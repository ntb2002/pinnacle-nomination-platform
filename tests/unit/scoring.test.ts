import { describe, expect, it } from "vitest";
import {
  allowedCounts,
  checkSelection,
  cutoffTie,
  entryScore,
  rank,
  weightedScore,
  type Ranked,
} from "@/lib/scoring";

const standard = {
  weightImpact: 40,
  weightInnovation: 20,
  weightInfluence: 20,
  weightReferences: 20,
};
const creator = {
  weightImpact: 30,
  weightInnovation: 30,
  weightInfluence: 30,
  weightReferences: 10,
};
const s = (impact: number, innovation: number, influence: number, referenceValidation: number) => ({
  impact,
  innovation,
  influence,
  referenceValidation,
});

describe("weighted score", () => {
  it("is Σ(score × weight) / 10 on a 10-100 scale, per rubric profile", () => {
    expect(weightedScore(s(10, 10, 10, 10), standard)).toBe(100);
    expect(weightedScore(s(1, 1, 1, 1), standard)).toBe(10);
    expect(weightedScore(s(8, 6, 7, 9), standard)).toBe(76); // (320+120+140+180)/10
    expect(weightedScore(s(8, 6, 7, 9), creator)).toBe(72); // (240+180+210+90)/10
  });

  it("averages only submitted, unrecused judges", () => {
    const r = entryScore(
      [
        { judgeId: "a", criteria: s(8, 8, 8, 8), submitted: true, recused: false },
        { judgeId: "b", criteria: s(6, 6, 6, 6), submitted: true, recused: false },
        { judgeId: "c", criteria: s(1, 1, 1, 1), submitted: false, recused: false }, // draft
        { judgeId: "d", criteria: s(10, 10, 10, 10), submitted: true, recused: true }, // conflict
      ],
      standard,
    );
    expect(r).toEqual({ mean: 70, sd: 10, count: 2 });
    expect(entryScore([], standard)).toEqual({ mean: null, sd: null, count: 0 });
  });
});

const r = (entryId: string, mean: number | null): Ranked => ({
  entryId,
  mean,
  count: mean === null ? 0 : 2,
});

describe("ranking and the cut-off", () => {
  it("ranks by mean, unscored last", () => {
    expect(rank([r("a", 70), r("b", null), r("c", 90), r("d", 80)]).map((x) => x.entryId)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("allows 3-5 finalists, or all entries when fewer than 3", () => {
    expect(allowedCounts(7)).toEqual([3, 4, 5]);
    expect(allowedCounts(4)).toEqual([3, 4]);
    expect(allowedCounts(2)).toEqual([2]);
    expect(allowedCounts(0)).toEqual([]);
  });

  it("detects a tie at the cut to 2 decimal places", () => {
    const ranked = rank([r("a", 90), r("b", 80), r("c", 75.004), r("d", 74.996), r("e", 60)]);
    expect(cutoffTie(ranked, 3)).toEqual({ above: ["a", "b"], tied: ["c", "d"], slots: 1 });
    expect(cutoffTie(ranked, 4)).toBeNull(); // the tie sits inside the top 4
    expect(cutoffTie(rank([r("a", 90), r("b", 80), r("c", 75.01), r("d", 75)]), 3)).toBeNull();
  });
});

describe("finalist selection rule", () => {
  const ranked = rank([r("a", 90), r("b", 80), r("c", 70), r("d", 60), r("e", 50), r("f", 40)]);

  it("accepts exactly the top N", () => {
    expect(checkSelection(ranked, 3, ["c", "a", "b"], "")).toEqual({ ok: true, tiebreak: false });
  });

  it("rejects 2 or 6 finalists, skipping a higher entry, and duplicates", () => {
    expect(checkSelection(ranked, 2, ["a", "b"], "").ok).toBe(false);
    expect(checkSelection(ranked, 6, ["a", "b", "c", "d", "e", "f"], "").ok).toBe(false);
    expect(checkSelection(ranked, 3, ["a", "b", "d"], "")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/top 3/),
    });
    expect(checkSelection(ranked, 3, ["a", "a", "b"], "").ok).toBe(false);
  });

  it("allows a choice only among entries tied at the cut, with a reason", () => {
    const tied = rank([r("a", 90), r("b", 80), r("c", 70), r("d", 70), r("e", 50)]);
    expect(checkSelection(tied, 3, ["a", "b", "c"], "")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Explain/),
    });
    expect(checkSelection(tied, 3, ["a", "b", "e"], "Reason for picking e")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/tied/),
    });
    expect(checkSelection(tied, 3, ["a", "c", "d"], "Reason enough here")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/above the tie/),
    });
    expect(checkSelection(tied, 3, ["a", "b", "d"], "Stronger reference validation")).toEqual({
      ok: true,
      tiebreak: true,
    });
  });

  it("refuses while any entry is unscored", () => {
    expect(
      checkSelection(rank([r("a", 90), r("b", 80), r("c", null)]), 3, ["a", "b", "c"], "").ok,
    ).toBe(false);
  });
});
