import "server-only";
import { and, eq, lte, ne, or } from "drizzle-orm";
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
const BACKOFF_MS = [15, 60, 240].map((m) => m * 60_000);
const nextAttemptAfter = (attempts: number, now: Date) =>
  attempts >= MAX_ATTEMPTS
    ? null
    : new Date(now.getTime() + BACKOFF_MS[Math.min(Math.max(attempts - 2, 0), 2)]!);
/**
 * A claimed row's lease: while it runs, nobody else sends the row. Longer than one
 * send can take (two tries of at most 50 s each); after it, a crashed send is retried.
 */
export const LEASE_MS = 10 * 60_000;

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

export interface Claimed {
  id: string;
  /** The claim's lease: outcome writes apply only while the row still carries it. */
  nextAttemptAt: Date | null;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attempts: number;
}

const claimedColumns = {
  id: emailOutbox.id,
  nextAttemptAt: emailOutbox.nextAttemptAt,
  toAddress: emailOutbox.toAddress,
  subject: emailOutbox.subject,
  textBody: emailOutbox.textBody,
  htmlBody: emailOutbox.htmlBody,
  attempts: emailOutbox.attempts,
};

/**
 * Atomically claims an undelivered row for sending: a FAILED row (never mid-send, since
 * every attempt ends by writing its outcome) or a PENDING one whose lease has run out.
 * Returns null when it is delivered or someone else is sending it now.
 */
export async function claimRow(id: string, now = new Date()): Promise<Claimed | null> {
  const [row] = await db
    .update(emailOutbox)
    .set({ status: "PENDING", nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
    .where(
      and(
        eq(emailOutbox.id, id),
        or(
          eq(emailOutbox.status, "FAILED"),
          and(eq(emailOutbox.status, "PENDING"), lte(emailOutbox.nextAttemptAt, now)),
        ),
      ),
    )
    .returning(claimedColumns);
  return row ?? null;
}

/**
 * Delivers a claimed row over SMTP: up to `tries` attempts a second apart, then one
 * write of the outcome. On success the stored body is cleared (the row stays as a
 * delivery record). On failure the row is FAILED with the error class and, if its body
 * is stored and attempts remain, a time for the retry sweep. `content` is the mail to
 * send when the body is not stored (sign-in links).
 */
export async function deliverClaimed(
  row: Claimed,
  { tries = 1, content }: { tries?: number; content?: { text: string; html: string } } = {},
): Promise<boolean> {
  const text = content?.text ?? row.textBody;
  const html = content?.html ?? row.htmlBody;
  let error: unknown;
  let made = 0;
  for (; made < tries; made++) {
    if (made > 0) await new Promise((r) => setTimeout(r, 1000));
    try {
      await smtp().sendMail({ from: from(), to: row.toAddress, subject: row.subject, text, html });
      error = undefined;
      made++;
      break;
    } catch (err) {
      error = err;
    }
  }
  const now = new Date();
  const attempts = row.attempts + made;
  // Only while our claim stands: if the lease ran out and someone else claimed the row,
  // their outcome is the one that counts.
  const ours = and(
    eq(emailOutbox.id, row.id),
    row.nextAttemptAt ? eq(emailOutbox.nextAttemptAt, row.nextAttemptAt) : undefined,
  );
  if (error === undefined) {
    await db
      .update(emailOutbox)
      .set({
        status: "SENT",
        sentAt: now,
        attempts,
        lastAttemptAt: now,
        nextAttemptAt: null,
        error: null,
        textBody: "",
        htmlBody: "",
      })
      .where(eq(emailOutbox.id, row.id));
    return true;
  }
  await db
    .update(emailOutbox)
    .set({
      status: "FAILED",
      error: errorClass(error),
      attempts,
      lastAttemptAt: now,
      nextAttemptAt: row.textBody ? nextAttemptAfter(attempts, now) : null,
    })
    .where(and(ours, ne(emailOutbox.status, "SENT")));
  return false;
}

/**
 * Sends one email. Call it after the database transaction that caused it commits.
 * - outbox transport (dev/test): the email_outbox row is the delivered mail (/dev/mailbox).
 * - smtp transport: the row is the delivery record. Its body is kept only until the
 *   mail is delivered (never for sign-in links), so a failure is recoverable: two tries
 *   now, then the retry sweep with backoff (retryDueEmails), then an admin's resend
 *   (/admin/emails). With `deliverNow: false` the mail is only queued for the sweep
 *   (bulk sends once the mail server is known to be failing).
 * Returns whether the mail was delivered now, and whether a delivery attempt failed
 * (false when it was only queued or skipped as a duplicate). Throws only when an unstored mail (a
 * sign-in link) could not be delivered, since nothing can retry it.
 */
export async function sendEmail(
  msg: OutgoingEmail,
  { deliverNow = true }: { deliverNow?: boolean } = {},
): Promise<{ delivered: boolean; failed: boolean }> {
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
    return { delivered: true, failed: false };
  }

  const store = !NOT_STORED.has(msg.template);
  const now = new Date();
  // Inserting claims the row (its lease); queued rows are due for the sweep at once.
  let [row] = await db
    .insert(emailOutbox)
    .values({
      toAddress: to,
      subject: rendered.subject,
      template: msg.template,
      textBody: store ? rendered.text : "",
      htmlBody: store ? rendered.html : "",
      dedupeKey: msg.dedupeKey,
      nextAttemptAt: deliverNow || !store ? new Date(now.getTime() + LEASE_MS) : now,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning(claimedColumns);
  if (!row && msg.dedupeKey) {
    // Same key seen before: delivered, being sent or queued → leave it to its owner
    // (or the sweep); failed or abandoned → claim it and send now.
    if (!deliverNow && store) return { delivered: false, failed: false };
    const [prior] = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.dedupeKey, msg.dedupeKey));
    row = prior ? ((await claimRow(prior.id, now)) ?? undefined) : undefined;
    if (!row) return { delivered: false, failed: false };
  }
  if (!row || (!deliverNow && store)) return { delivered: false, failed: false };

  const delivered = await deliverClaimed(row, {
    tries: 2,
    content: { text: rendered.text, html: rendered.html },
  });
  if (!delivered && !store) throw new Error(`Email delivery failed (${msg.template}); not stored`);
  if (!delivered) console.error(`Email delivery failed (${msg.template}); kept for retry`);
  return { delivered, failed: !delivered };
}
