import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { auditLog, emailOutbox } from "@/server/db/schema";
import { claimRow, MAX_ATTEMPTS, sendEmail } from "@/server/email";
import { retryDueEmails } from "@/server/email/retry";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { listUndeliveredEmails, resendEmail } from "@/server/services/email-admin";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import { startFakeSmtp } from "../support/fake-smtp";

// These tests deliver over SMTP (nodemailer) to a local fake server. env() is read
// lazily, so switching the transport before the first call applies to this file.
let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
const saved = { transport: process.env.EMAIL_TRANSPORT, url: process.env.SMTP_URL };
beforeAll(async () => {
  smtp = await startFakeSmtp();
  process.env.EMAIL_TRANSPORT = "smtp";
  process.env.SMTP_URL = smtp.url;
});
afterAll(async () => {
  process.env.EMAIL_TRANSPORT = saved.transport;
  if (saved.url === undefined) delete process.env.SMTP_URL;
  else process.env.SMTP_URL = saved.url;
  await smtp.close();
  await closeDb();
});
beforeEach(async () => {
  await resetTables();
  smtp.state.failing = false;
  smtp.state.accepted = [];
  smtp.state.refused = 0;
});

const MIN = 60_000;
const receipt = (key = "receipt:test-1") => ({
  to: "Nominator@Example.com",
  template: "payment_receipt",
  dedupeKey: key,
  content: { subject: "Receipt: Pinnacle Awards entry", paragraphs: ["Thank you for your entry."] },
});
const signIn = {
  to: "person@example.com",
  template: "sign-in",
  content: { subject: "Sign in", paragraphs: ["https://example.org/secret-token"] },
};
const outbox = () => db.select().from(emailOutbox);

describe("SMTP delivery (#16 reliability)", () => {
  it("delivers through nodemailer and keeps only a delivery record", async () => {
    expect(await sendEmail(receipt())).toEqual({ delivered: true, failed: false });
    expect(smtp.state.accepted).toHaveLength(1);
    expect(smtp.state.accepted[0]).toContain("Thank you for your entry.");
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "SENT", attempts: 1, textBody: "", nextAttemptAt: null });
  });

  it("delivers sign-in links without ever storing them", async () => {
    await sendEmail(signIn);
    expect(smtp.state.accepted[0]).toContain("https://example.org/secret-token");
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "SENT", textBody: "", htmlBody: "" });
  });

  it("tries twice, then keeps a failed email for the retry sweep", async () => {
    smtp.state.failing = true;
    expect(await sendEmail(receipt())).toEqual({ delivered: false, failed: true });
    expect(smtp.state.refused).toBe(2);
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "FAILED", attempts: 2 });
    expect(row!.error).toMatch(/451/);
    expect(row!.textBody).toContain("Thank you"); // kept until delivered
    expect(row!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 10 * MIN);

    // Not due yet: the sweep leaves it alone.
    expect(await retryDueEmails(new Date())).toEqual({ attempted: 0, delivered: 0 });
    // The server recovers; once due, the sweep delivers it and clears the body.
    smtp.state.failing = false;
    const later = new Date(row!.nextAttemptAt!.getTime() + MIN);
    expect(await retryDueEmails(later)).toEqual({ attempted: 1, delivered: 1 });
    const [after] = await outbox();
    expect(after).toMatchObject({ status: "SENT", attempts: 3, textBody: "", error: null });
    expect(await retryDueEmails(new Date(later.getTime() + 600 * MIN))).toEqual({
      attempted: 0,
      delivered: 0,
    });
  });

  it("queues without sending when asked, and the sweep sends it", async () => {
    expect(await sendEmail(receipt(), { deliverNow: false })).toEqual({
      delivered: false,
      failed: false,
    });
    expect(smtp.state.accepted).toHaveLength(0);
    expect(await retryDueEmails(new Date(Date.now() + 1000))).toEqual({
      attempted: 1,
      delivered: 1,
    });
    expect(smtp.state.accepted).toHaveLength(1);
  });

  it("a queued send with the key of a failed one leaves it to the sweep, untouched", async () => {
    smtp.state.failing = true;
    await sendEmail(receipt());
    const [before] = await outbox();
    smtp.state.failing = false;
    expect(await sendEmail(receipt(), { deliverNow: false })).toEqual({
      delivered: false,
      failed: false,
    });
    const [after] = await outbox();
    expect(after).toMatchObject({ status: "FAILED", nextAttemptAt: before!.nextAttemptAt });
    expect(smtp.state.accepted).toHaveLength(0);
  });

  it("stops retrying after the attempt limit; an admin can still resend", async () => {
    smtp.state.failing = true;
    await sendEmail(receipt());
    let at = Date.now();
    for (let i = 0; i < 10; i++) {
      at += 600 * MIN;
      await retryDueEmails(new Date(at));
    }
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, nextAttemptAt: null });

    const admin = await createActor("ADMIN");
    const list = await listUndeliveredEmails(admin);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ resendable: true, autoRetry: false });
    expect(list.rows[0]).not.toHaveProperty("textBody");

    expect(await resendEmail(admin, row!.id)).toBe(false); // still down: recorded, audited
    smtp.state.failing = false;
    expect(await resendEmail(admin, row!.id)).toBe(true);
    expect(smtp.state.accepted).toHaveLength(1);
    await expect(resendEmail(admin, row!.id)).rejects.toBeInstanceOf(ConflictError);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "email.resent"));
    expect(audits.map((a) => (a.metadata as { delivered: boolean }).delivered)).toEqual([
      false,
      true,
    ]);
    expect((await listUndeliveredEmails(admin)).rows).toHaveLength(0);
  });

  it("never sends a row someone else has claimed (sweep, resend, repeated send)", async () => {
    smtp.state.failing = true;
    await sendEmail(receipt());
    const [row] = await outbox();
    // Someone (a sweep elsewhere) claims it and is mid-send.
    expect(await claimRow(row!.id)).not.toBeNull();
    expect(await claimRow(row!.id)).toBeNull();
    smtp.state.failing = false;
    const admin = await createActor("ADMIN");
    await expect(resendEmail(admin, row!.id)).rejects.toThrow(/being sent right now/);
    expect(await sendEmail(receipt())).toEqual({ delivered: false, failed: false });
    expect(await retryDueEmails(new Date(Date.now() + 5 * MIN))).toEqual({
      attempted: 0,
      delivered: 0,
    });
    expect(smtp.state.accepted).toHaveLength(0);
    // Once the lease runs out (the claimer crashed), the sweep recovers it.
    expect(await retryDueEmails(new Date(Date.now() + 11 * MIN))).toEqual({
      attempted: 1,
      delivered: 1,
    });
  });

  it("a later send with the same key delivers the failed one, never twice", async () => {
    smtp.state.failing = true;
    await sendEmail(receipt());
    smtp.state.failing = false;
    expect(await sendEmail(receipt())).toEqual({ delivered: true, failed: false });
    expect(await sendEmail(receipt())).toEqual({ delivered: false, failed: false });
    expect(smtp.state.accepted).toHaveLength(1);
    expect(await outbox()).toHaveLength(1);
  });

  it("a sign-in link that cannot be delivered fails loudly and is never resent", async () => {
    smtp.state.failing = true;
    await expect(sendEmail(signIn)).rejects.toThrow(/not stored/);
    const [row] = await outbox();
    expect(row).toMatchObject({
      status: "FAILED",
      textBody: "",
      htmlBody: "",
      nextAttemptAt: null,
    });
    const admin = await createActor("ADMIN");
    expect((await listUndeliveredEmails(admin)).rows[0]).toMatchObject({ resendable: false });
    await expect(resendEmail(admin, row!.id)).rejects.toBeInstanceOf(ConflictError);
    smtp.state.failing = false;
    expect(await retryDueEmails(new Date(Date.now() + 600 * MIN))).toEqual({
      attempted: 0,
      delivered: 0,
    });
  });

  it("is admin only", async () => {
    const judge = await createActor("JUDGE");
    await expect(listUndeliveredEmails(judge)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resendEmail(judge, crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
  });
});
