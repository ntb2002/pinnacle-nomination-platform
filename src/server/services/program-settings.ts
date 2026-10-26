import "server-only";
import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import {
  categoryUpdateSchema,
  parseCycleSettings,
  parseRubricWeights,
  type CycleSettings,
} from "@/lib/validation/program-settings";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import { awardCycle, category, entry, payment, rubricProfile } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";

/** Rubric weights and category scoring are frozen once round one opens. */
export const isJudgingStarted = (phase: string) => phase !== "NOMINATION";

async function lockActiveCycle(tx: DbExecutor) {
  const [cycle] = await tx
    .select()
    .from(awardCycle)
    .where(eq(awardCycle.isActive, true))
    .for("update");
  if (!cycle) throw new NotFoundError("active cycle");
  return cycle;
}

const SETTINGS_KEYS = [
  "nominationsOpenAt",
  "earlyDeadline",
  "regularDeadline",
  "finalDeadline",
  "earlyFeeCents",
  "regularFeeCents",
  "lateFeeCents",
  "finalistFeeCents",
  "judgingOpensAt",
  "judgingClosesAt",
] as const;

function snapshot(c: Record<(typeof SETTINGS_KEYS)[number], Date | number | null>) {
  return Object.fromEntries(
    SETTINGS_KEYS.map((k) => [k, c[k] instanceof Date ? (c[k] as Date).toISOString() : c[k]]),
  );
}

/** Admin read model for the settings pages. */
export async function getAdminProgram(actor: Actor) {
  assertRole(actor, "ADMIN");
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  if (!cycle) return null;
  const [profiles, categories] = await Promise.all([
    db
      .select()
      .from(rubricProfile)
      .where(eq(rubricProfile.cycleId, cycle.id))
      .orderBy(asc(rubricProfile.name)),
    db
      .select()
      .from(category)
      .where(eq(category.cycleId, cycle.id))
      .orderBy(asc(category.sortOrder), asc(category.name)),
  ]);
  return { cycle, profiles, categories, locked: isJudgingStarted(cycle.phase) };
}

/** Admin: replaces the active cycle's dates and fees. Audited with before/after values. */
export async function updateCycleSettings(actor: Actor, raw: Record<string, unknown>, ip?: string) {
  assertRole(actor, "ADMIN");
  const parsed = parseCycleSettings(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", parsed.fieldErrors);
  const next = parsed.data;
  await db.transaction(async (tx) => {
    const before = await lockActiveCycle(tx);
    await assertSettingsChangeAllowed(tx, before, next);
    await tx.update(awardCycle).set(next).where(eq(awardCycle.id, before.id));
    await audit(
      {
        actor,
        action: "cycle.settings_updated",
        targetType: "award_cycle",
        targetId: before.id,
        metadata: { before: snapshot(before), after: snapshot(next) },
        ip,
      },
      tx,
    );
  });
}

const AFTER_FINALISTS = [
  "FINALISTS_ANNOUNCED",
  "ROUND2_OPEN",
  "ROUND2_CLOSED",
  "RESULTS_PUBLISHED",
];
const WINDOW_AND_ENTRY_FEES = [
  "nominationsOpenAt",
  "earlyDeadline",
  "regularDeadline",
  "finalDeadline",
  "earlyFeeCents",
  "regularFeeCents",
  "lateFeeCents",
] as const;

/**
 * Phase rules for changing dates and fees (DECISIONS 006):
 * - once judging starts, the nomination window and entry fees are frozen;
 * - once finalists are announced, the finalist package fee is frozen;
 * - while nominations run, opening cannot move later than an entry already submitted.
 * Extending a deadline during nominations is allowed (and audited).
 */
async function assertSettingsChangeAllowed(
  tx: DbExecutor,
  before: typeof awardCycle.$inferSelect,
  next: CycleSettings,
) {
  const same = (k: (typeof WINDOW_AND_ENTRY_FEES)[number] | "finalistFeeCents") =>
    String(before[k] instanceof Date ? (before[k] as Date).getTime() : before[k]) ===
    String(next[k] instanceof Date ? (next[k] as Date).getTime() : next[k]);
  if (isJudgingStarted(before.phase) && !WINDOW_AND_ENTRY_FEES.every(same)) {
    throw new ConflictError(
      "Nomination dates and entry fees are locked because judging has started.",
    );
  }
  if (AFTER_FINALISTS.includes(before.phase) && !same("finalistFeeCents")) {
    throw new ConflictError(
      "The finalist package fee is locked because finalists have been announced.",
    );
  }
  const [first] = await tx
    .select({ at: sql<Date | null>`min(${entry.submittedAt})` })
    .from(entry)
    .where(eq(entry.cycleId, before.id));
  const firstSubmitted = first?.at ? new Date(first.at) : null;
  if (firstSubmitted && next.nominationsOpenAt > firstSubmitted) {
    throw new ValidationError("Check the highlighted fields.", {
      opensDate: ["Entries were already submitted before this date. Opening cannot move later."],
    });
  }
}

/** Admin: edits a rubric profile's weights. Refused once round one has opened. */
export async function updateRubricWeights(
  actor: Actor,
  profileId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(profileId)) throw new NotFoundError("rubric profile");
  const parsed = parseRubricWeights(raw);
  if (!parsed.success) throw new ValidationError("Check the weights.", parsed.fieldErrors);
  const next = parsed.data;
  await db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx);
    if (isJudgingStarted(cycle.phase)) {
      throw new ConflictError("Rubric weights are locked because judging has started.");
    }
    const [before] = await tx
      .select()
      .from(rubricProfile)
      .where(and(eq(rubricProfile.id, profileId), eq(rubricProfile.cycleId, cycle.id)));
    if (!before) throw new NotFoundError("rubric profile");
    await tx.update(rubricProfile).set(next).where(eq(rubricProfile.id, profileId));
    const weights = (p: typeof next) => ({
      weightImpact: p.weightImpact,
      weightInnovation: p.weightInnovation,
      weightInfluence: p.weightInfluence,
      weightReferences: p.weightReferences,
    });
    await audit(
      {
        actor,
        action: "rubric.weights_updated",
        targetType: "rubric_profile",
        targetId: profileId,
        metadata: { before: weights(before), after: weights(next) },
        ip,
      },
      tx,
    );
  });
}

/**
 * Admin: edits a category's description, rubric and (optional categories only) whether
 * it is offered. A category with submitted entries cannot be withdrawn, and its rubric
 * cannot change once judging has started.
 */
export async function updateCategory(
  actor: Actor,
  categoryId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(categoryId)) throw new NotFoundError("category");
  const parsed = categoryUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  }
  const next = parsed.data;
  await db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx);
    const [before] = await tx
      .select()
      .from(category)
      .where(and(eq(category.id, categoryId), eq(category.cycleId, cycle.id)))
      // Serializes with entry submission, which reads the category FOR SHARE (#7, #9).
      .for("update");
    if (!before) throw new NotFoundError("category");
    if (before.kind === "CORE" && !next.enabled) {
      throw new ConflictError("Core categories are always offered.");
    }
    if (before.rubricProfileId !== next.rubricProfileId) {
      if (isJudgingStarted(cycle.phase)) {
        throw new ConflictError("The rubric is locked because judging has started.");
      }
      const [profile] = await tx
        .select({ id: rubricProfile.id })
        .from(rubricProfile)
        .where(
          and(eq(rubricProfile.id, next.rubricProfileId), eq(rubricProfile.cycleId, cycle.id)),
        );
      if (!profile)
        throw new ValidationError("Choose a rubric.", { rubricProfileId: ["Choose a rubric"] });
    }
    if (before.enabled && !next.enabled) {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(entry)
        .where(and(eq(entry.categoryId, categoryId), ne(entry.status, "DRAFT")));
      if ((row?.n ?? 0) > 0) {
        throw new ConflictError("This category has submitted entries, so it cannot be withdrawn.");
      }
      // A draft with an open checkout could be paid for after withdrawal.
      const [paying] = await tx
        .select({ id: payment.id })
        .from(payment)
        .innerJoin(entry, eq(entry.id, payment.entryId))
        .where(
          and(
            eq(entry.categoryId, categoryId),
            eq(payment.status, "PENDING"),
            gt(payment.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (paying) {
        throw new ConflictError(
          "A nominator is paying for an entry in this category right now. Try again in 30 minutes.",
        );
      }
    }
    await tx.update(category).set(next).where(eq(category.id, categoryId));
    await audit(
      {
        actor,
        action: "category.updated",
        targetType: "category",
        targetId: categoryId,
        metadata: {
          before: {
            enabled: before.enabled,
            rubricProfileId: before.rubricProfileId,
            description: before.description,
          },
          after: {
            enabled: next.enabled,
            rubricProfileId: next.rubricProfileId,
            description: next.description,
          },
        },
        ip,
      },
      tx,
    );
  });
}
