import { sql } from "drizzle-orm";
import { db } from "@/server/db";

let tables: string[] | undefined;

/** Empties every app table in the test database. Call in beforeEach of integration tests. */
export async function resetTables(): Promise<void> {
  // Derived from the catalog so new tables are covered automatically.
  tables ??= (
    await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
  ).rows.map((r) => r.tablename);
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`),
  );
}

export { db };
