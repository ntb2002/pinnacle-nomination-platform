import "server-only";
import type { DbExecutor } from "@/server/db";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import type { Actor } from "@/server/auth/actor";

export interface AuditEvent {
  /** Who acted. null = the system (webhooks, CLI). */
  actor: Pick<Actor, "id" | "role"> | null;
  /** Dotted verb, e.g. "entry.approved", "user.role_changed", "reference.viewed". */
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Small structured context. Never secrets, never full PII (no narratives, phone numbers). */
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Appends one row to the audit log (append-only; a DB trigger rejects changes).
 * Pass `tx` to write inside the same transaction as the action it records.
 */
export async function audit(event: AuditEvent, tx: DbExecutor = db): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: event.actor?.id ?? null,
    actorRole: event.actor?.role ?? null,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    metadata: event.metadata ?? {},
    ip: event.ip ?? null,
  });
}
