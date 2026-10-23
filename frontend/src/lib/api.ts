// Typed client for docs/openapi.json. Keep in sync with backend/app/schemas.py.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Role = "teacher" | "student";
export type User = { id: number; email: string; name: string; role: Role };
export type Klass = {
  id: number;
  name: string;
  code: string;
  teacher_id: number;
  student_count: number;
  lecture_count: number;
};
export type Status = "queued" | "transcribing" | "summarizing" | "generating" | "ready" | "failed";
export type Lecture = {
  id: number;
  class_id: number;
  title: string;
  source_type: "file" | "youtube" | "document";
  source_url: string | null;
  status: Status;
  progress: number;
  error: string | null;
  /** Assigned to at least one class. */
  published: boolean;
  /** Classes this lecture is assigned to; `class_id` is only where it was uploaded. */
  class_ids: number[];
  /** Produced by the mock speech/LLM engines, not from the lecture itself. */
  mock: boolean;
  created_at: string;
};
export type Segment = { idx: number; start: number; end: number; text: string };
export type Card = { id: number; lecture_id: number; front: string; back: string; source_start: number; edited?: boolean };
export type DueCard = Card & { lecture_title: string; source_type: string; source_url: string | null };
export type Quiz = {
  id: number;
  lecture_id: number;
  question: string;
  options: string[];
  source_start: number;
  answer_index?: number;
  difficulty: "easy" | "medium" | "hard";
  kind: "theory" | "calculation" | "true_false";
  explanation?: string;
  edited?: boolean;
};
export type Stats = {
  questions: { question_id: number; question: string; attempts: number; wrong_rate: number }[];
  students: {
    user_id: number;
    name: string;
    reviews: number;
    quiz_attempts: number;
    quiz_accuracy: number;
    due_now: number;
  }[];
};

const KEY = "lc.session";

export function session(): { token: string; user: User } | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
export function saveSession(s: { access_token: string; user: User }) {
  localStorage.setItem(KEY, JSON.stringify({ token: s.access_token, user: s.user }));
}
export function logout() {
  localStorage.removeItem(KEY);
  window.location.href = "/login";
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  { json, ...init }: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = session()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers, body: json !== undefined ? JSON.stringify(json) : init.body });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra backend đang chạy.");
  }
  if (res.status === 401 && token) logout();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : "Dữ liệu không hợp lệ";
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

/** Authenticated URL for <video>/<a> where headers can't be set. */
export const authedUrl = (path: string) => `${API_URL}${path}?token=${encodeURIComponent(session()?.token ?? "")}`;

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Where a card came from: a moment in a recording, or a page/slide of a document. */
export const fmtAt = (sourceType: string | undefined, s: number) =>
  sourceType === "document" ? `Trang ${Math.round(s)}` : fmtTime(s);

export const youtubeId = (url: string | null) =>
  url?.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1] ?? null;
