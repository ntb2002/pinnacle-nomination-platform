import { z } from "zod";

/** The admin's finalist choice for one category (#12). The rule itself is checkSelection. */
export const finalistSelectionSchema = z.object({
  count: z.coerce.number().int().min(1).max(5),
  entryIds: z.array(z.uuid()).max(50),
  reason: z.string().trim().max(1000, "Keep the reason under 1,000 characters"),
});

/** Reopening round one (before announcement) needs a reason for the audit log. */
export const reopenSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters")
    .max(500, "Keep the reason under 500 characters"),
});
