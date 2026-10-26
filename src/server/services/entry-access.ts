import "server-only";
import { and, eq } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { reached, roundStarted, type Round } from "@/lib/phases";
import type { Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import {
  awardCycle,
  conflictDeclaration,
  entry,
  judgeAssignment,
  judgeProfile,
  user,
} from "@/server/db/schema";

/** How an actor may see an entry's confidential content, or null for no access. */
export type EntryAccess = "OWNER" | "ADMIN" | "JUDGE" | null;

export interface JudgeAccess {
  /** May declare a conflict (sees only nominee name, title and company). */
  canDeclare: boolean;
  /** Rounds in which the judge may read the entry's content. */
  readableRounds: Round[];
  declaration: { hasConflict: boolean } | null;
  categoryId: string;
  phase: string;
}

/**
 * The judge rule (#11), the single source for every judge path (pages, files, scores):
 * - the user is still a JUDGE with an active profile, and the entry is APPROVED in the
 *   active cycle;
 * - declaring: assigned to the entry's category for round 1, or for round 2 when the
 *   entry is a finalist;
 * - reading in a round: assigned for that round, the round has opened, round 2 only for
 *   finalists, and the judge declared "no conflict" for this entry.
 * Disabled users never get here (getActor returns null for them).
 */
export async function judgeAccess(
  judgeId: string,
  entryId: string,
  tx: DbExecutor = db,
): Promise<JudgeAccess | null> {
  if (!isUuid(entryId)) return null;
  const [row] = await tx
    .select({
      status: entry.status,
      categoryId: entry.categoryId,
      isFinalist: entry.isFinalist,
      phase: awardCycle.phase,
    })
    .from(entry)
    // Only the active cycle: assignments and declarations are kept for the record,
    // so a past cycle's judges must not keep reading its entries.
    .innerJoin(awardCycle, and(eq(awardCycle.id, entry.cycleId), eq(awardCycle.isActive, true)))
    .where(eq(entry.id, entryId));
  if (!row || row.status !== "APPROVED") return null;
  const [profile] = await tx
    .select({ active: judgeProfile.active })
    .from(judgeProfile)
    // Profiles and assignments survive a role change: still a judge?
    .innerJoin(user, and(eq(user.id, judgeProfile.userId), eq(user.role, "JUDGE")))
    .where(eq(judgeProfile.userId, judgeId));
  if (!profile?.active) return null;
  const assigned = await tx
    .select({ round: judgeAssignment.round })
    .from(judgeAssignment)
    .where(
      and(eq(judgeAssignment.judgeId, judgeId), eq(judgeAssignment.categoryId, row.categoryId)),
    );
  // Round 2 covers finalists, and only once they are announced (until then the
  // selection is not public, even to the round-2 panel).
  const rounds = assigned
    .map((a) => a.round as Round)
    .filter((r) => r === 1 || (row.isFinalist && reached(row.phase, "FINALISTS_ANNOUNCED")));
  if (rounds.length === 0) return null;
  const [declared] = await tx
    .select({ hasConflict: conflictDeclaration.hasConflict })
    .from(conflictDeclaration)
    .where(and(eq(conflictDeclaration.judgeId, judgeId), eq(conflictDeclaration.entryId, entryId)));
  const clear = declared ? !declared.hasConflict : false;
  return {
    canDeclare: true,
    readableRounds: clear ? rounds.filter((r) => roundStarted(row.phase, r)) : [],
    declaration: declared ?? null,
    categoryId: row.categoryId,
    phase: row.phase,
  };
}

/**
 * The one rule for reading an entry's confidential content (narrative, outcomes,
 * references, files): its nominator; admins; a judge per `judgeAccess`.
 * Everyone else gets null. Callers turn null into NotFound, so existence is not revealed.
 */
export async function entryAccessFor(actor: Actor, entryId: string): Promise<EntryAccess> {
  if (!isUuid(entryId)) return null;
  if (actor.role === "ADMIN") {
    const [row] = await db.select({ id: entry.id }).from(entry).where(eq(entry.id, entryId));
    return row ? "ADMIN" : null;
  }
  if (actor.role === "NOMINATOR") {
    const [row] = await db
      .select({ id: entry.id })
      .from(entry)
      .where(and(eq(entry.id, entryId), eq(entry.nominatorId, actor.id)));
    return row ? "OWNER" : null;
  }
  const access = await judgeAccess(actor.id, entryId);
  return access && access.readableRounds.length > 0 ? "JUDGE" : null;
}
