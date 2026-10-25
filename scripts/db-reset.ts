// Drops and recreates the public and drizzle schemas, then re-applies migrations.
// Local dev/test databases only (scripts/lib/db-guard.ts).
import "dotenv/config";
import { Pool } from "pg";
import { assertSafeToReset } from "./lib/db-guard";
import { runMigrations } from "./lib/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertSafeToReset(url, process.env);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
  } finally {
    await pool.end();
  }
  await runMigrations(url);
  console.log("Database reset and migrated.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
