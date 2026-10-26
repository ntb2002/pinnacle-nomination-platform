import "server-only";
import { and, asc, count, desc, eq, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { isUuid } from "@/lib/ids";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import {
  attachment,
  awardCycle,
  category,
  entry,
  entryStatusEvent,
  payment,
  user,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { loadContent } from "./triage";

export const QUEUE_PAGE_SIZE = 25;

/** Queue filters from the URL. Anything invalid falls back to the default. */
const filtersSchema = z.object({
  status: z.enum(["SUBMITTED", "RETURNED", "APPROVED", "ALL"]).catch("SUBMITTED"),
  category: z.string().refine(isUuid).optional().catch(undefined),
  sort: z.enum(["oldest", "newest"]).catch("oldest"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type QueueFilters = z.output<typeof filtersSchema>;

export function parseQueueFilters(
  raw: Record<string, string | string[] | undefined>,
): QueueFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return filtersSchema.parse({
    status: one(raw.status) ?? "SUBMITTED",
    category: one(raw.category) || undefined,
    sort: one(raw.sort) ?? "oldest",
    page: one(raw.page) ?? 1,
  });
}

/**
 * Admin: submitted (never draft) entries of the active cycle, filtered by status and
 * category, sorted by submission date, one page at a time.
 */
export async function listTriageQueue(actor: Actor, f: QueueFilters) {
  assertRole(actor, "ADMIN");
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  if (!cycle) return null;
  const conds: SQL[] = [eq(entry.cycleId, cycle.id), ne(entry.status, "DRAFT")];
  if (f.status !== "ALL") conds.push(eq(entry.status, f.status));
  if (f.category) conds.push(eq(entry.categoryId, f.category));
  const where = and(...conds);
  const [[total], rows, categories] = await Promise.all([
    db.select({ n: count() }).from(entry).where(where),
    db
      .select({
        id: entry.id,
        status: entry.status,
        nomineeName: entry.nomineeName,
        nomineeCompany: entry.nomineeCompany,
        categoryName: category.name,
        submittedAt: entry.submittedAt,
        nominatorEmail: user.email,
      })
      .from(entry)
      .innerJoin(category, eq(category.id, entry.categoryId))
      .innerJoin(user, eq(user.id, entry.nominatorId))
      .where(where)
      .orderBy(
        f.sort === "oldest" ? asc(entry.submittedAt) : desc(entry.submittedAt),
        asc(entry.id),
      )
      .limit(QUEUE_PAGE_SIZE)
      .offset((f.page - 1) * QUEUE_PAGE_SIZE),
    db
      .select({ id: category.id, name: category.name })
      .from(category)
      .where(eq(category.cycleId, cycle.id))
      .orderBy(asc(category.sortOrder), asc(category.name)),
  ]);
  return { rows, total: total?.n ?? 0, categories, triageOpen: cycle.phase === "NOMINATION" };
}

/**
 * Admin: everything about one entry. Reference contact details (email, phone) are
 * included only when asked for, and every such view is audited.
 */
export async function getAdminEntry(
  actor: Actor,
  entryId: string,
  opts: { showContacts?: boolean; ip?: string } = {},
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const [row] = await db
    .select({
      entry,
      categoryName: category.name,
      phase: awardCycle.phase,
      nominatorEmail: user.email,
      nominatorName: user.name,
    })
    .from(entry)
    .innerJoin(category, eq(category.id, entry.categoryId))
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .innerJoin(user, eq(user.id, entry.nominatorId))
    .where(eq(entry.id, entryId));
  if (!row) throw new NotFoundError("entry");
  const actorUser = db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .as("actor_user");
  const [content, files, payments, history] = await Promise.all([
    loadContent(db, row.entry),
    db
      .select({
        id: attachment.id,
        name: attachment.originalName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
      })
      .from(attachment)
      .where(eq(attachment.entryId, entryId))
      .orderBy(asc(attachment.createdAt)),
    db
      .select({
        kind: payment.kind,
        expiresAt: payment.expiresAt,
        tier: payment.tier,
        status: payment.status,
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        reference: payment.providerPaymentIntentId,
      })
      .from(payment)
      .where(eq(payment.entryId, entryId))
      .orderBy(desc(payment.createdAt)),
    db
      .select({
        id: entryStatusEvent.id,
        fromStatus: entryStatusEvent.fromStatus,
        toStatus: entryStatusEvent.toStatus,
        returnReason: entryStatusEvent.returnReason,
        note: entryStatusEvent.note,
        at: entryStatusEvent.createdAt,
        actorName: actorUser.name,
        actorRole: actorUser.role,
      })
      .from(entryStatusEvent)
      .leftJoin(actorUser, eq(actorUser.id, entryStatusEvent.actorId))
      .where(eq(entryStatusEvent.entryId, entryId))
      .orderBy(asc(entryStatusEvent.createdAt)),
  ]);
  if (opts.showContacts && content.references.length > 0) {
    await audit({
      actor,
      action: "entry.references_viewed",
      targetType: "entry",
      targetId: entryId,
      ip: opts.ip,
    });
  }
  const references = content.references.map((r) =>
    opts.showContacts ? r : { ...r, email: null, phone: null },
  );
  return {
    ...row,
    outcomes: content.outcomes,
    references,
    files,
    payments,
    history,
    triageOpen: row.phase === "NOMINATION",
  };
}
