import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

// One pool per server process. In dev, hot reload re-evaluates modules, so the
// pool is kept on globalThis to avoid exhausting connections.
const globalForDb = globalThis as unknown as { pinnaclePool?: Pool };

function createPool(): Pool {
  return new Pool({ connectionString: env().DATABASE_URL, max: 10 });
}

export const pool: Pool = globalForDb.pinnaclePool ?? createPool();
if (env().NODE_ENV !== "production") globalForDb.pinnaclePool = pool;

export const db: Database = drizzle(pool, { schema, casing: "snake_case" });
