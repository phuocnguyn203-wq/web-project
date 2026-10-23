"""Background job: media -> transcript -> summary -> cards. Runs in the RQ worker."""

import logging
import os
import tempfile
from pathlib import Path

from ai.llm import generate_cards, generate_quiz, summarize
from ai.speech import download_youtube, extract_audio, transcribe
from ai.speech.captions import fetch_youtube_captions

from . import models as m
from .db import SessionLocal
from .documents import extract_pages

SPEECH_ENGINE = os.getenv("SPEECH_ENGINE", "mock")
log = logging.getLogger(__name__)


DEFAULT_QUIZ = {"count": 10, "difficulty": "medium", "kinds": ["theory"]}


def process_lecture(lecture_id: int, quiz: dict | None = None) -> None:
    """quiz: the teacher's choice of {count, difficulty, kinds} from the upload form."""
    with SessionLocal() as db:
        lec = db.get(m.Lecture, lecture_id)

        def step(status: str, progress: int):
            lec.status, lec.progress = status, progress
            db.commit()

        try:
            step("transcribing", 10)
            engine = SPEECH_ENGINE
            captions = _captions(lec.source_url) if lec.source_type == "youtube" else None
            if lec.source_type == "document":
                segs, engine = extract_pages(Path(lec.file_path)), "document"
            elif captions:
                segs, engine = captions[0], f"captions:{captions[1]}"
            else:
                audio = None
                if SPEECH_ENGINE != "mock":
                    tmp = Path(tempfile.mkdtemp())
                    src = download_youtube(lec.source_url, tmp) if lec.source_type == "youtube" else Path(lec.file_path)
                    audio = extract_audio(src, tmp / "audio.wav")
                segs = transcribe(audio, SPEECH_ENGINE)
            db.add(
                m.Transcript(
                    lecture_id=lec.id,
                    engine=engine,
                    text=" ".join(s.text for s in segs),
                    segments=[m.Segment(idx=i, start=s.start, end=s.end, text=s.text) for i, s in enumerate(segs)],
                )
            )
            # Flag anything a stand-in produced so the UI never passes it off as the lecture's content.
            lec.mock = engine == "mock" or os.getenv("LLM_PROVIDER", "mock") == "mock"
            step("summarizing", 50)
            db.add(m.Summary(lecture_id=lec.id, content=summarize(segs)))
            step("generating", 75)
            cs = generate_cards(segs)
            db.add_all(m.Flashcard(lecture_id=lec.id, **c.model_dump()) for c in cs.flashcards)
            step("generating", 85)
            try:
                questions = generate_quiz(segs, **(quiz or DEFAULT_QUIZ))
            except Exception:
                # Summary and flashcards are already worth having; the teacher can retry from the quiz tab.
                log.warning("quiz generation failed for lecture %s", lec.id, exc_info=True)
                questions = []
            db.add_all(m.QuizQuestion(lecture_id=lec.id, **q.model_dump()) for q in questions)
            step("ready", 100)
        except Exception as e:
            db.rollback()
            lec.status, lec.error = "failed", str(e)[:1000]
            db.commit()
            raise


def _captions(url: str):
    """YouTube's own subtitles when available: real text and timestamps without running ASR."""
    try:
        return fetch_youtube_captions(url)
    except Exception:  # network, bot-check, private video: fall back to the speech engine
        log.warning("captions unavailable for %s", url, exc_info=True)
        return None


def enqueue(lecture_id: int, quiz: dict | None = None) -> None:
    if os.getenv("SYNC_JOBS") == "1":  # tests / no-redis dev
        process_lecture(lecture_id, quiz)
        return
    from redis import Redis  # noqa: PLC0415
    from rq import Queue  # noqa: PLC0415

    Queue(connection=Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))).enqueue(
        process_lecture, lecture_id, quiz, job_timeout=3 * 3600
    )
