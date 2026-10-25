import { z } from "zod";
import { countWords } from "@/lib/text";
import { emailSchema } from "./common";

/** Program rules for an entry (VISION.md). One place, used by client and server. */
export const ENTRY_RULES = {
  narrativeMinWords: 250,
  narrativeMaxWords: 500,
  narrativeMaxChars: 5000,
  outcomesMin: 2,
  outcomesMax: 3,
  referencesMin: 1,
  referencesMax: 2,
} as const;

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const LINKEDIN_RE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/[^\s]+$/i;
const PHONE_RE = /^\+?[0-9 ().-]{7,25}(\s*(ext\.?|x)\s*\d{1,6})?$/i;
const LINKEDIN_MSG = "Enter a LinkedIn profile address starting with https://www.linkedin.com/";
const PHONE_MSG = "Enter a phone number, like +1 315 555 0100";
const EMAIL_MSG = "Enter a valid email address, like name@example.com";
const isEmail = (v: string) => z.email().safeParse(v).success;

/** Optional in a draft, but if something is typed it must have the right format. */
const formatIfPresent = (max: number, ok: (v: string) => boolean, message: string) =>
  text(max).refine((v) => v === "" || ok(v), message);

/**
 * Draft shape: everything optional (a draft can be saved at any point), but lengths are
 * always capped. Formats and counts are checked by `readinessProblems` before submission.
 */
export const draftSchema = z.object({
  nomineeName: text(120).optional(),
  nomineeTitle: text(120).optional(),
  nomineeCompany: text(160).optional(),
  nomineeEmail: formatIfPresent(254, isEmail, EMAIL_MSG).optional(),
  nomineeLinkedinUrl: formatIfPresent(300, (v) => LINKEDIN_RE.test(v), LINKEDIN_MSG).optional(),
  narrative: z.string().max(ENTRY_RULES.narrativeMaxChars, "The narrative is too long").optional(),
  outcomes: z
    .array(z.object({ description: text(300), dataPoint: text(200) }))
    .max(ENTRY_RULES.outcomesMax),
  references: z
    .array(
      z.object({
        name: text(120),
        title: text(120),
        organization: text(160),
        email: formatIfPresent(254, isEmail, EMAIL_MSG),
        phone: formatIfPresent(40, (v) => PHONE_RE.test(v), PHONE_MSG),
        relationship: text(200),
      }),
    )
    .max(ENTRY_RULES.referencesMax),
});
export type EntryDraft = z.infer<typeof draftSchema>;

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .max(max, `Keep the ${label} under ${max} characters`);

const linkedin = z
  .string()
  .trim()
  .refine((v) => v === "" || LINKEDIN_RE.test(v), LINKEDIN_MSG);

const phone = z.string().trim().regex(PHONE_RE, PHONE_MSG);

/** The complete entry required before payment and submission. */
export const submissionSchema = z.object({
  nomineeName: required("nominee's name", 120),
  nomineeTitle: required("nominee's title", 120),
  nomineeCompany: required("nominee's company", 160),
  nomineeEmail: emailSchema,
  nomineeLinkedinUrl: linkedin,
  narrative: z
    .string()
    .refine(
      (v) => countWords(v) >= ENTRY_RULES.narrativeMinWords,
      `Write at least ${ENTRY_RULES.narrativeMinWords} words`,
    )
    .refine(
      (v) => countWords(v) <= ENTRY_RULES.narrativeMaxWords,
      `Keep the narrative to ${ENTRY_RULES.narrativeMaxWords} words or fewer`,
    ),
  outcomes: z
    .array(
      z.object({
        description: required("outcome", 300),
        dataPoint: required("data point", 200),
      }),
    )
    .min(ENTRY_RULES.outcomesMin, `Add at least ${ENTRY_RULES.outcomesMin} outcomes`)
    .max(ENTRY_RULES.outcomesMax, `Add no more than ${ENTRY_RULES.outcomesMax} outcomes`),
  references: z
    .array(
      z.object({
        name: required("reference's name", 120),
        title: required("reference's title", 120),
        organization: required("reference's organization", 160),
        email: emailSchema,
        phone,
        relationship: required("reference's relationship to the nominee", 200),
      }),
    )
    .min(ENTRY_RULES.referencesMin, `Add at least ${ENTRY_RULES.referencesMin} reference`)
    .max(ENTRY_RULES.referencesMax, `Add no more than ${ENTRY_RULES.referencesMax} references`),
});
export type EntrySubmission = z.infer<typeof submissionSchema>;

/**
 * Field-keyed problems that stop an entry being submitted, e.g.
 * { narrative: ["Write at least 250 words"], "outcomes.1.dataPoint": ["Enter the data point"] }.
 * Empty when the entry is ready.
 */
export function readinessProblems(entry: unknown): Record<string, string[]> {
  const r = submissionSchema.safeParse(entry);
  if (r.success) return {};
  const out: Record<string, string[]> = {};
  for (const i of r.error.issues)
    (out[i.path.map(String).join(".") || "_form"] ??= []).push(i.message);
  return out;
}

export const startEntrySchema = z.object({
  categoryId: z.uuid("Choose a category"),
  relationship: z.enum(["SELF", "PEER", "STAFF"], { error: "Choose how you know the nominee" }),
});

/** A stored entry as submission-schema input: nullable text becomes "" so messages are friendly. */
export function toSubmissionInput(e: {
  nomineeName: string | null;
  nomineeTitle: string | null;
  nomineeCompany: string | null;
  nomineeEmail: string | null;
  nomineeLinkedinUrl: string | null;
  narrative: string | null;
  outcomes: { description: string; dataPoint: string }[];
  references: {
    name: string;
    title: string;
    organization: string;
    email: string;
    phone: string;
    relationship: string;
  }[];
}) {
  return {
    nomineeName: e.nomineeName ?? "",
    nomineeTitle: e.nomineeTitle ?? "",
    nomineeCompany: e.nomineeCompany ?? "",
    nomineeEmail: e.nomineeEmail ?? "",
    nomineeLinkedinUrl: e.nomineeLinkedinUrl ?? "",
    narrative: e.narrative ?? "",
    outcomes: e.outcomes.map(({ description, dataPoint }) => ({ description, dataPoint })),
    references: e.references.map(({ name, title, organization, email, phone, relationship }) => ({
      name,
      title,
      organization,
      email,
      phone,
      relationship,
    })),
  };
}
