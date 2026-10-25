import { z } from "zod";

/** Email as entered by a person: trimmed, lowercased, length-limited. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email address is too long")
  .pipe(z.email("Enter a valid email address, like name@example.com"));
