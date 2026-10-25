import { sql } from "drizzle-orm";
import { db } from "@/server/db";

const TABLES = [
  "audit_log",
  "email_outbox",
  "rate_limit",
  "webhook_event",
  "category_result",
  "score",
  "conflict_declaration",
  "judge_assignment",
  "payment",
  "entry_status_event",
  "attachment",
  "entry_reference",
  "entry_outcome",
  "entry",
  "category",
  "rubric_profile",
  "award_cycle",
  "judge_profile",
  "verification",
  "account",
  "session",
  "user",
];

/** Empties every app table in the test database. Call in beforeEach of integration tests. */
export async function resetTables(): Promise<void> {
  await db.execute(
    sql.raw(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`),
  );
}

export { db };
