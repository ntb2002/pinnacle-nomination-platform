/**
 * The Pinnacle program as published: categories, rubric weights, default fees and
 * dates. Used by the seed (scripts/seed) and test factories. Admins change the live
 * values in the app (#6); this file only sets the starting point for a new cycle.
 *
 * TODO(copy): category descriptions are placeholders for CCE staff to replace.
 * TODO(dates): early/regular/final deadlines after the Jan 26, 2027 opening are
 * placeholders pending CCE confirmation (docs/status.md → Needs human).
 */

export type RubricProfileKey = "executive" | "initiative";

export interface RubricWeights {
  weightImpact: number;
  weightInnovation: number;
  weightInfluence: number;
  weightReferences: number;
}

export const RUBRIC_CRITERIA = [
  { key: "impact", weightKey: "weightImpact", label: "Impact & Results" },
  { key: "innovation", weightKey: "weightInnovation", label: "Innovation" },
  { key: "influence", weightKey: "weightInfluence", label: "Industry Influence" },
  { key: "referenceValidation", weightKey: "weightReferences", label: "Reference Validation" },
] as const;

/** Published default weighting: Impact 40, Innovation 20, Influence 20, References 20. */
export const DEFAULT_WEIGHTS: RubricWeights = {
  weightImpact: 40,
  weightInnovation: 20,
  weightInfluence: 20,
  weightReferences: 20,
};

export const RUBRIC_PROFILES: { key: RubricProfileKey; name: string; weights: RubricWeights }[] = [
  { key: "executive", name: "Individual executive categories", weights: DEFAULT_WEIGHTS },
  { key: "initiative", name: "Initiative and campaign categories", weights: DEFAULT_WEIGHTS },
];

export interface CategoryDefinition {
  slug: string;
  name: string;
  kind: "CORE" | "OPTIONAL";
  rubric: RubricProfileKey;
  description: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    slug: "ceo-of-the-year",
    name: "CEO of the Year",
    kind: "CORE",
    rubric: "executive",
    description:
      "The chief executive whose leadership most advanced their company and the creator economy over the past year.",
  },
  {
    slug: "innovator-of-the-year",
    name: "Innovator of the Year",
    kind: "CORE",
    rubric: "executive",
    description:
      "The executive behind a new product, model or practice that changed how creators or brands work.",
  },
  {
    slug: "creator-of-the-year",
    name: "Creator of the Year",
    kind: "CORE",
    rubric: "executive",
    description:
      "The creator who built a business, not just an audience: measurable growth, durable revenue and influence on peers.",
  },
  {
    slug: "agent-manager-of-the-year",
    name: "Agent/Manager of the Year",
    kind: "CORE",
    rubric: "executive",
    description:
      "The talent agent or manager whose representation produced exceptional outcomes for the creators they serve.",
  },
  {
    slug: "top-sales-leader",
    name: "Top Sales Leader",
    kind: "CORE",
    rubric: "executive",
    description:
      "The sales leader who grew creator-economy revenue through partnerships, sponsorships or platform deals.",
  },
  {
    slug: "top-strategist",
    name: "Top Strategist",
    kind: "CORE",
    rubric: "executive",
    description:
      "The strategist whose plan reshaped a brand, agency or platform's position in the creator economy.",
  },
  {
    slug: "top-service-leader",
    name: "Top Service Leader of the Year",
    kind: "CORE",
    rubric: "executive",
    description:
      "The leader of a service organization (agency, studio, tools or support) that raised the standard for creators and clients.",
  },
  {
    slug: "best-use-of-genai",
    name: "Best Use of GenAI",
    kind: "OPTIONAL",
    rubric: "initiative",
    description:
      "The executive who applied generative AI to creator work responsibly, with measurable results.",
  },
  {
    slug: "most-innovative-campaign",
    name: "Most Innovative Campaign of the Year",
    kind: "OPTIONAL",
    rubric: "initiative",
    description:
      "The executive who led a creator-driven campaign that set a new bar for creativity and results.",
  },
];

/** Default fees in cents. TODO(fees): finalist package fee is a placeholder pending CCE. */
export const DEFAULT_FEES = {
  earlyFeeCents: 50_000,
  regularFeeCents: 65_000,
  lateFeeCents: 80_000,
  finalistFeeCents: 150_000,
};

/**
 * 2027 cycle dates as UTC instants. Each deadline is exclusive: an entry is in a tier
 * while now < deadline. Opening is 9:00 a.m. Eastern; deadlines are midnight Eastern
 * at the end of the named day.
 */
export const CYCLE_2027 = {
  year: 2027,
  name: "2027 Pinnacle Awards",
  nominationsOpenAt: new Date("2027-01-26T14:00:00Z"), // Tue Jan 26, 9:00 a.m. EST
  earlyDeadline: new Date("2027-02-27T05:00:00Z"), // end of Fri Feb 26 EST
  regularDeadline: new Date("2027-03-27T04:00:00Z"), // end of Fri Mar 26 EDT
  finalDeadline: new Date("2027-04-24T04:00:00Z"), // end of Fri Apr 23 EDT
};
