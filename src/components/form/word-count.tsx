"use client";

import { useEffect, useState } from "react";
import { countWords } from "@/lib/text";

/**
 * Shows the live word count for a textarea and its allowed range. The visible count
 * updates on every keystroke; the screen-reader announcement waits for a pause in typing.
 */
export function WordCount({ forId, min, max }: { forId: string; min: number; max: number }) {
  const [count, setCount] = useState(0);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const el = document.getElementById(forId) as HTMLTextAreaElement | null;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (announce: boolean) => {
      const n = countWords(el.value);
      setCount(n);
      clearTimeout(timer);
      if (announce) timer = setTimeout(() => setAnnounced(`${n} words`), 1200);
    };
    // Show the count on load without announcing it; announce after typing pauses.
    update(false);
    const onInput = () => update(true);
    el.addEventListener("input", onInput);
    return () => {
      el.removeEventListener("input", onInput);
      clearTimeout(timer);
    };
  }, [forId]);
  const inRange = count >= min && count <= max;
  return (
    <>
      <p
        id={`${forId}-count`}
        className={`text-sm font-semibold ${inRange ? "text-success" : "text-slate"}`}
      >
        {count} words ({min} to {max})
      </p>
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
    </>
  );
}
