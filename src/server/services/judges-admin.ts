import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, ne } from "drizzle-orm";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { inviteJudgeSchema, judgeProfileSchema } from "@/lib/validation/judges";
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
  payment,
  user,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { judgeInviteEmail } from "@/server/email/templates";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";
import { CONFIRMATION_GRACE_MS } from "./checkout";

export const JUDGE_HAS_ENTRIES_MESSAGE =
  "This person has submitted nominations in the current cycle, so they cannot judge it.";
export const JUDGE_PAYING_MESSAGE =
  "This person is paying for a nomination right now, so they cannot be made a judge. Try again later.";

/**
 * Conflict policy: judges may not submit nominations in the cycle they judge. Returns
 * why `userId` cannot judge the active cycle, or null: any non-draft entry, or a draft
 * whose checkout is open or still confirming (it would become submitted on payment).
 */
export async function nominationConflict(tx: DbExecutor, userId: string): Promise<string | null> {
  const [submitted] = await tx
    .select({ id: entry.id })
    .from(entry)
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .where(
      and(eq(entry.nominatorId, userId), ne(entry.status, "DRAFT"), eq(awardCycle.isActive, true)),
    )
    .limit(1);
  if (submitted) return JUDGE_HAS_ENTRIES_MESSAGE;
  const [paying] = await tx
    .select({ id: payment.id })
    .from(payment)
    .innerJoin(entry, eq(entry.id, payment.entryId))
    .innerJoin(awardCycle, and(eq(awardCycle.id, entry.cycleId), eq(awardCycle.isActive, true)))
    .where(
      and(
        eq(entry.nominatorId, userId),
        eq(payment.status, "PENDING"),
        gt(payment.expiresAt, new Date(Date.now() - CONFIRMATION_GRACE_MS)),
      ),
    )
    .limit(1);
  return paying ? JUDGE_PAYING_MESSAGE : null;
}

/** True when the judge has declared on any entry of the active cycle (they have seen the pool). */
export async function hasJudgedActiveCycle(tx: DbExecutor, judgeId: string) {
  const [row] = await tx
    .select({ id: conflictDeclaration.id })
    .from(conflictDeclaration)
    .innerJoin(entry, eq(entry.id, conflictDeclaration.entryId))
    .innerJoin(awardCycle, and(eq(awardCycle.id, entry.cycleId), eq(awardCycle.isActive, true)))
    .where(eq(conflictDeclaration.judgeId, judgeId))
    .limit(1);
  return !!row;
}

/** Admin: the panel, with each judge's assignments per round. */
export async function listJudges(actor: Actor) {
  assertRole(actor, "ADMIN");
  const judges = await db
    .select({
      id: user.id,
      email: user.email,
      disabledAt: user.disabledAt,
      displayName: judgeProfile.displayName,
      title: judgeProfile.title,
      organization: judgeProfile.organization,
      isPublic: judgeProfile.isPublic,
      active: judgeProfile.active,
    })
    .from(user)
    .leftJoin(judgeProfile, eq(judgeProfile.userId, user.id))
    .where(eq(user.role, "JUDGE"))
    .orderBy(asc(judgeProfile.sortOrder), asc(judgeProfile.displayName), asc(user.email));
  const assignments = judges.length
    ? await db
        .select({
          judgeId: judgeAssignment.judgeId,
          round: judgeAssignment.round,
          categoryName: category.name,
        })
        .from(judgeAssignment)
        .innerJoin(category, eq(category.id, judgeAssignment.categoryId))
        .innerJoin(
          awardCycle,
          and(eq(awardCycle.id, category.cycleId), eq(awardCycle.isActive, true)),
        )
        .where(
          inArray(
            judgeAssignment.judgeId,
            judges.map((j) => j.id),
          ),
        )
        .orderBy(asc(category.sortOrder))
    : [];
  return judges.map((j) => ({
    ...j,
    round1: assignments
      .filter((a) => a.judgeId === j.id && a.round === 1)
      .map((a) => a.categoryName),
    round2: assignments
      .filter((a) => a.judgeId === j.id && a.round === 2)
      .map((a) => a.categoryName),
  }));
}

/**
 * Admin: makes someone a judge (creating the account if needed) with a profile, and
 * emails them. Refused for admins and for anyone with submitted entries this cycle.
 */
export async function inviteJudge(actor: Actor, raw: Record<string, unknown>, ip?: string) {
  assertRole(actor, "ADMIN");
  const parsed = inviteJudgeSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const judgeId = await db.transaction(async (tx) => {
    // Insert-or-find, so two invites for a new address cannot race on the unique email.
    const created = await tx
      .insert(user)
      .values({
        id: randomUUID(),
        email: v.email,
        name: v.displayName,
        role: "JUDGE",
        emailVerified: false,
      })
      .onConflictDoNothing({ target: user.email })
      .returning({ id: user.id });
    const [u] = await tx
      .select({ id: user.id, role: user.role, disabledAt: user.disabledAt })
      .from(user)
      .where(eq(user.email, v.email))
      .for("update");
    const id = u!.id;
    if (u!.role === "ADMIN") throw new ConflictError("Administrators cannot also be judges.");
    if (u!.disabledAt)
      throw new ConflictError("This account's sign-in is disabled. Re-enable it first.");
    const blocked = await nominationConflict(tx, id);
    if (blocked) throw new ConflictError(blocked);
    const previousRole = u!.role;
    if (previousRole !== "JUDGE")
      await tx.update(user).set({ role: "JUDGE" }).where(eq(user.id, id));
    // A re-invite refreshes the profile text but never silently reactivates a judge.
    await tx
      .insert(judgeProfile)
      .values({
        userId: id,
        displayName: v.displayName,
        title: v.title,
        organization: v.organization,
        active: true,
      })
      .onConflictDoUpdate({
        target: judgeProfile.userId,
        set: { displayName: v.displayName, title: v.title, organization: v.organization },
      });
    await audit(
      {
        actor,
        action: "judge.invited",
        targetType: "user",
        targetId: id,
        metadata: { from: created.length ? null : previousRole, created: created.length > 0 },
        ip,
      },
      tx,
    );
    return id;
  });
  await sendEmail({
    to: v.email,
    template: "judge-invite",
    content: judgeInviteEmail({
      name: v.displayName,
      signInUrl: `${env().APP_URL}/sign-in?next=%2Fjudge`,
    }),
  });
  return judgeId;
}

export async function loadJudge(tx: DbExecutor, judgeId: string) {
  if (!isUuid(judgeId) && !/^[A-Za-z0-9_-]{8,64}$/.test(judgeId)) throw new NotFoundError("judge");
  const [j] = await tx
    .select({ id: user.id, email: user.email, profile: judgeProfile })
    .from(user)
    .leftJoin(judgeProfile, eq(judgeProfile.userId, user.id))
    .where(and(eq(user.id, judgeId), eq(user.role, "JUDGE")));
  if (!j) throw new NotFoundError("judge");
  return j;
}

/** Admin: one judge with profile and assignment ids per round (for the edit page). */
export async function getJudge(actor: Actor, judgeId: string) {
  assertRole(actor, "ADMIN");
  const j = await loadJudge(db, judgeId);
  const rows = await db
    .select({ categoryId: judgeAssignment.categoryId, round: judgeAssignment.round })
    .from(judgeAssignment)
    .where(eq(judgeAssignment.judgeId, judgeId));
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  const categories = cycle
    ? await db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(eq(category.cycleId, cycle.id))
        .orderBy(asc(category.sortOrder))
    : [];
  return {
    ...j,
    categories,
    phase: cycle?.phase ?? "NOMINATION",
    round1: rows.filter((r) => r.round === 1).map((r) => r.categoryId),
    round2: rows.filter((r) => r.round === 2).map((r) => r.categoryId),
  };
}

/** Admin: edits a judge's public profile (audited). */
export async function updateJudgeProfile(
  actor: Actor,
  judgeId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  const parsed = judgeProfileSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  await db.transaction(async (tx) => {
    await loadJudge(tx, judgeId);
    await tx
      .insert(judgeProfile)
      .values({ userId: judgeId, ...parsed.data })
      .onConflictDoUpdate({ target: judgeProfile.userId, set: parsed.data });
    await audit(
      {
        actor,
        action: "judge.profile_updated",
        targetType: "user",
        targetId: judgeId,
        metadata: { isPublic: parsed.data.isPublic },
        ip,
      },
      tx,
    );
  });
}
