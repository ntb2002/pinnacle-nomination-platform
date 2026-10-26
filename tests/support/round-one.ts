import { eq } from "drizzle-orm";
import type { Actor } from "@/server/auth/actor";
import { conflictDeclaration, entry, judgeProfile } from "@/server/db/schema";
import { saveScore } from "@/server/services/scoring";
import { createActor } from "./actors";
import { db } from "./db";
import { assignJudge, createCategory, createCompleteEntry, createCycle } from "./factories";

export const DAY = 86_400_000;

/** Score form input with every criterion set to `n`. */
export const all = (n: number) => ({
  impact: String(n),
  innovation: String(n),
  influence: String(n),
  referenceValidation: String(n),
  comment: "",
  intent: "submit",
});

export async function makeJudge(categoryId: string) {
  const j = await createActor("JUDGE");
  await db.insert(judgeProfile).values({ userId: j.id, displayName: j.name || "Judge" });
  await assignJudge(j.id, categoryId, 1);
  return j;
}

/** A closed nomination window, `entries` approved entries, 2 judges with no conflicts. */
export async function setup(entries = 6) {
  const now = Date.now();
  const cycle = await createCycle({
    nominationsOpenAt: new Date(now - 40 * DAY),
    earlyDeadline: new Date(now - 30 * DAY),
    regularDeadline: new Date(now - 20 * DAY),
    finalDeadline: new Date(now - DAY),
  });
  const cat = await createCategory(cycle.id);
  const admin = await createActor("ADMIN");
  const nominator = await createActor("NOMINATOR");
  const ids: string[] = [];
  for (let i = 0; i < entries; i++) {
    const e = await createCompleteEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: nominator.id,
    });
    ids.push(e.id);
  }
  await db
    .update(entry)
    .set({ status: "APPROVED", submittedAt: new Date() })
    .where(eq(entry.cycleId, cycle.id));
  const judges = [await makeJudge(cat.id), await makeJudge(cat.id)];
  for (const j of judges)
    for (const id of ids)
      await db
        .insert(conflictDeclaration)
        .values({ judgeId: j.id, entryId: id, hasConflict: false });
  return { cycle, category: cat, admin, nominator, ids, judges };
}

/** Each judge scores entry i with (10 - i), so entry 0 ranks first. */
export async function scoreAll(judges: Actor[], ids: string[], value = (i: number) => 10 - i) {
  for (const j of judges)
    for (const [i, id] of ids.entries()) await saveScore(j, id, 1, all(value(i)));
}
