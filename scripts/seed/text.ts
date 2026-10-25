/** Deterministic fake entry content for the demo (~300-word narrative). */
export function narrativeFor(name: string, company: string, categoryName: string): string {
  return [
    `${name} leads ${company} and is nominated for ${categoryName} for a year of measurable progress.`,
    `When ${name} took on the role, the business faced a familiar problem in the creator economy: audiences were growing faster than the systems built to serve them, and partners wanted proof that creator programs produced results rather than reach alone.`,
    `${name} answered with a plan that put creators and data at the center. The team rebuilt how it selects partners, moving from one-off sponsorships to multi-quarter programs with shared goals, clear reporting and fair payment terms.`,
    `Creators were brought into planning early, given access to performance dashboards and paid on a published schedule. That change alone cut late payments to near zero and raised creator retention across the program.`,
    `On the commercial side, ${name} introduced a measurement standard that brand clients now use across their own campaigns. Results were reported against agreed baselines, not vanity metrics, which made renewals easier and budgets larger.`,
    `Internally, ${name} invested in people: a mentoring program for early-career staff, a creator advisory council that meets every quarter, and transparent career paths that reduced turnover.`,
    `The work did not stop at ${company}. ${name} spoke at industry events, shared the measurement framework openly and worked with peers to draft guidelines for disclosure and fair contracts that several organizations have since adopted.`,
    `References from a long-time brand partner and a creator who has worked with ${company} for three years describe the same qualities: clear goals, honest reporting and follow-through.`,
    `This nomination documents the outcomes with specific numbers below, each tied to a source the judges can verify. Together they show sustained impact, real innovation and influence well beyond a single company, which is what this award recognizes.`,
  ].join("\n\n");
}

export const OUTCOME_TEMPLATES = [
  {
    description: "Grew creator-program revenue year over year",
    dataPoint: "+48% revenue, FY2026 vs FY2025 (audited financials)",
  },
  {
    description: "Increased creator retention in the partner program",
    dataPoint: "Retention up from 61% to 84% over 12 months",
  },
  {
    description: "Reduced average creator payment time",
    dataPoint: "From 47 days to 9 days after invoice",
  },
  { description: "Expanded brand partnerships", dataPoint: "From 22 to 57 active brand partners" },
  {
    description: "Lifted campaign performance against baseline",
    dataPoint: "2.3x conversion rate vs. prior campaigns",
  },
] as const;
