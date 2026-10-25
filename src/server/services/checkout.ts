import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { entryFeeFor } from "@/lib/pricing";
import { readinessProblems, toSubmissionInput } from "@/lib/validation/entry";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import {
  awardCycle,
  category,
  entry,
  entryOutcome,
  entryReference,
  payment,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { paymentProvider } from "@/server/payments";

/**
 * How long a checkout stays payable. Stripe's minimum is 30 minutes after it creates
 * the session; one extra minute covers clock skew and the request itself.
 */
export const CHECKOUT_TTL_MS = 31 * 60 * 1000;

/**
 * The entry stays frozen this long after a session's expiry: a payment completed at
 * the last second can still be on its way (webhook retries, clock skew).
 */
export const CONFIRMATION_GRACE_MS = 5 * 60 * 1000;

/** Unpaid sessions that may still be completed or are still being confirmed. */
const openCheckout = (entryId: string, now: Date) =>
  and(
    eq(payment.entryId, entryId),
    eq(payment.kind, "ENTRY_FEE"),
    eq(payment.status, "PENDING"),
    gt(payment.expiresAt, new Date(now.getTime() - CONFIRMATION_GRACE_MS)),
  );

export const CHECKOUT_OPEN_MESSAGE =
  "A checkout is open for this entry. Finish paying, or cancel the checkout to make changes.";

/**
 * Editing is frozen while a checkout is open, so the entry that is paid for is the
 * entry that was checked. Call inside the transaction that locks the entry.
 */
export async function assertNoOpenCheckout(tx: DbExecutor, entryId: string, now = new Date()) {
  const [open] = await tx
    .select({ id: payment.id })
    .from(payment)
    .where(openCheckout(entryId, now))
    .limit(1);
  if (open) throw new ConflictError(CHECKOUT_OPEN_MESSAGE);
}

/**
 * Nominator: starts hosted checkout for one complete DRAFT entry and returns the URL to
 * send them to. The amount is the fee tier in force now (entryFeeFor); nothing about
 * the price comes from the client. Any earlier open session for the entry is ended
 * first, so at most one can be paid.
 */
export async function startCheckout(actor: Actor, entryId: string, now = new Date()) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const provider = paymentProvider();
  const { APP_URL } = env();
  return db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(entry)
      .where(and(eq(entry.id, entryId), eq(entry.nominatorId, actor.id)))
      .for("update");
    if (!e) throw new NotFoundError("entry");
    if (e.status !== "DRAFT") throw new ConflictError("This entry has already been submitted.");
    // FOR SHARE serializes with an admin withdrawing the category (updateCategory).
    const [cat] = await tx
      .select({ name: category.name, enabled: category.enabled })
      .from(category)
      .where(eq(category.id, e.categoryId))
      .for("share");
    if (!cat?.enabled) throw new ConflictError("This category is no longer offered.");
    const [cycle] = await tx.select().from(awardCycle).where(eq(awardCycle.id, e.cycleId));
    const fee = cycle?.isActive && cycle.phase === "NOMINATION" ? entryFeeFor(cycle, now) : null;
    if (!fee?.open)
      throw new ConflictError("Nominations are not open, so this entry cannot be paid for.");

    const [outcomes, references] = await Promise.all([
      tx
        .select()
        .from(entryOutcome)
        .where(eq(entryOutcome.entryId, entryId))
        .orderBy(asc(entryOutcome.position)),
      tx
        .select()
        .from(entryReference)
        .where(eq(entryReference.entryId, entryId))
        .orderBy(asc(entryReference.position)),
    ]);
    const problems = readinessProblems(toSubmissionInput({ ...e, outcomes, references }));
    if (Object.keys(problems).length > 0) {
      throw new ValidationError("Complete the entry before paying.", problems);
    }

    const [paid] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.entryId, entryId),
          eq(payment.kind, "ENTRY_FEE"),
          eq(payment.status, "PAID"),
        ),
      )
      .limit(1);
    if (paid) throw new ConflictError("This entry has already been paid for.");
    await endOpenCheckouts(tx, entryId);

    const paymentId = randomUUID();
    // Priced at `now`; the expiry counts from this moment, after any lock wait and
    // provider calls above, so Stripe never sees less than its 30-minute minimum.
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);
    const session = await provider.createCheckout({
      paymentId,
      amountCents: fee.amountCents,
      currency: "usd",
      description: `Pinnacle Awards entry fee: ${cat.name}`,
      customerEmail: actor.email,
      successUrl: `${APP_URL}/entries/${entryId}?checkout=done`,
      cancelUrl: `${APP_URL}/entries/${entryId}?checkout=cancelled`,
      expiresAt,
    });
    await tx.insert(payment).values({
      id: paymentId,
      entryId,
      kind: "ENTRY_FEE",
      tier: fee.tier,
      amountCents: fee.amountCents,
      currency: "usd",
      provider: provider.name,
      providerSessionId: session.sessionId,
      createdById: actor.id,
      expiresAt,
    });
    return session.url;
  });
}

/**
 * Ends every unpaid session on the entry, or refuses if one was completed (its payment
 * is on its way). Asks the provider about every PENDING row, whatever our own expiry
 * says, so a late webhook can never be followed by a second charge.
 */
async function endOpenCheckouts(tx: DbExecutor, entryId: string) {
  const provider = paymentProvider();
  const pending = await tx
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.entryId, entryId),
        eq(payment.kind, "ENTRY_FEE"),
        eq(payment.status, "PENDING"),
      ),
    )
    .for("update");
  for (const p of pending) {
    // A session from another provider cannot complete through this deployment.
    const ended =
      p.provider !== provider.name || (await provider.expireCheckout(p.providerSessionId));
    if (!ended) {
      throw new ConflictError(
        "Your earlier payment is still being confirmed. Refresh this page in a minute.",
      );
    }
    await tx.update(payment).set({ status: "EXPIRED" }).where(eq(payment.id, p.id));
  }
}

/** Nominator: cancels the open checkout so the draft can be edited again. */
export async function cancelCheckout(actor: Actor, entryId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  await db.transaction(async (tx) => {
    const [e] = await tx
      .select({ id: entry.id })
      .from(entry)
      .where(and(eq(entry.id, entryId), eq(entry.nominatorId, actor.id), eq(entry.status, "DRAFT")))
      .for("update");
    if (!e) throw new NotFoundError("draft");
    await endOpenCheckouts(tx, entryId);
  });
}

/**
 * The entry-fee payment state the nominator's entry page shows: the paid fee, and any
 * checkout that is open or has just ended and may still be confirmed.
 */
export async function getMyEntryPayment(actor: Actor, entryId: string, now = new Date()) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const rows = await db
    .select({
      status: payment.status,
      tier: payment.tier,
      amountCents: payment.amountCents,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
      reference: payment.providerPaymentIntentId,
    })
    .from(payment)
    .innerJoin(entry, eq(entry.id, payment.entryId))
    .where(
      and(
        eq(payment.entryId, entryId),
        eq(entry.nominatorId, actor.id),
        eq(payment.kind, "ENTRY_FEE"),
      ),
    )
    .orderBy(desc(payment.createdAt));
  const paid = rows.find((r) => r.status === "PAID") ?? null;
  const graceStart = now.getTime() - CONFIRMATION_GRACE_MS;
  const pending = rows.find(
    (r) => r.status === "PENDING" && !!r.expiresAt && r.expiresAt.getTime() > graceStart,
  );
  // `ended`: past its expiry but still inside the confirmation grace period.
  const open = pending ? { ...pending, ended: pending.expiresAt! <= now } : null;
  return { paid, open, attempts: rows.length };
}
