import cors from "cors";
import express from "express";
import type { Ai } from "./ai.ts";
import type { Db } from "./db.ts";
import { errors } from "./http.ts";
import { accountRoutes } from "./routes/accounts.ts";
import { cardRoutes } from "./routes/cards.ts";
import { internalRoutes } from "./routes/internal.ts";
import { lectureRoutes } from "./routes/lectures.ts";
import { studyRoutes } from "./routes/study.ts";

/** The REST API from docs/openapi.json. db and ai are passed in so tests can use PGlite and a fake AI service. */
export function createApp(db: Db, ai: Ai) {
  const app = express();
  app.set("trust proxy", true); // behind Caddy in production
  app.use(cors({ origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",") }));
  app.use(express.json({ limit: "20mb" })); // the worker posts whole transcripts
  app.use(express.urlencoded()); // YouTube-only lecture forms may come without multipart

  app.get("/health", (_req, res) => void res.json({ ok: true }));
  app.use(accountRoutes(db));
  app.use(lectureRoutes(db, ai));
  app.use(cardRoutes(db, ai));
  app.use(studyRoutes(db, ai));
  app.use(internalRoutes(db));

  app.use((_req, res) => void res.status(404).json({ detail: "Not Found" }));
  app.use(errors);
  return app;
}
