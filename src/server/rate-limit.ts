import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
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
 * Fixed-window counter in Postgres, so the limit holds across app instances.
 * Returns true when the request is allowed (and counts it).
 */
export async function consume(
  rule: RateLimitRule,
  identifier: string,
  now = new Date(),
): Promise<boolean> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimitWindow)
    .values({ key: bucketKey(rule, identifier), windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitWindow.key, rateLimitWindow.windowStart],
      set: { count: sql`${rateLimitWindow.count} + 1` },
    })
    .returning({ count: rateLimitWindow.count });
  return (row?.count ?? 1) <= rule.limit;
}

/** Deletes expired windows. Called opportunistically; old rows are harmless otherwise. */
export async function pruneRateLimits(olderThan: Date): Promise<void> {
  await db.delete(rateLimitWindow).where(sql`${rateLimitWindow.windowStart} < ${olderThan}`);
}
