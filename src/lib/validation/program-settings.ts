import { z } from "zod";
import { endOfDayDeadline, zonedToUtc } from "@/lib/zoned-time";

const dollars = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `Enter the ${label}`, abort: true })
    .regex(/^\d+$/, `Enter the ${label} in whole dollars, digits only`)
    .pipe(
      z.coerce
        .number<string>({ error: `Enter the ${label} in whole dollars` })
        .int(`Enter the ${label} in whole dollars`)
        .min(1, `The ${label} must be at least $1`)
        .max(100_000, `The ${label} must be $100,000 or less`),
    );

const dateField = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label} as a date`);

const datesSchema = z.object({
  opensDate: dateField("opening date"),
  opensTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter the opening time, like 09:00"),
  earlyDate: dateField("early deadline"),
  regularDate: dateField("regular deadline"),
  finalDate: dateField("final deadline"),
});

/** The judging window is optional (blank until confirmed): both dates or neither. */
const judgingSchema = z.object({
  judgingOpensDate: z
    .string()
    .optional()
    .transform((v) => v?.trim() ?? ""),
  judgingClosesDate: z
    .string()
    .optional()
    .transform((v) => v?.trim() ?? ""),
});

const feesSchema = z.object({
  earlyFee: dollars("early fee"),
  regularFee: dollars("regular fee"),
  lateFee: dollars("late fee"),
  finalistFee: dollars("finalist package fee"),
});

/**
 * Cycle settings as entered in the admin form: Eastern dates/times and whole dollars,
 * returned as exclusive UTC deadlines and cents. Dates and fees are validated
 * independently so every problem is reported in one pass.
 */
export function parseCycleSettings(
  raw: Record<string, unknown>,
):
  | { success: true; data: CycleSettings }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const add = (field: string, message: string) => (errors[field] ??= []).push(message);
  const dates = datesSchema.safeParse(raw);
  const fees = feesSchema.safeParse(raw);
  for (const r of [dates, fees]) {
    if (!r.success) for (const i of r.error.issues) add(String(i.path[0] ?? "_form"), i.message);
  }
  let window: Omit<CycleSettings, keyof FeeCents | keyof JudgingWindow> | undefined;
  if (dates.success) {
    const v = dates.data;
    const nominationsOpenAt = zonedToUtc(v.opensDate, v.opensTime);
    const earlyDeadline = endOfDayDeadline(v.earlyDate);
    const regularDeadline = endOfDayDeadline(v.regularDate);
    const finalDeadline = endOfDayDeadline(v.finalDate);
    if (!nominationsOpenAt) add("opensDate", "Enter a real opening date and time");
    if (!earlyDeadline) add("earlyDate", "Enter a real early deadline");
    if (!regularDeadline) add("regularDate", "Enter a real regular deadline");
    if (!finalDeadline) add("finalDate", "Enter a real final deadline");
    if (nominationsOpenAt && earlyDeadline && earlyDeadline <= nominationsOpenAt) {
      add("earlyDate", "The early deadline must be after nominations open");
    }
    if (earlyDeadline && regularDeadline && regularDeadline <= earlyDeadline) {
      add("regularDate", "The regular deadline must be after the early deadline");
    }
    if (regularDeadline && finalDeadline && finalDeadline <= regularDeadline) {
      add("finalDate", "The final deadline must be after the regular deadline");
    }
    if (nominationsOpenAt && earlyDeadline && regularDeadline && finalDeadline) {
      window = { nominationsOpenAt, earlyDeadline, regularDeadline, finalDeadline };
    }
  }
  const judgingInput = judgingSchema.safeParse(raw);
  if (!judgingInput.success)
    for (const i of judgingInput.error.issues) add(String(i.path[0] ?? "_form"), "Enter a date");
  const judging = judgingInput.success
    ? parseJudgingWindow(judgingInput.data, window?.finalDeadline, add)
    : null;
  // Fees escalate by deadline: a later tier never costs less than an earlier one.
  if (fees.success) {
    const f = fees.data;
    if (f.regularFee < f.earlyFee)
      add("regularFee", "The regular fee cannot be lower than the early fee");
    if (f.lateFee < f.regularFee)
      add("lateFee", "The late fee cannot be lower than the regular fee");
  }
  if (Object.keys(errors).length > 0 || !window || !judging || !fees.success) {
    return { success: false, fieldErrors: errors };
  }
  return {
    success: true,
    data: {
      ...window,
      ...judging,
      earlyFeeCents: fees.data.earlyFee * 100,
      regularFeeCents: fees.data.regularFee * 100,
      lateFeeCents: fees.data.lateFee * 100,
      finalistFeeCents: fees.data.finalistFee * 100,
    },
  };
}

function parseJudgingWindow(
  v: { judgingOpensDate: string; judgingClosesDate: string },
  finalDeadline: Date | undefined,
  add: (field: string, message: string) => void,
): JudgingWindow | null {
  if (!v.judgingOpensDate && !v.judgingClosesDate)
    return { judgingOpensAt: null, judgingClosesAt: null };
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const opens = day.test(v.judgingOpensDate) ? zonedToUtc(v.judgingOpensDate) : null;
  const closes = day.test(v.judgingClosesDate) ? endOfDayDeadline(v.judgingClosesDate) : null;
  if (!opens) add("judgingOpensDate", "Enter the date judging opens, or clear both dates");
  if (!closes) add("judgingClosesDate", "Enter the date judging closes, or clear both dates");
  if (!opens || !closes) return null;
  if (finalDeadline && opens < finalDeadline) {
    add("judgingOpensDate", "Judging opens after the final deadline");
    return null;
  }
  if (closes <= opens) {
    add("judgingClosesDate", "Judging closes on or after the day it opens");
    return null;
  }
  return { judgingOpensAt: opens, judgingClosesAt: closes };
}

interface JudgingWindow {
  judgingOpensAt: Date | null;
  judgingClosesAt: Date | null;
}

interface FeeCents {
  earlyFeeCents: number;
  regularFeeCents: number;
  lateFeeCents: number;
  finalistFeeCents: number;
}

export interface CycleSettings extends FeeCents, JudgingWindow {
  nominationsOpenAt: Date;
  earlyDeadline: Date;
  regularDeadline: Date;
  finalDeadline: Date;
}

const weight = z
  .string()
  .trim()
  .min(1, { message: "Enter a weight (0 to 100)", abort: true })
  .regex(/^\d+$/, "Weights are whole numbers from 0 to 100")
  .pipe(z.coerce.number<string>().max(100, "A weight cannot exceed 100"));

const rubricWeightsSchema = z.object({
  weightImpact: weight,
  weightInnovation: weight,
  weightInfluence: weight,
  weightReferences: weight,
});
export type RubricWeights = z.output<typeof rubricWeightsSchema>;

/** Four whole-number weights; the "add up to 100" rule is checked only once each is valid. */
export function parseRubricWeights(
  raw: Record<string, unknown>,
):
  | { success: true; data: RubricWeights }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const r = rubricWeightsSchema.safeParse(raw);
  if (!r.success) {
    const errors: Record<string, string[]> = {};
    for (const i of r.error.issues) (errors[String(i.path[0])] ??= []).push(i.message);
    return { success: false, fieldErrors: errors };
  }
  const w = r.data;
  if (w.weightImpact + w.weightInnovation + w.weightInfluence + w.weightReferences !== 100) {
    return { success: false, fieldErrors: { total: ["The four weights must add up to 100"] } };
  }
  return { success: true, data: w };
}

export const categoryUpdateSchema = z.object({
  description: z
    .string()
    .trim()
    .min(20, "Write at least 20 characters")
    .max(600, "Keep the description under 600 characters"),
  rubricProfileId: z.uuid("Choose a rubric"),
  enabled: z.boolean(),
});
