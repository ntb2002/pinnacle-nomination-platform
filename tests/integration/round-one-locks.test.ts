import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import { awardCycle, conflictDeclaration } from "@/server/db/schema";
import { declareConflict, recordConflict } from "@/server/services/conflicts";
import { selectFinalists } from "@/server/services/finalists";
import { closeRoundOne, openRoundOne } from "@/server/services/rounds";
import { db, resetTables } from "../support/db";
import { makeJudge, scoreAll, setup } from "../support/round-one";

beforeEach(resetTables);
afterAll(closeDb);

const settle = () => new Promise((r) => setTimeout(r, 400));

/**
 * Holds the active cycle row FOR UPDATE, as announceFinalists does for its whole
 * transaction, until `release` is called.
 */
async function holdCycle(cycleId: string) {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let taken!: () => void;
  const lockTaken = new Promise<void>((r) => (taken = r));
  const done = db.transaction(async (tx) => {
    await tx.select().from(awardCycle).where(eq(awardCycle.id, cycleId)).for("update");
    taken();
    await released;
  });
  await lockTaken;
  return { release, done };
}

/** Five entries scored by three judges, round one closed, top 3 selected. */
async function readyToAnnounce() {
  const s = await setup(5);
  const third = await makeJudge(s.category.id);
  for (const id of s.ids)
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: third.id, entryId: id, hasConflict: false });
  const judges = [...s.judges, third] as [Actor, Actor, Actor];
  await openRoundOne(s.admin, {});
  await scoreAll(judges, s.ids);
  await closeRoundOne(s.admin);
  await selectFinalists(s.admin, s.category.id, {
    count: 3,
    entryIds: s.ids.slice(0, 3),
    reason: "",
  });
  return { ...s, judges };
}

describe("conflict declarations during finalist announcement (#12)", () => {
  it("a judge's late conflict waits for an announcement in progress", async () => {
    const { cycle, ids, judges } = await readyToAnnounce();
    const hold = await holdCycle(cycle.id);
    let committed = false;
    const declaring = declareConflict(judges[0], ids[0]!, {
      conflict: "yes",
      reason: "Former colleague of the nominee",
    }).then(() => (committed = true));
    try {
      await settle();
      // While the announcement holds the cycle, the declaration must not commit: a
      // conflict landing mid-announce would not be in the ranking it publishes.
      expect(committed).toBe(false);
    } finally {
      hold.release();
      await hold.done;
    }
    await declaring;
    expect(committed).toBe(true);
  });

  it("an admin-recorded conflict waits for an announcement in progress", async () => {
    const { admin, cycle, ids, judges } = await readyToAnnounce();
    const hold = await holdCycle(cycle.id);
    let committed = false;
    const recording = recordConflict(admin, judges[1].id, ids[1]!, {
      reason: "Reported by the nominee's company",
    }).then(() => (committed = true));
    try {
      await settle();
      expect(committed).toBe(false);
    } finally {
      hold.release();
      await hold.done;
    }
    await recording;
    expect(committed).toBe(true);
  });
});
