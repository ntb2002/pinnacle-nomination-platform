"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex items-center justify-center rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised disabled:opacity-70"
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
