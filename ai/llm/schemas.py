from typing import Literal

from pydantic import BaseModel, Field, model_validator

Difficulty = Literal["easy", "medium", "hard"]
Kind = Literal["theory", "calculation", "true_false"]
TRUE_FALSE = ["Đúng", "Sai"]


class Flashcard(BaseModel):
    front: str = Field(min_length=3)
    back: str = Field(min_length=1)
    source_start: float = Field(ge=0, description="Timestamp (s) of the source segment")


class QuizItem(BaseModel):
    question: str = Field(min_length=3)
    options: list[str] = Field(min_length=2, max_length=6)
    answer_index: int
    explanation: str = ""
    source_start: float = Field(ge=0)
    difficulty: Difficulty = "medium"
    kind: Kind = "theory"

    @model_validator(mode="after")
    def _consistent(self):
        if self.kind == "true_false":
            # Models write "True/False", "Đúng/Sai", "đúng"…: normalise to the fixed pair.
            if len(self.options) != 2:
                raise ValueError("true_false needs exactly 2 options")
            if self.options[0].strip().lower() in ("sai", "false"):  # given as [Sai, Đúng]: keep the answer
                self.answer_index = 1 - self.answer_index
            self.options = TRUE_FALSE
        if not 0 <= self.answer_index < len(self.options):
            raise ValueError("answer_index out of range")
        return self


class CardSet(BaseModel):
    flashcards: list[Flashcard]
    quiz: list[QuizItem]
