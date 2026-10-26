import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { assignedTo, getClass } from "../access.ts";
import { auth, hashPassword, makeToken, teacher, type User, verifyPassword } from "../auth.ts";
import type { Db, Row } from "../db.ts";
import { HttpError, id, parse } from "../http.ts";

const Register = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(6),
  role: z.enum(["teacher", "student"]),
});
const Login = z.object({ email: z.string(), password: z.string() });
const ClassIn = z.object({ name: z.string().trim().min(1).max(200) });
const Join = z.object({ code: z.string() });

export function accountRoutes(db: Db) {
  const r = Router();
  const authed = auth(db);
  const session = (user: User) => ({ access_token: makeToken(user), user });

  r.post("/auth/register", async (req, res) => {
    const body = parse(Register, req.body);
    // Teachers spend the LLM quota: on a public server, close teacher sign-up once your own account exists.
    if (body.role === "teacher" && (process.env.ALLOW_TEACHER_SIGNUP ?? "1") !== "1")
      throw new HttpError(403, "Đăng ký tài khoản giảng viên đang đóng. Liên hệ quản trị viên.");
    const email = body.email.toLowerCase();
    if ((await db.query("SELECT 1 FROM users WHERE email = $1", [email])).length)
      throw new HttpError(409, "Email đã được sử dụng");
    const [user] = await db.query<User>(
      "INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role",
      [email, body.name, body.role, await hashPassword(body.password)],
    );
    res.json(session(user));
  });

  r.post("/auth/login", async (req, res) => {
    const body = parse(Login, req.body);
    const [row] = await db.query("SELECT * FROM users WHERE email = $1", [body.email.trim().toLowerCase()]);
    if (!row || !(await verifyPassword(body.password, row.password_hash)))
      throw new HttpError(401, "Sai email hoặc mật khẩu");
    res.json(session({ id: row.id, email: row.email, name: row.name, role: row.role }));
  });

  r.get("/auth/me", authed, (req, res) => void res.json(req.user));

  const classOut = async (c: Row) => {
    const [n] = await db.query(
      `SELECT (SELECT count(*)::int FROM enrollments WHERE class_id = $1) AS student_count,
              (SELECT count(*)::int FROM lectures WHERE class_id = $1 OR id IN ${assignedTo("$1")}) AS lecture_count`,
      [c.id],
    );
    return { id: c.id, name: c.name, code: c.code, teacher_id: c.teacher_id, ...n };
  };

  r.post("/classes", authed, teacher, async (req, res) => {
    const { name } = parse(ClassIn, req.body);
    const [c] = await db.query(
      "INSERT INTO classes (name, teacher_id, code, created_at) VALUES ($1, $2, $3, now()) RETURNING *",
      [name, req.user.id, randomBytes(3).toString("hex").toUpperCase()],
    );
    res.json(await classOut(c));
  });

  r.get("/classes", authed, async (req, res) => {
    const rows =
      req.user.role === "teacher"
        ? await db.query("SELECT * FROM classes WHERE teacher_id = $1 ORDER BY id DESC", [req.user.id])
        : await db.query(
            "SELECT c.* FROM classes c JOIN enrollments e ON e.class_id = c.id WHERE e.user_id = $1 ORDER BY c.id DESC",
            [req.user.id],
          );
    res.json(await Promise.all(rows.map(classOut)));
  });

  r.post("/classes/join", authed, async (req, res) => {
    if (req.user.role !== "student") throw new HttpError(403, "Chỉ sinh viên tham gia lớp bằng mã");
    const { code } = parse(Join, req.body);
    const [c] = await db.query("SELECT * FROM classes WHERE code = $1", [code.trim().toUpperCase()]);
    if (!c) throw new HttpError(404, "Mã lớp không đúng");
    await db.query(
      "INSERT INTO enrollments (user_id, class_id, joined_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING",
      [req.user.id, c.id],
    );
    res.json(await classOut(c));
  });

  r.get("/classes/:id", authed, async (req, res) => {
    res.json(await classOut(await getClass(db, id(req.params.id), req.user)));
  });

  return r;
}
