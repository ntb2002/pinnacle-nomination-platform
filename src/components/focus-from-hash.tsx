"use client";

import { useEffect } from "react";

/**
 * When a page is opened at "#field-id" (e.g. from the review page's list of problems),
 * focus that field and centre it, so its label and error are visible and keyboard users
 * continue from there.
 */
export function FocusFromHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    // A group (fieldset) can be taller than the screen: show its legend at the top.
    el.scrollIntoView({ block: el.tagName === "FIELDSET" ? "start" : "center" });
    el.focus({ preventScroll: true });
  }, []);
  return null;
}
