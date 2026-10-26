import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { reached, type Round } from "@/lib/phases";
import { adminConflictSchema, declarationSchema } from "@/lib/validation/judges";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import {
  awardCycle,
  category,
  conflictDeclaration,
  entry,
  judgeAssignment,
  judgeProfile,
  user,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";
import { judgeAccess } from "./entry-access";

export const CONFLICT_IS_FINAL =
  "You declared a conflict for this entry. Only the program team can change that.";

/**
 * Serializes declarations for one judge/entry pair. Cycle FOR SHARE first (order cycle →
 * entry, as triage and scoring): no conflict commits while finalists are announced. The
 * entry NO KEY UPDATE does not block inserts referencing it (scores, files).
 */
async function lockPair(tx: DbExecutor, judgeId: string, entryId: string) {
  const inCycle = and(eq(entry.id, entryId), eq(awardCycle.id, entry.cycleId));
  await tx.select({ id: awardCycle.id }).from(entry).innerJoin(awardCycle, inCycle).for("share", {
    of: awardCycle,
  });
  const [e] = await tx
    .select({ id: entry.id })
    .from(entry)
    .where(eq(entry.id, entryId))
    .for("no key update");
  if (!e) throw new NotFoundError("entry");
  const [row] = await tx
    .select()
    .from(conflictDeclaration)
    .where(and(eq(conflictDeclaration.judgeId, judgeId), eq(conflictDeclaration.entryId, entryId)));
  return row ?? null;
}

/**
 * Judge: declares "no conflict" or "conflict" (with a reason) for an entry they may
 * declare on. A conflict recuses them at once and is final for the judge. A judge who
 * said "no conflict" can later change it to "conflict" (e.g. they turn out to be a
 * reference); scores they started then no longer count (#12 excludes recused judges).
 */
export async function declareConflict(
  actor: Actor,
  entryId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "JUDGE");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const parsed = declarationSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  const hasConflict = parsed.data.conflict === "yes";
  const reason = hasConflict ? parsed.data.reason! : null;
  await db.transaction(async (tx) => {
    const existing = await lockPair(tx, actor.id, entryId);
    const access = await judgeAccess(actor.id, entryId, tx);
    if (!access?.canDeclare) throw new NotFoundError("entry");
    if (existing?.hasConflict) throw new ConflictError(CONFLICT_IS_FINAL);
    if (existing && !hasConflict) return; // already "no conflict"
    if (existing) {
      await tx
        .update(conflictDeclaration)
        .set({ hasConflict: true, reason, declaredAt: new Date(), recordedById: null })
        .where(eq(conflictDeclaration.id, existing.id));
    } else {
      await tx
        .insert(conflictDeclaration)
        .values({ judgeId: actor.id, entryId, hasConflict, reason });
    }
    await audit(
      {
        actor,
        action: existing ? "conflict.changed_to_conflict" : "conflict.declared",
        targetType: "entry",
        targetId: entryId,
        // The judge's own words: an admin may later clear the conflict and the judge
        // re-declare, overwriting the row, so the audit log keeps every reason.
        metadata: {
          hasConflict,
          reason,
          // Flag for admins: after round one closes a conflict can change rankings that
          // finalist selection relies on (announcement re-checks them).
          ...(reached(access.phase, "ROUND1_CLOSED") ? { afterRoundClosed: true } : {}),
        },
        ip,
      },
      tx,
    );
  });
}

async function requireJudge(tx: DbExecutor, judgeId: string) {
  const [j] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, judgeId), eq(user.role, "JUDGE")));
  if (!j) throw new NotFoundError("judge");
}

/** Admin: records a recusal on a judge's behalf (e.g. a conflict the team knows about). */
export async function recordConflict(
  actor: Actor,
  judgeId: string,
  entryId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const parsed = adminConflictSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  await db.transaction(async (tx) => {
    await requireJudge(tx, judgeId);
    const existing = await lockPair(tx, judgeId, entryId);
    if (existing?.hasConflict) return;
    const values = {
      hasConflict: true,
      recordedById: actor.id,
      adminNote: parsed.data.reason,
      declaredAt: new Date(),
    };
    if (existing)
      await tx
        .update(conflictDeclaration)
        .set(values)
        .where(eq(conflictDeclaration.id, existing.id));
    else await tx.insert(conflictDeclaration).values({ judgeId, entryId, ...values });
    await audit(
      {
        actor,
        action: "conflict.recorded_by_admin",
        targetType: "entry",
        targetId: entryId,
        metadata: { judgeId, reason: parsed.data.reason },
        ip,
      },
      tx,
    );
  });
}

/** Admin: reverses a declared conflict. Always with a reason, always audited. */
export async function clearConflict(
  actor: Actor,
  judgeId: string,
  entryId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const parsed = adminConflictSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  await db.transaction(async (tx) => {
    await requireJudge(tx, judgeId);
    const existing = await lockPair(tx, judgeId, entryId);
    if (!existing?.hasConflict) throw new ConflictError("There is no conflict to clear.");
    await tx
      .update(conflictDeclaration)
      .set({ hasConflict: false, recordedById: actor.id, adminNote: parsed.data.reason })
      .where(eq(conflictDeclaration.id, existing.id));
    await audit(
      {
        actor,
        action: "conflict.cleared",
        targetType: "entry",
        targetId: entryId,
        metadata: { judgeId, reason: parsed.data.reason },
        ip,
      },
      tx,
    );
  });
}

/** Admin: approved entries in a judge's assigned categories, with the judge's declaration. */
export async function declarationsForJudge(actor: Actor, judgeId: string) {
  assertRole(actor, "ADMIN");
  return db
    .selectDistinct({
      entryId: entry.id,
      nomineeName: entry.nomineeName,
      nomineeCompany: entry.nomineeCompany,
      categoryName: category.name,
      // DISTINCT (one row per entry, even when assigned for both rounds) needs every
      // ORDER BY expression in the select list.
      categorySort: category.sortOrder,
      isFinalist: entry.isFinalist,
      hasConflict: conflictDeclaration.hasConflict,
      reason: conflictDeclaration.reason,
      adminNote: conflictDeclaration.adminNote,
      recordedById: conflictDeclaration.recordedById,
      declaredAt: conflictDeclaration.declaredAt,
    })
    .from(judgeAssignment)
    .innerJoin(category, eq(category.id, judgeAssignment.categoryId))
    .innerJoin(awardCycle, and(eq(awardCycle.id, category.cycleId), eq(awardCycle.isActive, true)))
    .innerJoin(entry, and(eq(entry.categoryId, category.id), eq(entry.status, "APPROVED")))
    .leftJoin(
      conflictDeclaration,
      and(eq(conflictDeclaration.entryId, entry.id), eq(conflictDeclaration.judgeId, judgeId)),
    )
    .where(eq(judgeAssignment.judgeId, judgeId))
    .orderBy(asc(category.sortOrder), asc(entry.nomineeName));
}

export const MIN_ELIGIBLE_JUDGES = 2;

/**
 * Admin: entries that fewer than 2 eligible judges (assigned for the round, active, not
 * disabled, not recused) can score. Round 1 covers approved entries; round 2 finalists.
 */
export async function coverageWarnings(actor: Actor) {
  assertRole(actor, "ADMIN");
  const [cycle] = await db
    .select({ id: awardCycle.id })
    .from(awardCycle)
    .where(eq(awardCycle.isActive, true));
  if (!cycle) return [];
  const [entries, assignments, conflicts] = await Promise.all([
    db
      .select({
        id: entry.id,
        categoryId: entry.categoryId,
        nomineeName: entry.nomineeName,
        isFinalist: entry.isFinalist,
        categoryName: category.name,
      })
      .from(entry)
      .innerJoin(category, eq(category.id, entry.categoryId))
      .where(and(eq(entry.cycleId, cycle.id), eq(entry.status, "APPROVED")))
      .orderBy(asc(category.sortOrder), asc(entry.nomineeName)),
    db
      .select({
        judgeId: judgeAssignment.judgeId,
        categoryId: judgeAssignment.categoryId,
        round: judgeAssignment.round,
      })
      .from(judgeAssignment)
      .innerJoin(
        judgeProfile,
        and(eq(judgeProfile.userId, judgeAssignment.judgeId), eq(judgeProfile.active, true)),
      )
      .innerJoin(
        user,
        and(eq(user.id, judgeAssignment.judgeId), eq(user.role, "JUDGE"), isNull(user.disabledAt)),
      ),
    db
      .select({ judgeId: conflictDeclaration.judgeId, entryId: conflictDeclaration.entryId })
      .from(conflictDeclaration)
      .innerJoin(entry, and(eq(entry.id, conflictDeclaration.entryId), eq(entry.cycleId, cycle.id)))
      .where(eq(conflictDeclaration.hasConflict, true)),
  ]);
  const recused = new Set(conflicts.map((c) => `${c.judgeId}:${c.entryId}`));
  const byCategoryRound = new Map<string, string[]>();
  for (const a of assignments) {
    const k = `${a.categoryId}:${a.round}`;
    byCategoryRound.set(k, [...(byCategoryRound.get(k) ?? []), a.judgeId]);
  }
  const out: {
    entryId: string;
    nomineeName: string | null;
    categoryName: string;
    round: Round;
    eligible: number;
  }[] = [];
  for (const round of [1, 2] as const) {
    for (const e of entries) {
      if (round === 2 && !e.isFinalist) continue;
      const eligible = (byCategoryRound.get(`${e.categoryId}:${round}`) ?? []).filter(
        (judgeId) => !recused.has(`${judgeId}:${e.id}`),
      ).length;
      if (eligible < MIN_ELIGIBLE_JUDGES) {
        out.push({
          entryId: e.id,
          nomineeName: e.nomineeName,
          categoryName: e.categoryName,
          round,
          eligible,
        });
      }
    }
  }
  return out;
}
