import "server-only";
import { and, asc, lt, lte, ne } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";
import { claimRow, deliverClaimed, MAX_ATTEMPTS } from "@/server/email";

/**
 * The retry sweep: delivers stored, undelivered emails whose retry time has come (or
 * whose send was interrupted: an expired lease). Each row is claimed atomically just
 * before its send (claimRow), so concurrent sweeps on several app instances, an admin's
 * resend and a repeated sendEmail never send the same mail twice. Returns how many were
 * attempted and delivered.
 */
export async function retryDueEmails(now = new Date(), limit = 20) {
  if (env().EMAIL_TRANSPORT !== "smtp") return { attempted: 0, delivered: 0 };
  const due = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        ne(emailOutbox.status, "SENT"),
        lte(emailOutbox.nextAttemptAt, now),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        ne(emailOutbox.textBody, ""),
      ),
    )
    .orderBy(asc(emailOutbox.nextAttemptAt))
    .limit(limit);
  let attempted = 0;
  let delivered = 0;
  const started = Date.now();
  for (const { id } of due) {
    // Each claim's lease runs from when it is taken, not from the start of the sweep.
    const row = await claimRow(id, new Date(now.getTime() + (Date.now() - started)));
    if (!row) continue; // delivered or claimed by someone else meanwhile
    attempted++;
    if (await deliverClaimed(row)) delivered++;
  }
  return { attempted, delivered };
}

let timer: NodeJS.Timeout | undefined;

/**
 * Runs the sweep in this server process (started from instrumentation): a minute after
 * the previous sweep finished, so sweeps never overlap here.
 */
export function startEmailRetryLoop() {
  if (timer || env().EMAIL_TRANSPORT !== "smtp") return;
  const tick = async () => {
    try {
      await retryDueEmails();
    } catch (err) {
      const e = err as { name?: string; code?: string };
      console.error("Email retry sweep failed:", e?.name ?? typeof err, e?.code ?? "");
    }
    timer = setTimeout(tick, 60_000);
    timer.unref();
  };
  timer = setTimeout(tick, 60_000);
  timer.unref();
}
