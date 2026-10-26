import { z } from "zod";

/** The latest status event the admin's page was showing (stale-page guard). */
const version = z.uuid().optional().catch(undefined);

/** An admin returning an entry: a reason and a message the nominator will read. */
export const returnEntrySchema = z.object({
  version,
  reason: z.enum(["INCOMPLETE", "WRONG_CATEGORY", "OTHER"], {
    error: "Choose why the entry is being returned",
  }),
  message: z
    .string()
    .trim()
    .min(10, "Write a message of at least 10 characters telling the nominator what to change")
    .max(1000, "Keep the message under 1,000 characters"),
});

/** Optional internal note on approval (admins only). */
export const approveEntrySchema = z.object({
  version,
  note: z.string().trim().max(500, "Keep the note under 500 characters").optional(),
});
