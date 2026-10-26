import { z } from "zod";
import { emailSchema } from "./common";

const text = (label: string, max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? `Enter the ${label}` : undefined)
    .max(max, `Keep the ${label} under ${max} characters`);

/** Admin inviting a judge: who they are, as shown on the public panel. */
export const inviteJudgeSchema = z.object({
  email: emailSchema,
  displayName: text("judge's name", 120, 2),
  title: text("title", 120),
  organization: text("organization", 160),
});

/** Admin editing a judge's public profile. */
export const judgeProfileSchema = z.object({
  displayName: text("judge's name", 120, 2),
  title: text("title", 120),
  organization: text("organization", 160),
  bio: text("bio", 1500),
  isPublic: z.boolean(),
  sortOrder: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Enter a whole number from 0 to 999")
    .pipe(z.coerce.number<string>()),
});

/** A judge's declaration for one entry. A conflict needs a reason. */
export const declarationSchema = z
  .object({
    conflict: z.enum(["no", "yes"], { error: "Choose whether you have a conflict" }),
    reason: z.string().trim().max(500, "Keep the reason under 500 characters").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.conflict === "yes" && (v.reason ?? "").length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say briefly why you have a conflict (at least 5 characters)",
      });
    }
  });

/** An admin recording or clearing a recusal always gives a reason. */
export const adminConflictSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters")
    .max(500, "Keep the reason under 500 characters"),
});
