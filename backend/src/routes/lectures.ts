import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { type RequestHandler, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { LECTURE, assignedTo, getClass, getLecture, lectureOut } from "../access.ts";
import type { Ai } from "../ai.ts";
import { auth, teacher } from "../auth.ts";
import type { Db } from "../db.ts";
import { HttpError, id, parse } from "../http.ts";

export const QuizOptions = z.object({
  count: z.coerce.number().int().min(1).max(30).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("medium"),
  kinds: z.array(z.enum(["theory", "calculation", "true_false"])).min(1).default(["theory"]),
});
const Assign = z.object({ class_ids: z.array(z.number().int()) }); // the full set; [] takes it back everywhere
const DOC_SUFFIXES = new Set([".pdf", ".pptx"]); // text is extracted per page instead of transcribed

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 1024);
mkdirSync(UPLOAD_DIR, { recursive: true });
const uploader = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID().replaceAll("-", "") + path.extname(file.originalname).slice(0, 10)),
  }),
  limits: { fileSize: MAX_UPLOAD_MB << 20 },
});
const upload: RequestHandler = (req, res, next) =>
  uploader.single("file")(req, res, (err: any) =>
    next(err?.code === "LIMIT_FILE_SIZE" ? new HttpError(413, `File vượt quá ${MAX_UPLOAD_MB} MB`) : err),
  );
const removeFile = (p?: string | null) => {
  try {
    if (p) unlinkSync(p);
  } catch {} // already gone
};

export function lectureRoutes(db: Db, ai: Ai) {
  const r = Router();
  const authed = auth(db);
  const readLecture = async (lectureId: number) =>
    (await db.query(`SELECT ${LECTURE} FROM lectures l WHERE l.id = $1`, [lectureId]))[0];

  /** Students: lectures assigned to the class. Teachers: also drafts uploaded here. */
  r.get("/classes/:id/lectures", authed, async (req, res) => {
    const classId = id(req.params.id);
    await getClass(db, classId, req.user);
    const where = req.user.role === "teacher" ? `l.id IN ${assignedTo("$1")} OR l.class_id = $1` : `l.id IN ${assignedTo("$1")}`;
    res.json(await db.query(`SELECT ${LECTURE} FROM lectures l WHERE ${where} ORDER BY l.id DESC`, [classId]));
  });

  r.post("/classes/:id/lectures", authed, teacher, upload, async (req, res) => {
    const file = req.file;
    let lectureId: number;
    let job: Parameters<Ai["enqueue"]>[0];
    try {
      const classId = id(req.params.id);
      await getClass(db, classId, req.user);
      const { title, youtube_url: youtube } = parse(
        z.object({ title: z.string().trim().min(1).max(300), youtube_url: z.string().trim().optional() }),
        req.body,
      );
      if (!!youtube === !!file) throw new HttpError(422, "Cần đúng một nguồn: file hoặc link YouTube");
      if (youtube && !youtube.includes("youtu")) throw new HttpError(422, "Link YouTube không hợp lệ");
      const quiz = QuizOptions.safeParse({
        count: req.body.quiz_count,
        difficulty: req.body.quiz_difficulty,
        kinds: req.body.quiz_kinds?.split(","),
      });
      if (!quiz.success) throw new HttpError(422, "Tuỳ chọn câu hỏi không hợp lệ");
      const sourceType = youtube
        ? "youtube"
        : DOC_SUFFIXES.has(path.extname(file!.filename).toLowerCase())
          ? "document"
          : "file";
      const [row] = await db.query(
        `INSERT INTO lectures (class_id, title, source_type, source_url, file_path, status, progress, mock, created_at)
         VALUES ($1, $2, $3, $4, $5, 'queued', 0, false, now()) RETURNING id`,
        [classId, title, sourceType, youtube || null, file?.path ?? null],
      );
      lectureId = row.id;
      job = { lecture_id: lectureId, source_type: sourceType, source_url: youtube || null, file_path: file?.path ?? null, quiz: quiz.data };
    } catch (e) {
      removeFile(file?.path);
      throw e;
    }
    try {
      await ai.enqueue(job);
    } catch (e) {
      // keep the lecture so the teacher sees why it stopped
      await db.query("UPDATE lectures SET status = 'failed', error = $2 WHERE id = $1", [lectureId, (e as Error).message]);
    }
    res.json(await readLecture(lectureId));
  });

  /** Poll this for job progress (status + progress 0..100). */
  r.get("/lectures/:id", authed, async (req, res) => {
    res.json(lectureOut(await getLecture(db, id(req.params.id), req.user)));
  });

  /** Set which of the teacher's classes see this lecture. One lecture, shared cards, many classes. */
  r.put("/lectures/:id/assignments", authed, teacher, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    const ids = [...new Set(parse(Assign, req.body).class_ids)];
    if (ids.length && lec.status !== "ready") throw new HttpError(409, "Bài giảng chưa xử lý xong");
    for (const classId of ids) await getClass(db, classId, req.user);
    await db.tx(async (t) => {
      await t.query("DELETE FROM assignments WHERE lecture_id = $1 AND NOT (class_id = ANY($2::int[]))", [lec.id, ids]);
      for (const classId of ids)
        await t.query(
          "INSERT INTO assignments (lecture_id, class_id, assigned_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING",
          [lec.id, classId],
        );
    });
    res.json(await readLecture(lec.id));
  });

  r.delete("/lectures/:id", authed, teacher, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    removeFile(lec.file_path);
    await db.query("DELETE FROM lectures WHERE id = $1", [lec.id]);
    res.status(204).end();
  });

  r.get("/lectures/:id/media", authed, async (req, res, next) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    if (!lec.file_path) throw new HttpError(404, "Bài giảng không có file");
    // sendFile handles Range requests, so the <video> element can seek to a card's timestamp
    res.sendFile(path.resolve(lec.file_path), (err) => {
      if (err && !res.headersSent) next(new HttpError(404, "Không tìm thấy file bài giảng"));
    });
  });

  r.get("/lectures/:id/transcript", authed, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    res.json(
      await db.query(
        `SELECT s.idx, s.start, s."end", s.text FROM segments s JOIN transcripts t ON t.id = s.transcript_id
         WHERE t.lecture_id = $1 ORDER BY s.idx`,
        [lec.id],
      ),
    );
  });

  r.get("/lectures/:id/summary", authed, async (req, res) => {
    const lec = await getLecture(db, id(req.params.id), req.user);
    const [s] = await db.query("SELECT content FROM summaries WHERE lecture_id = $1", [lec.id]);
    res.json({ content: s?.content ?? "" });
  });

  return r;
}
