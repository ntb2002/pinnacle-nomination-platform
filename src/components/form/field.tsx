import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  /** Mark invalid because of an error shown elsewhere (its element id), e.g. a form total. */
  invalidBecause?: string;
}

/**
 * Labelled input with hint and error text wired up for assistive tech
 * (aria-describedby, aria-invalid). Use for every text-like input.
 */
export function Field({
  id,
  label,
  hint,
  errors,
  invalidBecause,
  className,
  ...input
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId, invalidBecause].filter(Boolean).join(" ") || undefined;
  const invalid = !!errorId || !!invalidBecause;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-slate">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {errors!.join(" ")}
        </p>
      )}
      <input
        id={id}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded border-2 bg-surface px-3 py-2 text-base text-ink ${invalid ? "border-danger" : "border-control"} ${className ?? ""}`}
        {...input}
      />
    </div>
  );
}
