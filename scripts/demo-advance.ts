// npm run demo:advance -- <step>   (development and demo databases only)
//   close-nominations  move the deadlines into the past so round one can open
//   fill-scores        (round one open) every assigned judge declares "no conflict" and
//                      scores every approved entry, except entries with a declared
//                      conflict: those are left for the presenter to score live
//   select-others      (round one closed) choose the top finalists in every category
//                      except one with a recusal, which the presenter chooses live
// Runs the real services (rules, locks and audit rows apply), as admin@example.org and
// the seeded judges. Local *_dev/_test/_e2e databases only (scripts/lib/db-guard.ts).
// See DEMO.md.
import "dotenv/config";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { deadlineToDateInput, toZonedDateInput, toZonedTimeInput } from "@/lib/zoned-time";
import { allowedCounts, cutoffTie } from "@/lib/scoring";
import type { Actor } from "@/server/auth/actor";
import { closeDb, db } from "@/server/db";
import {
  awardCycle,
  category,
  conflictDeclaration,
  entry,
  finalistSelection,
  judgeAssignment,
  score,
  user,
} from "@/server/db/schema";
import { declareConflict } from "@/server/services/conflicts";
import { selectFinalists } from "@/server/services/finalists";
import { updateCycleSettings } from "@/server/services/program-settings";
import { computeRanking } from "@/server/services/rankings";
import { saveScore } from "@/server/services/scoring";
import { assertSafeToReset } from "./lib/db-guard";

/** The Eastern calendar date `offset` days from today (calendar days, DST-safe). */
function day(offset: number) {
  const [y, m, d] = toZonedDateInput(new Date()).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}
const must = <T>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new Error(`demo: ${what}`);
  return v;
};

async function activeCycle() {
  const [c] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  return must(c, "no active cycle (run npm run db:seed -- --open-now)");
}

async function actorFor(email: string): Promise<Actor> {
  const [u] = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.email, email));
  return must(u, `${email} not found (is this the demo database?)`);
}

/** Entries with a declared conflict: the presenter handles these live. */
async function recusedEntryIds(cycleId: string) {
  const rows = await db
    .selectDistinct({ id: conflictDeclaration.entryId })
    .from(conflictDeclaration)
    .innerJoin(entry, eq(entry.id, conflictDeclaration.entryId))
    .where(and(eq(entry.cycleId, cycleId), eq(conflictDeclaration.hasConflict, true)));
  return new Set(rows.map((r) => r.id));
}

async function closeNominations(admin: Actor) {
  const c = await activeCycle();
  if (c.phase !== "NOMINATION") throw new Error("demo: nominations are already closed");
  // Through the admin settings service: validated, locked and audited like the form.
  const dollars = (cents: number) => String(cents / 100);
  await updateCycleSettings(admin, {
    opensDate: toZonedDateInput(c.nominationsOpenAt),
    opensTime: toZonedTimeInput(c.nominationsOpenAt),
    earlyDate: day(-3),
    regularDate: day(-2),
    finalDate: day(-1),
    judgingOpensDate: day(0),
    judgingClosesDate: day(18),
    earlyFee: dollars(c.earlyFeeCents),
    regularFee: dollars(c.regularFeeCents),
    lateFee: dollars(c.lateFeeCents),
    finalistFee: dollars(c.finalistFeeCents),
  });
  console.log(
    `Nominations closed at the end of ${deadlineToDateInput(must((await activeCycle()).finalDeadline, "date"))}. Open round one in Admin → Judging.`,
  );
}

/** A deterministic 4-10 score per criterion, so reruns give the same rankings. */
function scoresFor(judgeId: string, entryId: string) {
  const h = createHash("sha256").update(`${judgeId}:${entryId}`).digest();
  const v = (i: number) => String(4 + (h[i]! % 7));
  return {
    impact: v(0),
    innovation: v(1),
    influence: v(2),
    referenceValidation: v(3),
    comment: "",
    intent: "submit",
  };
}

async function fillScores() {
  const c = await activeCycle();
  if (c.phase !== "ROUND1_OPEN") throw new Error("demo: open round one first (Admin → Judging)");
  const live = await recusedEntryIds(c.id);
  const pairs = await db
    .select({ entryId: entry.id, judgeId: judgeAssignment.judgeId, email: user.email })
    .from(entry)
    .innerJoin(
      judgeAssignment,
      and(eq(judgeAssignment.categoryId, entry.categoryId), eq(judgeAssignment.round, 1)),
    )
    .innerJoin(user, eq(user.id, judgeAssignment.judgeId))
    .where(and(eq(entry.cycleId, c.id), eq(entry.status, "APPROVED")));
  const done = new Set(
    (
      await db
        .select({ e: score.entryId, j: score.judgeId })
        .from(score)
        .where(and(eq(score.round, 1), sql`${score.submittedAt} IS NOT NULL`))
    ).map((s) => `${s.j}:${s.e}`),
  );
  let scored = 0;
  for (const p of pairs) {
    if (live.has(p.entryId) || done.has(`${p.judgeId}:${p.entryId}`)) continue;
    const judge = await actorFor(p.email);
    await declareConflict(judge, p.entryId, { conflict: "no" });
    await saveScore(judge, p.entryId, 1, scoresFor(p.judgeId, p.entryId));
    scored++;
  }
  console.log(`Submitted ${scored} scores. Left for you to score live: ${live.size} entries.`);
}

async function selectOthers(admin: Actor) {
  const c = await activeCycle();
  if (c.phase !== "ROUND1_CLOSED") throw new Error("demo: close round one first");
  const live = await recusedEntryIds(c.id);
  const liveCats = live.size
    ? (
        await db
          .selectDistinct({ id: entry.categoryId })
          .from(entry)
          .where(inArray(entry.id, [...live]))
      ).map((r) => r.id)
    : [];
  const chosen = new Set(
    (
      await db
        .select({ id: finalistSelection.categoryId })
        .from(finalistSelection)
        .where(eq(finalistSelection.cycleId, c.id))
    ).map((r) => r.id),
  );
  const cats = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.cycleId, c.id));
  for (const cat of cats) {
    if (liveCats.includes(cat.id) || chosen.has(cat.id)) continue;
    const r = await computeRanking(db, cat.id, 1);
    const n = allowedCounts(r.ranked.length).at(-1);
    if (!n) continue;
    const tie = cutoffTie(r.ranked, n);
    const ids = tie
      ? [...tie.above, ...tie.tied.slice(0, tie.slots)]
      : r.ranked.slice(0, n).map((x) => x.entryId);
    await selectFinalists(admin, cat.id, {
      count: n,
      entryIds: ids,
      reason: tie ? "Demo data: the demo script broke this tie by entry order." : "",
    });
    console.log(
      `${cat.name}: ${n} finalists${tie ? " (tie at the cut broken by the script)" : ""}`,
    );
  }
  console.log("Choose the remaining category's finalists in Admin → Judging, then announce.");
}

async function main() {
  // Same rule as db:reset: never production, only a local *_dev/_test/_e2e database.
  assertSafeToReset(must(process.env.DATABASE_URL, "DATABASE_URL is not set"), process.env);
  const admin = await actorFor("admin@example.org"); // the seeded demo admin, or stop
  const step = process.argv[2];
  if (step === "close-nominations") await closeNominations(admin);
  else if (step === "fill-scores") await fillScores();
  else if (step === "select-others") await selectOthers(admin);
  else
    throw new Error("Usage: npm run demo:advance -- close-nominations|fill-scores|select-others");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
