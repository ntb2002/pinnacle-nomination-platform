import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";
import { seedDemo } from "./demo";
import { seedProgram } from "./program";

export interface SeedOptions {
  /** Only the cycle, rubric profiles and categories: no people or entries (production bootstrap). */
  programOnly?: boolean;
  /** Open the nomination window now (demo / e2e). */
  openNow?: boolean;
  now?: Date;
}

const COUNTED = [
  "award_cycle",
  "rubric_profile",
  "category",
  "user",
  "judge_profile",
  "judge_assignment",
  "entry",
  "entry_outcome",
  "entry_reference",
  "entry_status_event",
  "payment",
] as const;

/** Seeds fake data. Safe to run repeatedly: every insert is keyed and skips existing rows. */
export async function seed(db: Database, opts: SeedOptions = {}): Promise<Record<string, number>> {
  await db.transaction(async (tx) => {
    const cycleId = await seedProgram(tx as unknown as Database, {
      openNow: opts.openNow ?? false,
      now: opts.now ?? new Date(),
    });
    if (!opts.programOnly) await seedDemo(tx as unknown as Database, cycleId);
  });
  const counts: Record<string, number> = {};
  for (const table of COUNTED) {
    const res = await db.execute<{ n: number }>(
      sql.raw(`SELECT count(*)::int AS n FROM "${table}"`),
    );
    counts[table] = res.rows[0]?.n ?? 0;
  }
  return counts;
}
