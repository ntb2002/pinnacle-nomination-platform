import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/paths";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/entries")).toBe("/entries");
    expect(safeNextPath("/admin/entries?status=SUBMITTED")).toBe("/admin/entries?status=SUBMITTED");
  });
  it("rejects open redirects", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "entries",
      "/%0d%0aSet-Cookie:x",
      "\n/x",
    ]) {
      expect(safeNextPath(bad), bad).toMatch(/^\/(?!\/)/);
      expect(safeNextPath(bad)).not.toContain("evil");
    }
    expect(safeNextPath(null)).toBe("/");
  });
});
