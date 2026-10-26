// Client for the internal AI service (ai/service, FastAPI). Kept behind an interface so tests swap it out.
import { HttpError } from "./http.ts";

export type QuizOptions = { count: number; difficulty: "easy" | "medium" | "hard" | "mixed"; kinds: string[] };
export type Job = {
  lecture_id: number;
  source_type: "youtube" | "file" | "document";
  source_url: string | null;
  file_path: string | null;
  quiz: QuizOptions;
};
export type QuizItem = {
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  source_start: number;
  difficulty: string;
  kind: string;
};
export type Segment = { start: number; end: number; text: string };
export type ApkgCard = { id: number; front: string; back: string; source_start: number };

export interface Ai {
  /** Queue transcription + generation; the worker reports back on /internal/lectures/:id/*. */
  enqueue(job: Job): Promise<void>;
  generateQuiz(segments: Segment[], options: QuizOptions): Promise<QuizItem[]>;
  exportApkg(lecture: { lecture_id: number; title: string; source_type: string; cards: ApkgCard[] }): Promise<Buffer>;
}

export const internalToken = () => process.env.INTERNAL_TOKEN ?? "dev-internal-token";
if (process.env.APP_ENV === "production" && internalToken() === "dev-internal-token")
  throw new Error("Set INTERNAL_TOKEN (shared with the AI service) in production");

export function httpAi(base = process.env.AI_URL ?? "http://localhost:8001"): Ai {
  async function call(path: string, body: unknown) {
    let res: Response;
    try {
      res = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": internalToken() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10 * 60_000), // quiz generation on a long lecture takes a few minutes
      });
    } catch {
      throw new HttpError(502, "Dịch vụ AI không phản hồi, thử lại sau ít phút");
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))).detail;
      // 429 carries a message meant for teachers (quota exhausted); anything else is our problem, not theirs
      throw new HttpError(res.status === 429 ? 429 : 502, res.status === 429 && typeof detail === "string"
        ? detail
        : "Dịch vụ AI đang lỗi hoặc quá tải, thử lại sau ít phút");
    }
    return res;
  }
  return {
    enqueue: async (job) => void (await call("/jobs", job)),
    generateQuiz: async (segments, options) => (await call("/quiz", { segments, ...options })).json(),
    exportApkg: async (lecture) => Buffer.from(await (await call("/export/apkg", lecture)).arrayBuffer()),
  };
}
