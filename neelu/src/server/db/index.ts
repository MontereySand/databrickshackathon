/**
 * Database abstraction. A single tiny interface (`Db`) is implemented by two
 * adapters that both speak Postgres SQL with $1 placeholders:
 *
 *   - PGlite  (LOCAL_SIM): an in-process Postgres, no external services.
 *   - node-postgres (DATABRICKS / DATABASE_URL): Lakebase or a local Postgres.
 *
 * Because both adapters run the same SQL, the repository layer is written once.
 */

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { config, hasPostgres } from "../config";
import { SCHEMA_SQL } from "./schema";

export interface Db {
  kind: "pglite" | "postgres";
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function createPglite(): Db {
  const dir = config.pgliteDir;
  const inMemory = dir === "memory" || dir === "memory://";
  const instance = new PGlite(inMemory ? undefined : dir);
  return {
    kind: "pglite",
    async query<T>(text: string, params: unknown[] = []) {
      const result = await instance.query<T>(text, params);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await instance.exec(sql);
    },
    async close() {
      await instance.close();
    },
  };
}

function createPostgres(): Db {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  return {
    kind: "postgres",
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * Choose the adapter: any explicit Postgres connection string wins (covers both
 * Lakebase in DATABRICKS mode and a developer-provided local Postgres); otherwise
 * fall back to PGlite for a zero-dependency local simulation.
 */
function createDb(): Db {
  return hasPostgres() ? createPostgres() : createPglite();
}

let dbPromise: Promise<Db> | null = null;

async function createAndInit(): Promise<Db> {
  const db = createDb();
  await db.exec(SCHEMA_SQL);
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = createAndInit();
  }
  return dbPromise;
}

/** Tear down the cached singleton (used by tests for isolation). */
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}
