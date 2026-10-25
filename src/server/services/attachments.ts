import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import {
  displayName,
  sniffType,
  UPLOAD_ERRORS,
  UPLOAD_RULES,
  type UploadErrorCode,
} from "@/lib/file-rules";
import { isUuid } from "@/lib/ids";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import { attachment, entry } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { storage } from "@/server/storage";
import { EDITABLE_STATUSES } from "./entries";
import { entryAccessFor } from "./entry-access";

/** A refused upload, with a code the upload route can put in its redirect. */
export class UploadRejected extends ValidationError {
  constructor(readonly code: UploadErrorCode) {
    super(UPLOAD_ERRORS[code], { file: [UPLOAD_ERRORS[code]] });
    this.name = "UploadRejected";
  }
}

/**
 * Nominator: attaches one supporting file to their own editable entry. The type comes
 * from the file's bytes; the stored name is a random key; at most 5 files of 10 MB.
 */
export async function uploadAttachment(
  actor: Actor,
  entryId: string,
  file: { name: string; bytes: Uint8Array },
) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new UploadRejected("closed");
  if (file.bytes.byteLength === 0) throw new UploadRejected("empty");
  if (file.bytes.byteLength > UPLOAD_RULES.maxBytes) throw new UploadRejected("size");
  const type = sniffType(file.bytes.subarray(0, 16));
  if (!type) throw new UploadRejected("type");

  const key = randomUUID();
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  // Cheap refusal before anything is stored; re-checked under the lock below.
  await checkUploadAllowed(db, actor, entryId);
  // The bytes are written outside the transaction, so a slow storage service never
  // holds a database connection or the entry lock. Any refusal or failure afterwards
  // removes them again.
  await storage().put(key, file.bytes, type);
  try {
    await db.transaction(async (tx) => {
      await checkUploadAllowed(tx, actor, entryId, true);
      await tx.insert(attachment).values({
        entryId,
        storageKey: key,
        originalName: displayName(file.name, type),
        contentType: type,
        sizeBytes: file.bytes.byteLength,
        sha256,
        uploadedById: actor.id,
      });
    });
  } catch (err) {
    await removeBytes([key]);
    throw err;
  }
}

/** The entry is the actor's, editable, and below the file limit. `lock` serializes uploads. */
async function checkUploadAllowed(tx: DbExecutor, actor: Actor, entryId: string, lock = false) {
  const owned = tx
    .select({ id: entry.id })
    .from(entry)
    .where(
      and(
        eq(entry.id, entryId),
        eq(entry.nominatorId, actor.id),
        inArray(entry.status, [...EDITABLE_STATUSES]),
      ),
    );
  const [row] = lock ? await owned.for("update") : await owned;
  if (!row) throw new UploadRejected("closed");
  const [existing] = await tx
    .select({ n: count() })
    .from(attachment)
    .where(eq(attachment.entryId, entryId));
  if ((existing?.n ?? 0) >= UPLOAD_RULES.maxFiles) throw new UploadRejected("count");
}

/**
 * Deletes stored bytes whose rows are already gone. Best effort: a failure leaves an
 * orphaned file (logged, never a dangling row) and does not fail the user's action.
 */
export async function removeBytes(keys: string[]) {
  const results = await Promise.allSettled(keys.map((k) => storage().delete(k)));
  for (const r of results) {
    if (r.status === "rejected") {
      const e = r.reason as { name?: string; code?: string };
      console.error("Stored file not removed:", e?.name ?? typeof r.reason, e?.code ?? "");
    }
  }
}

/** Files on an entry, for anyone allowed to read the entry. */
export async function listAttachments(actor: Actor, entryId: string) {
  if (!(await entryAccessFor(actor, entryId))) throw new NotFoundError("entry");
  return db
    .select({
      id: attachment.id,
      name: attachment.originalName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    })
    .from(attachment)
    .where(eq(attachment.entryId, entryId))
    .orderBy(asc(attachment.createdAt));
}

/** Nominator: removes a file from their own editable entry (row, then bytes). Returns its entry id. */
export async function deleteAttachment(actor: Actor, attachmentId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(attachmentId)) throw new NotFoundError("file");
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ key: attachment.storageKey, entryId: attachment.entryId })
      .from(attachment)
      .innerJoin(entry, eq(entry.id, attachment.entryId))
      .where(
        and(
          eq(attachment.id, attachmentId),
          eq(entry.nominatorId, actor.id),
          inArray(entry.status, [...EDITABLE_STATUSES]),
        ),
      )
      .for("update");
    if (!row) throw new NotFoundError("file");
    await tx.delete(attachment).where(eq(attachment.id, attachmentId));
    return row;
  });
  await removeBytes([removed.key]);
  return removed.entryId;
}

/**
 * A file's bytes for download, for anyone allowed to read its entry. Admin and judge
 * downloads are audit logged. NotFound for everyone else.
 */
export async function openAttachment(actor: Actor, attachmentId: string, ip?: string) {
  if (!isUuid(attachmentId)) throw new NotFoundError("file");
  const [row] = await db.select().from(attachment).where(eq(attachment.id, attachmentId));
  if (!row) throw new NotFoundError("file");
  const access = await entryAccessFor(actor, row.entryId);
  if (!access) throw new NotFoundError("file");
  const bytes = await storage().get(row.storageKey);
  if (!bytes) throw new NotFoundError("file");
  if (access !== "OWNER") {
    await audit({
      actor,
      action: "attachment.downloaded",
      targetType: "attachment",
      targetId: row.id,
      metadata: { entryId: row.entryId },
      ip,
    });
  }
  return { bytes, name: row.originalName, contentType: row.contentType };
}
