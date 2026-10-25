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
 * - smtp transport: the row is a delivery record only; bodies are not stored, so
 *   tokens and personal details do not accumulate in the database.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const rendered = renderEmail(msg.content);
  const to = msg.to.trim().toLowerCase();
  const { EMAIL_TRANSPORT, EMAIL_FROM } = env();

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

  const [row] = await db
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
  if (!row) return; // already sent under this dedupe key

  try {
    await smtp().sendMail({
      from: EMAIL_FROM,
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
    const message = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
    await db
      .update(emailOutbox)
      .set({ status: "FAILED", error: message })
      .where(eq(emailOutbox.id, row.id));
    throw err;
  }
}
