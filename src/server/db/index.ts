import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything queries can run on: the shared client or an open transaction. */
export type DbExecutor = Database | Transaction;

// One pool per server process, created on first use (so `next build` does not need
// DATABASE_URL). In dev, hot reload re-evaluates modules, so the pool lives on globalThis.
const globalForDb = globalThis as unknown as { pinnacleDb?: { pool: Pool; db: Database } };

function connect(): { pool: Pool; db: Database } {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
  });
  // An idle client losing its connection must not crash the process.
  pool.on("error", (err) => console.error("postgres pool error:", err.message));
  return { pool, db: drizzle(pool, { schema, casing: "snake_case" }) };
}

function instance() {
  globalForDb.pinnacleDb ??= connect();
  return globalForDb.pinnacleDb;
}

/** The Drizzle client. A proxy so importing this module never opens a connection. */
export const db: Database = new Proxy({} as Database, {
  get: (_target, prop) => {
    const real = instance().db;
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Closes the pool (tests and scripts). The next `db` use reconnects. */
export async function closeDb(): Promise<void> {
  const current = globalForDb.pinnacleDb;
  globalForDb.pinnacleDb = undefined;
  await current?.pool.end();
}
