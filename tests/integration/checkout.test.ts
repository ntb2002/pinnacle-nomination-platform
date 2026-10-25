import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import {
  auditLog,
  awardCycle,
  category,
  emailOutbox,
  entry,
  entryStatusEvent,
  payment,
} from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { mockPaymentProvider } from "@/server/payments";
import {
  cancelCheckout,
  CHECKOUT_TTL_MS,
  CONFIRMATION_GRACE_MS,
  getMyEntryPayment,
  startCheckout,
} from "@/server/services/checkout";
import { listPayments, paymentLabel } from "@/server/services/payments-admin";
import { saveDraft } from "@/server/services/entry-drafts";
import { handleWebhook, WEBHOOK_REJECTION_AUDIT } from "@/server/services/payment-events";
import { stripeProvider } from "@/server/payments/stripe";
import { updateCategory } from "@/server/services/program-settings";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import {
  createCategory,
  createCompleteEntry,
  createCycle,
  createEntry,
} from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

const DAY = 86_400_000;
const mock = () => mockPaymentProvider()!;

async function setup(cycleOverrides = {}) {
  const cycle = await createCycle(cycleOverrides);
  const cat = await createCategory(cycle.id);
  const owner = await createActor("NOMINATOR");
  const e = await createCompleteEntry({
    cycleId: cycle.id,
    categoryId: cat.id,
    nominatorId: owner.id,
  });
  return { cycle, category: cat, owner, entry: e };
}

const paymentsOf = (entryId: string) =>
  db.select().from(payment).where(eq(payment.entryId, entryId));

async function pay(sessionId: string, amountCents: number) {
  const { body, signature } = mock().signEvent({ type: "paid", sessionId, amountCents });
  return { body, signature, result: await handleWebhook(mock(), body, signature) };
}

async function startAndGet(owner: Actor, entryId: string) {
  await startCheckout(owner, entryId);
  const [p] = (await paymentsOf(entryId)).filter((r) => r.status === "PENDING");
  return p!;
}

describe("starting checkout", () => {
  it("prices from the tier in force at creation and expires within 31 minutes", async () => {
    const now = Date.now();
    // Regular tier: the early deadline has passed.
    const { owner, entry: e } = await setup({
      earlyDeadline: new Date(now - DAY),
      regularDeadline: new Date(now + DAY),
      finalDeadline: new Date(now + 2 * DAY),
    });
    const url = await startCheckout(owner, e.id);
    const [p] = await paymentsOf(e.id);
    expect(p).toMatchObject({
      status: "PENDING",
      tier: "REGULAR",
      amountCents: 65_000,
      provider: "mock",
    });
    expect(url).toBe(`http://localhost:3000/dev/checkout/${p!.providerSessionId}`);
    const ttl = p!.expiresAt!.getTime() - p!.createdAt.getTime();
    expect(ttl).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(CHECKOUT_TTL_MS + 1000);
  });

  it("refuses incomplete, closed, withdrawn, someone else's and already-paid entries", async () => {
    const { cycle, category: cat, owner, entry: e } = await setup();
    const incomplete = await createEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: owner.id,
    });
    await expect(startCheckout(owner, incomplete.id)).rejects.toBeInstanceOf(ValidationError);
    const other = await createActor("NOMINATOR");
    await expect(startCheckout(other, e.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(startCheckout(owner, "nope")).rejects.toBeInstanceOf(NotFoundError);
    // Closed: after the final deadline.
    await expect(
      startCheckout(owner, e.id, new Date(Date.now() + 30 * DAY)),
    ).rejects.toBeInstanceOf(ConflictError);
    await db.update(category).set({ enabled: false }).where(eq(category.id, cat.id));
    await expect(startCheckout(owner, e.id)).rejects.toBeInstanceOf(ConflictError);
    await db.update(category).set({ enabled: true }).where(eq(category.id, cat.id));
    const p = await startAndGet(owner, e.id);
    await pay(p.providerSessionId, p.amountCents);
    await expect(startCheckout(owner, e.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("ends an earlier open session before starting a new one", async () => {
    const { owner, entry: e } = await setup();
    const first = await startAndGet(owner, e.id);
    await startCheckout(owner, e.id);
    const rows = await paymentsOf(e.id);
    expect(rows.find((r) => r.id === first.id)?.status).toBe("EXPIRED");
    expect(rows.filter((r) => r.status === "PENDING")).toHaveLength(1);
  });

  it("freezes the entry while checkout is open; cancelling unfreezes it", async () => {
    const { owner, entry: e, category: cat } = await setup();
    await startCheckout(owner, e.id);
    await expect(saveDraft(owner, e.id, { outcomes: [], references: [] })).rejects.toBeInstanceOf(
      ConflictError,
    );
    const admin = await createActor("ADMIN");
    await db.update(category).set({ kind: "OPTIONAL" }).where(eq(category.id, cat.id));
    await expect(
      updateCategory(admin, cat.id, {
        description: cat.description,
        rubricProfileId: cat.rubricProfileId,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await cancelCheckout(owner, e.id);
    expect((await paymentsOf(e.id))[0]?.status).toBe("EXPIRED");
    await saveDraft(owner, e.id, { nomineeName: "Changed", outcomes: [], references: [] });
  });
});

describe("webhook fulfilment", () => {
  it("submits the entry, records the payment, audits and sends one receipt, once", async () => {
    const { owner, entry: e } = await setup();
    const p = await startAndGet(owner, e.id);
    const { body, signature, result } = await pay(p.providerSessionId, p.amountCents);
    expect(result.status).toBe(200);
    const [paid] = await paymentsOf(e.id);
    expect(paid).toMatchObject({ status: "PAID", tier: "EARLY", amountCents: 50_000 });
    expect(paid!.paidAt).toBeInstanceOf(Date);
    expect(paid!.providerPaymentIntentId).toMatch(/^mock_pi_/);
    const [row] = await db.select().from(entry).where(eq(entry.id, e.id));
    expect(row).toMatchObject({ status: "SUBMITTED" });
    expect(row!.submittedAt).toBeInstanceOf(Date);
    const events = await db
      .select()
      .from(entryStatusEvent)
      .where(eq(entryStatusEvent.entryId, e.id));
    expect(events).toMatchObject([{ fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: null }]);

    // Replay of the same delivery, and a new event for the same session: no change.
    expect((await handleWebhook(mock(), body, signature)).status).toBe(200);
    await pay(p.providerSessionId, p.amountCents);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "payment.fulfilled"));
    expect(audits).toHaveLength(1);
    const mail = await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, owner.email));
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toMatch(/^Receipt: Pinnacle Awards entry/);
    expect(mail[0]!.textBody).toContain("$500");
    expect(await paymentsOf(e.id)).toHaveLength(1);
  });

  it("never records two paid fees for one entry", async () => {
    const { owner, entry: e } = await setup();
    const first = await startAndGet(owner, e.id);
    await startCheckout(owner, e.id); // ends the first session locally
    const [second] = (await paymentsOf(e.id)).filter((r) => r.status === "PENDING");
    // Both sessions report payment (a race with the provider).
    await pay(second!.providerSessionId, second!.amountCents);
    await pay(first.providerSessionId, first.amountCents);
    const paid = (await paymentsOf(e.id)).filter((r) => r.status === "PAID");
    expect(paid.map((r) => r.id)).toEqual([second!.id]);
    const flagged = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.duplicate_needs_refund"));
    expect(flagged).toMatchObject([{ targetId: first.id }]);
  });

  it("does not fulfil a different amount than was priced", async () => {
    const { owner, entry: e } = await setup();
    const p = await startAndGet(owner, e.id);
    await pay(p.providerSessionId, 100);
    expect((await paymentsOf(e.id))[0]?.status).toBe("PENDING");
    expect((await db.select().from(entry).where(eq(entry.id, e.id)))[0]?.status).toBe("DRAFT");
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.amount_mismatch"));
    expect(audits).toHaveLength(1);
  });

  it("rejects and audits a bad signature, and marks expired sessions", async () => {
    const { owner, entry: e } = await setup();
    const p = await startAndGet(owner, e.id);
    const { body } = mock().signEvent({
      type: "paid",
      sessionId: p.providerSessionId,
      amountCents: p.amountCents,
    });
    const bad = await handleWebhook(mock(), body, "t=1,v1=" + "0".repeat(64), "203.0.113.7");
    expect(bad.status).toBe(400);
    const [rejected] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "webhook.rejected"));
    expect(rejected).toMatchObject({ ip: "203.0.113.7", actorId: null });
    expect((await paymentsOf(e.id))[0]?.status).toBe("PENDING");

    const expired = mock().signEvent({ type: "expired", sessionId: p.providerSessionId });
    await handleWebhook(mock(), expired.body, expired.signature);
    expect((await paymentsOf(e.id))[0]?.status).toBe("EXPIRED");
    const pending = await db
      .select()
      .from(payment)
      .where(and(eq(payment.entryId, e.id), eq(payment.status, "PENDING")));
    expect(pending).toHaveLength(0);
  });
});

describe("payment visibility", () => {
  it("lists payments for admins only, with expired sessions labelled", async () => {
    const { owner, entry: e } = await setup();
    await startCheckout(owner, e.id);
    const admin = await createActor("ADMIN");
    const { rows, totals } = await listPayments(admin);
    expect(totals).toEqual({ paid: 0, paidCents: 0 });
    expect(rows).toHaveLength(1);
    expect(paymentLabel(rows[0]!)).toBe("Checkout open");
    expect(paymentLabel(rows[0]!, new Date(Date.now() + 2 * CHECKOUT_TTL_MS))).toBe("Expired");
    await expect(listPayments(owner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPayments(await createActor("JUDGE"))).rejects.toBeInstanceOf(ForbiddenError);
    // The nominator sees their own entry's payment state, nobody else's.
    expect((await getMyEntryPayment(owner, e.id)).open).not.toBeNull();
    const other = await createActor("NOMINATOR");
    expect(await getMyEntryPayment(other, e.id)).toEqual({ paid: null, open: null, attempts: 0 });
  });
});

describe("review regressions", () => {
  it("asks the provider about a session past our expiry and refuses a second charge", async () => {
    const { owner, entry: e } = await setup();
    const first = await startAndGet(owner, e.id);
    const longAgo = new Date(Date.now() - 2 * CHECKOUT_TTL_MS);
    await db.update(payment).set({ expiresAt: longAgo }).where(eq(payment.id, first.id));
    // The provider reports the old session as completed: its payment is on its way.
    const spy = vi.spyOn(mock(), "expireCheckout").mockResolvedValueOnce(false);
    await expect(startCheckout(owner, e.id)).rejects.toBeInstanceOf(ConflictError);
    expect(spy).toHaveBeenCalledWith(first.providerSessionId);
    expect(await paymentsOf(e.id)).toHaveLength(1);
    // Once the provider says it ended, a new checkout can start.
    await startCheckout(owner, e.id);
    expect((await paymentsOf(e.id)).map((r) => r.status).sort()).toEqual(["EXPIRED", "PENDING"]);
  });

  it("keeps the entry frozen for a grace period after expiry", async () => {
    const { owner, entry: e } = await setup();
    const p = await startAndGet(owner, e.id);
    await db
      .update(payment)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(payment.id, p.id));
    await expect(saveDraft(owner, e.id, { outcomes: [], references: [] })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await getMyEntryPayment(owner, e.id)).open).toMatchObject({ ended: true });
    await db
      .update(payment)
      .set({ expiresAt: new Date(Date.now() - CONFIRMATION_GRACE_MS - 60_000) })
      .where(eq(payment.id, p.id));
    expect((await getMyEntryPayment(owner, e.id)).open).toBeNull();
  });

  it("honours a payment for a session started before the final deadline", async () => {
    const { owner, entry: e, cycle } = await setup();
    const p = await startAndGet(owner, e.id);
    await db
      .update(awardCycle)
      // Nominations have now closed (deadlines stay in order).
      .set({
        earlyDeadline: new Date(Date.now() - 3000),
        regularDeadline: new Date(Date.now() - 2000),
        finalDeadline: new Date(Date.now() - 1000),
      })
      .where(eq(awardCycle.id, cycle.id));
    await pay(p.providerSessionId, p.amountCents);
    expect((await db.select().from(entry).where(eq(entry.id, e.id)))[0]?.status).toBe("SUBMITTED");
  });

  it("shows a charged duplicate as needing review, with its reference", async () => {
    const { owner, entry: e } = await setup();
    const first = await startAndGet(owner, e.id);
    await startCheckout(owner, e.id);
    const [second] = (await paymentsOf(e.id)).filter((r) => r.status === "PENDING");
    await pay(second!.providerSessionId, second!.amountCents);
    await pay(first.providerSessionId, first.amountCents);
    const { rows } = await listPayments(await createActor("ADMIN"));
    const flagged = rows.find((r) => r.id === first.id)!;
    expect(flagged.reference).toMatch(/^mock_pi_/);
    expect(paymentLabel(flagged)).toBe("Charged, needs review");
    expect(paymentLabel(rows.find((r) => r.id === second!.id)!)).toBe("Paid");
  });

  it("verifies and fulfils a real Stripe-signed event", async () => {
    const { owner, entry: e } = await setup();
    const p = await startAndGet(owner, e.id);
    await db
      .update(payment)
      .set({ provider: "stripe", providerSessionId: "cs_test_regress" })
      .where(eq(payment.id, p.id));
    const secret = "whsec_regress";
    const provider = stripeProvider({ secretKey: "sk_test_regress", webhookSecret: secret });
    const payload = JSON.stringify({
      id: "evt_regress",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_regress",
          object: "checkout.session",
          payment_status: "paid",
          payment_intent: "pi_regress",
          amount_total: p.amountCents,
          currency: "usd",
        },
      },
    });
    const header = new Stripe("sk_test_regress").webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    expect((await handleWebhook(provider, payload, header)).status).toBe(200);
    expect((await paymentsOf(e.id))[0]).toMatchObject({
      status: "PAID",
      providerPaymentIntentId: "pi_regress",
    });
  });

  it("audits rejected webhooks up to a cap per IP", async () => {
    for (let i = 0; i < WEBHOOK_REJECTION_AUDIT.limit + 3; i++) {
      expect(
        (await handleWebhook(mock(), "{}", "t=1,v1=" + "0".repeat(64), "198.51.100.4")).status,
      ).toBe(400);
    }
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "webhook.rejected"));
    expect(rows).toHaveLength(WEBHOOK_REJECTION_AUDIT.limit);
  });
});
