import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, expect, test } from "vitest";
import type { Ai, Job, QuizItem } from "../src/ai.ts";
import { migrate, pglite } from "../src/db.ts";
import { sm2 } from "../src/sm2.ts";

process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "lc-uploads-"));
const { createApp } = await import("../src/app.ts"); // after UPLOAD_DIR is set
const { verifyPassword } = await import("../src/auth.ts");

// ---- fake AI service: records jobs; finish() plays the worker's part over the internal endpoints ----
const jobs: Job[] = [];
let aiDown = false;
const fakeQuiz = (o: Job["quiz"]): QuizItem[] =>
  Array.from({ length: o.count }, (_, i) => {
    const kind = o.kinds[i % o.kinds.length];
    return {
      question: `Câu ${i + 1}`,
      options: kind === "true_false" ? ["Đúng", "Sai"] : ["A", "B", "C", "D"],
      answer_index: 0,
      explanation: "vì A",
      source_start: i * 10,
      difficulty: o.difficulty === "mixed" ? "medium" : o.difficulty,
      kind,
    };
  });
const ai: Ai = {
  async enqueue(job) {
    if (aiDown) throw new Error("Dịch vụ AI không phản hồi, thử lại sau ít phút");
    jobs.push(job);
  },
  generateQuiz: async (_segments, o) => fakeQuiz(o),
  exportApkg: async () => Buffer.from("PK\x03\x04 fake apkg"),
};

const db = pglite();
const app = createApp(db, ai);
const api = () => request(app);
const INTERNAL = { "X-Internal-Token": "dev-internal-token" };

async function finish(job = jobs.at(-1)!) {
  const base = `/internal/lectures/${job.lecture_id}`;
  await api().post(`${base}/status`).set(INTERNAL).send({ status: "transcribing", progress: 10 }).expect(204);
  const cards = Array.from({ length: 6 }, (_, i) => ({ front: `Thẻ ${i}?`, back: `Đáp ${i}`, source_start: i * 30 }));
  await api()
    .post(`${base}/result`)
    .set(INTERNAL)
    .send({
      engine: "mock",
      mock: true,
      segments: [{ start: 0, end: 28, text: "cây nhị phân tìm kiếm" }, { start: 30, end: 58, text: "AVL" }],
      summary: "# Tóm tắt",
      flashcards: cards,
      quiz: fakeQuiz(job.quiz),
    })
    .expect(204);
}

type Headers = Record<string, string>;
let n = 0;
async function auth(role: "teacher" | "student") {
  const r = await api()
    .post("/auth/register")
    .send({ email: `u${++n}@x.vn`, name: `U${n}`, password: "secret1", role })
    .expect(200);
  return { Authorization: `Bearer ${r.body.access_token}` };
}
const newClass = async (t: Headers, name = "CTDL") => (await api().post("/classes").set(t).send({ name })).body;
const youtube = (t: Headers, classId: number, form: Record<string, string> = {}) =>
  api().post(`/classes/${classId}/lectures`).set(t).field({ title: "BST", youtube_url: "https://youtu.be/x", ...form });

beforeAll(() => migrate(db));

test("sm2", () => {
  expect(sm2(5)).toEqual({ ease: expect.closeTo(2.6), interval: 1, repetitions: 1 });
  const s = sm2(4, 2.5, 1, 1);
  expect([s.interval, s.repetitions]).toEqual([6, 2]);
  expect(sm2(4, s.ease, s.interval, s.repetitions).interval).toBe(Math.round(6 * s.ease));
  expect(sm2(1, 2.5, 30, 5)).toMatchObject({ interval: 1, repetitions: 0 });
  expect(sm2(0, 1.3).ease).toBe(1.3);
  expect(() => sm2(6)).toThrow();
});

test("end to end: teacher uploads, reviews and assigns; student studies; stats and exports", async () => {
  const t = await auth("teacher");
  const st = await auth("student");
  const cls = await newClass(t);
  await api().post("/classes/join").set(st).send({ code: cls.code.toLowerCase() }).expect(200);

  const lec = (await youtube(t, cls.id).expect(200)).body;
  expect(lec).toMatchObject({ status: "queued", progress: 0, published: false, class_ids: [] });
  expect(jobs.at(-1)).toMatchObject({ lecture_id: lec.id, source_type: "youtube", quiz: { count: 10 } });
  await finish();
  expect((await api().get(`/lectures/${lec.id}`).set(t)).body).toMatchObject({ status: "ready", progress: 100, mock: true });

  // unassigned lectures are hidden from students
  await api().get(`/lectures/${lec.id}`).set(st).expect(403);
  expect((await api().get(`/classes/${cls.id}/lectures`).set(st)).body).toEqual([]);
  const cards = (await api().get(`/lectures/${lec.id}/flashcards`).set(t)).body;
  await api().delete(`/flashcards/${cards[0].id}`).set(t).expect(204);
  const edited = (await api().put(`/flashcards/${cards[1].id}`).set(t).send({ front: "Sửa?", back: "Rồi" })).body;
  expect(edited).toMatchObject({ front: "Sửa?", edited: true });
  await api().put(`/lectures/${lec.id}/assignments`).set(t).send({ class_ids: [cls.id] }).expect(200);

  const due = (await api().get("/review/due").set(st)).body;
  expect(due).toHaveLength(cards.length - 1);
  expect(due[0]).toMatchObject({ lecture_title: "BST", source_type: "youtube" });
  const rev = (await api().post("/review").set(st).send({ flashcard_id: due[0].id, quality: 5 })).body;
  expect(rev.interval).toBe(1);
  expect((await api().get("/review/due").set(st)).body).toHaveLength(due.length - 1);

  const quiz = (await api().get(`/lectures/${lec.id}/quiz`).set(st)).body;
  expect(quiz[0]).not.toHaveProperty("answer_index");
  const answer = await api().post(`/quiz/${quiz[0].id}/answer`).set(st).send({ choice: 1 });
  expect(answer.body).toEqual({ correct: false, answer_index: 0, explanation: "vì A" });

  const stats = (await api().get(`/classes/${cls.id}/stats`).set(t)).body;
  expect(stats.questions[0]).toMatchObject({ question_id: quiz[0].id, attempts: 1, wrong_rate: 1 });
  expect(stats.students[0]).toMatchObject({ reviews: 1, quiz_attempts: 1, quiz_accuracy: 0, due_now: cards.length - 2 });
  await api().get(`/classes/${cls.id}/stats`).set(st).expect(403);

  const csv = await api().get(`/lectures/${lec.id}/export.csv`).set(st).expect(200);
  expect(csv.text).toContain("#separator:semicolon");
  expect(csv.text).toContain("Sửa?;Rồi;lecturecards");
  const token = st.Authorization.slice(7);
  const apkg = await api().get(`/lectures/${lec.id}/export.apkg?token=${token}`).expect(200);
  expect(apkg.headers["content-disposition"]).toContain(`lecture-${lec.id}.apkg`);
});

test("file upload: documents are flagged, sources validated, file served back", async () => {
  const t = await auth("teacher");
  const cls = await newClass(t);
  const upload = (name: string, form: Record<string, string> = {}) =>
    api().post(`/classes/${cls.id}/lectures`).set(t).field({ title: "Slide", ...form }).attach("file", Buffer.from("pptx"), name);

  const doc = (await upload("bai1.pptx").expect(200)).body;
  expect(doc.source_type).toBe("document");
  expect(doc).not.toHaveProperty("file_path");
  const job = jobs.at(-1)!;
  expect(job.source_type).toBe("document");
  expect(readFileSync(job.file_path!, "utf8")).toBe("pptx");
  await api().get(`/lectures/${doc.id}/media`).set(t).expect(200).expect("pptx");

  expect((await upload("bai.mp4").expect(200)).body.source_type).toBe("file");
  await upload("bai.mp4", { youtube_url: "https://youtu.be/x" }).expect(422); // two sources
  await api().post(`/classes/${cls.id}/lectures`).set(t).field({ title: "x" }).expect(422); // none
  await youtube(t, cls.id, { youtube_url: "https://vimeo.com/1" }).expect(422);

  await api().delete(`/lectures/${doc.id}`).set(t).expect(204);
  expect(existsSync(job.file_path!)).toBe(false);
});

test("quiz options from the upload form reach the worker; bad options are refused", async () => {
  const t = await auth("teacher");
  const cls = await newClass(t);
  await youtube(t, cls.id, { quiz_count: "4", quiz_difficulty: "easy", quiz_kinds: "true_false" }).expect(200);
  expect(jobs.at(-1)!.quiz).toEqual({ count: 4, difficulty: "easy", kinds: ["true_false"] });
  await finish();
  await youtube(t, cls.id, { quiz_kinds: "essay" }).expect(422);
  await youtube(t, cls.id, { quiz_count: "99" }).expect(422);
});

test("generate quiz on demand: add, replace, validation", async () => {
  const t = await auth("teacher");
  const cls = await newClass(t);
  const lec = (await youtube(t, cls.id).expect(200)).body;
  const gen = (body: object) => api().post(`/lectures/${lec.id}/quiz/generate`).set(t).send(body);
  await gen({ count: 3 }).expect(409); // not processed yet
  await finish();

  const body = { count: 5, difficulty: "hard", kinds: ["true_false", "calculation"], replace: true };
  const quiz = (await gen(body).expect(200)).body;
  expect(quiz).toHaveLength(5);
  expect(new Set(quiz.map((q: QuizItem) => q.kind))).toEqual(new Set(["true_false", "calculation"]));
  expect(quiz.every((q: QuizItem) => q.difficulty === "hard")).toBe(true);
  expect((await gen({ count: 2 }).expect(200)).body).toHaveLength(7); // added, not replaced
  await gen({ ...body, count: 99 }).expect(422);

  await api().put(`/quiz/${quiz[0].id}`).set(t).send({ question: "Q", options: ["a", "b"], answer_index: 2 }).expect(422);
  const fixed = await api().put(`/quiz/${quiz[0].id}`).set(t).send({ question: "Q", options: ["a", "b"], answer_index: 1 });
  expect(fixed.body).toMatchObject({ answer_index: 1, edited: true, kind: "theory" });
});

test("one lecture assigned to many classes", async () => {
  const t = await auth("teacher");
  const other = await auth("teacher");
  const [a, b] = [await newClass(t, "A"), await newClass(t, "B")];
  const foreign = await newClass(other, "X");
  const [sa, sb] = [await auth("student"), await auth("student")];
  await api().post("/classes/join").set(sa).send({ code: a.code });
  await api().post("/classes/join").set(sb).send({ code: b.code });
  const lec = (await youtube(t, a.id)).body;
  await finish();
  const url = `/lectures/${lec.id}/assignments`;

  await api().put(url).set(t).send({ class_ids: [foreign.id] }).expect(403);
  const out = (await api().put(url).set(t).send({ class_ids: [a.id, b.id] })).body;
  expect(out).toMatchObject({ class_ids: [a.id, b.id].sort((x, y) => x - y), published: true });
  expect((await api().get(`/classes/${b.id}/lectures`).set(sb)).body.map((l: { id: number }) => l.id)).toEqual([lec.id]);
  expect((await api().get(`/classes/${b.id}`).set(t)).body.lecture_count).toBe(1);
  expect((await api().get("/review/due").set(sa)).body).toEqual((await api().get("/review/due").set(sb)).body);

  expect((await api().put(url).set(t).send({ class_ids: [a.id] })).body.class_ids).toEqual([a.id]);
  await api().get(`/lectures/${lec.id}`).set(sb).expect(403); // taken back from B
  await api().get(`/lectures/${lec.id}`).set(sa).expect(200);
});

test("auth: login, wrong password, teacher sign-up lock, Python-era password hashes", async () => {
  await api().post("/auth/register").send({ email: "Login@X.vn", name: "L", password: "secret1", role: "student" });
  const ok = await api().post("/auth/login").send({ email: "login@x.vn", password: "secret1" }).expect(200);
  expect(ok.body.user).toMatchObject({ email: "login@x.vn", role: "student" });
  await api().post("/auth/login").send({ email: "login@x.vn", password: "nope" }).expect(401);
  await api().post("/auth/register").send({ email: "login@x.vn", name: "L", password: "secret1", role: "student" }).expect(409);
  await api().get("/auth/me").expect(401);
  await api().get("/auth/me").set({ Authorization: "Bearer junk" }).expect(401);

  process.env.ALLOW_TEACHER_SIGNUP = "0";
  const body = { name: "x", password: "secret1" };
  await api().post("/auth/register").send({ ...body, email: "t9@x.vn", role: "teacher" }).expect(403);
  await api().post("/auth/register").send({ ...body, email: "s9@x.vn", role: "student" }).expect(200);
  delete process.env.ALLOW_TEACHER_SIGNUP;

  const python = "0123456789abcdef0123456789abcdef$c5b9694faaa657f4a16584e6a955e036551479e7f33578f835ece1a11e0bbe23";
  expect(await verifyPassword("secret1", python)).toBe(true);
  expect(await verifyPassword("secret2", python)).toBe(false);
});

test("worker endpoints need the internal token; failures and AI outages reach the teacher", async () => {
  const t = await auth("teacher");
  const cls = await newClass(t);
  const lec = (await youtube(t, cls.id)).body;
  await api().post(`/internal/lectures/${lec.id}/status`).send({ status: "failed" }).expect(401);
  await api()
    .post(`/internal/lectures/${lec.id}/status`)
    .set(INTERNAL)
    .send({ status: "failed", error: "Không trích được chữ" })
    .expect(204);
  expect((await api().get(`/lectures/${lec.id}`).set(t)).body).toMatchObject({ status: "failed", error: "Không trích được chữ" });

  aiDown = true;
  const down = (await youtube(t, cls.id).expect(200)).body;
  aiDown = false;
  expect(down).toMatchObject({ status: "failed", error: "Dịch vụ AI không phản hồi, thử lại sau ít phút" });
});

test("production refuses a placeholder JWT secret", () => {
  const run = (secret: string) =>
    execFileSync(process.execPath, ["-e", "await import('./src/auth.ts')", "--input-type=module"], {
      env: { ...process.env, APP_ENV: "production", JWT_SECRET: secret },
      stdio: "pipe",
    });
  expect(() => run("change-me-to-a-64-char-random-string")).toThrow(/JWT_SECRET/);
  expect(() => run("f".repeat(64))).not.toThrow();
});

test("every endpoint in the OpenAPI contract is served", async () => {
  const spec = JSON.parse(readFileSync(new URL("../../docs/openapi.json", import.meta.url), "utf8"));
  expect((await api().get("/no-such-route")).body.detail).toBe("Not Found"); // the probe below can tell
  const missing: string[] = [];
  for (const [p, ops] of Object.entries<Record<string, unknown>>(spec.paths))
    for (const method of Object.keys(ops)) {
      const res = await (api() as any)[method](p.replace(/{\w+}/g, "1"));
      if (res.body?.detail === "Not Found") missing.push(`${method.toUpperCase()} ${p}`);
    }
  expect(missing).toEqual([]);
});
