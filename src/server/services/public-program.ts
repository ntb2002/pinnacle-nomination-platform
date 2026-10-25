import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db";
import { awardCycle, category, judgeProfile, rubricProfile, user } from "@/server/db/schema";

/**
 * Read-only public program data: the active cycle's dates and fees, enabled categories,
 * rubric weights, and judges who opted into a public profile. Nothing here is
 * confidential; entries, nominators and results are never selected.
 */
export const getActiveCycle = cache(async () => {
  const [cycle] = await db
    .select({
      id: awardCycle.id,
      year: awardCycle.year,
      name: awardCycle.name,
      phase: awardCycle.phase,
      nominationsOpenAt: awardCycle.nominationsOpenAt,
      earlyDeadline: awardCycle.earlyDeadline,
      regularDeadline: awardCycle.regularDeadline,
      finalDeadline: awardCycle.finalDeadline,
      earlyFeeCents: awardCycle.earlyFeeCents,
      regularFeeCents: awardCycle.regularFeeCents,
      lateFeeCents: awardCycle.lateFeeCents,
      finalistFeeCents: awardCycle.finalistFeeCents,
      finalistsAnnouncedAt: awardCycle.finalistsAnnouncedAt,
      resultsPublishedAt: awardCycle.resultsPublishedAt,
    })
    .from(awardCycle)
    .where(eq(awardCycle.isActive, true));
  return cycle ?? null;
});

export type PublicCycle = NonNullable<Awaited<ReturnType<typeof getActiveCycle>>>;

export const getPublicCategories = cache(async (cycleId: string) =>
  db
    .select({
      slug: category.slug,
      name: category.name,
      description: category.description,
      kind: category.kind,
      rubricProfileId: category.rubricProfileId,
    })
    .from(category)
    .where(and(eq(category.cycleId, cycleId), eq(category.enabled, true)))
    .orderBy(asc(category.sortOrder), asc(category.name)),
);

export const getRubricProfiles = cache(async (cycleId: string) =>
  db
    .select({
      id: rubricProfile.id,
      key: rubricProfile.key,
      name: rubricProfile.name,
      weightImpact: rubricProfile.weightImpact,
      weightInnovation: rubricProfile.weightInnovation,
      weightInfluence: rubricProfile.weightInfluence,
      weightReferences: rubricProfile.weightReferences,
    })
    .from(rubricProfile)
    .where(eq(rubricProfile.cycleId, cycleId))
    .orderBy(asc(rubricProfile.name)),
);

/** Judges shown on /judges: public profile, active, still a judge, not disabled. */
export const getPublicJudges = cache(async () =>
  db
    .select({
      name: judgeProfile.displayName,
      title: judgeProfile.title,
      organization: judgeProfile.organization,
      bio: judgeProfile.bio,
    })
    .from(judgeProfile)
    .innerJoin(user, eq(user.id, judgeProfile.userId))
    .where(
      and(
        eq(judgeProfile.isPublic, true),
        eq(judgeProfile.active, true),
        eq(user.role, "JUDGE"),
        isNull(user.disabledAt),
      ),
    )
    .orderBy(asc(judgeProfile.sortOrder), asc(judgeProfile.displayName)),
);
