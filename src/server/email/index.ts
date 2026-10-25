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

let transporter: Transporter | undefined;
function smtp(): Transporter {
  const url = env().SMTP_URL;
  if (!url) throw new Error("SMTP_URL is not configured");
  transporter ??= nodemailer.createTransport(url);
  return transporter;
}

/**
 * Sends one email. Call it after the database transaction that caused it commits.
 * - outbox transport (dev/test): the email_outbox row is the delivered mail (/dev/mailbox).
 * - smtp transport: the row is a delivery record only (recipient, subject, template,
 *   status); bodies are not stored, so sign-in tokens and entry details do not accumulate.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const rendered = renderEmail(msg.content);
  const to = msg.to.trim().toLowerCase();
  const { EMAIL_TRANSPORT } = env();
  const from = env().EMAIL_FROM ?? "Pinnacle Awards <no-reply@example.edu>";

  if (EMAIL_TRANSPORT === "outbox") {
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

  let [row] = await db
    .insert(emailOutbox)
    .values({
      toAddress: to,
      subject: rendered.subject,
      template: msg.template,
      textBody: "",
      htmlBody: "",
      dedupeKey: msg.dedupeKey,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id });
  if (!row && msg.dedupeKey) {
    // Same key seen before: skip only if it was delivered; retry a PENDING/FAILED one.
    const [prior] = await db
      .select({ id: emailOutbox.id, status: emailOutbox.status })
      .from(emailOutbox)
      .where(eq(emailOutbox.dedupeKey, msg.dedupeKey));
    if (!prior || prior.status === "SENT") return;
    row = { id: prior.id };
  }
  if (!row) return;

  try {
    await smtp().sendMail({
      from,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    await db
      .update(emailOutbox)
      .set({ status: "SENT", sentAt: new Date() })
      .where(eq(emailOutbox.id, row.id));
  } catch (err) {
    // Record the failure class only: SMTP error text usually contains the recipient address.
    const e = err as { name?: string; code?: string; responseCode?: number };
    const message = [e.name, e.code, e.responseCode].filter(Boolean).join(" ") || "send failed";
    await db
      .update(emailOutbox)
      .set({ status: "FAILED", error: message })
      .where(eq(emailOutbox.id, row.id));
    throw err;
  }
}
