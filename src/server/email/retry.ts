import "server-only";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { attemptDelivery, MAX_ATTEMPTS } from "@/server/email";

/** How long a claimed row is held before another sweep may take it (send in progress). */
const CLAIM_MS = 10 * 60_000;

/**
 * The retry sweep: delivers stored, undelivered emails whose retry time has come.
 * Rows are claimed with SKIP LOCKED (pushing their retry time out), so concurrent
 * sweeps on several app instances never send the same mail twice. Returns how many
 * were attempted and delivered.
 */
export async function retryDueEmails(now = new Date(), limit = 20) {
  if (env().EMAIL_TRANSPORT !== "smtp") return { attempted: 0, delivered: 0 };
  const claimed = await db.execute<{
    id: string;
    to_address: string;
    subject: string;
    text_body: string;
    html_body: string;
    attempts: number;
  }>(sql`
    UPDATE email_outbox SET next_attempt_at = ${new Date(now.getTime() + CLAIM_MS)}
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE status <> 'SENT' AND next_attempt_at <= ${now}
        AND attempts < ${MAX_ATTEMPTS} AND text_body <> ''
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, to_address, subject, text_body, html_body, attempts`);
  let delivered = 0;
  for (const r of claimed.rows) {
    const ok = await attemptDelivery(
      {
        id: r.id,
        toAddress: r.to_address,
        subject: r.subject,
        textBody: r.text_body,
        htmlBody: r.html_body,
        attempts: r.attempts,
      },
      now,
    );
    if (ok) delivered++;
  }
  return { attempted: claimed.rows.length, delivered };
}

let timer: NodeJS.Timeout | undefined;

/** Runs the sweep every minute in this server process (started from instrumentation). */
export function startEmailRetryLoop() {
  if (timer || env().EMAIL_TRANSPORT !== "smtp") return;
  timer = setInterval(() => {
    retryDueEmails().catch((err: unknown) => {
      const e = err as { name?: string; code?: string };
      console.error("Email retry sweep failed:", e?.name ?? typeof err, e?.code ?? "");
    });
  }, 60_000);
  timer.unref();
}
