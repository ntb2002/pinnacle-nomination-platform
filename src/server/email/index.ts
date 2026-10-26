import "server-only";
import { eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";
import { renderEmail, type EmailContent } from "./layout";

export interface OutgoingEmail {
  to: string;
  /** Template name for the delivery record, e.g. "sign-in". */
  template: string;
  content: EmailContent;
  /** Idempotency key: a second send with the same key is skipped. */
  dedupeKey?: string;
}

/**
 * Templates whose body is never stored and never resent: sign-in links are secrets and
 * expire in minutes; the person asks for a new one instead.
 */
const NOT_STORED = new Set(["sign-in"]);

/** Delivery attempts before a row waits for an admin's resend. */
export const MAX_ATTEMPTS = 5;
/** Wait before the retry sweep tries again, by attempts made so far (last value repeats). */
const BACKOFF_MS = [5, 15, 60, 240].map((m) => m * 60_000);
const nextAttemptAfter = (attempts: number, now: Date) =>
  attempts >= MAX_ATTEMPTS
    ? null
    : new Date(now.getTime() + BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1]!);

let transporter: Transporter | undefined;
function smtp(): Transporter {
  const url = env().SMTP_URL;
  if (!url) throw new Error("SMTP_URL is not configured");
  // Short timeouts: a send runs inside a request, and a failure is retried later anyway.
  transporter ??= nodemailer.createTransport({
    url,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

const from = () => env().EMAIL_FROM ?? "Pinnacle Awards <no-reply@example.edu>";

/** Error class only: SMTP error text usually contains the recipient address. */
function errorClass(err: unknown) {
  const e = err as { name?: string; code?: string; responseCode?: number };
  return [e.name, e.code, e.responseCode].filter(Boolean).join(" ") || "send failed";
}

interface Delivery {
  id: string;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attempts: number;
}

/**
 * One SMTP attempt for an outbox row, recorded on the row. On success the stored body
 * is cleared (the row stays as a delivery record); on failure the row is FAILED with
 * the error class and, while attempts remain, a time for the retry sweep.
 */
export async function attemptDelivery(row: Delivery, now = new Date()): Promise<boolean> {
  const attempts = row.attempts + 1;
  try {
    await smtp().sendMail({
      from: from(),
      to: row.toAddress,
      subject: row.subject,
      text: row.textBody,
      html: row.htmlBody,
    });
    await db
      .update(emailOutbox)
      .set({
        status: "SENT",
        sentAt: new Date(),
        attempts,
        lastAttemptAt: now,
        nextAttemptAt: null,
        error: null,
        textBody: "",
        htmlBody: "",
      })
      .where(eq(emailOutbox.id, row.id));
    return true;
  } catch (err) {
    const stored = row.textBody !== "";
    await db
      .update(emailOutbox)
      .set({
        status: "FAILED",
        error: errorClass(err),
        attempts,
        lastAttemptAt: now,
        nextAttemptAt: stored ? nextAttemptAfter(attempts, now) : null,
      })
      .where(eq(emailOutbox.id, row.id));
    return false;
  }
}

/**
 * Sends one email. Call it after the database transaction that caused it commits.
 * - outbox transport (dev/test): the email_outbox row is the delivered mail (/dev/mailbox).
 * - smtp transport: the row is the delivery record. Its body is kept only until the
 *   mail is delivered, so a failed send can be retried: once at once, then by the
 *   retry sweep with backoff (retryDueEmails), then by an admin (/admin/emails).
 *   Throws when the immediate attempts fail; callers log it and move on.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const rendered = renderEmail(msg.content);
  const to = msg.to.trim().toLowerCase();

  if (env().EMAIL_TRANSPORT === "outbox") {
    await db
      .insert(emailOutbox)
      .values({
        toAddress: to,
        subject: rendered.subject,
        template: msg.template,
        textBody: rendered.text,
        htmlBody: rendered.html,
        dedupeKey: msg.dedupeKey,
        status: "SENT",
        sentAt: new Date(),
      })
      .onConflictDoNothing({ target: emailOutbox.dedupeKey });
    return;
  }

  const store = !NOT_STORED.has(msg.template);
  const body = { textBody: store ? rendered.text : "", htmlBody: store ? rendered.html : "" };
  const now = new Date();
  // The lease: if this process dies mid-send, the sweep picks the row up later.
  const lease = store ? nextAttemptAfter(1, now) : null;
  let [row] = await db
    .insert(emailOutbox)
    .values({
      toAddress: to,
      subject: rendered.subject,
      template: msg.template,
      ...body,
      dedupeKey: msg.dedupeKey,
      nextAttemptAt: lease,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id, attempts: emailOutbox.attempts });
  if (!row && msg.dedupeKey) {
    // Same key seen before: skip only if it was delivered; retry a PENDING/FAILED one.
    const [prior] = await db
      .select({ id: emailOutbox.id, status: emailOutbox.status, attempts: emailOutbox.attempts })
      .from(emailOutbox)
      .where(eq(emailOutbox.dedupeKey, msg.dedupeKey));
    if (!prior || prior.status === "SENT") return;
    row = prior;
  }
  if (!row) return;

  const delivery = { id: row.id, toAddress: to, subject: rendered.subject, ...body };
  // One immediate retry covers a dropped connection or a momentary refusal.
  if (await attemptDelivery({ ...delivery, attempts: row.attempts })) return;
  await new Promise((r) => setTimeout(r, 1000));
  if (await attemptDelivery({ ...delivery, attempts: row.attempts + 1 })) return;
  throw new Error(`Email delivery failed (${msg.template}); kept for retry`);
}
