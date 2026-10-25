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
  // Not public: demonstrates that /judges lists only judges who opted in.
  {
    email: "judge6@example.org",
    name: "Leo Brandt",
    title: "Head of Creator Strategy",
    organization: "Signal Point Agency",
    bio: "Leads strategy for creator-led campaigns at a full-service agency.",
    isPublic: false,
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

export const NOMINEES = [
  ["Elena Vasquez", "Chief Executive Officer", "Brightline Creator Studios"],
  ["Noah Kim", "Co-founder and CEO", "Tandem Media Labs"],
  ["Aisha Bello", "Chief Executive Officer", "Parallax Networks"],
  ["Daniel Osei", "VP, Product Innovation", "Crestview Platforms"],
  ["Mei Tanaka", "Head of New Ventures", "Fieldnote Audio"],
  ["Lucas Ferreira", "Chief Technology Officer", "Overture Creator Tools"],
  ["Sofia Marchetti", "Creator and Founder", "Studio Marchetti"],
  ["Jamal Carter", "Creator and CEO", "Carter Makes"],
  ["Hannah Lindqvist", "Creator and Founder", "North Trail Kitchen"],
  ["Omar Haddad", "Partner, Digital Talent", "Meridian Representation"],
  ["Claire Dubois", "Talent Manager", "Bluewater Management"],
  ["Victor Nguyen", "Head of Talent", "Lantern Artists"],
  ["Rachel Stein", "SVP, Creator Partnerships", "Harbor Commerce"],
  ["Kwame Mensah", "Head of Brand Sales", "Pulse Streaming"],
  ["Isabel Cruz", "Chief Revenue Officer", "Copperleaf Media"],
  ["Ethan Brooks", "Chief Strategy Officer", "Atlas Creative Group"],
  ["Nadia Rahman", "VP, Strategy", "Kestrel Brands"],
  ["Felix Wagner", "Head of Creator Strategy", "Summit & Pine"],
  ["Grace Liu", "Managing Director", "Clearpath Creator Services"],
  ["Samuel Adeyemi", "Chief Operating Officer", "Harmonic Studios"],
  ["Olivia Hart", "Head of Creator Success", "Waypoint Platforms"],
  ["Mateo Silva", "Director of AI Products", "Northwind Creator Labs"],
  ["Ava Thompson", "VP, Generative Media", "Prism Content Co."],
  ["Hiro Sato", "Head of Applied AI", "Keystone Video"],
  ["Zara Ali", "Executive Creative Director", "Bold Signal Agency"],
  ["Benjamin Cole", "Head of Social Campaigns", "Riverbend Beverage Co."],
  ["Leila Haddad", "VP, Integrated Campaigns", "Foxglove Retail"],
  ["Peter Novak", "Chief Executive Officer", "Ridgeway Creator Fund"],
  ["Imani Brooks", "Founder and CEO", "Spark Collective"],
  ["Chen Wei", "Chief Product Officer", "Loomwork Apps"],
] as const;
