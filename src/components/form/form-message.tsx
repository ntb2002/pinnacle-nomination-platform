"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action-state";

/**
 * Announces a form's result and takes focus. Errors list each field problem as a link
 * to the field (the error-summary pattern), so keyboard and screen-reader users can
 * jump straight to it. `labels` maps field names to the label text shown in the list.
 */
export function FormMessage({
  state,
  labels = {},
  idPrefix = "",
}: {
  state: ActionState;
  labels?: Record<string, string>;
  /** Prefix of the form's field ids, when they are not the bare field names. */
  idPrefix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle") ref.current?.focus();
  }, [state]);
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  const fieldErrors = Object.entries(state.fieldErrors ?? {}).filter(([k]) => k !== "_form");
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      className={`rounded border-l-4 px-4 py-3 ${error ? "border-danger bg-danger-bg text-danger" : "border-success bg-success-bg text-success"}`}
    >
      <p className="font-semibold">{state.message}</p>
      {error && fieldErrors.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {fieldErrors.map(([field, messages]) => (
            <li key={field}>
              <a
                href={`#${idPrefix}${field}`}
                className="underline"
                onClick={(e) => {
                  // Move focus to the field itself, not just scroll to it.
                  const target = document.getElementById(`${idPrefix}${field}`);
                  if (target) {
                    e.preventDefault();
                    target.focus();
                  }
                }}
              >
                {labels[field] ? `${labels[field]}: ` : ""}
                {messages[0]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
