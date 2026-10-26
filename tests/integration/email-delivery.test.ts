import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { auditLog, emailOutbox } from "@/server/db/schema";
import { MAX_ATTEMPTS, sendEmail } from "@/server/email";
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
});

const MIN = 60_000;
const receipt = (key = "receipt:test-1") => ({
  to: "Nominator@Example.com",
  template: "payment_receipt",
  dedupeKey: key,
  content: { subject: "Receipt: Pinnacle Awards entry", paragraphs: ["Thank you for your entry."] },
});
const outbox = () => db.select().from(emailOutbox);

describe("SMTP delivery (#16 reliability)", () => {
  it("delivers through nodemailer and keeps only a delivery record", async () => {
    await sendEmail(receipt());
    expect(smtp.state.accepted).toHaveLength(1);
    expect(smtp.state.accepted[0]).toContain("Thank you for your entry.");
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "SENT", attempts: 1, textBody: "", nextAttemptAt: null });
  });

  it("retries at once, then keeps a failed email for the retry sweep", async () => {
    smtp.state.failing = true;
    await expect(sendEmail(receipt())).rejects.toThrow(/kept for retry/);
    expect(smtp.state.refused).toBeGreaterThanOrEqual(2);
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

  it("stops retrying after the attempt limit; an admin can still resend", async () => {
    smtp.state.failing = true;
    await sendEmail(receipt()).catch(() => {});
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

  it("a later send with the same key delivers the failed one, never twice", async () => {
    smtp.state.failing = true;
    await sendEmail(receipt()).catch(() => {});
    smtp.state.failing = false;
    await sendEmail(receipt());
    await sendEmail(receipt());
    expect(smtp.state.accepted).toHaveLength(1);
    expect(await outbox()).toHaveLength(1);
  });

  it("never stores or resends sign-in links", async () => {
    smtp.state.failing = true;
    await sendEmail({
      to: "person@example.com",
      template: "sign-in",
      content: { subject: "Sign in", paragraphs: ["https://example.org/secret-token"] },
    }).catch(() => {});
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
