import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import {
  auditLog,
  categoryResult,
  conflictDeclaration,
  payment,
  rubricProfile,
  score,
  user,
} from "@/server/db/schema";
import { db, resetTables } from "../support/db";
import {
  createCategory,
  createCycle,
  createEntry,
  createProgram,
  createRubricProfile,
  createUser,
} from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

/** Postgres error code of a failed query (drizzle wraps the driver error as `cause`). */
async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
}

describe("policy constraints in the schema", () => {
  it("allows one score per judge per entry per round", async () => {
    const { cycle, category, nominator } = await createProgram();
    const e = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    const judge = await createUser("JUDGE");
    await db.insert(score).values({ judgeId: judge.id, entryId: e.id, round: 1, impact: 8 });
    expect(
      await pgCode(db.insert(score).values({ judgeId: judge.id, entryId: e.id, round: 1 })),
    ).toBe("23505");
    // A round-two score for the same entry is a different score.
    await db.insert(score).values({ judgeId: judge.id, entryId: e.id, round: 2 });
  });

  it("rejects out-of-range criteria and incomplete submitted scores", async () => {
    const { cycle, category, nominator } = await createProgram();
    const e = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    const judge = await createUser("JUDGE");
    expect(
      await pgCode(
        db.insert(score).values({ judgeId: judge.id, entryId: e.id, round: 1, impact: 11 }),
      ),
    ).toBe("23514");
    expect(
      await pgCode(
        db.insert(score).values({
          judgeId: judge.id,
          entryId: e.id,
          round: 1,
          impact: 7,
          submittedAt: new Date(),
        }),
      ),
    ).toBe("23514");
  });

  it("allows one conflict declaration per judge per entry", async () => {
    const { cycle, category, nominator } = await createProgram();
    const e = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    const judge = await createUser("JUDGE");
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: judge.id, entryId: e.id, hasConflict: false });
    expect(
      await pgCode(
        db.insert(conflictDeclaration).values({
          judgeId: judge.id,
          entryId: e.id,
          hasConflict: true,
          reason: "Former colleague",
        }),
      ),
    ).toBe("23505");
  });

  it("allows only one paid entry fee per entry", async () => {
    const { cycle, category, nominator } = await createProgram();
    const e = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    const base = {
      entryId: e.id,
      kind: "ENTRY_FEE" as const,
      tier: "EARLY" as const,
      amountCents: 50_000,
      provider: "mock",
      createdById: nominator.id,
    };
    await db.insert(payment).values({ ...base, status: "PAID", providerSessionId: "cs_1" });
    // An abandoned or pending session alongside the paid one is fine...
    await db.insert(payment).values({ ...base, status: "EXPIRED", providerSessionId: "cs_2" });
    // ...a second paid entry fee is not.
    expect(
      await pgCode(
        db.insert(payment).values({ ...base, status: "PAID", providerSessionId: "cs_3" }),
      ),
    ).toBe("23505");
    // The finalist fee is a separate kind.
    await db.insert(payment).values({
      ...base,
      kind: "FINALIST_FEE",
      tier: null,
      status: "PAID",
      providerSessionId: "cs_4",
    });
  });

  it("blocks a duplicate nominee in the same category for the same nominator", async () => {
    const { cycle, category, nominator } = await createProgram();
    await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
      nomineeEmail: "Pat@Example.com",
    });
    expect(
      await pgCode(
        createEntry({
          cycleId: cycle.id,
          categoryId: category.id,
          nominatorId: nominator.id,
          nomineeEmail: "pat@example.com",
        }),
      ),
    ).toBe("23505");
  });

  it("rejects rubric weights that do not sum to 100", async () => {
    const { cycle } = await createProgram();
    expect(
      await pgCode(
        createRubricProfile(cycle.id, {
          weightImpact: 40,
          weightInnovation: 20,
          weightInfluence: 20,
          weightReferences: 10,
        }),
      ),
    ).toBe("23514");
  });

  it("keeps the audit log append-only", async () => {
    const [row] = await db
      .insert(auditLog)
      .values({ action: "test.event", targetType: "test" })
      .returning();
    expect(
      await pgCode(db.update(auditLog).set({ action: "tampered" }).where(eq(auditLog.id, row!.id))),
    ).toBe("42501");
    expect(await pgCode(db.delete(auditLog).where(eq(auditLog.id, row!.id)))).toBe("42501");
    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog);
    expect(count?.n).toBe(1);
  });

  it("allows one result per category, requires a tiebreak reason, and a winner from that category", async () => {
    const { cycle, category, nominator } = await createProgram();
    const other = await createCategory(cycle.id);
    const admin = await createUser("ADMIN");
    const winner = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    const elsewhere = await createEntry({
      cycleId: cycle.id,
      categoryId: other.id,
      nominatorId: nominator.id,
    });
    const base = { cycleId: cycle.id, categoryId: category.id, confirmedById: admin.id };
    // Winner from another category is rejected by the composite FK.
    expect(
      await pgCode(
        db
          .insert(categoryResult)
          .values({ ...base, winnerEntryId: elsewhere.id, decision: "SCORE" }),
      ),
    ).toBe("23503");
    // A tiebreak needs a written reason.
    expect(
      await pgCode(
        db
          .insert(categoryResult)
          .values({ ...base, winnerEntryId: winner.id, decision: "TIEBREAK", tiebreakReason: " " }),
      ),
    ).toBe("23514");
    await db
      .insert(categoryResult)
      .values({ ...base, winnerEntryId: winner.id, decision: "SCORE" });
    expect(
      await pgCode(
        db.insert(categoryResult).values({ ...base, winnerEntryId: winner.id, decision: "SCORE" }),
      ),
    ).toBe("23505");
  });

  it("keeps an entry in its category's cycle", async () => {
    const { category, nominator } = await createProgram();
    const otherCycle = await createCycle({ isActive: false });
    expect(
      await pgCode(
        createEntry({ cycleId: otherCycle.id, categoryId: category.id, nominatorId: nominator.id }),
      ),
    ).toBe("23503");
  });

  it("refuses to delete a judge who has scored", async () => {
    const { cycle, category, nominator } = await createProgram();
    const e = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    const judge = await createUser("JUDGE");
    await db.insert(score).values({ judgeId: judge.id, entryId: e.id, round: 1 });
    expect(await pgCode(db.delete(user).where(eq(user.id, judge.id)))).toBe("23503");
  });

  it("stores emails lowercased", async () => {
    expect(await pgCode(createUser("NOMINATOR", { email: "Mixed@Example.com" }))).toBe("23514");
  });

  it("stores weights per profile", async () => {
    const { cycle } = await createProgram();
    const p = await createRubricProfile(cycle.id);
    const [stored] = await db.select().from(rubricProfile).where(eq(rubricProfile.id, p.id));
    expect(stored?.weightImpact).toBe(40);
  });
});
