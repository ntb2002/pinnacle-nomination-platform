/** Result of a server action, rendered by forms via useActionState. */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const idleState: ActionState = { status: "idle" };
