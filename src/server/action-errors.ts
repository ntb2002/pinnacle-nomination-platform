import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { AppError, ValidationError } from "@/server/errors";

/**
 * Maps a thrown error to a user-safe form state. Known AppErrors carry their own
 * public message; anything else is logged server-side and shown generically.
 * Next's redirect()/forbidden()/notFound() signals are re-thrown untouched.
 */
export function toActionState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof ValidationError) {
    return { status: "error", message: err.publicMessage, fieldErrors: err.fieldErrors };
  }
  if (err instanceof AppError) return { status: "error", message: err.publicMessage };
  console.error("Unhandled action error:", err instanceof Error ? err.message : err);
  return { status: "error", message: "Something went wrong. Please try again." };
}
