import { z } from "zod";

const criterion = z
  .string()
  .trim()
  .refine((v) => v === "" || /^(10|[1-9])$/.test(v), "Choose a whole number from 1 to 10")
  .transform((v) => (v === "" ? null : Number(v)));

/** A judge's score form: drafts may be partial; submitting needs every criterion. */
export const scoreSchema = z
  .object({
    impact: criterion,
    innovation: criterion,
    influence: criterion,
    referenceValidation: criterion,
    comment: z.string().trim().max(2000, "Keep the comment under 2,000 characters"),
    intent: z.enum(["draft", "submit"]),
  })
  .superRefine((v, ctx) => {
    if (v.intent !== "submit") return;
    for (const k of ["impact", "innovation", "influence", "referenceValidation"] as const) {
      if (v[k] === null)
        ctx.addIssue({
          code: "custom",
          path: [k],
          message: "Score this criterion before submitting",
        });
    }
  });
