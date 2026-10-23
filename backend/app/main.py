import csv
import html
import io
import os
import secrets
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import genanki
import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from ai.llm import QuotaExceeded, generate_quiz

from . import models as m
from . import schemas as s
from .auth import current_user, hash_password, make_token, teacher, verify_password
from .db import get_db
from .documents import DOC_SUFFIXES
from .pipeline import enqueue
from .sm2 import sm2

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "1024"))

# Schema is managed by Alembic: `alembic upgrade head` (run automatically in Docker).
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="LectureCards API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health():
    return {"ok": True}


# ---------- auth ----------


@app.post("/auth/register", response_model=s.TokenOut, tags=["auth"])
def register(body: s.RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(m.User).where(m.User.email == body.email)):
        raise HTTPException(409, "Email đã được sử dụng")
    user = m.User(email=body.email, name=body.name, role=body.role, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return {"access_token": make_token(user), "user": user}


@app.post("/auth/login", response_model=s.TokenOut, tags=["auth"])
def login(body: s.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(m.User).where(m.User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Sai email hoặc mật khẩu")
    return {"access_token": make_token(user), "user": user}


@app.get("/auth/me", response_model=s.UserOut, tags=["auth"])
def me(user: m.User = Depends(current_user)):
    return user


# ---------- access helpers ----------


def get_class(db: Session, class_id: int, user: m.User) -> m.Class:
    c = db.get(m.Class, class_id)
    if not c:
        raise HTTPException(404, "Không tìm thấy lớp")
    if user.role == "teacher" and c.teacher_id == user.id:
        return c
    if user.role == "student" and db.get(m.Enrollment, (user.id, class_id)):
        return c
    raise HTTPException(403, "Bạn không thuộc lớp này")


def get_lecture(db: Session, lecture_id: int, user: m.User, edit: bool = False) -> m.Lecture:
    lec = db.get(m.Lecture, lecture_id)
    if not lec:
        raise HTTPException(404, "Không tìm thấy bài giảng")
    if user.role == "teacher":
        get_class(db, lec.class_id, user)
    elif edit or not db.scalar(
        select(m.Assignment)
        .join(m.Enrollment, m.Enrollment.class_id == m.Assignment.class_id)
        .where(m.Assignment.lecture_id == lec.id, m.Enrollment.user_id == user.id)
    ):
        raise HTTPException(403, "Bài giảng chưa được giao")
    return lec


def assigned_to(class_id: int):
    return select(m.Assignment.lecture_id).where(m.Assignment.class_id == class_id)


# ---------- classes ----------


def class_out(db: Session, c: m.Class) -> dict:
    return {
        **s.ClassOut.model_validate(c).model_dump(),
        "student_count": db.scalar(select(func.count()).where(m.Enrollment.class_id == c.id)),
        "lecture_count": db.scalar(
            select(func.count()).where(or_(m.Lecture.class_id == c.id, m.Lecture.id.in_(assigned_to(c.id))))
        ),
    }


@app.post("/classes", response_model=s.ClassOut, tags=["classes"])
def create_class(body: s.ClassIn, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    c = m.Class(name=body.name, teacher_id=user.id, code=secrets.token_hex(3).upper())
    db.add(c)
    db.commit()
    return class_out(db, c)


@app.get("/classes", response_model=list[s.ClassOut], tags=["classes"])
def list_classes(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = (
        select(m.Class).where(m.Class.teacher_id == user.id)
        if user.role == "teacher"
        else select(m.Class).join(m.Enrollment).where(m.Enrollment.user_id == user.id)
    )
    return [class_out(db, c) for c in db.scalars(q.order_by(m.Class.id.desc()))]


@app.post("/classes/join", response_model=s.ClassOut, tags=["classes"])
def join_class(body: s.JoinIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "student":
        raise HTTPException(403, "Chỉ sinh viên tham gia lớp bằng mã")
    c = db.scalar(select(m.Class).where(m.Class.code == body.code.strip().upper()))
    if not c:
        raise HTTPException(404, "Mã lớp không đúng")
    if not db.get(m.Enrollment, (user.id, c.id)):
        db.add(m.Enrollment(user_id=user.id, class_id=c.id))
        db.commit()
    return class_out(db, c)


@app.get("/classes/{class_id}", response_model=s.ClassOut, tags=["classes"])
def read_class(class_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return class_out(db, get_class(db, class_id, user))


# ---------- lectures ----------


@app.get("/classes/{class_id}/lectures", response_model=list[s.LectureOut], tags=["lectures"])
def list_lectures(class_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Students: lectures assigned to the class. Teachers: also drafts uploaded here."""
    get_class(db, class_id, user)
    cond = m.Lecture.id.in_(assigned_to(class_id))
    if user.role == "teacher":
        cond = or_(cond, m.Lecture.class_id == class_id)
    return db.scalars(select(m.Lecture).where(cond).order_by(m.Lecture.id.desc())).all()


@app.post("/classes/{class_id}/lectures", response_model=s.LectureOut, tags=["lectures"])
def create_lecture(
    class_id: int,
    title: str = Form(...),
    youtube_url: str | None = Form(None),
    file: UploadFile | None = File(None),
    quiz_count: int = Form(10),
    quiz_difficulty: str = Form("medium"),
    quiz_kinds: str = Form("theory", description="Comma-separated: theory,calculation,true_false"),
    user: m.User = Depends(teacher),
    db: Session = Depends(get_db),
):
    get_class(db, class_id, user)
    if bool(youtube_url) == bool(file):
        raise HTTPException(422, "Cần đúng một nguồn: file hoặc link YouTube")
    try:
        quiz = s.QuizGenerateIn(count=quiz_count, difficulty=quiz_difficulty, kinds=quiz_kinds.split(","))
    except ValidationError:
        raise HTTPException(422, "Tuỳ chọn câu hỏi không hợp lệ") from None
    lec = m.Lecture(class_id=class_id, title=title, source_type="youtube" if youtube_url else "file")
    if youtube_url:
        if "youtu" not in youtube_url:
            raise HTTPException(422, "Link YouTube không hợp lệ")
        lec.source_url = youtube_url
    else:
        dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{Path(file.filename or '').suffix[:10]}"
        size = 0
        with dest.open("wb") as f:
            while chunk := file.file.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD_MB << 20:
                    f.close()
                    dest.unlink()
                    raise HTTPException(413, f"File vượt quá {MAX_UPLOAD_MB} MB")
                f.write(chunk)
        lec.file_path = str(dest)
        if dest.suffix.lower() in DOC_SUFFIXES:
            lec.source_type = "document"
    db.add(lec)
    db.commit()
    enqueue(lec.id, quiz.model_dump(exclude={"replace"}))
    db.refresh(lec)
    return lec


@app.get("/lectures/{lecture_id}", response_model=s.LectureOut, tags=["lectures"])
def read_lecture(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Poll this for job progress (status + progress 0..100)."""
    return get_lecture(db, lecture_id, user)


@app.put("/lectures/{lecture_id}/assignments", response_model=s.LectureOut, tags=["lectures"])
def assign_lecture(lecture_id: int, body: s.AssignIn, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    """Set which of the teacher's classes see this lecture. One lecture, shared cards, many classes."""
    lec = get_lecture(db, lecture_id, user)
    ids = set(body.class_ids)
    if ids and lec.status != "ready":
        raise HTTPException(409, "Bài giảng chưa xử lý xong")
    for cid in ids:
        get_class(db, cid, user)
    lec.assignments = [a for a in lec.assignments if a.class_id in ids] + [
        m.Assignment(class_id=cid) for cid in ids - set(lec.class_ids)
    ]
    db.commit()
    db.refresh(lec)
    return lec


@app.delete("/lectures/{lecture_id}", status_code=204, tags=["lectures"])
def delete_lecture(lecture_id: int, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    lec = get_lecture(db, lecture_id, user)
    if lec.file_path:
        Path(lec.file_path).unlink(missing_ok=True)
    db.delete(lec)
    db.commit()


@app.get("/lectures/{lecture_id}/media", tags=["lectures"])
def lecture_media(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    lec = get_lecture(db, lecture_id, user)
    if not lec.file_path:
        raise HTTPException(404, "Bài giảng không có file")
    return FileResponse(lec.file_path)


@app.get("/lectures/{lecture_id}/transcript", response_model=list[s.SegmentOut], tags=["lectures"])
def read_transcript(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    get_lecture(db, lecture_id, user)
    t = db.scalar(select(m.Transcript).where(m.Transcript.lecture_id == lecture_id))
    return t.segments if t else []


@app.get("/lectures/{lecture_id}/summary", response_model=s.SummaryOut, tags=["lectures"])
def read_summary(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    get_lecture(db, lecture_id, user)
    sm = db.scalar(select(m.Summary).where(m.Summary.lecture_id == lecture_id))
    return {"content": sm.content if sm else ""}


# ---------- flashcards & quiz (teacher review) ----------


@app.get("/lectures/{lecture_id}/flashcards", response_model=list[s.FlashcardOut], tags=["cards"])
def list_cards(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    get_lecture(db, lecture_id, user)
    return db.scalars(
        select(m.Flashcard).where(m.Flashcard.lecture_id == lecture_id).order_by(m.Flashcard.source_start)
    ).all()


@app.post("/lectures/{lecture_id}/flashcards", response_model=s.FlashcardOut, tags=["cards"])
def add_card(lecture_id: int, body: s.FlashcardIn, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    get_lecture(db, lecture_id, user)
    c = m.Flashcard(lecture_id=lecture_id, **body.model_dump())
    db.add(c)
    db.commit()
    return c


def owned_card(db, model, item_id, user):
    obj = db.get(model, item_id)
    if not obj:
        raise HTTPException(404, "Không tìm thấy")
    get_lecture(db, obj.lecture_id, user, edit=True)
    return obj


@app.put("/flashcards/{card_id}", response_model=s.FlashcardOut, tags=["cards"])
def update_card(card_id: int, body: s.FlashcardIn, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    c = owned_card(db, m.Flashcard, card_id, user)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    c.edited = True
    db.commit()
    return c


@app.delete("/flashcards/{card_id}", status_code=204, tags=["cards"])
def delete_card(card_id: int, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    db.delete(owned_card(db, m.Flashcard, card_id, user))
    db.commit()


@app.get("/lectures/{lecture_id}/quiz", response_model=list[s.QuizOut] | list[s.QuizPublicOut], tags=["cards"])
def list_quiz(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Teachers get answers; students get QuizPublicOut (no answer_index)."""
    get_lecture(db, lecture_id, user)
    rows = db.scalars(
        select(m.QuizQuestion).where(m.QuizQuestion.lecture_id == lecture_id).order_by(m.QuizQuestion.source_start)
    )
    out = s.QuizOut if user.role == "teacher" else s.QuizPublicOut
    return [out.model_validate(r) for r in rows]


@app.post("/lectures/{lecture_id}/quiz/generate", response_model=list[s.QuizOut], tags=["cards"])
def generate_lecture_quiz(
    lecture_id: int, body: s.QuizGenerateIn, user: m.User = Depends(teacher), db: Session = Depends(get_db)
):
    """Generate questions with a chosen size, difficulty and kinds from the lecture transcript.
    Synchronous (one LLM call per ~6k chars of transcript)."""
    lec = get_lecture(db, lecture_id, user, edit=True)
    t = db.scalar(select(m.Transcript).where(m.Transcript.lecture_id == lecture_id))
    if lec.status != "ready" or not t:
        raise HTTPException(409, "Bài giảng chưa xử lý xong")
    try:
        items = generate_quiz(t.segments, body.count, body.difficulty, list(dict.fromkeys(body.kinds)))
    except QuotaExceeded as e:
        raise HTTPException(429, str(e)) from None
    except httpx.HTTPError:
        raise HTTPException(502, "Dịch vụ AI đang lỗi hoặc quá tải, thử lại sau ít phút") from None
    if not items:
        raise HTTPException(502, "AI không tạo được câu hỏi hợp lệ, thử lại")
    if body.replace:
        for q in db.scalars(select(m.QuizQuestion).where(m.QuizQuestion.lecture_id == lecture_id)):
            db.delete(q)
    db.add_all(m.QuizQuestion(lecture_id=lecture_id, **q.model_dump()) for q in items)
    db.commit()
    return db.scalars(
        select(m.QuizQuestion).where(m.QuizQuestion.lecture_id == lecture_id).order_by(m.QuizQuestion.source_start)
    ).all()


@app.put("/quiz/{qid}", response_model=s.QuizOut, tags=["cards"])
def update_quiz(qid: int, body: s.QuizIn, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    if not 0 <= body.answer_index < len(body.options):
        raise HTTPException(422, "Đáp án không hợp lệ")
    q = owned_card(db, m.QuizQuestion, qid, user)
    for k, v in body.model_dump().items():
        setattr(q, k, v)
    q.edited = True
    db.commit()
    return q


@app.delete("/quiz/{qid}", status_code=204, tags=["cards"])
def delete_quiz(qid: int, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    db.delete(owned_card(db, m.QuizQuestion, qid, user))
    db.commit()


@app.post("/quiz/{qid}/answer", response_model=s.AnswerOut, tags=["study"])
def answer_quiz(qid: int, body: s.AnswerIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.get(m.QuizQuestion, qid)
    if not q:
        raise HTTPException(404, "Không tìm thấy câu hỏi")
    get_lecture(db, q.lecture_id, user)
    ok = body.choice == q.answer_index
    db.add(m.QuizAttempt(user_id=user.id, question_id=qid, choice=body.choice, correct=ok))
    db.commit()
    return {"correct": ok, "answer_index": q.answer_index, "explanation": q.explanation}


# ---------- spaced repetition ----------


def latest_logs(db: Session, user_id: int) -> dict[int, m.ReviewLog]:
    last = select(func.max(m.ReviewLog.id)).where(m.ReviewLog.user_id == user_id).group_by(m.ReviewLog.flashcard_id)
    return {r.flashcard_id: r for r in db.scalars(select(m.ReviewLog).where(m.ReviewLog.id.in_(last)))}


def as_utc(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)  # SQLite drops tzinfo


@app.get("/review/due", response_model=list[s.DueCard], tags=["study"])
def due_cards(class_id: int | None = None, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    visible = (
        select(m.Assignment.lecture_id)
        .join(m.Enrollment, m.Enrollment.class_id == m.Assignment.class_id)
        .where(m.Enrollment.user_id == user.id)
    )
    if class_id:
        visible = visible.where(m.Assignment.class_id == class_id)
    q = select(m.Flashcard, m.Lecture).join(m.Lecture).where(m.Lecture.id.in_(visible))
    logs, now = latest_logs(db, user.id), datetime.now(UTC)
    return [
        {
            **s.FlashcardOut.model_validate(c).model_dump(),
            "lecture_title": lec.title,
            "source_type": lec.source_type,
            "source_url": lec.source_url,
        }
        for c, lec in db.execute(q)
        if c.id not in logs or as_utc(logs[c.id].due_at) <= now
    ][:50]


@app.post("/review", response_model=s.ReviewOut, tags=["study"])
def review(body: s.ReviewIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    card = db.get(m.Flashcard, body.flashcard_id)
    if not card:
        raise HTTPException(404, "Không tìm thấy thẻ")
    get_lecture(db, card.lecture_id, user)
    prev = latest_logs(db, user.id).get(card.id)
    ease, interval, reps = sm2(body.quality, *((prev.ease, prev.interval, prev.repetitions) if prev else ()))
    due = datetime.now(UTC) + timedelta(days=interval)
    db.add(
        m.ReviewLog(
            user_id=user.id,
            flashcard_id=card.id,
            quality=body.quality,
            ease=ease,
            interval=interval,
            repetitions=reps,
            due_at=due,
        )
    )
    db.commit()
    return {"interval": interval, "ease": ease, "due_at": due}


# ---------- stats & export ----------


@app.get("/classes/{class_id}/stats", response_model=s.ClassStats, tags=["stats"])
def class_stats(class_id: int, user: m.User = Depends(teacher), db: Session = Depends(get_db)):
    get_class(db, class_id, user)
    qrows = db.execute(
        select(
            m.QuizQuestion.id,
            m.QuizQuestion.question,
            func.count(m.QuizAttempt.id),
            func.sum(case((m.QuizAttempt.correct, 0), else_=1)),
        )
        .join(m.QuizAttempt)
        # a shared lecture collects attempts from every class: count only this class's students
        .join(m.Enrollment, (m.Enrollment.user_id == m.QuizAttempt.user_id) & (m.Enrollment.class_id == class_id))
        .where(m.QuizQuestion.lecture_id.in_(assigned_to(class_id)))
        .group_by(m.QuizQuestion.id, m.QuizQuestion.question)
    )
    questions = sorted(
        ({"question_id": i, "question": q, "attempts": n, "wrong_rate": (w or 0) / n} for i, q, n, w in qrows),
        key=lambda x: -x["wrong_rate"],
    )
    card_ids = set(db.scalars(select(m.Flashcard.id).where(m.Flashcard.lecture_id.in_(assigned_to(class_id)))))
    now, students = datetime.now(UTC), []
    for u in db.scalars(select(m.User).join(m.Enrollment).where(m.Enrollment.class_id == class_id)):
        # ponytail: per-student queries, fine for class sizes < ~200
        logs = {k: v for k, v in latest_logs(db, u.id).items() if k in card_ids}
        attempts = db.scalars(
            select(m.QuizAttempt.correct)
            .join(m.QuizQuestion)
            .where(m.QuizAttempt.user_id == u.id, m.QuizQuestion.lecture_id.in_(assigned_to(class_id)))
        ).all()
        students.append(
            {
                "user_id": u.id,
                "name": u.name,
                "reviews": db.scalar(
                    select(func.count()).where(m.ReviewLog.user_id == u.id, m.ReviewLog.flashcard_id.in_(card_ids))
                )
                if card_ids
                else 0,
                "quiz_attempts": len(attempts),
                "quiz_accuracy": sum(attempts) / len(attempts) if attempts else 0,
                "due_now": len(card_ids - logs.keys()) + sum(as_utc(log.due_at) <= now for log in logs.values()),
            }
        )
    return {"questions": questions, "students": students}


@app.get("/lectures/{lecture_id}/export.csv", tags=["study"])
def export_csv(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Anki-importable plain text: front;back;tags."""
    lec = get_lecture(db, lecture_id, user)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["#separator:semicolon"])
    for c in db.scalars(select(m.Flashcard).where(m.Flashcard.lecture_id == lecture_id)):
        w.writerow([c.front, c.back, f"lecturecards lecture{lec.id}"])
    return StreamingResponse(
        iter(["﻿" + buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="lecture-{lec.id}.csv"'},
    )


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


@app.get("/lectures/{lecture_id}/export.apkg", tags=["study"])
def export_apkg(lecture_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Anki package; one deck per lecture, stable note GUIDs per flashcard."""
    lec = get_lecture(db, lecture_id, user)
    deck = genanki.Deck(1_726_150_402 + lec.id, f"LectureCards::{lec.title}")
    where = "Trang" if lec.source_type == "document" else "Phút"
    for c in db.scalars(select(m.Flashcard).where(m.Flashcard.lecture_id == lecture_id)):
        at = (
            int(c.source_start)
            if lec.source_type == "document"
            else f"{int(c.source_start) // 60}:{int(c.source_start) % 60:02d}"
        )
        deck.add_note(
            genanki.Note(
                model=ANKI_MODEL,
                fields=[html.escape(c.front), html.escape(c.back), html.escape(f"{lec.title} · {where} {at}")],
                guid=genanki.guid_for("lecturecards", c.id),
            )
        )
    fd, path = tempfile.mkstemp(suffix=".apkg")
    os.close(fd)
    genanki.Package(deck).write_to_file(path)
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"lecture-{lec.id}.apkg",
        background=BackgroundTask(os.unlink, path),
    )
