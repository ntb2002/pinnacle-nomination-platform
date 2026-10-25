// Invented people for the demo. Emails use reserved example domains only
// (RFC 2606); a test fails the build if any other domain appears.

export const ADMIN = { email: "admin@example.org", name: "Avery Morgan" };

export const JUDGES = [
  {
    email: "judge1@example.org",
    name: "Dana Whitfield",
    title: "Professor of Communications",
    organization: "Northbridge University",
    bio: "Researches platform economics and creator labor markets. Former head of insights at a national media group.",
  },
  {
    email: "judge2@example.org",
    name: "Marcus Ellery",
    title: "Managing Partner",
    organization: "Ellery Ventures",
    bio: "Invests in creator tools and media businesses. Previously led partnerships at a video platform.",
  },
  {
    email: "judge3@example.org",
    name: "Priya Raman",
    title: "Chief Marketing Officer",
    organization: "Lumen Consumer Brands",
    bio: "Built one of the first in-house creator marketing teams at a consumer goods company.",
  },
  {
    email: "judge4@example.org",
    name: "Tomás Herrera",
    title: "Founder",
    organization: "Herrera Talent Group",
    bio: "Represents creators across video, audio and live events. Advises on brand deal standards.",
  },
  {
    email: "judge5@example.org",
    name: "Grace Okafor",
    title: "Editor at Large",
    organization: "The Creator Ledger",
    bio: "Covers the business of the creator economy. Twenty years in business journalism.",
  },
  {
    email: "judge6@example.org",
    name: "Leo Brandt",
    title: "Head of Creator Strategy",
    organization: "Signal Point Agency",
    bio: "Leads strategy for creator-led campaigns at a full-service agency.",
  },
] as const;

export const NOMINATORS = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  const names = [
    "Jordan Blake",
    "Casey Lin",
    "Riley Patel",
    "Morgan Reyes",
    "Taylor Brooks",
    "Jamie Cho",
    "Alex Moreno",
    "Sam Whitaker",
    "Robin Ahmed",
    "Drew Kowalski",
    "Quinn Foster",
    "Harper Diaz",
  ];
  return { email: `nominator${n}@example.com`, name: names[i]! };
});

// Invented names and deliberately unusual company names, combined deterministically.
const FIRST = [
  "Elena",
  "Noah",
  "Aisha",
  "Daniel",
  "Mei",
  "Lucas",
  "Sofia",
  "Jamal",
  "Hannah",
  "Omar",
  "Claire",
  "Victor",
  "Rachel",
  "Kwame",
  "Isabel",
  "Ethan",
  "Nadia",
  "Felix",
  "Grace",
  "Samuel",
  "Olivia",
];
const LAST = [
  "Vasquez",
  "Kimura",
  "Bello",
  "Osei",
  "Tanaka",
  "Ferreira",
  "Marchetti",
  "Carter",
  "Lindqvist",
  "Haddad",
  "Dubois",
  "Nguyen",
  "Steinberg",
  "Mensah",
  "Cruz",
  "Brookfield",
  "Rahman",
  "Wagner",
  "Liu",
  "Adeyemi",
  "Hartwell",
];
const COMPANY_PREFIX = [
  "Quillfeather",
  "Emberlight",
  "Tallow & Finch",
  "Corvid",
  "Marigold Lane",
  "Copperkettle",
  "Bramblewood",
  "Saltmarsh",
  "Juniper Hollow",
];
const COMPANY_SUFFIX = [
  "Studios",
  "Media Labs",
  "Creator Co.",
  "Talent",
  "Partners",
  "Networks",
  "Collective",
];

/** Nominee i (0-based): unique name and company for i < 63. */
export function nominee(i: number) {
  return {
    name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / 3) % LAST.length]}`,
    company: `${COMPANY_PREFIX[i % COMPANY_PREFIX.length]} ${COMPANY_SUFFIX[Math.floor(i / COMPANY_PREFIX.length) % COMPANY_SUFFIX.length]}`,
  };
}

/** Typical nominee titles per category slug. */
export const TITLES: Record<string, string> = {
  "ceo-of-the-year": "Chief Executive Officer",
  "innovator-of-the-year": "VP, Product Innovation",
  "creator-of-the-year": "Creator and Founder",
  "agent-manager-of-the-year": "Talent Manager",
  "top-sales-leader": "Chief Revenue Officer",
  "top-strategist": "Chief Strategy Officer",
  "top-service-leader": "Managing Director",
  "best-use-of-genai": "Head of Applied AI",
  "most-innovative-campaign": "Executive Creative Director",
};
