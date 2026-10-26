// npm run db:seed [-- --open-now] [-- --program-only]
//   --open-now      move the nomination window so it is open today (demo, e2e)
//   --program-only  cycle, rubric profiles and categories only (production bootstrap)
// Demo data is fake (example.com / example.org) and refused in production.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";
import { seed } from "./seed/index";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const args = new Set(process.argv.slice(2));
  const programOnly = args.has("--program-only");
  if (process.env.NODE_ENV === "production" && (!programOnly || args.has("--open-now"))) {
    throw new Error(
      "Refused: demo data and --open-now never run in production (use --program-only alone).",
    );
  }
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    const counts = await seed(db, { programOnly, openNow: args.has("--open-now") });
    console.log("Seed complete. Row counts:");
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(20)} ${n}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
