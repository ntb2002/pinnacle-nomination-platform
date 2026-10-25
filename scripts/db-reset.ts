// Drops and recreates the public and drizzle schemas, then re-applies migrations.
// Development and test only: refuses to run when NODE_ENV=production.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("db:reset refused in production");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
  } finally {
    await pool.end();
  }
  execFileSync("npx", ["tsx", "scripts/db-migrate.ts"], { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
