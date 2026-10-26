import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Db } from "./db.ts";
import { HttpError } from "./http.ts";

export type User = { id: number; email: string; name: string; role: "teacher" | "student" };

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
if (process.env.APP_ENV === "production" && (SECRET.length < 32 || SECRET.includes("change-me")))
  throw new Error("JWT_SECRET must be a random string of 32+ chars in production");

const derive = promisify(pbkdf2);
const hashWith = async (pw: string, salt: string) => (await derive(pw, salt, 200_000, 32, "sha256")).toString("hex");

/** "salt$hex" — same format as the Python backend wrote, so its users can still log in. */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}$${await hashWith(pw, salt)}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [salt, digest] = stored.split("$");
  const got = Buffer.from(await hashWith(pw, salt), "hex");
  const want = Buffer.from(digest, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export const makeToken = (u: User) =>
  jwt.sign({ sub: String(u.id), role: u.role }, SECRET, { algorithm: "HS256", expiresIn: "7d" });

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}

/** Bearer header, or ?token= for <video> and download links that can't send headers. */
export const auth = (db: Db) => async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : typeof req.query.token === "string" ? req.query.token : "";
  if (!raw) throw new HttpError(401, "Chưa đăng nhập");
  let uid: number;
  try {
    uid = Number((jwt.verify(raw, SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload).sub);
  } catch {
    throw new HttpError(401, "Phiên đăng nhập không hợp lệ");
  }
  const [user] = await db.query<User>("SELECT id, email, name, role FROM users WHERE id = $1", [uid]);
  if (!user) throw new HttpError(401, "Tài khoản không tồn tại");
  req.user = user;
  next();
};

export function teacher(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== "teacher") throw new HttpError(403, "Chỉ giảng viên được thực hiện");
  next();
}
