"""Map-reduce summary + flashcard/quiz generation over an OpenAI-compatible API.

Provider is chosen by env: LLM_PROVIDER=mock|openai, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
Works with OpenAI, Gemini (OpenAI endpoint), Groq, Ollama, vLLM — anything speaking /chat/completions.
"""

import json
import logging
import os
import random
import re
import time
from collections import Counter
from difflib import SequenceMatcher

import httpx

from .clean import chunk_segments, clean_text
from .schemas import TRUE_FALSE, CardSet, Flashcard, QuizItem

log = logging.getLogger(__name__)


class QuotaExceeded(RuntimeError):
    """Every configured model is out of its daily allowance. The message is shown to teachers as-is."""


_exhausted: set[str] = set()  # models that hit their daily cap in this process; skipped until restart


def _models() -> list[str]:
    fallbacks = [m.strip() for m in os.getenv("LLM_FALLBACK_MODELS", "").split(",") if m.strip()]
    return [m for m in [os.getenv("LLM_MODEL", "gpt-4o-mini"), *fallbacks] if m not in _exhausted]


def _chat(prompt: str, json_mode: bool = False) -> str:
    """One completion. Free tiers cap tokens per minute (wait and retry) and per day, per model
    (switch to the next model in LLM_FALLBACK_MODELS; when none is left, raise QuotaExceeded)."""
    models, too_large = _models(), None
    while models:
        r = _post(models[0], prompt, json_mode)
        text = r.text.lower()
        if r.status_code == 429 and "per day" in text:
            _exhausted.add(models.pop(0))
            continue
        if r.status_code == 429 and "too large" in text:  # this model's per-minute caps can't fit it; next one might
            too_large = r
            models.pop(0)
            continue
        if r.is_error:  # keep the provider's explanation: it is what tells a 429 apart from a 429
            raise httpx.HTTPStatusError(
                f"{models[0]} → HTTP {r.status_code}: {r.text[:400]}", request=r.request, response=r
            )
        content = r.json()["choices"][0]["message"]["content"] or ""
        return re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()  # Qwen-style reasoning blocks
    if too_large is not None:  # some model still has quota, but none of the remaining ones can take this request
        raise httpx.HTTPStatusError(
            f"HTTP 429 request too large: {too_large.text[:400]}", request=too_large.request, response=too_large
        )
    raise QuotaExceeded(
        "Đã hết hạn mức AI trong ngày của mọi model đã cấu hình (gói miễn phí Groq: 200.000 token/ngày/model). "
        "Thử lại sau, thêm model vào LLM_FALLBACK_MODELS, hoặc dùng khoá khác."
    )


def _chat_json(prompt: str) -> dict:
    """JSON-mode chat, asked twice: models now and then return truncated or invalid JSON. {} if both fail."""
    for _ in range(2):
        try:
            return json.loads(_chat(prompt, True))
        except json.JSONDecodeError:
            log.warning("model returned invalid JSON, retrying")
    return {}


def _post(model: str, prompt: str, json_mode: bool) -> httpx.Response:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        # Providers count input + max_tokens against tokens-per-minute (Groq free tier: 8k TPM), so cap it.
        "max_tokens": int(os.getenv("LLM_MAX_TOKENS", "3000")),
    }
    if "gpt-oss" in model:  # reasoning model: hidden reasoning tokens count too; keep them short
        body["reasoning_effort"] = os.getenv("LLM_REASONING_EFFORT", "low")
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    for attempt in range(8):
        r = httpx.post(
            os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {os.getenv('LLM_API_KEY', '')}"},
            json=body,
            timeout=120,
        )
        text = r.text.lower()
        # Only the per-minute limit is worth waiting out; daily caps and oversize requests never clear in time.
        if r.status_code != 429 or "per day" in text or "too large" in text or attempt == 7:
            return r
        time.sleep(min(float(r.headers.get("retry-after", 2**attempt)), 60))
    return r


CHUNK_CHARS = 4000  # ~1.5–2k tokens of Vietnamese per call: fits an 8k tokens/minute free tier with room to answer


def _mock() -> bool:
    return os.getenv("LLM_PROVIDER", "mock") == "mock"


def _fmt(chunk) -> str:
    return "\n".join(f"[{s.start:.0f}s] {clean_text(s.text)}" for s in chunk)


def summarize(segments) -> str:
    if _mock():
        return "## Ý chính\n" + "\n".join(f"- {clean_text(s.text).capitalize()}." for s in segments[:5])
    chunks = chunk_segments(segments, CHUNK_CHARS)
    if len(chunks) == 1:  # short lecture: one call, no reduce step
        return _chat(SUMMARY_PROMPT + _fmt(chunks[0]))
    partials = [
        _chat(f"Tóm tắt ngắn gọn đoạn bài giảng sau bằng tiếng Việt, dạng gạch đầu dòng:\n{_fmt(c)}") for c in chunks
    ]
    return _chat(
        "Gộp các bản tóm tắt sau thành một bản tóm tắt bài giảng hoàn chỉnh bằng tiếng Việt, bỏ ý trùng lặp. "
        + FORMAT
        + "\n\n"
        + "\n\n".join(partials)
    )


# The UI renders a small Markdown subset; ask for exactly that.
FORMAT = (
    "Định dạng: chỉ dùng tiêu đề mục bắt đầu bằng `## ` và gạch đầu dòng `- `. "
    "Không dùng bảng, không dùng `---`, không dùng tiêu đề `#`/`###`."
)
SUMMARY_PROMPT = (
    "Tóm tắt bài giảng sau bằng tiếng Việt (kể cả khi lời giảng là tiếng Anh): vài mục, mỗi mục vài gạch đầu "
    "dòng ngắn. Giữ nguyên thuật ngữ chuyên ngành, có thể kèm tiếng Anh trong ngoặc. Chỉ dùng nội dung có "
    f"trong bài. {FORMAT}\n\n"
)

# Quiz questions come from generate_quiz (teacher-chosen size/difficulty/kinds), so this asks for flashcards only.
CARD_PROMPT = """Từ đoạn bài giảng (mỗi dòng có timestamp [Ns]) dưới đây, tạo 4–8 flashcard để sinh viên ôn tập.
Viết bằng tiếng Việt kể cả khi lời giảng là tiếng Anh; giữ thuật ngữ chuyên ngành (có thể kèm tiếng Anh
trong ngoặc). Hỏi về khái niệm, định nghĩa, tính chất, độ phức tạp, so sánh; không hỏi chi tiết vụn vặt
như lời chào hay tên bài trước. Mặt sau trả lời ngắn gọn, đúng theo bài giảng. Không nhắc timestamp
trong nội dung thẻ; timestamp chỉ ghi vào trường source_start.
Trả về JSON đúng schema:
{{"flashcards":[{{"front":str,"back":str,"source_start":float}}]}}
source_start là timestamp (giây) của đoạn chứa kiến thức đó.

{text}"""


def _valid(model, items) -> list:
    out = []
    for it in items if isinstance(items, list) else []:
        try:
            out.append(model.model_validate(it))
        except ValueError:
            pass
    return out


def _similar(a: str, b: str) -> bool:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio() > 0.85


def dedupe(items, key):
    kept = []
    for it in items:
        if not any(_similar(key(it), key(k)) for k in kept):
            kept.append(it)
    return kept


MOCK_QA = [
    (
        "Cây nhị phân tìm kiếm (BST) là gì?",
        "Cây nhị phân mà mọi nút con trái nhỏ hơn nút cha, mọi nút con phải lớn hơn nút cha.",
    ),
    ("Mỗi nút của cây nhị phân có tối đa bao nhiêu con?", "Hai con: con trái và con phải."),
    ("Độ phức tạp tìm kiếm trung bình trên BST?", "O(log n), khi cây tương đối cân bằng."),
    ("Khi nào tìm kiếm trên BST tốn O(n)?", "Khi cây bị lệch, suy biến thành một danh sách liên kết."),
    ("Cây AVL đảm bảo điều kiện gì?", "Chênh lệch chiều cao hai cây con của mọi nút không quá 1."),
    ("Duyệt cây theo thứ tự giữa (in-order) cho kết quả gì?", "Dãy giá trị được sắp xếp tăng dần."),
]
MOCK_WRONG = ["O(n²) trong mọi trường hợp", "Chỉ áp dụng cho mảng đã sắp xếp", "Không phụ thuộc vào cấu trúc cây"]


def _mock_cards(segments) -> CardSet:
    """Deterministic stand-in for the LLM: authored Q&A pinned to the segments' timestamps."""
    starts = [s.start for s in segments] or [0.0]
    cards, quiz = [], []
    for i, (q, a) in enumerate(MOCK_QA):
        at = starts[min(i + 1, len(starts) - 1)]
        cards.append(Flashcard(front=q, back=a, source_start=at))
        k = i % 4  # rotate so the answer isn't always A
        opts = [a, *MOCK_WRONG]
        quiz.append(
            QuizItem(question=q, options=opts[k:] + opts[:k], answer_index=(4 - k) % 4, explanation=a, source_start=at)
        )
    return CardSet(flashcards=cards, quiz=quiz)


LEVELS = {
    "easy": "DỄ: nhớ lại định nghĩa, sự kiện nêu trực tiếp trong bài",
    "medium": "TRUNG BÌNH: hiểu và so sánh khái niệm, áp dụng vào ví dụ quen thuộc",
    "hard": "KHÓ: suy luận nhiều bước, tình huống mới, phân biệt các trường hợp dễ nhầm",
}
KINDS = {
    "theory": 'lý thuyết (kind "theory"): 4 phương án, một đáp án đúng',
    "calculation": (
        'tính toán (kind "calculation"): CHỈ khi bài giảng dạy một công thức, thuật toán hay phương pháp tính; '
        "câu hỏi là bài toán áp dụng nó với số liệu cụ thể, 4 phương án là các kết quả số. Cộng trừ các con số "
        'nhắc trong bài cho có KHÔNG phải câu tính toán: khi bài không dạy cách tính, tạo câu kind "theory" thay vào'
    ),
    "true_false": 'đúng/sai (kind "true_false"): một mệnh đề, options đúng bằng ["Đúng","Sai"]',
}

QUIZ_PROMPT = """Từ đoạn bài giảng (mỗi dòng có timestamp [Ns]) dưới đây, tạo câu hỏi trắc nghiệm để sinh viên
ôn tập, ĐÚNG theo danh sách sau (đủ số lượng từng loại, ghi đúng kind và difficulty):
{plan}
Kiểu câu: {kinds}.
Mức độ: {levels}.
Viết bằng tiếng Việt kể cả khi lời giảng là tiếng Anh; giữ thuật ngữ chuyên ngành.
Mỗi câu CHỈ MỘT đáp án đúng; phương án sai phải hợp lý nhưng thật sự sai theo bài giảng. Giải thích ngắn
vì sao đáp án đúng (với câu tính toán: nêu các bước). Không hỏi điều hiển nhiên (ví dụ hỏi lại tên chủ đề),
không hỏi chi tiết vụn vặt như lời chào hay tên bài trước. Các phương án sẽ bị xáo trộn, nên KHÔNG dùng
"tất cả các phương án trên", "cả A và B", "không phương án nào" hay tham chiếu vị trí.
Không nhắc timestamp hay "đoạn [Ns]" trong câu hỏi,
phương án hay giải thích; timestamp chỉ ghi vào trường source_start.
Trả về JSON: {{"quiz":[{{"question":str,"options":[str],"answer_index":int,"explanation":str,
"source_start":float,"difficulty":"easy"|"medium"|"hard","kind":"theory"|"calculation"|"true_false"}}]}}
source_start là timestamp (giây) của đoạn chứa kiến thức đó.

{text}"""

MOCK_CALC = (
    "Một BST cân bằng có 1023 nút. Tìm kiếm cần tối đa khoảng bao nhiêu phép so sánh?",
    ["10", "1023", "512", "32"],
    "Chiều cao cây cân bằng ≈ log₂(1024) = 10, mỗi tầng một phép so sánh.",
)


def _mock_quiz(segments, count: int, difficulty: str, kinds: list[str]) -> list[QuizItem]:
    starts = [s.start for s in segments] or [0.0]
    levels = ["easy", "medium", "hard"] if difficulty == "mixed" else [difficulty]
    out = []
    for i in range(count):
        q, a = MOCK_QA[i % len(MOCK_QA)]
        kind, level, at = kinds[i % len(kinds)], levels[i % len(levels)], starts[(i + 1) % len(starts)]
        if kind == "true_false":
            item = QuizItem(
                question=f"{q.rstrip('?')}: {a}", options=TRUE_FALSE, answer_index=0, explanation=a, source_start=at
            )
        elif kind == "calculation":
            item = QuizItem(
                question=MOCK_CALC[0], options=MOCK_CALC[1], answer_index=0, explanation=MOCK_CALC[2], source_start=at
            )
        else:
            k = i % 4
            opts = [a, *MOCK_WRONG]
            item = QuizItem(
                question=q, options=opts[k:] + opts[:k], answer_index=(4 - k) % 4, explanation=a, source_start=at
            )
        out.append(item.model_copy(update={"kind": kind, "difficulty": level}))
    return out


def generate_quiz(
    segments, count: int = 10, difficulty: str = "medium", kinds: list[str] | None = None
) -> list[QuizItem]:
    """On-demand quiz with a chosen size, difficulty (easy|medium|hard|mixed) and mix of kinds."""
    kinds = kinds or ["theory"]
    if _mock():
        return _mock_quiz(segments, count, difficulty, kinds)
    levels = list(LEVELS) if difficulty == "mixed" else [difficulty]
    # The plan: one (kind, level) slot per question, cycling both so every chosen kind and level appears.
    slots = [(kinds[i % len(kinds)], levels[(i // len(kinds) + i) % len(levels)]) for i in range(count)]
    chunks = chunk_segments(segments, CHUNK_CHARS)
    pool: list[QuizItem] = []
    for j, chunk in enumerate(chunks):
        mine = slots[j :: len(chunks)] or slots[:1]  # spread the plan across the whole lecture
        mine += [(k, levels[0]) for k in dict.fromkeys(k for k, _ in mine)]  # one spare per kind, for dedupe
        calc_note = " (CHỈ nếu đoạn này dạy công thức/cách tính; nếu không, tạo câu lý thuyết thay vào)"
        plan = "\n".join(
            f"- {n} câu {KIND_NAME[k]}, mức {LEVEL_NAME[lv]}{calc_note if k == 'calculation' else ''}"
            for (k, lv), n in Counter(mine).items()
        )
        prompt = QUIZ_PROMPT.format(
            plan=plan,
            kinds="; ".join(KINDS[k] for k in kinds),
            levels="; ".join(LEVELS[lv] for lv in levels),
            text=_fmt(chunk),
        )
        pool += _valid(QuizItem, _chat_json(prompt).get("quiz", []))
    pool = _verify([q for q in dedupe(pool, lambda q: q.question) if q.kind in kinds])
    picked = _fill(slots, pool)
    if difficulty != "mixed":
        picked = [q.model_copy(update={"difficulty": difficulty}) for q in picked]
    return [_shuffle(q) for q in sorted(picked, key=lambda q: q.source_start)]


KIND_NAME = {"theory": "lý thuyết", "calculation": "tính toán", "true_false": "đúng/sai"}
LEVEL_NAME = {"easy": "DỄ", "medium": "TRUNG BÌNH", "hard": "KHÓ"}


def _fill(slots, pool: list[QuizItem]) -> list[QuizItem]:
    """Match each planned slot to a generated question: exact kind+level, then same kind, then anything left."""
    left, chosen = list(pool), [None] * len(slots)
    for match in (
        lambda q, k, lv: q.kind == k and q.difficulty == lv,
        lambda q, k, lv: q.kind == k,
        lambda q, k, lv: True,
    ):
        for i, (k, lv) in enumerate(slots):
            if chosen[i] is None and (hit := next((q for q in left if match(q, k, lv)), None)):
                left.remove(hit)
                chosen[i] = hit
    return [q for q in chosen if q]


VERIFY_PROMPT = """Giải độc lập từng câu trắc nghiệm dưới đây (tự tính toán cẩn thận, không đoán).
Trả về JSON {{"answers":[int, ...]}}: chỉ số (từ 0) của phương án đúng cho từng câu, theo đúng thứ tự;
dùng -1 nếu không có phương án nào đúng hoặc có nhiều hơn một phương án đúng.

{questions}"""


def _verify(pool: list[QuizItem]) -> list[QuizItem]:
    """Second opinion: the model re-solves every question blind; keep only those where it agrees with the key.
    Catches miscalculated answers (worst for calculation questions). If a check fails, that batch is kept."""
    kept = []
    for b in range(0, len(pool), 10):  # small batches keep each request inside tokens-per-minute limits
        batch = pool[b : b + 10]
        listing = "\n\n".join(
            f"Câu {n}: {q.question}\n" + "\n".join(f"  {i}. {o}" for i, o in enumerate(q.options))
            for n, q in enumerate(batch)
        )
        try:
            answers = json.loads(_chat(VERIFY_PROMPT.format(questions=listing), True)).get("answers", [])
        except (json.JSONDecodeError, httpx.HTTPError, QuotaExceeded):  # unverified beats nothing
            answers = None
        if not isinstance(answers, list) or len(answers) != len(batch):
            kept += batch
            continue
        kept += [q for q, a in zip(batch, answers, strict=True) if a == q.answer_index]
    return kept


def _shuffle(q: QuizItem) -> QuizItem:
    """LLMs put the right answer first far too often; shuffle choices (deterministically per question)."""
    if q.kind == "true_false":
        return q
    order = list(range(len(q.options)))
    random.Random(q.question).shuffle(order)
    return q.model_copy(update={"options": [q.options[i] for i in order], "answer_index": order.index(q.answer_index)})


def generate_cards(segments) -> CardSet:
    if _mock():
        raw = _mock_cards(segments)
    else:
        cards, quiz = [], []
        for chunk in chunk_segments(segments, CHUNK_CHARS):
            data = _chat_json(CARD_PROMPT.format(text=_fmt(chunk)))
            # Validate item by item: one malformed question shouldn't sink the whole chunk.
            cards += _valid(Flashcard, data.get("flashcards", []))
            quiz += _valid(QuizItem, data.get("quiz", []))
        raw = CardSet(flashcards=cards, quiz=quiz)
    return CardSet(
        flashcards=dedupe(raw.flashcards, lambda c: c.front),
        quiz=[_shuffle(q) for q in dedupe(raw.quiz, lambda q: q.question)],
    )
