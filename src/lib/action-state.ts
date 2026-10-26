/** Result of a server action, rendered by forms via useActionState. */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Submitted values to show again after an error (React resets the form on submit). */
  values?: Record<string, string>;
}

export const idleState: ActionState = { status: "idle" };
