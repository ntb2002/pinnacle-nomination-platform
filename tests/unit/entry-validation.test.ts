import { describe, expect, it } from "vitest";
import { entryFormToDraft } from "@/lib/entry-form";
import { readinessProblems } from "@/lib/validation/entry";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const outcome = { description: "Grew revenue", dataPoint: "+48% YoY (audited)" };
const reference = {
  name: "Morgan Ellis",
  title: "VP Partnerships",
  organization: "Example Brand Co.",
  email: "morgan@example.org",
  phone: "+1 315 555 0100",
  relationship: "Brand partner for three years",
};
const complete = {
  nomineeName: "Pat Example",
  nomineeTitle: "CEO",
  nomineeCompany: "Example Co.",
  nomineeEmail: "pat@example.com",
  nomineeLinkedinUrl: "",
  narrative: words(300),
  outcomes: [outcome, outcome],
  references: [reference],
};
const problems = (patch: Partial<typeof complete>) =>
  Object.keys(readinessProblems({ ...complete, ...patch }));

describe("readinessProblems", () => {
  it("accepts a complete entry", () => {
    expect(readinessProblems(complete)).toEqual({});
  });

  it("enforces the 250-500 word narrative at the boundaries", () => {
    expect(problems({ narrative: words(249) })).toEqual(["narrative"]);
    expect(problems({ narrative: words(250) })).toEqual([]);
    expect(problems({ narrative: words(500) })).toEqual([]);
    expect(problems({ narrative: words(501) })).toEqual(["narrative"]);
  });

  it("requires 2-3 outcomes, each with a data point", () => {
    expect(problems({ outcomes: [outcome] })).toEqual(["outcomes"]);
    expect(problems({ outcomes: [outcome, outcome, outcome] })).toEqual([]);
    expect(problems({ outcomes: [outcome, outcome, outcome, outcome] })).toEqual(["outcomes"]);
    expect(problems({ outcomes: [outcome, { description: "x", dataPoint: "" }] })).toEqual([
      "outcomes.1.dataPoint",
    ]);
  });

  it("requires 1-2 references with valid contact details", () => {
    expect(problems({ references: [] })).toEqual(["references"]);
    expect(problems({ references: [reference, reference] })).toEqual([]);
    expect(problems({ references: [reference, reference, reference] })).toEqual(["references"]);
    expect(
      problems({ references: [{ ...reference, email: "nope", phone: "call me" }] }).sort(),
    ).toEqual(["references.0.email", "references.0.phone"]);
  });

  it("validates nominee email and LinkedIn URL", () => {
    expect(problems({ nomineeEmail: "not-an-email" })).toEqual(["nomineeEmail"]);
    expect(problems({ nomineeLinkedinUrl: "https://evil.example/in/pat" })).toEqual([
      "nomineeLinkedinUrl",
    ]);
    expect(problems({ nomineeLinkedinUrl: "https://www.linkedin.com/in/pat-example" })).toEqual([]);
  });
});

describe("entryFormToDraft", () => {
  it("builds rows from flat fields and drops blank optional rows", () => {
    const draft = entryFormToDraft([
      ["nomineeName", "Pat"],
      ["outcomes.0.description", "A"],
      ["outcomes.0.dataPoint", "1"],
      ["outcomes.1.description", " "],
      ["outcomes.1.dataPoint", ""],
      ["outcomes.2.description", "C"],
      ["outcomes.2.dataPoint", "3"],
      ["references.0.name", "Morgan"],
      ["references.5.name", "ignored"],
      ["role", "ADMIN"],
    ]);
    expect(draft.outcomes).toEqual([
      { description: "A", dataPoint: "1" },
      { description: "C", dataPoint: "3" },
    ]);
    expect(draft.references).toHaveLength(1);
    expect(draft).not.toHaveProperty("role");
    expect(draft.nomineeName).toBe("Pat");
  });
});
