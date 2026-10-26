import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { allowedCounts, checkSelection } from "@/lib/scoring";
import { finalistSelectionSchema } from "@/lib/validation/finalists";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awardCycle, category, entry, finalistSelection, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { finalistEmail, notAdvancedEmail } from "@/server/email/templates";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";
import { computeRanking } from "./rankings";
import { lockCycle } from "./rounds";

/**
 * Admin: chooses a category's finalists after round one closes. Must be exactly the
 * top N (3-5) by mean; the only choice is among entries tied at the cut, with a reason
 * (checkSelection). Stores the ranking it was made from. Audited.
 */
export async function selectFinalists(
  actor: Actor,
  categoryId: string,
  input: { count: unknown; entryIds: unknown; reason: unknown },
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(categoryId)) throw new NotFoundError("category");
  const parsed = finalistSelectionSchema.safeParse(input);
  if (!parsed.success) {
    // Tampered ids report on the finalists fieldset, not "entryIds.0".
    const errors: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(fieldErrorsOf(parsed.error)))
      (errors[k.split(".")[0]!] ??= []).push(...v);
    throw new ValidationError("Check the highlighted fields.", errors);
  }
  const raw = parsed.data;
  await db.transaction(async (tx) => {
    const cycle = await lockCycle(tx);
    if (cycle.phase !== "ROUND1_CLOSED")
      throw new ConflictError(
        "Finalists are chosen after round one closes and before they are announced.",
      );
    const r = await computeRanking(tx, categoryId, 1);
    if (r.cycleId !== cycle.id) throw new NotFoundError("category");
    if (r.blockers.length > 0)
      throw new ConflictError(
        `${r.blockers.length} ${r.blockers.length === 1 ? "entry has" : "entries have"} fewer than 2 scores.`,
      );
    const check = checkSelection(r.ranked, raw.count, raw.entryIds, raw.reason);
    if (!check.ok)
      throw new ValidationError(check.error, { [check.field ?? "entryIds"]: [check.error] });
    const values = {
      entryIds: raw.entryIds,
      tiebreakReason: check.tiebreak ? raw.reason.trim() : null,
      ranking: r.ranked.map((x) => ({ entryId: x.entryId, mean: x.mean, count: x.count })),
      selectedById: actor.id,
      selectedAt: new Date(),
    };
    await tx
      .insert(finalistSelection)
      .values({ cycleId: cycle.id, categoryId, ...values })
      .onConflictDoUpdate({
        target: [finalistSelection.cycleId, finalistSelection.categoryId],
        set: values,
      });
    await audit(
      {
        actor,
        action: "finalists.selected",
        targetType: "category",
        targetId: categoryId,
        metadata: {
          count: raw.count,
          entryIds: raw.entryIds,
          tiebreak: check.tiebreak,
          reason: values.tiebreakReason,
        },
        ip,
      },
      tx,
    );
  });
}

/**
 * Admin: ROUND1_CLOSED → FINALISTS_ANNOUNCED. Every category with approved entries needs
 * a selection that still matches the current ranking, and no entry may have fewer than
 * 2 scores. Marks finalists, then emails every nominator their result.
 */
export async function announceFinalists(actor: Actor, ip?: string) {
  assertRole(actor, "ADMIN");
  const results = await db.transaction(async (tx) => {
    const cycle = await lockCycle(tx);
    if (cycle.phase !== "ROUND1_CLOSED")
      throw new ConflictError("Finalists can be announced only after round one closes.");
    const cats = await tx
      .select({ id: category.id, name: category.name })
      .from(category)
      .where(eq(category.cycleId, cycle.id));
    const selections = await tx
      .select()
      .from(finalistSelection)
      .where(eq(finalistSelection.cycleId, cycle.id));
    const chosen: string[] = [];
    for (const c of cats) {
      const r = await computeRanking(tx, c.id, 1);
      if (r.ranked.length === 0) continue;
      if (r.blockers.length > 0)
        throw new ConflictError(`${c.name}: some entries have fewer than 2 scores.`);
      const sel = selections.find((s) => s.categoryId === c.id);
      if (!sel) throw new ConflictError(`${c.name}: choose its finalists first.`);
      const check = checkSelection(
        r.ranked,
        sel.entryIds.length,
        sel.entryIds,
        sel.tiebreakReason ?? "",
      );
      if (!check.ok || !allowedCounts(r.ranked.length).includes(sel.entryIds.length)) {
        throw new ConflictError(
          `${c.name}: the scores changed after its finalists were chosen. Review and choose again.`,
        );
      }
      chosen.push(...sel.entryIds);
    }
    const approved = and(eq(entry.cycleId, cycle.id), eq(entry.status, "APPROVED"));
    await tx.update(entry).set({ isFinalist: false }).where(approved);
    if (chosen.length)
      await tx
        .update(entry)
        .set({ isFinalist: true })
        .where(and(approved, inArray(entry.id, chosen)));
    await tx
      .update(awardCycle)
      .set({ phase: "FINALISTS_ANNOUNCED", finalistsAnnouncedAt: new Date() })
      .where(eq(awardCycle.id, cycle.id));
    await audit(
      {
        actor,
        action: "finalists.announced",
        targetType: "award_cycle",
        targetId: cycle.id,
        metadata: { finalists: chosen.length },
        ip,
      },
      tx,
    );
    return {
      feeCents: cycle.finalistFeeCents,
      entries: await tx
        .select({
          id: entry.id,
          isFinalist: entry.isFinalist,
          nomineeName: entry.nomineeName,
          categoryName: category.name,
          email: user.email,
        })
        .from(entry)
        .innerJoin(category, eq(category.id, entry.categoryId))
        .innerJoin(user, eq(user.id, entry.nominatorId))
        .where(approved),
    };
  });
  const { APP_URL } = env();
  for (const e of results.entries) {
    const base = {
      categoryName: e.categoryName,
      nomineeName: e.nomineeName ?? "your nominee",
      entryUrl: `${APP_URL}/entries/${e.id}`,
    };
    await sendEmail({
      to: e.email,
      template: e.isFinalist ? "finalist" : "not_advanced",
      dedupeKey: `round1-result:${e.id}`,
      content: e.isFinalist
        ? finalistEmail({ ...base, feeCents: results.feeCents })
        : notAdvancedEmail(base),
    }).catch((err: unknown) => {
      const x = err as { name?: string; code?: string };
      console.error("Result email failed:", x?.name ?? typeof err, x?.code ?? "");
    });
  }
}
