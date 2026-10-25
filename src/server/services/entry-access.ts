import "server-only";
import { and, eq } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import type { Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { conflictDeclaration, entry, judgeAssignment } from "@/server/db/schema";

/** How an actor may see an entry's confidential content, or null for no access. */
export type EntryAccess = "OWNER" | "ADMIN" | "JUDGE" | null;

/**
 * The one rule for reading an entry's confidential content (narrative, outcomes,
 * references, files):
 * - its nominator;
 * - admins;
 * - a judge assigned to the entry's category who has declared no conflict for this
 *   entry, once the entry is approved for judging.
 * Everyone else gets null. Callers turn null into NotFound, so existence is not revealed.
 */
export async function entryAccessFor(actor: Actor, entryId: string): Promise<EntryAccess> {
  if (!isUuid(entryId)) return null;
  const [row] = await db
    .select({ nominatorId: entry.nominatorId, categoryId: entry.categoryId, status: entry.status })
    .from(entry)
    .where(eq(entry.id, entryId));
  if (!row) return null;
  if (actor.role === "ADMIN") return "ADMIN";
  if (actor.role === "NOMINATOR") return row.nominatorId === actor.id ? "OWNER" : null;
  if (row.status !== "APPROVED") return null;
  const [assigned] = await db
    .select({ id: judgeAssignment.id })
    .from(judgeAssignment)
    .where(
      and(eq(judgeAssignment.judgeId, actor.id), eq(judgeAssignment.categoryId, row.categoryId)),
    )
    .limit(1);
  if (!assigned) return null;
  const [declared] = await db
    .select({ hasConflict: conflictDeclaration.hasConflict })
    .from(conflictDeclaration)
    .where(
      and(eq(conflictDeclaration.judgeId, actor.id), eq(conflictDeclaration.entryId, entryId)),
    );
  return declared && !declared.hasConflict ? "JUDGE" : null;
}
