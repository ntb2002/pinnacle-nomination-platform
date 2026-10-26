import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { roundStarted, type Round } from "@/lib/phases";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import {
  attachment,
  awardCycle,
  category,
  conflictDeclaration,
  entry,
  entryOutcome,
  entryReference,
  judgeAssignment,
  judgeProfile,
  score,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { judgeAccess } from "./entry-access";

async function activeProfile(judgeId: string) {
  const [p] = await db
    .select({ active: judgeProfile.active, displayName: judgeProfile.displayName })
    .from(judgeProfile)
    .where(eq(judgeProfile.userId, judgeId));
  return p?.active ? p : null;
}

/** Entries a round covers: approved ones in round 1, finalists in round 2. */
const inScope = (round: Round) =>
  round === 1
    ? eq(entry.status, "APPROVED")
    : and(eq(entry.status, "APPROVED"), eq(entry.isFinalist, true));

/** Judge home: assigned categories per round with progress (recused entries excluded). */
export async function getJudgeHome(actor: Actor) {
  assertRole(actor, "JUDGE");
  const profile = await activeProfile(actor.id);
  if (!profile) return { active: false as const, assignments: [] };
  const assignments = await db
    .select({
      categoryId: category.id,
      categoryName: category.name,
      round: judgeAssignment.round,
      phase: awardCycle.phase,
    })
    .from(judgeAssignment)
    .innerJoin(category, eq(category.id, judgeAssignment.categoryId))
    .innerJoin(awardCycle, and(eq(awardCycle.id, category.cycleId), eq(awardCycle.isActive, true)))
    .where(eq(judgeAssignment.judgeId, actor.id))
    .orderBy(asc(judgeAssignment.round), asc(category.sortOrder));
  const rows = [];
  for (const a of assignments) {
    const round = a.round as Round;
    const queue = await queueRows(actor.id, a.categoryId, round);
    const open = queue.filter((q) => !q.hasConflict);
    rows.push({
      ...a,
      round,
      started: roundStarted(a.phase, round),
      total: open.length,
      undeclared: queue.filter((q) => q.hasConflict === null).length,
      recused: queue.length - open.length,
      scored: open.filter((q) => q.scored).length,
    });
  }
  return { active: true as const, name: profile.displayName, assignments: rows };
}

async function queueRows(judgeId: string, categoryId: string, round: Round) {
  const rows = await db
    .select({
      id: entry.id,
      nomineeName: entry.nomineeName,
      nomineeTitle: entry.nomineeTitle,
      nomineeCompany: entry.nomineeCompany,
      hasConflict: conflictDeclaration.hasConflict,
    })
    .from(entry)
    .leftJoin(
      conflictDeclaration,
      and(eq(conflictDeclaration.entryId, entry.id), eq(conflictDeclaration.judgeId, judgeId)),
    )
    .where(and(eq(entry.categoryId, categoryId), inScope(round)))
    .orderBy(asc(entry.nomineeName), asc(entry.id));
  const ids = rows.map((r) => r.id);
  const scored = ids.length
    ? await db
        .select({ entryId: score.entryId })
        .from(score)
        .where(
          and(
            eq(score.judgeId, judgeId),
            eq(score.round, round),
            isNotNull(score.submittedAt),
            inArray(score.entryId, ids),
          ),
        )
    : [];
  const done = new Set(scored.map((s) => s.entryId));
  return rows.map((r) => ({ ...r, scored: done.has(r.id) }));
}

/**
 * Judge: one category's entries for a round. Before declaring, a judge sees only the
 * nominee's name, title and company. NotFound unless assigned (and active).
 */
export async function getJudgeQueue(actor: Actor, categoryId: string, round: Round) {
  assertRole(actor, "JUDGE");
  if (!isUuid(categoryId) || (round !== 1 && round !== 2)) throw new NotFoundError("category");
  if (!(await activeProfile(actor.id))) throw new NotFoundError("category");
  const [a] = await db
    .select({ categoryName: category.name, phase: awardCycle.phase })
    .from(judgeAssignment)
    .innerJoin(category, eq(category.id, judgeAssignment.categoryId))
    .innerJoin(awardCycle, and(eq(awardCycle.id, category.cycleId), eq(awardCycle.isActive, true)))
    .where(
      and(
        eq(judgeAssignment.judgeId, actor.id),
        eq(judgeAssignment.categoryId, categoryId),
        eq(judgeAssignment.round, round),
      ),
    );
  if (!a) throw new NotFoundError("category");
  const rows = await queueRows(actor.id, categoryId, round);
  return {
    categoryName: a.categoryName,
    started: roundStarted(a.phase, round),
    queue: rows.filter((r) => r.hasConflict !== true),
    recused: rows
      .filter((r) => r.hasConflict === true)
      .map((r) => ({ id: r.id, nomineeName: r.nomineeName })),
  };
}

/**
 * Judge: an entry's content for scoring, if `judgeAccess` allows it in this round.
 * Never includes reference emails/phones, the nominee's email, the nominator or
 * payments. Each view is audited.
 */
export async function getJudgeEntry(actor: Actor, entryId: string, round: Round, ip?: string) {
  assertRole(actor, "JUDGE");
  const access = await judgeAccess(actor.id, entryId);
  if (!access?.readableRounds.includes(round)) throw new NotFoundError("entry");
  const [e] = await db
    .select({
      id: entry.id,
      categoryId: entry.categoryId,
      categoryName: category.name,
      nomineeName: entry.nomineeName,
      nomineeTitle: entry.nomineeTitle,
      nomineeCompany: entry.nomineeCompany,
      nomineeLinkedinUrl: entry.nomineeLinkedinUrl,
      narrative: entry.narrative,
    })
    .from(entry)
    .innerJoin(category, eq(category.id, entry.categoryId))
    .where(eq(entry.id, entryId));
  if (!e) throw new NotFoundError("entry");
  const outcomes = await db
    .select({
      position: entryOutcome.position,
      description: entryOutcome.description,
      dataPoint: entryOutcome.dataPoint,
    })
    .from(entryOutcome)
    .where(eq(entryOutcome.entryId, entryId))
    .orderBy(asc(entryOutcome.position));
  const references = await db
    .select({
      position: entryReference.position,
      name: entryReference.name,
      title: entryReference.title,
      organization: entryReference.organization,
      relationship: entryReference.relationship,
    })
    .from(entryReference)
    .where(eq(entryReference.entryId, entryId))
    .orderBy(asc(entryReference.position));
  const files = await db
    .select({
      id: attachment.id,
      name: attachment.originalName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    })
    .from(attachment)
    .where(eq(attachment.entryId, entryId))
    .orderBy(asc(attachment.createdAt));
  await audit({
    actor,
    action: "entry.viewed_by_judge",
    targetType: "entry",
    targetId: entryId,
    metadata: { round },
    ip,
  });
  return { ...e, outcomes, references, files };
}
