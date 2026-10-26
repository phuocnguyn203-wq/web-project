// Plain parameterised SQL over one small interface, backed by node-postgres in production and by PGlite
// (real Postgres compiled to WASM, in-process) for tests and for local dev without a database server.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export type Row = Record<string, any>;
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Several statements, no parameters (migrations). */
  exec(sql: string): Promise<void>;
  tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
}

/** A connection already inside a transaction: nested tx() just joins it. */
function inTx(c: Omit<Db, "tx">): Db {
  const d: Db = { ...c, tx: (f) => f(d) };
  return d;
}

export function postgres(url: string): Db {
  const pool = new pg.Pool({ connectionString: url });
  const on = (c: pg.Pool | pg.PoolClient): Omit<Db, "tx"> => ({
    query: async (sql, params) => (await c.query(sql, params)).rows,
    exec: async (sql) => void (await c.query(sql)),
  });
  return {
    ...on(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(inTx(on(client)));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/** dataDir undefined = in memory (tests). */
export function pglite(dataDir?: string): Db {
  if (dataDir) mkdirSync(dataDir, { recursive: true }); // PGlite creates only the last path segment
  const db = new PGlite(dataDir);
  type Conn = Pick<PGlite, "query" | "exec">;
  const on = (c: Conn): Omit<Db, "tx"> => ({
    query: async (sql, params) => (await c.query<any>(sql, params)).rows,
    exec: async (sql) => void (await c.exec(sql)),
  });
  return { ...on(db), tx: (fn) => db.transaction((t) => fn(inTx(on(t as unknown as Conn)))) };
}

export async function migrate(db: Db, dir = new URL("../migrations/", import.meta.url)) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const done = new Set((await db.query("SELECT name FROM schema_migrations")).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await db.tx(async (t) => {
      await t.exec(readFileSync(new URL(file, dir), "utf8"));
      await t.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
  }
}
