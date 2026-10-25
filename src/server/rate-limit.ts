import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { rateLimitWindow } from "@/server/db/schema";

export interface RateLimitRule {
  /** Logical bucket name, e.g. "signin:email". */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** Hash identifiers (emails, IPs) so the table never stores PII. */
export function bucketKey(rule: RateLimitRule, identifier: string): string {
  const digest = createHash("sha256")
    .update(identifier.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
  return `${rule.name}:${digest}`;
}

/**
 * Sliding-window limit, shared across app instances via Postgres. Counts are kept per
 * fixed window; the estimate for "the last windowSeconds" is the current window's count
 * plus the previous window's count weighted by how much of it still overlaps. That stops
 * bursts straddling a window boundary (5 at :14:59 and 5 at :15:00 is 10 in seconds).
 * Counts the request and returns true when it is allowed.
 */
export async function consume(
  rule: RateLimitRule,
  identifier: string,
  now = new Date(),
): Promise<boolean> {
  const windowMs = rule.windowSeconds * 1000;
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const key = bucketKey(rule, identifier);
  const [row] = await db
    .insert(rateLimitWindow)
    .values({ key, windowStart: new Date(startMs), count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitWindow.key, rateLimitWindow.windowStart],
      set: { count: sql`${rateLimitWindow.count} + 1` },
    })
    .returning({ count: rateLimitWindow.count });
  const [previous] = await db
    .select({ count: rateLimitWindow.count })
    .from(rateLimitWindow)
    .where(
      and(
        eq(rateLimitWindow.key, key),
        eq(rateLimitWindow.windowStart, new Date(startMs - windowMs)),
      ),
    );
  const overlap = 1 - (now.getTime() - startMs) / windowMs;
  const estimate = (row?.count ?? 1) + (previous?.count ?? 0) * overlap;
  return estimate <= rule.limit;
}

/** Deletes old windows. Called occasionally; old rows are harmless otherwise. */
export async function pruneRateLimits(olderThan: Date): Promise<void> {
  await db.delete(rateLimitWindow).where(sql`${rateLimitWindow.windowStart} < ${olderThan}`);
}
