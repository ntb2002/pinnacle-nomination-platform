import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import { auditLog, awardCycle, payment } from "@/server/db/schema";
import { mockPaymentProvider } from "@/server/payments";
import { declareConflict } from "@/server/services/conflicts";
import { announceFinalists, selectFinalists } from "@/server/services/finalists";
import { handleWebhook } from "@/server/services/payment-events";
import { getCategoryRanking } from "@/server/services/rankings";
import { saveScore } from "@/server/services/scoring";
import { closeRoundOne, getRoundOneOverview, openRoundOne } from "@/server/services/rounds";
import { db, resetTables } from "../support/db";
import { createCompleteEntry } from "../support/factories";
import { all, makeJudge, scoreAll, setup } from "../support/round-one";

beforeEach(resetTables);
afterAll(closeDb);

describe("a payment that lands after round one opens (#12)", () => {
  it("submits the entry and flags it as having missed eligibility review", async () => {
    const { admin, cycle, category: cat, nominator } = await setup(3);
    const late = await createCompleteEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: nominator.id,
    });
    const [p] = await db
      .insert(payment)
      .values({
        entryId: late.id,
        kind: "ENTRY_FEE",
        tier: "LATE",
        amountCents: 80000,
        provider: "mock",
        providerSessionId: "cs_test_after_triage",
        createdById: nominator.id,
        expiresAt: new Date(Date.now() - 60 * 60_000), // expired, so round one may open
      })
      .returning();
    await openRoundOne(admin, {});
    const mock = mockPaymentProvider()!;
    const { body, signature } = mock.signEvent({
      type: "paid",
      sessionId: p!.providerSessionId,
      amountCents: p!.amountCents,
    });
    expect((await handleWebhook(mock, body, signature)).status).toBe(200);
    const [fulfilled] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.fulfilled"));
    expect(fulfilled!.metadata).toMatchObject({ afterTriageClosed: true });
  });
});

describe("stale finalist selections (#12)", () => {
  it("are flagged after a late conflict, and not once finalists are announced", async () => {
    const s = await setup(4);
    const third = await makeJudge(s.category.id);
    const judges = [...s.judges, third] as [Actor, Actor, Actor];
    for (const id of s.ids) await declareConflict(third, id, { conflict: "no" });
    await openRoundOne(s.admin, {});
    // Entries 0-1 score 10 and 9 from everyone; entry 3 gets 7s (70.00). Entry 2 gets
    // 10, 6, 6 (73.33) and ranks third, until judge 0's 10 is withdrawn by a conflict.
    await scoreAll(judges, s.ids, (i) => [10, 9, 6, 7][i]!);
    await saveScore(judges[0], s.ids[2]!, 1, all(10));
    await closeRoundOne(s.admin);
    await selectFinalists(s.admin, s.category.id, {
      count: 3,
      entryIds: s.ids.slice(0, 3),
      reason: "",
    });
    expect((await getCategoryRanking(s.admin, s.category.id)).selectionStale).toBe(false);
    await declareConflict(judges[0], s.ids[2]!, { conflict: "yes", reason: "Former colleague" });
    const stale = await getCategoryRanking(s.admin, s.category.id);
    expect(stale.selectionStale).toBe(true);
    expect((await getRoundOneOverview(s.admin))!.categories[0]!.selectionStale).toBe(true);
    await expect(announceFinalists(s.admin)).rejects.toThrow(/choose again/);

    const top = stale.ranked.slice(0, 3).map((r) => r.entryId);
    await selectFinalists(s.admin, s.category.id, { count: 3, entryIds: top, reason: "" });
    await announceFinalists(s.admin);
    const [c] = await db.select().from(awardCycle);
    expect(c!.finalistsAnnouncedAt).not.toBeNull();
    // A round-one judge may still declare after announcement; the result is fixed.
    await declareConflict(judges[2], top[0]!, { conflict: "yes", reason: "Found out later on" });
    expect((await getCategoryRanking(s.admin, s.category.id)).selectionStale).toBe(false);
  });
});
