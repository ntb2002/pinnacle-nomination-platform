import { ENTRY_RULES } from "@/lib/validation/entry";

const NOMINEE_FIELDS = [
  "nomineeName",
  "nomineeTitle",
  "nomineeCompany",
  "nomineeEmail",
  "nomineeLinkedinUrl",
] as const;
const OUTCOME_FIELDS = ["description", "dataPoint"] as const;
const REFERENCE_FIELDS = [
  "name",
  "title",
  "organization",
  "email",
  "phone",
  "relationship",
] as const;

type Row<K extends readonly string[]> = Record<K[number], string>;

/**
 * Turns the entry form's flat fields ("outcomes.1.dataPoint") into the draft shape.
 * Rows left completely blank are dropped, so an optional third outcome or second
 * reference is simply absent. Unknown fields are ignored.
 */
export function entryFormToDraft(form: Iterable<[string, FormDataEntryValue]>) {
  const flat = new Map<string, string>();
  for (const [k, v] of form) if (typeof v === "string") flat.set(k, v);
  const get = (k: string) => flat.get(k) ?? "";

  const rows = <K extends readonly string[]>(prefix: string, fields: K, max: number) =>
    Array.from(
      { length: max },
      (_, i) => Object.fromEntries(fields.map((f) => [f, get(`${prefix}.${i}.${f}`)])) as Row<K>,
    ).filter((r) => Object.values(r).some((v) => (v as string).trim() !== ""));

  const nominee = Object.fromEntries(NOMINEE_FIELDS.map((f) => [f, get(f)])) as Row<
    typeof NOMINEE_FIELDS
  >;
  return {
    ...nominee,
    narrative: get("narrative"),
    outcomes: rows("outcomes", OUTCOME_FIELDS, ENTRY_RULES.outcomesMax),
    references: rows("references", REFERENCE_FIELDS, ENTRY_RULES.referencesMax),
  };
}

const TOP_LABELS: Record<string, string> = {
  nomineeName: "Nominee's name",
  nomineeTitle: "Nominee's title",
  nomineeCompany: "Nominee's company",
  nomineeEmail: "Nominee's email",
  nomineeLinkedinUrl: "LinkedIn profile",
  narrative: "Narrative",
  outcomes: "Outcomes",
  references: "References",
};
const ROW_FIELD_LABELS: Record<string, string> = {
  description: "what changed",
  dataPoint: "data point",
  name: "name",
  title: "job title",
  organization: "organization",
  email: "email",
  phone: "phone",
  relationship: "relationship to the nominee",
};

/** Human label for an entry field path: "outcomes.1.dataPoint" → "Outcome 2, data point". */
export function entryFieldLabel(path: string): string {
  const [root = "", index, field] = path.split(".");
  if (index !== undefined && field) {
    const kind = root === "outcomes" ? "Outcome" : "Reference";
    return `${kind} ${Number(index) + 1}, ${ROW_FIELD_LABELS[field] ?? field}`;
  }
  return TOP_LABELS[root] ?? root;
}

/** Flattens a draft back into form field names, for echoing values into the form. */
export function draftToFormValues(
  draft: ReturnType<typeof entryFormToDraft>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft)) if (typeof v === "string") out[k] = v;
  draft.outcomes.forEach((o, i) => {
    for (const [k, v] of Object.entries(o)) out[`outcomes.${i}.${k}`] = v;
  });
  draft.references.forEach((r, i) => {
    for (const [k, v] of Object.entries(r)) out[`references.${i}.${k}`] = v;
  });
  return out;
}
