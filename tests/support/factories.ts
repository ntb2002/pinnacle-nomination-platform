import { randomUUID } from "node:crypto";
import { CATEGORIES, DEFAULT_FEES, DEFAULT_WEIGHTS } from "@/lib/program-defaults";
import {
  awardCycle,
  category,
  entry,
  entryOutcome,
  entryReference,
  judgeAssignment,
  rubricProfile,
  user,
} from "@/server/db/schema";
import { db } from "./db";

type Role = "NOMINATOR" | "JUDGE" | "ADMIN";
const DAY = 86_400_000;
let counter = 0;
const next = () => ++counter;

export async function createUser(
  role: Role = "NOMINATOR",
  overrides: Partial<typeof user.$inferInsert> = {},
) {
  const n = next();
  const [row] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `Test ${role} ${n}`,
      email: `${role.toLowerCase()}${n}@example.com`,
      role,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row!;
}

/** An active cycle whose nomination window is open at `now` (early tier). */
export async function createCycle(
  overrides: Partial<typeof awardCycle.$inferInsert> = {},
  now = new Date(),
) {
  const t = now.getTime();
  const [row] = await db
    .insert(awardCycle)
    .values({
      year: 3000 + next(),
      name: "Test cycle",
      isActive: true,
      nominationsOpenAt: new Date(t - 7 * DAY),
      earlyDeadline: new Date(t + 7 * DAY),
      regularDeadline: new Date(t + 14 * DAY),
      finalDeadline: new Date(t + 21 * DAY),
      ...DEFAULT_FEES,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function createRubricProfile(
  cycleId: string,
  weights = DEFAULT_WEIGHTS,
  key = `profile-${next()}`,
) {
  const [row] = await db
    .insert(rubricProfile)
    .values({ cycleId, key, name: key, ...weights })
    .returning();
  return row!;
}

export async function createCategory(
  cycleId: string,
  overrides: Partial<typeof category.$inferInsert> = {},
) {
  const profileId = overrides.rubricProfileId ?? (await createRubricProfile(cycleId)).id;
  const def = CATEGORIES[next() % CATEGORIES.length]!;
  const [row] = await db
    .insert(category)
    .values({
      cycleId,
      slug: `${def.slug}-${next()}`,
      name: def.name,
      description: def.description,
      kind: "CORE",
      rubricProfileId: profileId,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function createEntry(
  values: { cycleId: string; categoryId: string; nominatorId: string } & Partial<
    typeof entry.$inferInsert
  >,
) {
  const n = next();
  const [row] = await db
    .insert(entry)
    .values({
      relationship: "PEER",
      nomineeName: `Nominee ${n}`,
      nomineeEmail: `nominee${n}@example.com`,
      ...values,
    })
    .returning();
  return row!;
}

export async function assignJudge(judgeId: string, categoryId: string, round: 1 | 2 = 1) {
  const [row] = await db.insert(judgeAssignment).values({ judgeId, categoryId, round }).returning();
  return row!;
}

/** A cycle + one category + a nominator, the common starting point. */
export async function createProgram(now = new Date()) {
  const cycle = await createCycle({}, now);
  const cat = await createCategory(cycle.id);
  const nominator = await createUser("NOMINATOR");
  return { cycle, category: cat, nominator };
}

/** A DRAFT entry that passes every submission rule (ready to pay for). */
export async function createCompleteEntry(values: {
  cycleId: string;
  categoryId: string;
  nominatorId: string;
}) {
  const words = Array.from({ length: 300 }, (_, i) => ["growth", "creators", "results"][i % 3]);
  const e = await createEntry({
    ...values,
    nomineeTitle: "Chief Executive Officer",
    nomineeCompany: "Example Media Co.",
    narrative: words.join(" "),
  });
  await db.insert(entryOutcome).values([
    { entryId: e.id, position: 1, description: "Grew creator revenue", dataPoint: "+48% YoY" },
    {
      entryId: e.id,
      position: 2,
      description: "Expanded the partner program",
      dataPoint: "120 partners",
    },
  ]);
  await db.insert(entryReference).values({
    entryId: e.id,
    position: 1,
    name: "Morgan Ellis",
    title: "VP, Partnerships",
    organization: "Example Brand Co.",
    email: "morgan.ellis@example.org",
    phone: "+1 315 555 0142",
    relationship: "Brand partner for three years",
  });
  return e;
}
