import { httpAi } from "./ai.ts";
import { createApp } from "./app.ts";
import { migrate, pglite, postgres } from "./db.ts";

// No DATABASE_URL (local dev without Docker): an embedded Postgres persisted under backend/.data.
const db = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL) : pglite(".data/pglite");
await migrate(db);

const port = Number(process.env.PORT ?? 8000);
createApp(db, httpAi()).listen(port, "0.0.0.0", () => console.log(`LectureCards API on :${port}`));
