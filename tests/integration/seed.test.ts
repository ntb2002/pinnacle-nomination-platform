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
      entry: 63,
    });
  });

  it("has the documented mix of roles, statuses and public judges", async () => {
    const roles = await db.execute<{ role: string; n: number }>(
      sql`SELECT role, count(*)::int AS n FROM "user" GROUP BY role`,
    );
    expect(Object.fromEntries(roles.rows.map((r) => [r.role, r.n]))).toEqual({
      ADMIN: 1,
      JUDGE: 6,
      NOMINATOR: 12,
    });
    const statuses = await db.execute<{ status: string; n: number }>(
      sql`SELECT status, count(*)::int AS n FROM entry GROUP BY status`,
    );
    expect(Object.fromEntries(statuses.rows.map((r) => [r.status, r.n]))).toEqual({
      APPROVED: 45,
      SUBMITTED: 9,
      RETURNED: 3,
      DRAFT: 6,
    });
    const publicJudges = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM judge_profile WHERE is_public AND bio <> ''`,
    );
    expect(publicJudges.rows[0]?.n).toBe(6);
  });

  it("charges each paid entry the tier in force when it was submitted", async () => {
    const res = await db.execute<{ bad: number }>(sql`
      SELECT count(*)::int AS bad FROM payment p JOIN entry e ON e.id = p.entry_id JOIN award_cycle c ON c.id = e.cycle_id
      WHERE p.kind = 'ENTRY_FEE' AND NOT (
        (p.tier = 'EARLY' AND e.submitted_at < c.early_deadline AND p.amount_cents = c.early_fee_cents) OR
        (p.tier = 'REGULAR' AND e.submitted_at >= c.early_deadline AND e.submitted_at < c.regular_deadline AND p.amount_cents = c.regular_fee_cents) OR
        (p.tier = 'LATE' AND e.submitted_at >= c.regular_deadline AND e.submitted_at < c.final_deadline AND p.amount_cents = c.late_fee_cents))`);
    expect(res.rows[0]?.bad).toBe(0);
    const tiers = await db.execute<{ n: number }>(
      sql`SELECT count(DISTINCT tier)::int AS n FROM payment`,
    );
    expect(tiers.rows[0]?.n).toBeGreaterThan(1);
  });

  it("names the nominator as nominee on self-nominations", async () => {
    const res = await db.execute<{ bad: number }>(sql`
      SELECT count(*)::int AS bad FROM entry e JOIN "user" u ON u.id = e.nominator_id
      WHERE e.relationship = 'SELF' AND (e.nominee_email <> u.email OR e.nominee_name <> u.name)`);
    expect(res.rows[0]?.bad).toBe(0);
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
