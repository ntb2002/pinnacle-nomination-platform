import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db";
import { CATEGORIES, CYCLE_2027, DEFAULT_FEES, RUBRIC_PROFILES } from "@/lib/program-defaults";
import { awardCycle, category, rubricProfile } from "@/server/db/schema";
import { endOfDayDeadline, toZonedDateInput, zonedToUtc } from "@/lib/zoned-time";
import { stableId } from "./ids";

const DAY = 86_400_000;

export interface ProgramOptions {
  /** Shift the 2027 window so nominations are open now (demo and e2e). */
  openNow: boolean;
  now: Date;
}

/** Eastern calendar date (YYYY-MM-DD) `days` from `now`. */
const easternDay = (now: Date, days: number) =>
  toZonedDateInput(new Date(now.getTime() + days * DAY));

function cycleDates({ openNow, now }: ProgramOptions) {
  if (!openNow) return CYCLE_2027;
  // Opened a week ago at 9:00 a.m. Eastern; deadlines at the end of an Eastern day,
  // the same shape admins enter (src/lib/zoned-time.ts).
  const at = (d: Date | null) => {
    if (!d) throw new Error("seed: bad date");
    return d;
  };
  return {
    ...CYCLE_2027,
    nominationsOpenAt: at(zonedToUtc(easternDay(now, -7), "09:00")),
    earlyDeadline: at(endOfDayDeadline(easternDay(now, 14))),
    regularDeadline: at(endOfDayDeadline(easternDay(now, 35))),
    finalDeadline: at(endOfDayDeadline(easternDay(now, 63))),
    judgingOpensAt: at(zonedToUtc(easternDay(now, 66))),
    judgingClosesAt: at(endOfDayDeadline(easternDay(now, 84))),
  };
}

/** Creates the active cycle with its rubric profiles and categories (idempotent). */
export async function seedProgram(db: Database, opts: ProgramOptions): Promise<string> {
  const dates = cycleDates(opts);
  const cycleId = stableId(`cycle:${dates.year}`);
  const values = { id: cycleId, ...dates, ...DEFAULT_FEES, isActive: true };
  const insert = db.insert(awardCycle).values(values);
  // --open-now re-aims an existing demo cycle's dates; otherwise existing settings win.
  await (opts.openNow
    ? insert.onConflictDoUpdate({
        target: awardCycle.year,
        set: {
          nominationsOpenAt: dates.nominationsOpenAt,
          earlyDeadline: dates.earlyDeadline,
          regularDeadline: dates.regularDeadline,
          finalDeadline: dates.finalDeadline,
          judgingOpensAt: dates.judgingOpensAt,
          judgingClosesAt: dates.judgingClosesAt,
        },
      })
    : insert.onConflictDoNothing({ target: awardCycle.year }));

  const [cycle] = await db
    .select({ id: awardCycle.id })
    .from(awardCycle)
    .where(eq(awardCycle.year, dates.year));
  if (!cycle) throw new Error("seed: cycle missing after insert");

  for (const p of RUBRIC_PROFILES) {
    await db
      .insert(rubricProfile)
      .values({
        id: stableId(`rubric:${dates.year}:${p.key}`),
        cycleId: cycle.id,
        key: p.key,
        name: p.name,
        ...p.weights,
      })
      .onConflictDoNothing();
  }
  const profiles = await db
    .select({ id: rubricProfile.id, key: rubricProfile.key })
    .from(rubricProfile)
    .where(eq(rubricProfile.cycleId, cycle.id));

  for (const [i, c] of CATEGORIES.entries()) {
    const profile = profiles.find((p) => p.key === c.rubric);
    if (!profile) throw new Error(`seed: rubric profile ${c.rubric} missing`);
    await db
      .insert(category)
      .values({
        id: stableId(`category:${dates.year}:${c.slug}`),
        cycleId: cycle.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        kind: c.kind,
        rubricProfileId: profile.id,
        sortOrder: i + 1,
      })
      .onConflictDoNothing();
  }
  return cycle.id;
}

export async function categoryIdsBySlug(db: Database, cycleId: string) {
  const rows = await db
    .select({ id: category.id, slug: category.slug, name: category.name })
    .from(category)
    .where(and(eq(category.cycleId, cycleId)));
  return new Map(rows.map((r) => [r.slug, r]));
}
