-- LectureCards schema. Idempotent on purpose: a database created by the earlier Python backend
-- (Alembic, same tables and columns) is adopted as-is instead of failing on "already exists".

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10)  NOT NULL            -- teacher | student
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE TABLE IF NOT EXISTS classes (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  code       VARCHAR(8)   NOT NULL,              -- students join with it
  teacher_id INTEGER      NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_classes_code ON classes (code);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id   INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  class_id  INTEGER     NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, class_id)
);

CREATE TABLE IF NOT EXISTS lectures (
  id          SERIAL PRIMARY KEY,
  class_id    INTEGER      NOT NULL REFERENCES classes (id) ON DELETE CASCADE, -- where it was uploaded
  title       VARCHAR(300) NOT NULL,
  source_type VARCHAR(10)  NOT NULL,             -- file | youtube | document
  source_url  VARCHAR(500),
  file_path   VARCHAR(500),
  status      VARCHAR(20)  NOT NULL DEFAULT 'queued', -- queued | transcribing | summarizing | generating | ready | failed
  progress    INTEGER      NOT NULL DEFAULT 0,
  error       TEXT,
  mock        BOOLEAN      NOT NULL DEFAULT false, -- produced by a stand-in engine, not the lecture itself
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_lectures_class_id ON lectures (class_id);

-- One lecture can be given to many classes; cards and quiz stay shared.
CREATE TABLE IF NOT EXISTS assignments (
  lecture_id  INTEGER     NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  class_id    INTEGER     NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lecture_id, class_id)
);
CREATE INDEX IF NOT EXISTS ix_assignments_class_id ON assignments (class_id);

-- Python-era databases that predate assignments still carry lectures.published.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lectures' AND column_name = 'published') THEN
    INSERT INTO assignments (lecture_id, class_id, assigned_at)
      SELECT id, class_id, created_at FROM lectures WHERE published ON CONFLICT DO NOTHING;
    ALTER TABLE lectures DROP COLUMN published;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS transcripts (
  id         SERIAL PRIMARY KEY,
  lecture_id INTEGER     NOT NULL UNIQUE REFERENCES lectures (id) ON DELETE CASCADE,
  engine     VARCHAR(30) NOT NULL,               -- captions:vi-..., api, document, mock
  text       TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id            SERIAL PRIMARY KEY,
  transcript_id INTEGER          NOT NULL REFERENCES transcripts (id) ON DELETE CASCADE,
  idx           INTEGER          NOT NULL,
  start         DOUBLE PRECISION NOT NULL,       -- seconds, or page number for documents
  "end"         DOUBLE PRECISION NOT NULL,
  text          TEXT             NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_segments_transcript_id ON segments (transcript_id);

CREATE TABLE IF NOT EXISTS summaries (
  id         SERIAL PRIMARY KEY,
  lecture_id INTEGER NOT NULL UNIQUE REFERENCES lectures (id) ON DELETE CASCADE,
  content    TEXT    NOT NULL                    -- markdown
);

CREATE TABLE IF NOT EXISTS flashcards (
  id           SERIAL PRIMARY KEY,
  lecture_id   INTEGER          NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  front        TEXT             NOT NULL,
  back         TEXT             NOT NULL,
  source_start DOUBLE PRECISION NOT NULL DEFAULT 0,
  edited       BOOLEAN          NOT NULL DEFAULT false -- teacher touched it
);
CREATE INDEX IF NOT EXISTS ix_flashcards_lecture_id ON flashcards (lecture_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id           SERIAL PRIMARY KEY,
  lecture_id   INTEGER          NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  question     TEXT             NOT NULL,
  options      JSON             NOT NULL,
  answer_index INTEGER          NOT NULL,
  explanation  TEXT             NOT NULL DEFAULT '',
  source_start DOUBLE PRECISION NOT NULL DEFAULT 0,
  edited       BOOLEAN          NOT NULL DEFAULT false,
  difficulty   VARCHAR(10)      NOT NULL DEFAULT 'medium', -- easy | medium | hard
  kind         VARCHAR(12)      NOT NULL DEFAULT 'theory'  -- theory | calculation | true_false
);
CREATE INDEX IF NOT EXISTS ix_quiz_questions_lecture_id ON quiz_questions (lecture_id);

-- One row per review; the latest row per (user, card) holds the SM-2 state.
CREATE TABLE IF NOT EXISTS review_logs (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  flashcard_id INTEGER          NOT NULL REFERENCES flashcards (id) ON DELETE CASCADE,
  quality      INTEGER          NOT NULL,        -- 0..5
  ease         DOUBLE PRECISION NOT NULL,
  interval     INTEGER          NOT NULL,        -- days
  repetitions  INTEGER          NOT NULL,
  due_at       TIMESTAMPTZ      NOT NULL,
  reviewed_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_review_logs_user_id ON review_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_review_logs_flashcard_id ON review_logs (flashcard_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  question_id INTEGER     NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
  choice      INTEGER     NOT NULL,
  correct     BOOLEAN     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_user_id ON quiz_attempts (user_id);
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_question_id ON quiz_attempts (question_id);
