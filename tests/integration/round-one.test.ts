import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import {
  auditLog,
  awardCycle,
  conflictDeclaration,
  emailOutbox,
  entry,
  finalistSelection,
  payment,
} from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { declareConflict } from "@/server/services/conflicts";
import { updateRubricWeights } from "@/server/services/program-settings";
import { computeRanking } from "@/server/services/rankings";
import { announceFinalists, selectFinalists } from "@/server/services/finalists";
import { closeRoundOne, openRoundOne, reopenRoundOne } from "@/server/services/rounds";
import { getMyScore, saveScore } from "@/server/services/scoring";
import { db, resetTables } from "../support/db";
import { createCompleteEntry } from "../support/factories";
import { all, DAY, makeJudge, scoreAll, setup } from "../support/round-one";

beforeEach(resetTables);
afterAll(closeDb);

describe("opening and closing round one", () => {
  it("needs closed nominations and a confirmation for entries still in review; locks weights", async () => {
    const { admin, cycle, category: cat, nominator } = await setup(3);
    await db
      .update(awardCycle)
      .set({ finalDeadline: new Date(Date.now() + DAY) })
      .where(eq(awardCycle.id, cycle.id));
    await expect(openRoundOne(admin, {})).rejects.toBeInstanceOf(ConflictError);
    await db
      .update(awardCycle)
      .set({ finalDeadline: new Date(Date.now() - 1000) })
      .where(eq(awardCycle.id, cycle.id));
    const pending = await createCompleteEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: nominator.id,
    });
    await db.update(entry).set({ status: "SUBMITTED" }).where(eq(entry.id, pending.id));
    await expect(openRoundOne(admin, {})).rejects.toBeInstanceOf(ValidationError);
    await openRoundOne(admin, { confirm: true });
    await expect(
      updateRubricWeights(admin, cat.rubricProfileId, {
        weightImpact: "25",
        weightInnovation: "25",
        weightInfluence: "25",
        weightReferences: "25",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(openRoundOne(nominator, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("scoring", () => {
  it("only while the round is open; drafts, submission and revision", async () => {
    const { admin, ids, judges } = await setup(3);
    const [j] = judges as [Actor, Actor];
    await expect(saveScore(j, ids[0]!, 1, all(8))).rejects.toBeInstanceOf(NotFoundError); // not open: not readable yet
    await openRoundOne(admin, {});
    await saveScore(j, ids[0]!, 1, { ...all(8), innovation: "", intent: "draft" });
    await expect(saveScore(j, ids[0]!, 1, { ...all(8), innovation: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(saveScore(j, ids[0]!, 1, { ...all(8), impact: "11" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await saveScore(j, ids[0]!, 1, all(8));
    await saveScore(j, ids[0]!, 1, all(9)); // revised
    expect((await getMyScore(j, ids[0]!, 1)).score).toMatchObject({ impact: 9 });
    const actions = (await db.select().from(auditLog).where(eq(auditLog.actorId, j.id))).map(
      (r) => r.action,
    );
    expect(actions).toEqual(["score.draft_saved", "score.submitted", "score.revised"]);
    await scoreAll(judges, ids); // closing needs 2 scores per entry
    await closeRoundOne(admin);
    await expect(saveScore(j, ids[0]!, 1, all(5))).rejects.toBeInstanceOf(ConflictError);
  });

  it("a recused judge cannot score, and a late conflict drops their score from the mean", async () => {
    const { admin, ids, judges, category: cat } = await setup(3);
    const [j1, j2] = judges as [Actor, Actor];
    await openRoundOne(admin, {});
    await saveScore(j1, ids[0]!, 1, all(10));
    await saveScore(j2, ids[0]!, 1, all(6));
    const third = await makeJudge(cat.id);
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: third.id, entryId: ids[0]!, hasConflict: true, reason: "Colleague" });
    await expect(saveScore(third, ids[0]!, 1, all(9))).rejects.toBeInstanceOf(NotFoundError);
    const before = await computeRanking(db, cat.id, 1);
    expect(before.ranked.find((r) => r.entryId === ids[0])).toMatchObject({ mean: 80, count: 2 });
    // j1 discovers a conflict after scoring: their score no longer counts.
    await declareConflict(j1, ids[0]!, { conflict: "yes", reason: "Turns out I am a reference" });
    const after = await computeRanking(db, cat.id, 1);
    expect(after.ranked.find((r) => r.entryId === ids[0])).toMatchObject({ mean: 60, count: 1 });
    await expect(saveScore(j1, ids[0]!, 1, all(10))).rejects.toBeInstanceOf(NotFoundError);
    // Judges never see anyone else's score.
    expect((await getMyScore(j2, ids[0]!, 1)).score).toMatchObject({ impact: 6 });
  });
});

describe("finalists", () => {
  async function closedRound(entries = 6, value?: (i: number) => number) {
    const ctx = await setup(entries);
    await openRoundOne(ctx.admin, {});
    await scoreAll(ctx.judges, ctx.ids, value);
    await closeRoundOne(ctx.admin);
    return ctx;
  }

  it("rejects 2 or 6, skipping a higher entry, and selection while open", async () => {
    const { admin, category: cat, ids } = await closedRound();
    await expect(
      selectFinalists(admin, cat.id, { count: 2, entryIds: ids.slice(0, 2), reason: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      selectFinalists(admin, cat.id, { count: 6, entryIds: ids, reason: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      selectFinalists(admin, cat.id, {
        count: 3,
        entryIds: [ids[0]!, ids[1]!, ids[3]!],
        reason: "",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await selectFinalists(admin, cat.id, { count: 3, entryIds: ids.slice(0, 3), reason: "" });
    const [sel] = await db.select().from(finalistSelection);
    expect(sel!.entryIds.sort()).toEqual(ids.slice(0, 3).sort());
    expect(sel!.ranking).toHaveLength(6);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "finalists.selected")),
    ).toHaveLength(1);
  });

  it("allows a choice among entries tied at the cut only with a reason", async () => {
    // Entries 2 and 3 tie (both scored 7).
    const { admin, category: cat, ids } = await closedRound(5, (i) => [10, 9, 7, 7, 5][i]!);
    await expect(
      selectFinalists(admin, cat.id, {
        count: 3,
        entryIds: [ids[0]!, ids[1]!, ids[2]!],
        reason: "",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      selectFinalists(admin, cat.id, {
        count: 3,
        entryIds: [ids[0]!, ids[1]!, ids[4]!],
        reason: "Picking a non-tied entry",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await selectFinalists(admin, cat.id, {
      count: 3,
      entryIds: [ids[0]!, ids[1]!, ids[3]!],
      reason: "Stronger reference validation",
    });
    expect((await db.select().from(finalistSelection))[0]!.tiebreakReason).toBe(
      "Stronger reference validation",
    );
  });

  it("refuses to close round one, select or announce with an entry that has only one score", async () => {
    const ctx = await setup(3);
    await openRoundOne(ctx.admin, {});
    await scoreAll(ctx.judges, ctx.ids.slice(0, 2));
    await saveScore(ctx.judges[0]!, ctx.ids[2]!, 1, all(5));
    await expect(closeRoundOne(ctx.admin)).rejects.toThrow(/fewer than 2 scores/);
    expect((await db.select().from(awardCycle))[0]!.phase).toBe("ROUND1_OPEN");
    await expect(
      selectFinalists(ctx.admin, ctx.category.id, { count: 3, entryIds: ctx.ids, reason: "" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(announceFinalists(ctx.admin)).rejects.toBeInstanceOf(ConflictError);
  });

  it("announces: marks finalists, moves the phase and emails every nominator", async () => {
    const { admin, category: cat, ids, nominator } = await closedRound();
    await expect(announceFinalists(admin)).rejects.toBeInstanceOf(ConflictError); // no selection yet
    await selectFinalists(admin, cat.id, { count: 4, entryIds: ids.slice(0, 4), reason: "" });
    await announceFinalists(admin);
    const rows = await db
      .select({ id: entry.id, isFinalist: entry.isFinalist })
      .from(entry)
      .where(eq(entry.categoryId, cat.id));
    expect(
      rows
        .filter((r) => r.isFinalist)
        .map((r) => r.id)
        .sort(),
    ).toEqual(ids.slice(0, 4).sort());
    expect((await db.select().from(awardCycle))[0]!.phase).toBe("FINALISTS_ANNOUNCED");
    const mail = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.toAddress, nominator.email));
    expect(mail.filter((m) => m.template === "finalist")).toHaveLength(4);
    expect(mail.filter((m) => m.template === "not_advanced")).toHaveLength(2);
    expect(mail.find((m) => m.template === "finalist")!.textBody).toContain("finalist package fee");
  });

  it("refuses to announce if the scores changed after selection (e.g. a late conflict)", async () => {
    const { admin, category: cat, ids, judges } = await closedRound(4, (i) => [10, 9, 8, 7][i]!);
    await selectFinalists(admin, cat.id, { count: 3, entryIds: ids.slice(0, 3), reason: "" });
    // A judge's late conflict on the third entry leaves it one score: blocked.
    await declareConflict(judges[0]!, ids[2]!, {
      conflict: "yes",
      reason: "Found a conflict late",
    });
    await expect(announceFinalists(admin)).rejects.toBeInstanceOf(ConflictError);
    const flagged = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "conflict.changed_to_conflict")));
    expect(flagged).toHaveLength(1);

    // The way out: reopen (with a reason), add a judge, score, close and choose again.
    await expect(reopenRoundOne(admin, { reason: "" })).rejects.toBeInstanceOf(ValidationError);
    await reopenRoundOne(admin, { reason: "Late conflict left one entry with one score" });
    expect(await db.select().from(finalistSelection)).toHaveLength(0);
    const third = await makeJudge(cat.id);
    await declareConflict(third, ids[2]!, { conflict: "no" });
    await saveScore(third, ids[2]!, 1, all(8));
    await closeRoundOne(admin);
    await selectFinalists(admin, cat.id, { count: 3, entryIds: ids.slice(0, 3), reason: "" });
    await announceFinalists(admin);
    expect((await db.select().from(awardCycle))[0]!.phase).toBe("FINALISTS_ANNOUNCED");
    await expect(
      reopenRoundOne(admin, { reason: "Too late to reopen now" }),
    ).rejects.toBeInstanceOf(ConflictError);
    const [reopened] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "round.reopened"));
    expect(reopened!.metadata).toMatchObject({ selectionsCleared: 1 });
  });

  it("will not open round one while an entry-fee checkout can still be paid", async () => {
    const { admin, cycle, category: cat, nominator } = await setup(3);
    const draft = await createCompleteEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: nominator.id,
    });
    await db.insert(payment).values({
      entryId: draft.id,
      kind: "ENTRY_FEE",
      tier: "LATE",
      amountCents: 80000,
      currency: "usd",
      provider: "mock",
      providerSessionId: "cs_test_late",
      createdById: nominator.id,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    await expect(openRoundOne(admin, {})).rejects.toThrow(/checkout/);
    await db.update(payment).set({ expiresAt: new Date(Date.now() - 6 * 60_000) });
    await openRoundOne(admin, {});
  });
});
