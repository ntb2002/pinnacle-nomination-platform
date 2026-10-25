import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countWords } from "@/lib/text";
import { closeDb } from "@/server/db";
import { entry, rubricProfile } from "@/server/db/schema";
import { seed } from "../../scripts/seed/index";
import { db, resetTables } from "../support/db";

beforeAll(resetTables);
afterAll(closeDb);

describe("demo seed", () => {
  it("runs twice with identical results", async () => {
    const first = await seed(db);
    const second = await seed(db);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      award_cycle: 1,
      rubric_profile: 2,
      category: 9,
      user: 19,
      judge_profile: 6,
      entry: 30,
    });
  });

  it("uses only reserved example email domains", async () => {
    const res = await db.execute<{ email: string }>(sql`
      SELECT email FROM "user"
      UNION ALL SELECT nominee_email FROM entry WHERE nominee_email IS NOT NULL
      UNION ALL SELECT email FROM entry_reference`);
    expect(res.rows.length).toBeGreaterThan(0);
    const bad = res.rows.filter((r) => !/@example\.(com|org)$/.test(r.email));
    expect(bad).toEqual([]);
  });

  it("publishes rubric weights that sum to 100 with the 40/20/20/20 default", async () => {
    const profiles = await db.select().from(rubricProfile);
    for (const p of profiles) {
      expect(p.weightImpact + p.weightInnovation + p.weightInfluence + p.weightReferences).toBe(
        100,
      );
      expect([p.weightImpact, p.weightInnovation, p.weightInfluence, p.weightReferences]).toEqual([
        40, 20, 20, 20,
      ]);
    }
  });

  it("gives every complete entry a 250-500 word narrative", async () => {
    const rows = await db.select({ narrative: entry.narrative }).from(entry);
    for (const r of rows.filter((r) => r.narrative)) {
      const n = countWords(r.narrative!);
      expect(n).toBeGreaterThanOrEqual(250);
      expect(n).toBeLessThanOrEqual(500);
    }
  });
});
