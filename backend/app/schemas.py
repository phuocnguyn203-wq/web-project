"""API contract. `python -m app.export_openapi` writes docs/openapi.json from these."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6)
    role: Literal["teacher", "student"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    email: str
    name: str
    role: str


class TokenOut(BaseModel):
    access_token: str
    user: UserOut


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class JoinIn(BaseModel):
    code: str


class ClassOut(ORM):
    id: int
    name: str
    code: str
    teacher_id: int
    student_count: int = 0
    lecture_count: int = 0


class LectureOut(ORM):
    id: int
    class_id: int
    title: str
    source_type: str
    source_url: str | None
    status: str
    progress: int
    error: str | None
    published: bool  # assigned to at least one class
    class_ids: list[int] = []  # classes it is assigned to
    mock: bool = False
    created_at: datetime


class AssignIn(BaseModel):
    class_ids: list[int]  # the full set; [] takes the lecture back from every class


class SegmentOut(ORM):
    idx: int
    start: float
    end: float
    text: str


class SummaryOut(BaseModel):
    content: str


class FlashcardIn(BaseModel):
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)
    source_start: float = 0


class FlashcardOut(ORM):
    id: int
    lecture_id: int
    front: str
    back: str
    source_start: float
    edited: bool = False


Difficulty = Literal["easy", "medium", "hard"]
Kind = Literal["theory", "calculation", "true_false"]


class QuizIn(BaseModel):
    question: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    answer_index: int
    explanation: str = ""
    source_start: float = 0
    difficulty: Difficulty = "medium"
    kind: Kind = "theory"


class QuizOut(QuizIn, ORM):
    id: int
    lecture_id: int
    edited: bool = False


class QuizPublicOut(ORM):
    """Students don't get the answer until they submit."""

    id: int
    lecture_id: int
    question: str
    options: list[str]
    source_start: float
    difficulty: str
    kind: str


class QuizGenerateIn(BaseModel):
    count: int = Field(10, ge=1, le=30)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "medium"
    kinds: list[Kind] = Field(default=["theory"], min_length=1)
    replace: bool = False  # True: drop the current questions first


class AnswerIn(BaseModel):
    choice: int


class AnswerOut(BaseModel):
    correct: bool
    answer_index: int
    explanation: str


class ReviewIn(BaseModel):
    flashcard_id: int
    quality: int = Field(ge=0, le=5)


class ReviewOut(BaseModel):
    interval: int
    ease: float
    due_at: datetime


class DueCard(FlashcardOut):
    lecture_title: str
    source_type: str
    source_url: str | None


class QuestionStat(BaseModel):
    question_id: int
    question: str
    attempts: int
    wrong_rate: float


class StudentStat(BaseModel):
    user_id: int
    name: str
    reviews: int
    quiz_attempts: int
    quiz_accuracy: float
    due_now: int


class ClassStats(BaseModel):
    questions: list[QuestionStat]
    students: list[StudentStat]
