import { TextArea } from "@/components/form/controls";
import { Field } from "@/components/form/field";
import { WordCount } from "@/components/form/word-count";
import { ENTRY_RULES } from "@/lib/validation/entry";

type Values = Record<string, string>;
type Errors = Record<string, string[] | undefined>;

const sectionClass = "flex flex-col gap-6 rounded border border-line bg-surface p-6";
const legendClass = "mb-2 font-display text-2xl font-semibold";

export function NomineeSection({ v, e }: { v: Values; e: Errors }) {
  const f = (
    name: string,
    label: string,
    extra: Partial<React.ComponentProps<typeof Field>> = {},
  ) => (
    <Field
      id={name}
      name={name}
      label={label}
      defaultValue={v[name] ?? ""}
      errors={e[name]}
      {...extra}
    />
  );
  return (
    <fieldset className={sectionClass}>
      <legend className={legendClass}>The nominee</legend>
      {f("nomineeName", "Full name", { autoComplete: "off", maxLength: 120 })}
      {f("nomineeTitle", "Job title", { maxLength: 120 })}
      {f("nomineeCompany", "Company or organization", { maxLength: 160 })}
      {f("nomineeEmail", "Email address", {
        type: "email",
        hint: "Used only by program staff, to contact the nominee if they become a finalist.",
        maxLength: 254,
      })}
      {f("nomineeLinkedinUrl", "LinkedIn profile (optional)", {
        type: "url",
        hint: "For example https://www.linkedin.com/in/name",
        maxLength: 300,
      })}
    </fieldset>
  );
}

export function NarrativeSection({ v, e }: { v: Values; e: Errors }) {
  return (
    <fieldset className={sectionClass}>
      <legend className={legendClass}>The narrative</legend>
      <TextArea
        id="narrative"
        name="narrative"
        label="Why this person deserves the award"
        hint={`${ENTRY_RULES.narrativeMinWords} to ${ENTRY_RULES.narrativeMaxWords} words. Describe what the nominee achieved in the past year and why it matters to the creator economy.`}
        rows={14}
        maxLength={ENTRY_RULES.narrativeMaxChars}
        defaultValue={v.narrative ?? ""}
        errors={e.narrative}
        aria-describedby={[
          "narrative-hint",
          e.narrative ? "narrative-error" : "",
          "narrative-count",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <WordCount
        forId="narrative"
        min={ENTRY_RULES.narrativeMinWords}
        max={ENTRY_RULES.narrativeMaxWords}
      />
    </fieldset>
  );
}

export function OutcomesSection({ v, e }: { v: Values; e: Errors }) {
  return (
    <fieldset className={sectionClass} id="outcomes" tabIndex={-1}>
      <legend className={legendClass}>Quantified outcomes</legend>
      <p className="text-slate">
        Give {ENTRY_RULES.outcomesMin} or {ENTRY_RULES.outcomesMax} results, each with a data point
        judges can check (a figure, its period and its source).
      </p>
      {e.outcomes && <p className="font-semibold text-danger">{e.outcomes.join(" ")}</p>}
      {Array.from({ length: ENTRY_RULES.outcomesMax }, (_, i) => (
        <fieldset key={i} className="flex flex-col gap-4 border-t border-line pt-4">
          <legend className="font-semibold">
            Outcome {i + 1}
            {i >= ENTRY_RULES.outcomesMin ? " (optional)" : ""}
          </legend>
          {(["description", "dataPoint"] as const).map((k) => {
            const name = `outcomes.${i}.${k}`;
            return (
              <Field
                key={k}
                id={name}
                name={name}
                label={k === "description" ? "What changed" : "Data point"}
                hint={
                  k === "dataPoint"
                    ? "For example: +48% revenue, FY2026 vs FY2025 (audited financials)"
                    : undefined
                }
                maxLength={k === "description" ? 300 : 200}
                defaultValue={v[name] ?? ""}
                errors={e[name]}
              />
            );
          })}
        </fieldset>
      ))}
    </fieldset>
  );
}

const REFERENCE_FIELDS = [
  ["name", "Full name", "text", 120],
  ["title", "Job title", "text", 120],
  ["organization", "Organization", "text", 160],
  ["email", "Email address", "email", 254],
  ["phone", "Phone number", "tel", 40],
  ["relationship", "How they know the nominee", "text", 200],
] as const;

export function ReferencesSection({ v, e }: { v: Values; e: Errors }) {
  return (
    <fieldset className={sectionClass} id="references" tabIndex={-1}>
      <legend className={legendClass}>References</legend>
      <p className="text-slate">
        Give {ENTRY_RULES.referencesMin} or {ENTRY_RULES.referencesMax} people who can confirm the
        outcomes. Program staff may contact them. Judges see their names and roles, never their
        contact details.
      </p>
      {e.references && <p className="font-semibold text-danger">{e.references.join(" ")}</p>}
      {Array.from({ length: ENTRY_RULES.referencesMax }, (_, i) => (
        <fieldset key={i} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <legend className="font-semibold">
            Reference {i + 1}
            {i >= ENTRY_RULES.referencesMin ? " (optional)" : ""}
          </legend>
          {REFERENCE_FIELDS.map(([k, label, type, max]) => {
            const name = `references.${i}.${k}`;
            return (
              <Field
                key={k}
                id={name}
                name={name}
                label={label}
                type={type}
                maxLength={max}
                defaultValue={v[name] ?? ""}
                errors={e[name]}
              />
            );
          })}
        </fieldset>
      ))}
    </fieldset>
  );
}
