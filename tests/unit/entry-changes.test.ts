import { describe, expect, it } from "vitest";
import { changedFields, contentHashes, type EntryContent } from "@/server/entry-changes";

const base: EntryContent = {
  categoryId: "c1",
  nomineeName: "Pat Example",
  nomineeTitle: "CEO",
  nomineeCompany: "Example Co.",
  nomineeEmail: "pat@example.com",
  nomineeLinkedinUrl: null,
  narrative: "Words",
  outcomes: [
    { position: 1, description: "Grew", dataPoint: "+10%" },
    { position: 2, description: "Hired", dataPoint: "12 people" },
  ],
  references: [
    {
      position: 1,
      name: "Ref",
      title: "VP",
      organization: "Org",
      email: "ref@example.org",
      phone: "+1 315 555 0100",
      relationship: "Partner",
    },
  ],
  fileHashes: ["a".repeat(64)],
};

describe("entry change summary", () => {
  it("reports nothing when nothing changed, and never contains the content", () => {
    const h = contentHashes(base);
    expect(changedFields(h, contentHashes(structuredClone(base)))).toEqual([]);
    expect(JSON.stringify(h)).not.toContain("Pat Example");
    expect(Object.values(h).every((v) => /^[0-9a-f]{64}$/.test(v))).toBe(true);
  });

  it("names changed fields, outcomes and references in form order", () => {
    const after = structuredClone(base);
    after.categoryId = "c2";
    after.narrative = "Different words";
    after.outcomes[1]!.dataPoint = "15 people";
    after.outcomes.push({ position: 3, description: "New", dataPoint: "1" });
    after.references = [];
    after.fileHashes.push("b".repeat(64));
    expect(changedFields(contentHashes(base), contentHashes(after))).toEqual([
      "Category",
      "Narrative",
      "Outcome 2",
      "Outcome 3",
      "Reference 1",
      "Supporting files",
    ]);
  });

  it("names the old category when it is known, and ignores plain context", () => {
    const before = { ...contentHashes(base), "meta.categoryName": "Top Strategist" };
    const after = contentHashes({ ...structuredClone(base), categoryId: "c9" });
    expect(changedFields(before, after)).toEqual(["Category (was Top Strategist)"]);
  });
});
