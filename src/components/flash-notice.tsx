"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The result of a redirect-based action (e.g. "File uploaded."), focused when it
 * appears so screen readers announce it and keyboard users continue from it. Give it a
 * `key` that changes per result, so a repeated action remounts it and it focuses again.
 * A newer message on the page can hide it by dispatching `flash-notice:clear`.
 */
export function FlashNotice({ id, error, text }: { id: string; error: boolean; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus({ preventScroll: true });
    const hide = () => setHidden(true);
    window.addEventListener(CLEAR_EVENT, hide);
    return () => window.removeEventListener(CLEAR_EVENT, hide);
  }, []);
  if (hidden) return null;
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

export const CLEAR_EVENT = "flash-notice:clear";
