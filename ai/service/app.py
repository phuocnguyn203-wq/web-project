"""Internal AI service (FastAPI). Only the Express API calls it; it is never exposed to browsers.

POST /jobs          queue a lecture for transcription + summary + cards (RQ, or in-process with SYNC_JOBS=1)
POST /quiz          generate quiz questions from transcript segments, synchronously
POST /export/apkg   build an Anki package from cards (genanki has no Node equivalent)
"""

import html
import logging
import os
import tempfile
from typing import Literal

import genanki
import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from ai.llm import QuotaExceeded, generate_quiz
from ai.speech import Segment

from .pipeline import internal_token, process_lecture

logging.basicConfig(level=logging.INFO)
if os.getenv("APP_ENV") == "production" and internal_token() == "dev-internal-token":
    raise RuntimeError("Set INTERNAL_TOKEN (shared with the API) in production")


def check_token(x_internal_token: str = Header("")) -> None:
    if x_internal_token != internal_token():
        raise HTTPException(401, "bad internal token")


app = FastAPI(title="LectureCards AI service", dependencies=[Depends(check_token)])

Kind = Literal["theory", "calculation", "true_false"]


class QuizOptions(BaseModel):
    count: int = Field(10, ge=1, le=30)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "medium"
    kinds: list[Kind] = Field(default=["theory"], min_length=1)


class JobIn(BaseModel):
    lecture_id: int
    source_type: Literal["youtube", "file", "document"]
    source_url: str | None = None
    file_path: str | None = None
    quiz: QuizOptions | None = None


class SegmentIn(BaseModel):
    start: float
    end: float
    text: str


class QuizIn(QuizOptions):
    segments: list[SegmentIn] = Field(min_length=1)


class CardIn(BaseModel):
    id: int
    front: str
    back: str
    source_start: float


class ApkgIn(BaseModel):
    lecture_id: int
    title: str
    source_type: str
    cards: list[CardIn]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/jobs", status_code=202)
def queue_job(job: JobIn, background: BackgroundTasks):
    body = job.model_dump()
    if os.getenv("SYNC_JOBS") == "1":  # tests / dev without Redis: run after the response is sent
        background.add_task(process_lecture, body)
    else:
        from redis import Redis  # noqa: PLC0415
        from rq import Queue  # noqa: PLC0415

        redis = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))
        Queue(connection=redis).enqueue(process_lecture, body, job_timeout=3 * 3600)
    return {"queued": True}


@app.post("/quiz")
def quiz(body: QuizIn):
    segs = [Segment(s.start, s.end, s.text) for s in body.segments]
    try:
        items = generate_quiz(segs, body.count, body.difficulty, list(dict.fromkeys(body.kinds)))
    except QuotaExceeded as e:
        raise HTTPException(429, str(e)) from None
    except httpx.HTTPError:
        raise HTTPException(502, "Dịch vụ AI đang lỗi hoặc quá tải, thử lại sau ít phút") from None
    return [q.model_dump() for q in items]


ANKI_MODEL = genanki.Model(
    1_726_150_401,  # fixed ids so re-imports update notes instead of duplicating
    "LectureCards",
    fields=[{"name": "Front"}, {"name": "Back"}, {"name": "Source"}],
    templates=[
        {
            "name": "Card 1",
            "qfmt": "{{Front}}",
            "afmt": '{{FrontSide}}<hr id="answer">{{Back}}<br><br><small style="color:#888">{{Source}}</small>',
        }
    ],
)


@app.post("/export/apkg")
def export_apkg(body: ApkgIn):
    """One deck per lecture, stable note GUIDs per flashcard id."""
    doc = body.source_type == "document"
    deck = genanki.Deck(1_726_150_402 + body.lecture_id, f"LectureCards::{body.title}")
    for c in body.cards:
        s = int(c.source_start)
        at = f"Trang {s}" if doc else f"Phút {s // 60}:{s % 60:02d}"
        deck.add_note(
            genanki.Note(
                model=ANKI_MODEL,
                fields=[html.escape(c.front), html.escape(c.back), html.escape(f"{body.title} · {at}")],
                guid=genanki.guid_for("lecturecards", c.id),
            )
        )
    fd, path = tempfile.mkstemp(suffix=".apkg")
    os.close(fd)
    genanki.Package(deck).write_to_file(path)
    return FileResponse(path, media_type="application/octet-stream", background=BackgroundTask(os.unlink, path))
