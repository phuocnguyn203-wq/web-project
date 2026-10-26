import type { ErrorRequestHandler } from "express";
import { z } from "zod";

/** Thrown anywhere in a handler; rendered as {detail} like the rest of the API's errors. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(422, `Dữ liệu không hợp lệ: ${issue.path.join(".") || "body"} (${issue.message})`);
  }
  return r.data;
}

/** Route ids like /lectures/:id. */
export const id = (v: unknown) => parse(z.coerce.number().int().positive(), v);

export const errors: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ detail: err.message });
  if (err?.type === "entity.parse.failed") return res.status(422).json({ detail: "JSON không hợp lệ" });
  console.error(err);
  res.status(500).json({ detail: "Lỗi máy chủ" });
};
