"""Audio acquisition + speech-to-text. Owner: Person 1 (Speech)."""

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Segment:
    start: float  # seconds
    end: float
    text: str


def download_youtube(url: str, out_dir: Path) -> Path:
    """Download best audio track with yt-dlp, return the file path."""
    out = out_dir / "youtube.%(ext)s"
    subprocess.run(["yt-dlp", "-x", "--audio-format", "wav", "-o", str(out), url], check=True)
    return out_dir / "youtube.wav"


def extract_audio(src: Path, out: Path) -> Path:
    """16 kHz mono, the format Whisper-family models expect. `.ogg` out = 16 kbps Opus (~7 MB/hour) for upload."""
    codec = ["-c:a", "libopus", "-b:a", "16k"] if out.suffix == ".ogg" else []
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", *codec, str(out)],
        check=True,
        capture_output=True,
    )
    return out


API_MAX_BYTES = 25 << 20  # Groq free tier / OpenAI per-file limit


def _transcribe_api(audio: Path) -> list[Segment]:
    """OpenAI-compatible /audio/transcriptions (Groq whisper-large-v3 by default). Reuses the LLM key unless
    SPEECH_BASE_URL / SPEECH_API_KEY are set."""
    import httpx  # noqa: PLC0415

    if audio.stat().st_size > API_MAX_BYTES:
        raise RuntimeError("Bài giảng quá dài để nhận dạng một lần (giới hạn 25 MB âm thanh, khoảng 3 giờ)")
    base = os.getenv("SPEECH_BASE_URL") or os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
    key = os.getenv("SPEECH_API_KEY") or os.getenv("LLM_API_KEY", "")
    with audio.open("rb") as f:
        r = httpx.post(
            f"{base.rstrip('/')}/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            data={"model": os.getenv("SPEECH_MODEL", "whisper-large-v3"), "response_format": "verbose_json"},
            files={"file": (audio.name, f)},
            timeout=900,
        )
    r.raise_for_status()
    return [Segment(s["start"], s["end"], s["text"].strip()) for s in r.json()["segments"] if s["text"].strip()]


MOCK_TRANSCRIPT = [
    "ờ hôm nay chúng ta học về cấu trúc dữ liệu cây nhị phân tìm kiếm",
    "cây nhị phân tìm kiếm là cây mà mỗi nút có tối đa hai con",
    "à giá trị nút con trái luôn nhỏ hơn nút cha và nút con phải luôn lớn hơn",
    "thao tác tìm kiếm có độ phức tạp trung bình là O log n",
    "trong trường hợp xấu nhất cây bị lệch thì độ phức tạp là O n",
    "để tránh điều đó người ta dùng cây cân bằng như AVL hoặc cây đỏ đen",
    "cây AVL đảm bảo chênh lệch chiều cao hai cây con không quá một",
    "ờ duyệt cây theo thứ tự giữa sẽ cho dãy giá trị được sắp xếp tăng dần",
]


def transcribe(audio: Path | None, engine: str = "mock") -> list[Segment]:
    """engine: mock | api (hosted Whisper, no GPU) | phowhisper | whisper (local GPU, heavy deps imported lazily)."""
    if engine == "mock":
        return [Segment(i * 30.0, i * 30.0 + 28.0, t) for i, t in enumerate(MOCK_TRANSCRIPT)]
    if engine == "api":
        return _transcribe_api(audio)

    from transformers import pipeline  # noqa: PLC0415

    model = "vinai/PhoWhisper-small" if engine == "phowhisper" else "openai/whisper-small"
    asr = pipeline("automatic-speech-recognition", model=model, chunk_length_s=30)
    out = asr(str(audio), return_timestamps=True)
    return [Segment(c["timestamp"][0] or 0.0, c["timestamp"][1] or 0.0, c["text"].strip()) for c in out["chunks"]]
