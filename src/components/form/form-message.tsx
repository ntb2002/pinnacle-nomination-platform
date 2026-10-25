"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action-state";

/**
 * Announces a form's result. Errors take focus so keyboard and screen-reader users
 * land on the problem; successes are announced politely.
 */
export function FormMessage({ state }: { state: ActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      className={`rounded border-l-4 px-4 py-3 ${error ? "border-danger bg-danger-bg text-danger" : "border-success bg-success-bg text-success"}`}
    >
      <p className="font-semibold">{state.message}</p>
    </div>
  );
}
