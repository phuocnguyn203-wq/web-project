// Called only by the AI worker (shared INTERNAL_TOKEN); Caddy also refuses /api/internal/* from outside.
import { timingSafeEqual } from "node:crypto";
import { type RequestHandler, Router } from "express";
import { z } from "zod";
import { internalToken } from "../ai.ts";
import type { Db } from "../db.ts";
import { HttpError, id, parse } from "../http.ts";
import { insertQuiz } from "./cards.ts";

const Status = z.object({
  status: z.enum(["transcribing", "summarizing", "generating", "failed"]),
  progress: z.number().int().min(0).max(100).optional(),
  error: z.string().optional(),
});
const Result = z.object({
  engine: z.string().max(30),
  mock: z.boolean(),
  segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
  summary: z.string(),
  flashcards: z.array(z.object({ front: z.string(), back: z.string(), source_start: z.number() })),
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      answer_index: z.number().int(),
      explanation: z.string(),
      source_start: z.number(),
      difficulty: z.string(),
      kind: z.string(),
    }),
  ),
});

const checkToken: RequestHandler = (req, _res, next) => {
  const got = Buffer.from(req.get("X-Internal-Token") ?? "");
  const want = Buffer.from(internalToken());
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, "bad internal token");
  next();
};

export function internalRoutes(db: Db) {
  const r = Router();
  r.use("/internal", checkToken);

  r.post("/internal/lectures/:id/status", async (req, res) => {
    const s = parse(Status, req.body);
    await db.query(
      "UPDATE lectures SET status = $2, progress = COALESCE($3, progress), error = $4 WHERE id = $1",
      [id(req.params.id), s.status, s.progress ?? null, s.error ?? null],
    );
    res.status(204).end();
  });

  /** Everything the pipeline produced, stored atomically; the lecture becomes ready in the same transaction. */
  r.post("/internal/lectures/:id/result", async (req, res) => {
    const lectureId = id(req.params.id);
    const out = parse(Result, req.body);
    await db.tx(async (t) => {
      if (!(await t.query("SELECT 1 FROM lectures WHERE id = $1", [lectureId])).length)
        throw new HttpError(404, "lecture deleted while processing");
      const [tr] = await t.query(
        "INSERT INTO transcripts (lecture_id, engine, text) VALUES ($1, $2, $3) RETURNING id",
        [lectureId, out.engine, out.segments.map((s) => s.text).join(" ")],
      );
      for (const [i, s] of out.segments.entries())
        await t.query('INSERT INTO segments (transcript_id, idx, start, "end", text) VALUES ($1, $2, $3, $4, $5)', [
          tr.id, i, s.start, s.end, s.text,
        ]);
      await t.query("INSERT INTO summaries (lecture_id, content) VALUES ($1, $2)", [lectureId, out.summary]);
      for (const c of out.flashcards)
        await t.query(
          "INSERT INTO flashcards (lecture_id, front, back, source_start, edited) VALUES ($1, $2, $3, $4, false)",
          [lectureId, c.front, c.back, c.source_start],
        );
      for (const q of out.quiz) await insertQuiz(t, lectureId, q);
      await t.query("UPDATE lectures SET status = 'ready', progress = 100, error = NULL, mock = $2 WHERE id = $1", [
        lectureId, out.mock,
      ]);
    });
    res.status(204).end();
  });

  return r;
}
