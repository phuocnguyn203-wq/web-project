import { Router } from "express";
import { z } from "zod";
import { assignedTo, getClass, getLecture } from "../access.ts";
import type { Ai } from "../ai.ts";
import { auth, teacher } from "../auth.ts";
import type { Db } from "../db.ts";
import { HttpError, id, parse } from "../http.ts";
import { sm2 } from "../sm2.ts";

const Answer = z.object({ choice: z.number().int() });
const Review = z.object({ flashcard_id: z.number().int(), quality: z.number().int().min(0).max(5) });

/** The latest review per card for one user: it holds the SM-2 state. */
const LATEST = `(SELECT DISTINCT ON (flashcard_id) * FROM review_logs WHERE user_id = $1 ORDER BY flashcard_id, id DESC)`;

export function studyRoutes(db: Db, ai: Ai) {
  const r = Router();
  const authed = auth(db);

  r.post("/quiz/:id/answer", authed, async (req, res) => {
    const { choice } = parse(Answer, req.body);
    const [q] = await db.query("SELECT * FROM quiz_questions WHERE id = $1", [id(req.params.id)]);
    if (!q) throw new HttpError(404, "Không tìm thấy câu hỏi");
    await getLecture(db, q.lecture_id, req.user);
    const correct = choice === q.answer_index;
    await db.query(
      "INSERT INTO quiz_attempts (user_id, question_id, choice, correct, created_at) VALUES ($1, $2, $3, $4, now())",
      [req.user.id, q.id, choice, correct],
    );
    res.json({ correct, answer_index: q.answer_index, explanation: q.explanation });
  });

  /** Cards never reviewed or past their due date, from lectures assigned to the student's classes. */
  r.get("/review/due", authed, async (req, res) => {
    const classId = req.query.class_id ? id(req.query.class_id) : null;
    res.json(
      await db.query(
        `SELECT f.id, f.lecture_id, f.front, f.back, f.source_start, f.edited,
                l.title AS lecture_title, l.source_type, l.source_url
         FROM flashcards f JOIN lectures l ON l.id = f.lecture_id
         LEFT JOIN ${LATEST} r ON r.flashcard_id = f.id
         WHERE l.id IN (SELECT a.lecture_id FROM assignments a JOIN enrollments e ON e.class_id = a.class_id
                        WHERE e.user_id = $1 AND ($2::int IS NULL OR a.class_id = $2))
           AND (r.due_at IS NULL OR r.due_at <= now())
         ORDER BY f.id LIMIT 50`,
        [req.user.id, classId],
      ),
    );
  });

  r.post("/review", authed, async (req, res) => {
    const body = parse(Review, req.body);
    const [card] = await db.query("SELECT * FROM flashcards WHERE id = $1", [body.flashcard_id]);
    if (!card) throw new HttpError(404, "Không tìm thấy thẻ");
    await getLecture(db, card.lecture_id, req.user);
    const [prev] = await db.query(`SELECT * FROM ${LATEST} r WHERE r.flashcard_id = $2`, [req.user.id, card.id]);
    const s = prev ? sm2(body.quality, prev.ease, prev.interval, prev.repetitions) : sm2(body.quality);
    const due = new Date(Date.now() + s.interval * 86_400_000);
    await db.query(
      `INSERT INTO review_logs (user_id, flashcard_id, quality, ease, interval, repetitions, due_at, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [req.user.id, card.id, body.quality, s.ease, s.interval, s.repetitions, due],
    );
    res.json({ interval: s.interval, ease: s.ease, due_at: due });
  });

  r.get("/classes/:id/stats", authed, teacher, async (req, res) => {
    const classId = id(req.params.id);
    await getClass(db, classId, req.user);
    // A shared lecture collects attempts from every class: count only this class's students.
    const questions = await db.query(
      `SELECT q.id AS question_id, q.question, count(*)::int AS attempts,
              avg(CASE WHEN a.correct THEN 0 ELSE 1 END)::float8 AS wrong_rate
       FROM quiz_questions q JOIN quiz_attempts a ON a.question_id = q.id
       JOIN enrollments e ON e.user_id = a.user_id AND e.class_id = $1
       WHERE q.lecture_id IN ${assignedTo("$1")}
       GROUP BY q.id, q.question ORDER BY wrong_rate DESC, q.id`,
      [classId],
    );
    const students = await db.query(
      `WITH cards AS (SELECT id FROM flashcards WHERE lecture_id IN ${assignedTo("$1")}),
            latest AS (SELECT DISTINCT ON (user_id, flashcard_id) user_id, due_at FROM review_logs
                       WHERE flashcard_id IN (SELECT id FROM cards) ORDER BY user_id, flashcard_id, id DESC),
            attempts AS (SELECT a.user_id, a.correct FROM quiz_attempts a JOIN quiz_questions q ON q.id = a.question_id
                         WHERE q.lecture_id IN ${assignedTo("$1")})
       SELECT u.id AS user_id, u.name,
         (SELECT count(*)::int FROM review_logs r WHERE r.user_id = u.id AND r.flashcard_id IN (SELECT id FROM cards))
           AS reviews,
         (SELECT count(*)::int FROM attempts WHERE user_id = u.id) AS quiz_attempts,
         COALESCE((SELECT avg(CASE WHEN correct THEN 1 ELSE 0 END)::float8 FROM attempts WHERE user_id = u.id), 0)
           AS quiz_accuracy,
         -- never reviewed + reviewed and due again
         (SELECT count(*)::int FROM cards) - (SELECT count(*)::int FROM latest WHERE user_id = u.id)
           + (SELECT count(*)::int FROM latest WHERE user_id = u.id AND due_at <= now()) AS due_now
       FROM users u JOIN enrollments e ON e.user_id = u.id
       WHERE e.class_id = $1 ORDER BY u.id`,
      [classId],
    );
    res.json({ questions, students });
  });

  const cardsOf = (lectureId: number) =>
    db.query("SELECT id, front, back, source_start FROM flashcards WHERE lecture_id = $1 ORDER BY source_start, id", [
      lectureId,
    ]);

  /** Anki-importable plain text: front;back;tags. */
  r.get("/lectures/:id/export.csv", authed, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    const cell = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
    const lines = ["#separator:semicolon", ...(await cardsOf(lec.id)).map((c) =>
      [c.front, c.back, `lecturecards lecture${lec.id}`].map(cell).join(";"),
    )];
    res
      .type("text/csv; charset=utf-8")
      .attachment(`lecture-${lec.id}.csv`)
      .send("﻿" + lines.join("\r\n") + "\r\n"); // BOM so Excel reads Vietnamese correctly
  });

  r.get("/lectures/:id/export.apkg", authed, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    const file = await ai.exportApkg({
      lecture_id: lec.id,
      title: lec.title,
      source_type: lec.source_type,
      cards: await cardsOf(lec.id) as any,
    });
    res.type("application/octet-stream").attachment(`lecture-${lec.id}.apkg`).send(file);
  });

  return r;
}
