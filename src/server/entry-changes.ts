import "server-only";
import { createHash } from "node:crypto";

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

const sha = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(v ?? null))
    .digest("hex");

/**
 * One SHA-256 per field, outcome and reference. Stored on a return so the later
 * resubmission can list what changed without keeping a copy of confidential content.
 */
export function contentHashes(c: EntryContent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(LABELS)) out[key] = sha(c[key as keyof EntryContent]);
  for (let i = 1; i <= 3; i++) {
    const o = c.outcomes.find((r) => r.position === i);
    out[`outcome.${i}`] = sha(o ? [o.description, o.dataPoint] : null);
  }
  for (let i = 1; i <= 2; i++) {
    const r = c.references.find((x) => x.position === i);
    out[`reference.${i}`] = sha(
      r ? [r.name, r.title, r.organization, r.email, r.phone, r.relationship] : null,
    );
  }
  return out;
}

/** Labels of the fields whose hashes differ, in form order ("Category", "Outcome 2"). */
export function changedFields(before: Record<string, string>, after: Record<string, string>) {
  return Object.keys(after)
    .filter((k) => before[k] !== after[k])
    .map(
      (k) => LABELS[k] ?? k.replace(/^outcome\./, "Outcome ").replace(/^reference\./, "Reference "),
    );
}
