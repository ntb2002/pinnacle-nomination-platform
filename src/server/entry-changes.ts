import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/** The parts of an entry a nominator can change between a return and a resubmission. */
export interface EntryContent {
  categoryId: string;
  nomineeName: string | null;
  nomineeTitle: string | null;
  nomineeCompany: string | null;
  nomineeEmail: string | null;
  nomineeLinkedinUrl: string | null;
  narrative: string | null;
  outcomes: { position: number; description: string; dataPoint: string }[];
  references: {
    position: number;
    name: string;
    title: string;
    organization: string;
    email: string;
    phone: string;
    relationship: string;
  }[];
  /** SHA-256 of each supporting file (attachment.sha256). */
  fileHashes: string[];
}

const LABELS: Record<string, string> = {
  categoryId: "Category",
  nomineeName: "Nominee's name",
  nomineeTitle: "Nominee's title",
  nomineeCompany: "Nominee's company",
  nomineeEmail: "Nominee's email",
  nomineeLinkedinUrl: "Nominee's LinkedIn",
  narrative: "Narrative",
};
const FIELDS = Object.keys(LABELS) as (keyof typeof LABELS & keyof EntryContent)[];

/** Plain (not hashed, not compared) context stored next to the hashes. */
export const CATEGORY_NAME_KEY = "meta.categoryName";

/**
 * Keyed HMAC-SHA-256 (key derived from BETTER_AUTH_SECRET), so someone reading the
 * database cannot confirm a guess about an earlier value of a short field such as a
 * name. Rotating the secret makes every field read as changed once.
 */
function digest(v: unknown) {
  const key = createHmac("sha256", env().BETTER_AUTH_SECRET).update("entry-changes").digest();
  return createHmac("sha256", key)
    .update(JSON.stringify(v ?? null))
    .digest("hex");
}

/**
 * One keyed hash per field, outcome, reference and the set of files. Stored on a return
 * so the later resubmission can list what changed without keeping a copy of
 * confidential content.
 */
export function contentHashes(c: EntryContent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FIELDS) out[key] = digest(c[key]);
  for (let i = 1; i <= 3; i++) {
    const o = c.outcomes.find((r) => r.position === i);
    out[`outcome.${i}`] = digest(o ? [o.description, o.dataPoint] : null);
  }
  for (let i = 1; i <= 2; i++) {
    const r = c.references.find((x) => x.position === i);
    out[`reference.${i}`] = digest(
      r ? [r.name, r.title, r.organization, r.email, r.phone, r.relationship] : null,
    );
  }
  out.files = digest([...c.fileHashes].sort());
  return out;
}

function label(key: string, before: Record<string, string>) {
  if (key === "categoryId" && before[CATEGORY_NAME_KEY]) {
    return `Category (was ${before[CATEGORY_NAME_KEY]})`;
  }
  if (key === "files") return "Supporting files";
  return LABELS[key] ?? key.replace(/^outcome\./, "Outcome ").replace(/^reference\./, "Reference ");
}

/** Labels of the fields whose hashes differ, in form order ("Category", "Outcome 2"). */
export function changedFields(before: Record<string, string>, after: Record<string, string>) {
  return Object.keys(after)
    .filter((k) => !k.startsWith("meta.") && before[k] !== after[k])
    .map((k) => label(k, before));
}
