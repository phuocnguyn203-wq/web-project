import { Router } from "express";
import { z } from "zod";
import { getLecture, ownedItem } from "../access.ts";
import type { Ai, QuizItem } from "../ai.ts";
import { auth, teacher } from "../auth.ts";
import type { Db } from "../db.ts";
import { HttpError, id, parse } from "../http.ts";
import { QuizOptions } from "./lectures.ts";

const CardIn = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  source_start: z.number().default(0),
});
const QuizIn = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).min(2).max(6),
  answer_index: z.number().int(),
  explanation: z.string().default(""),
  source_start: z.number().default(0),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  kind: z.enum(["theory", "calculation", "true_false"]).default("theory"),
});
const Generate = QuizOptions.extend({ replace: z.boolean().default(false) }); // replace: drop current questions

const CARD = "id, lecture_id, front, back, source_start, edited";
const QUIZ = "id, lecture_id, question, options, answer_index, explanation, source_start, difficulty, kind, edited";

export function cardRoutes(db: Db, ai: Ai) {
  const r = Router();
  const authed = auth(db);
  const quizOf = (lectureId: number) =>
    db.query(`SELECT ${QUIZ} FROM quiz_questions WHERE lecture_id = $1 ORDER BY source_start, id`, [lectureId]);

  r.get("/lectures/:id/flashcards", authed, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    res.json(await db.query(`SELECT ${CARD} FROM flashcards WHERE lecture_id = $1 ORDER BY source_start, id`, [lec.id]));
  });

  r.post("/lectures/:id/flashcards", authed, teacher, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    const c = parse(CardIn, req.body);
    const [row] = await db.query(
      `INSERT INTO flashcards (lecture_id, front, back, source_start, edited) VALUES ($1, $2, $3, $4, false) RETURNING ${CARD}`,
      [lec.id, c.front, c.back, c.source_start],
    );
    res.json(row);
  });

  r.put("/flashcards/:id", authed, teacher, async (req, res) => {
    const card = await ownedItem(db, "flashcards", id(req.params.id), req.user);
    const c = parse(CardIn, req.body);
    const [row] = await db.query(
      `UPDATE flashcards SET front = $2, back = $3, source_start = $4, edited = true WHERE id = $1 RETURNING ${CARD}`,
      [card.id, c.front, c.back, c.source_start],
    );
    res.json(row);
  });

  r.delete("/flashcards/:id", authed, teacher, async (req, res) => {
    const card = await ownedItem(db, "flashcards", id(req.params.id), req.user);
    await db.query("DELETE FROM flashcards WHERE id = $1", [card.id]);
    res.status(204).end();
  });

  /** Teachers get answers; students don't until they submit. */
  r.get("/lectures/:id/quiz", authed, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    const rows = await quizOf(lec.id);
    res.json(
      req.user.role === "teacher"
        ? rows
        : rows.map(({ id, lecture_id, question, options, source_start, difficulty, kind }) => ({
            id, lecture_id, question, options, source_start, difficulty, kind,
          })),
    );
  });

  /** Generate questions with a chosen size, difficulty and kinds from the transcript. Synchronous. */
  r.post("/lectures/:id/quiz/generate", authed, teacher, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user, true);
    const body = parse(Generate, req.body);
    const segments = await db.query(
      `SELECT s.start, s."end", s.text FROM segments s JOIN transcripts t ON t.id = s.transcript_id
       WHERE t.lecture_id = $1 ORDER BY s.idx`,
      [lec.id],
    );
    if (lec.status !== "ready" || !segments.length) throw new HttpError(409, "Bài giảng chưa xử lý xong");
    const items = await ai.generateQuiz(segments as any, {
      count: body.count,
      difficulty: body.difficulty,
      kinds: [...new Set(body.kinds)],
    });
    if (!items.length) throw new HttpError(502, "AI không tạo được câu hỏi hợp lệ, thử lại");
    await db.tx(async (t) => {
      if (body.replace) await t.query("DELETE FROM quiz_questions WHERE lecture_id = $1", [lec.id]);
      for (const q of items) await insertQuiz(t, lec.id, q);
    });
    res.json(await quizOf(lec.id));
  });

  r.put("/quiz/:id", authed, teacher, async (req, res) => {
    const body = parse(QuizIn, req.body);
    if (body.answer_index < 0 || body.answer_index >= body.options.length) throw new HttpError(422, "Đáp án không hợp lệ");
    const q = await ownedItem(db, "quiz_questions", id(req.params.id), req.user);
    const [row] = await db.query(
      `UPDATE quiz_questions SET question = $2, options = $3, answer_index = $4, explanation = $5, source_start = $6,
         difficulty = $7, kind = $8, edited = true WHERE id = $1 RETURNING ${QUIZ}`,
      [q.id, body.question, JSON.stringify(body.options), body.answer_index, body.explanation, body.source_start,
        body.difficulty, body.kind],
    );
    res.json(row);
  });

  r.delete("/quiz/:id", authed, teacher, async (req, res) => {
    const q = await ownedItem(db, "quiz_questions", id(req.params.id), req.user);
    await db.query("DELETE FROM quiz_questions WHERE id = $1", [q.id]);
    res.status(204).end();
  });

  return r;
}

export const insertQuiz = (db: Db, lectureId: number, q: QuizItem) =>
  db.query(
    `INSERT INTO quiz_questions
       (lecture_id, question, options, answer_index, explanation, source_start, difficulty, kind, edited)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
    [lectureId, q.question, JSON.stringify(q.options), q.answer_index, q.explanation, q.source_start, q.difficulty,
      q.kind],
  );
