"""Background job: media -> transcript -> summary -> cards. Runs in the RQ worker.

The worker owns no database: it reports progress and the finished result to the Express API's internal
endpoints, which store them. Owner: Person 1 + 2, called by Person 3's API.
"""

import logging
import os
import tempfile
from dataclasses import asdict
from pathlib import Path

import httpx

from ai.llm import generate_cards, generate_quiz, summarize
from ai.speech import download_youtube, extract_audio, transcribe
from ai.speech.captions import fetch_youtube_captions

from .documents import extract_pages

log = logging.getLogger(__name__)
DEFAULT_QUIZ = {"count": 10, "difficulty": "medium", "kinds": ["theory"]}


def internal_token() -> str:
    return os.getenv("INTERNAL_TOKEN", "dev-internal-token")


def _post(path: str, body: dict) -> None:
    base = os.getenv("API_INTERNAL_URL", "http://localhost:8000").rstrip("/")
    r = httpx.post(base + path, json=body, headers={"X-Internal-Token": internal_token()}, timeout=60)
    r.raise_for_status()


def process_lecture(job: dict) -> None:
    """job: {lecture_id, source_type, source_url, file_path, quiz: {count, difficulty, kinds} | None}"""
    lid = job["lecture_id"]
    speech_engine = os.getenv("SPEECH_ENGINE", "mock")

    def step(status: str, progress: int) -> None:
        _post(f"/internal/lectures/{lid}/status", {"status": status, "progress": progress})

    try:
        step("transcribing", 10)
        captions = _captions(job["source_url"]) if job["source_type"] == "youtube" else None
        if job["source_type"] == "document":
            segs, engine = extract_pages(Path(job["file_path"])), "document"
        elif captions:
            segs, engine = captions[0], f"captions:{captions[1]}"
        else:
            engine = speech_engine
            with tempfile.TemporaryDirectory() as d:  # downloaded audio can be hundreds of MB
                audio, tmp = None, Path(d)
                if speech_engine != "mock":
                    yt = job["source_type"] == "youtube"
                    src = download_youtube(job["source_url"], tmp) if yt else Path(job["file_path"])
                    audio = extract_audio(src, tmp / ("audio.ogg" if speech_engine == "api" else "audio.wav"))
                segs = transcribe(audio, speech_engine)

        step("summarizing", 50)
        summary = summarize(segs)
        step("generating", 75)
        cards = generate_cards(segs).flashcards
        step("generating", 85)
        try:
            questions = generate_quiz(segs, **(job.get("quiz") or DEFAULT_QUIZ))
        except Exception:
            # Summary and flashcards are already worth having; the teacher can retry from the quiz tab.
            log.warning("quiz generation failed for lecture %s", lid, exc_info=True)
            questions = []
        if not questions:
            log.warning("lecture %s has no quiz questions; the teacher can generate them from the quiz tab", lid)

        _post(
            f"/internal/lectures/{lid}/result",
            {
                "engine": engine,
                # Flag anything a stand-in produced so the UI never passes it off as the lecture's content.
                "mock": engine == "mock" or os.getenv("LLM_PROVIDER", "mock") == "mock",
                "segments": [asdict(s) for s in segs],
                "summary": summary,
                "flashcards": [c.model_dump() for c in cards],
                "quiz": [q.model_dump() for q in questions],
            },
        )
    except Exception as e:
        log.exception("lecture %s failed", lid)
        _post(f"/internal/lectures/{lid}/status", {"status": "failed", "error": str(e)[:1000]})
        raise


def _captions(url: str):
    """YouTube's own subtitles when available: real text and timestamps without running ASR."""
    try:
        return fetch_youtube_captions(url)
    except Exception:  # network, bot-check, private video: fall back to the speech engine
        log.warning("captions unavailable for %s", url, exc_info=True)
        return None
