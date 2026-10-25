"use client";

import { useEffect, useRef } from "react";

/**
 * The result of a redirect-based action (e.g. "File uploaded."), focused when it
 * appears so screen readers announce it and keyboard users continue from it. Give it a
 * `key` that changes per result, so a repeated action remounts it and it focuses again.
 */
export function FlashNotice({ id, error, text }: { id: string; error: boolean; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <p
      ref={ref}
      id={id}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      className={`mt-4 rounded border-l-4 px-4 py-3 font-semibold ${error ? "border-danger bg-danger-bg text-danger" : "border-success bg-success-bg text-success"}`}
    >
      {text}
    </p>
  );
}
