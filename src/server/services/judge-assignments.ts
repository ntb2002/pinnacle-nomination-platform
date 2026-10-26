import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { assignmentsOpen, type Round } from "@/lib/phases";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awardCycle, category, judgeAssignment, judgeProfile } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { hasSubmittedEntries, JUDGE_HAS_ENTRIES_MESSAGE, loadJudge } from "./judges-admin";

/**
 * Admin: sets which categories a judge covers in one round of the active cycle.
 * Refused once that round has closed, and for a judge with submitted entries.
 */
export async function setAssignments(
  actor: Actor,
  judgeId: string,
  round: Round,
  categoryIds: string[],
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (round !== 1 && round !== 2) throw new ValidationError("Choose a round.");
  const wanted = [...new Set(categoryIds)];
  if (!wanted.every(isUuid)) throw new ValidationError("Choose categories from the list.");
  await db.transaction(async (tx) => {
    const [cycle] = await tx
      .select()
      .from(awardCycle)
      .where(eq(awardCycle.isActive, true))
      .for("share");
    if (!cycle) throw new NotFoundError("active cycle");
    if (!assignmentsOpen(cycle.phase, round))
      throw new ConflictError(`Round ${round} has closed, so its assignments are fixed.`);
    await loadJudge(tx, judgeId);
    if (wanted.length > 0 && (await hasSubmittedEntries(tx, judgeId)))
      throw new ConflictError(JUDGE_HAS_ENTRIES_MESSAGE);
    const valid = wanted.length
      ? await tx
          .select({ id: category.id })
          .from(category)
          .where(and(eq(category.cycleId, cycle.id), inArray(category.id, wanted)))
      : [];
    if (valid.length !== wanted.length)
      throw new ValidationError("Choose categories from the list.");
    const current = await tx
      .select({ id: judgeAssignment.id, categoryId: judgeAssignment.categoryId })
      .from(judgeAssignment)
      .innerJoin(category, eq(category.id, judgeAssignment.categoryId))
      .where(
        and(
          eq(judgeAssignment.judgeId, judgeId),
          eq(judgeAssignment.round, round),
          eq(category.cycleId, cycle.id),
        ),
      );
    const remove = current.filter((c) => !wanted.includes(c.categoryId));
    const add = wanted.filter((id) => !current.some((c) => c.categoryId === id));
    if (remove.length)
      await tx.delete(judgeAssignment).where(
        inArray(
          judgeAssignment.id,
          remove.map((r) => r.id),
        ),
      );
    if (add.length)
      await tx
        .insert(judgeAssignment)
        .values(add.map((categoryId) => ({ judgeId, categoryId, round })));
    await audit(
      {
        actor,
        action: "judge.assignments_updated",
        targetType: "user",
        targetId: judgeId,
        metadata: { round, added: add, removed: remove.map((r) => r.categoryId) },
        ip,
      },
      tx,
    );
  });
}

/** Admin: deactivates or reactivates a judge. Inactive judges see nothing and are off /judges. */
export async function setJudgeActive(actor: Actor, judgeId: string, active: boolean, ip?: string) {
  assertRole(actor, "ADMIN");
  await db.transaction(async (tx) => {
    const j = await loadJudge(tx, judgeId);
    await tx
      .insert(judgeProfile)
      .values({ userId: judgeId, displayName: j.profile?.displayName ?? j.email, active })
      .onConflictDoUpdate({ target: judgeProfile.userId, set: { active } });
    await audit(
      {
        actor,
        action: active ? "judge.reactivated" : "judge.deactivated",
        targetType: "user",
        targetId: judgeId,
        ip,
      },
      tx,
    );
  });
}
