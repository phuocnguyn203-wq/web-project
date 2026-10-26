import pytest

from ai.llm import CardSet, QuizItem, clean_text, generate_cards
from ai.llm.generate import dedupe
from ai.speech import transcribe, wer


def test_wer():
    assert wer("cây nhị phân", "cây nhị phân") == 0
    assert wer("cây nhị phân", "cây phân") == pytest.approx(1 / 3)
    assert wer("a b", "") == 1


def test_clean_removes_fillers_but_not_words():
    assert clean_text("ờ hôm nay à chúng ta") == "hôm nay chúng ta"
    assert clean_text("bàn ăn") == "bàn ăn"


def test_quiz_answer_index_validated():
    with pytest.raises(ValueError):
        QuizItem(question="abc?", options=["a", "b"], answer_index=5, source_start=0)


def test_dedupe():
    assert len(dedupe(["Cây AVL là gì?", "cây AVL là gì ?", "Cây đỏ đen"], str)) == 2


def test_mock_pipeline():
    cards = generate_cards(transcribe(None, "mock"))
    assert isinstance(cards, CardSet) and cards.flashcards and cards.quiz


def test_true_false_normalised_keeps_answer():
    q = QuizItem(
        question="BST là cây nhị phân?", options=["Sai", "Đúng"], answer_index=1, source_start=0, kind="true_false"
    )
    assert q.options == ["Đúng", "Sai"] and q.answer_index == 0
    with pytest.raises(ValueError):
        QuizItem(question="abc?", options=["a", "b", "c"], answer_index=0, source_start=0, kind="true_false")


def test_fill_matches_plan_then_falls_back():
    from ai.llm.generate import _fill

    def mk(kind, lv):
        return QuizItem(
            question=f"{kind} {lv}?", options=["a", "b"], answer_index=0, source_start=0, kind=kind, difficulty=lv
        )

    pool = [mk("theory", "easy"), mk("theory", "hard"), mk("true_false", "medium")]
    got = _fill([("true_false", "hard"), ("theory", "hard"), ("calculation", "easy")], pool)
    assert [(q.kind, q.difficulty) for q in got] == [("true_false", "medium"), ("theory", "hard"), ("theory", "easy")]


def test_shuffle_keeps_the_right_answer():
    from ai.llm.generate import _shuffle

    q = QuizItem(question="Độ phức tạp?", options=["O(log n)", "O(n)", "O(1)", "O(n²)"], answer_index=0, source_start=0)
    s = _shuffle(q)
    assert sorted(s.options) == sorted(q.options) and s.options[s.answer_index] == "O(log n)"


def test_chat_falls_back_when_daily_quota_hit(monkeypatch):
    import httpx

    from ai.llm import QuotaExceeded
    from ai.llm import generate as g

    req = httpx.Request("POST", "http://x")
    day = httpx.Response(429, text='{"error":{"message":"... tokens per day (TPD) ..."}}', request=req)
    ok = httpx.Response(200, json={"choices": [{"message": {"content": "<think>hmm</think> xin chào"}}]}, request=req)
    calls = []
    monkeypatch.setattr(g, "_post", lambda model, *a: calls.append(model) or (day if model == "a" else ok))
    monkeypatch.setattr(g, "_exhausted", set())
    monkeypatch.setenv("LLM_MODEL", "a")
    monkeypatch.setenv("LLM_FALLBACK_MODELS", "b")
    assert g._chat("hi") == "xin chào" and calls == ["a", "b"]
    assert g._chat("hi") == "xin chào" and calls[-1] == "b"  # exhausted model is skipped afterwards
    monkeypatch.setattr(g, "_post", lambda *a: day)
    with pytest.raises(QuotaExceeded):
        g._chat("hi")


def test_api_transcription_uses_llm_key_and_drops_blank_segments(monkeypatch, tmp_path):
    import httpx

    audio = tmp_path / "a.ogg"
    audio.write_bytes(b"x")
    monkeypatch.setenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    monkeypatch.setenv("LLM_API_KEY", "k")
    sent = {}

    def fake_post(url, headers, data, files, timeout):
        sent.update(url=url, auth=headers["Authorization"], model=data["model"])
        segs = [{"start": 0.0, "end": 4.2, "text": " Xin chào "}, {"start": 4.2, "end": 5.0, "text": " "}]
        return httpx.Response(200, json={"segments": segs}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    segs = transcribe(audio, "api")
    assert [(s.start, s.text) for s in segs] == [(0.0, "Xin chào")]
    assert sent == {
        "url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "auth": "Bearer k",
        "model": "whisper-large-v3",
    }


def test_chat_json_retries_invalid_json(monkeypatch):
    from ai.llm import generate as g

    replies = iter(['{"quiz": [', '{"quiz": []}'])
    monkeypatch.setattr(g, "_chat", lambda prompt, json_mode: next(replies))
    assert g._chat_json("p") == {"quiz": []}
    monkeypatch.setattr(g, "_chat", lambda prompt, json_mode: "not json")
    assert g._chat_json("p") == {}


def test_verify_drops_only_contradicted_questions(monkeypatch):
    from ai.llm import generate as g

    pool = [QuizItem(question=f"Câu {i}?", options=["A", "B", "C"], answer_index=0, source_start=0) for i in range(4)]
    # unsure (lecture-specific fact) / agrees / different answer / broken question
    monkeypatch.setattr(g, "_chat", lambda prompt, json_mode: '{"answers": [-1, 0, 2, -2]}')
    assert [q.question for q in g._verify(pool)] == ["Câu 0?", "Câu 1?"]
