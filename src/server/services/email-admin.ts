import "server-only";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";
import { claimRow, deliverClaimed, MAX_ATTEMPTS } from "@/server/email";
import { ConflictError, NotFoundError } from "@/server/errors";

/** A queued or interrupted row the sweep has not picked up within this long. */
const OVERDUE_MS = 5 * 60_000;

const undelivered = (now: Date) =>
  or(
    eq(emailOutbox.status, "FAILED"),
    and(
      eq(emailOutbox.status, "PENDING"),
      lt(emailOutbox.nextAttemptAt, new Date(now.getTime() - OVERDUE_MS)),
    ),
  );

/** Admin: emails that have not been delivered (failed, or interrupted), newest first. */
export async function listUndeliveredEmails(actor: Actor, now = new Date()) {
  assertRole(actor, "ADMIN");
  const rows = await db
    .select({
      id: emailOutbox.id,
      toAddress: emailOutbox.toAddress,
      template: emailOutbox.template,
      subject: emailOutbox.subject,
      status: emailOutbox.status,
      error: emailOutbox.error,
      attempts: emailOutbox.attempts,
      lastAttemptAt: emailOutbox.lastAttemptAt,
      nextAttemptAt: emailOutbox.nextAttemptAt,
      createdAt: emailOutbox.createdAt,
      stored: sql<boolean>`${emailOutbox.textBody} <> ''`,
    })
    .from(emailOutbox)
    .where(undelivered(now))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(200);
  return {
    smtp: env().EMAIL_TRANSPORT === "smtp",
    maxAttempts: MAX_ATTEMPTS,
    rows: rows.map((r) => ({
      ...r,
      // Sign-in links are never stored, so they cannot be resent.
      resendable: r.stored,
      autoRetry: r.stored && r.nextAttemptAt !== null && r.attempts < MAX_ATTEMPTS,
    })),
  };
}

/**
 * Admin: tries an undelivered email again now, with its stored body (whatever its
 * attempt count). Audited with the outcome. Returns whether it was delivered.
 */
export async function resendEmail(actor: Actor, id: string, ip?: string, now = new Date()) {
  assertRole(actor, "ADMIN");
  if (!isUuid(id)) throw new NotFoundError("email");
  const [row] = await db
    .select({
      status: emailOutbox.status,
      template: emailOutbox.template,
      stored: sql<boolean>`${emailOutbox.textBody} <> ''`,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, id));
  if (!row) throw new NotFoundError("email");
  if (row.status === "SENT") throw new ConflictError("This email was already delivered.");
  if (env().EMAIL_TRANSPORT !== "smtp")
    throw new ConflictError("Email is not being sent over SMTP on this server.");
  if (!row.stored)
    throw new ConflictError(
      "This email was not stored (sign-in links are not kept). Ask the person to request a new one.",
    );
  // The same atomic claim as the retry sweep: never two sends of one email at once.
  const claimed = await claimRow(id, now);
  if (!claimed)
    throw new ConflictError("This email is being sent right now. Refresh the page in a minute.");
  const delivered = await deliverClaimed(claimed);
  await audit({
    actor,
    action: "email.resent",
    targetType: "email",
    targetId: id,
    metadata: { template: row.template, delivered, attempts: claimed.attempts + 1 },
    ip,
  });
  return delivered;
}
