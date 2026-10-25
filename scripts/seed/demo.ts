import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db";
import { entryFeeFor } from "@/lib/pricing";
import { CATEGORIES } from "@/lib/program-defaults";
import {
  awardCycle,
  entry,
  entryOutcome,
  entryReference,
  entryStatusEvent,
  judgeAssignment,
  judgeProfile,
  payment,
  user,
} from "@/server/db/schema";
import { stableId } from "./ids";
import { ADMIN, JUDGES, NOMINATORS, nominee, TITLES } from "./people";
import { categoryIdsBySlug } from "./program";
import { narrativeFor, OUTCOME_TEMPLATES } from "./text";

type Status = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
interface SeedEvent {
  key: string;
  fromStatus: Status;
  toStatus: Status;
  actorId: string;
  returnReason?: "INCOMPLETE" | "WRONG_CATEGORY";
  note?: string;
}

const PER_CATEGORY = 7;
const relationships = ["SELF", "PEER", "STAFF"] as const;

/**
 * Per category: 5 approved, 1 submitted, and 1 returned (first three categories)
 * or draft (the rest). 63 entries: 45 approved, 9 submitted, 3 returned, 6 drafts.
 */
function statusFor(categoryIndex: number, slot: number): Status {
  if (slot < 5) return "APPROVED";
  if (slot === 5) return "SUBMITTED";
  return categoryIndex < 3 ? "RETURNED" : "DRAFT";
}

async function seedUsers(db: Database) {
  const rows = [
    { ...ADMIN, role: "ADMIN" as const },
    ...JUDGES.map((j) => ({ email: j.email, name: j.name, role: "JUDGE" as const })),
    ...NOMINATORS.map((n) => ({ ...n, role: "NOMINATOR" as const })),
  ];
  await db
    .insert(user)
    .values(rows.map((r) => ({ id: stableId(`user:${r.email}`), ...r, emailVerified: true })))
    .onConflictDoNothing({ target: user.email });
  const found = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      inArray(
        user.email,
        rows.map((r) => r.email),
      ),
    );
  const ids = new Map(found.map((u) => [u.email, u.id]));
  return (email: string) => {
    const id = ids.get(email);
    if (!id) throw new Error(`seed: user ${email} missing`);
    return id;
  };
}

async function seedJudges(db: Database, idOf: (email: string) => string, categoryIds: string[]) {
  await db
    .insert(judgeProfile)
    .values(
      JUDGES.map((j, i) => ({
        userId: idOf(j.email),
        displayName: j.name,
        title: j.title,
        organization: j.organization,
        bio: j.bio,
        isPublic: true,
        sortOrder: i + 1,
      })),
    )
    .onConflictDoNothing();
  // Each category gets two judges per round; each judge covers three categories.
  const rows = categoryIds.flatMap((categoryId, ci) =>
    [ci % JUDGES.length, (ci + 3) % JUDGES.length].flatMap((ji) =>
      [1, 2].map((round) => ({
        id: stableId(`assign:${ci}:${ji}:${round}`),
        judgeId: idOf(JUDGES[ji]!.email),
        categoryId,
        round,
      })),
    ),
  );
  await db.insert(judgeAssignment).values(rows).onConflictDoNothing();
}

export async function seedDemo(db: Database, cycleId: string, now: Date) {
  const idOf = await seedUsers(db);
  const adminId = idOf(ADMIN.email);
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.id, cycleId));
  if (!cycle) throw new Error("seed: cycle missing");
  const categories = await categoryIdsBySlug(db, cycleId);
  const cats = CATEGORIES.map((c) => categories.get(c.slug)!);
  await seedJudges(
    db,
    idOf,
    cats.map((c) => c.id),
  );

  // Submissions are spread from opening day up to now (or the first 50 days of a future cycle).
  const open = cycle.nominationsOpenAt.getTime();
  const span =
    Math.max(Math.min(now.getTime(), cycle.finalDeadline.getTime()) - open, 0) || 50 * 86_400_000;
  const total = cats.length * PER_CATEGORY;

  for (let i = 0; i < total; i++) {
    const ci = Math.floor(i / PER_CATEGORY);
    const status = statusFor(ci, i % PER_CATEGORY);
    const cat = cats[ci]!;
    const slug = CATEGORIES[ci]!.slug;
    const nominator = NOMINATORS[i % NOMINATORS.length]!;
    const nominatorId = idOf(nominator.email);
    const relationship = relationships[i % 3]!;
    // A self-nomination names the nominator.
    const person =
      relationship === "SELF"
        ? { name: nominator.name, email: nominator.email, company: nominee(i).company }
        : {
            ...nominee(i),
            email: `${nominee(i)
              .name.toLowerCase()
              .replace(/[^a-z]+/g, ".")}@example.com`,
          };
    const entryId = stableId(`entry:${i}`);
    const submittedAt =
      status === "DRAFT" ? null : new Date(open + Math.floor(((i + 1) / (total + 1)) * span));
    const partialDraft = status === "DRAFT" && ci % 2 === 1;

    await db
      .insert(entry)
      .values({
        id: entryId,
        cycleId,
        categoryId: cat.id,
        nominatorId,
        relationship,
        nomineeName: person.name,
        nomineeTitle: TITLES[slug] ?? "Executive",
        nomineeCompany: person.company,
        nomineeEmail: person.email,
        narrative: partialDraft ? null : narrativeFor(person.name, person.company, cat.name),
        status,
        submittedAt,
      })
      .onConflictDoNothing();

    if (!partialDraft) {
      const outcomes = Array.from({ length: 2 + (i % 2) }, (_, k) => ({
        id: stableId(`outcome:${i}:${k}`),
        entryId,
        position: k + 1,
        ...OUTCOME_TEMPLATES[(i + k) % OUTCOME_TEMPLATES.length]!,
      }));
      await db.insert(entryOutcome).values(outcomes).onConflictDoNothing();
      const refs = Array.from({ length: 1 + (i % 2) }, (_, k) => ({
        id: stableId(`reference:${i}:${k}`),
        entryId,
        position: k + 1,
        name: k === 0 ? "Morgan Ellis" : "Jesse Park",
        title: k === 0 ? "VP, Partnerships" : "Creator",
        organization: k === 0 ? "Example Brand Co." : "Independent",
        email: `reference${i}-${k}@example.org`,
        phone: `+1 315 555 01${String(i % 100).padStart(2, "0")}`,
        relationship: k === 0 ? "Brand partner for three years" : "Creator in the partner program",
      }));
      await db.insert(entryReference).values(refs).onConflictDoNothing();
    }

    if (!submittedAt) continue;
    const fee = entryFeeFor(cycle, submittedAt);
    if (!fee.open) throw new Error("seed: submission outside the nomination window");
    await db
      .insert(payment)
      .values({
        id: stableId(`payment:${i}`),
        entryId,
        kind: "ENTRY_FEE",
        tier: fee.tier,
        amountCents: fee.amountCents,
        status: "PAID",
        provider: "mock",
        providerSessionId: `seed_cs_${i}`,
        createdById: nominatorId,
        paidAt: submittedAt,
      })
      .onConflictDoNothing();

    const events: SeedEvent[] = [
      { key: "submit", fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: nominatorId },
    ];
    if (status === "APPROVED") {
      events.push({
        key: "approve",
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
        actorId: adminId,
      });
    }
    if (status === "RETURNED") {
      const wrongCategory = ci === 1;
      events.push({
        key: "return",
        fromStatus: "SUBMITTED",
        toStatus: "RETURNED",
        actorId: adminId,
        returnReason: wrongCategory ? "WRONG_CATEGORY" : "INCOMPLETE",
        note: wrongCategory
          ? "This nomination describes strategy work more than product innovation. Please move it to Top Strategist and resubmit."
          : "Please add a data point for the second outcome so judges can verify it.",
      });
    }
    await db
      .insert(entryStatusEvent)
      .values(
        events.map(({ key, ...e }, k) => ({
          id: stableId(`event:${i}:${key}`),
          entryId,
          ...e,
          createdAt: new Date(submittedAt.getTime() + k * 3_600_000),
        })),
      )
      .onConflictDoNothing();
  }
}
