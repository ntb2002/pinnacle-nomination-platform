/**
 * Entry-fee pricing: the single place the fee for "now" is decided (AGENTS.md →
 * don't compute a price in the client). Pure; unit tested at every boundary.
 * Deadlines are exclusive instants: a tier applies while now < its deadline.
 */
export type FeeTier = "EARLY" | "REGULAR" | "LATE";

export interface PricingCycle {
  nominationsOpenAt: Date;
  earlyDeadline: Date;
  regularDeadline: Date;
  finalDeadline: Date;
  earlyFeeCents: number;
  regularFeeCents: number;
  lateFeeCents: number;
}

export type EntryFee =
  | { open: true; tier: FeeTier; amountCents: number; tierEndsAt: Date }
  | { open: false; reason: "NOT_OPEN" | "CLOSED" };

export function entryFeeFor(cycle: PricingCycle, now: Date): EntryFee {
  const t = now.getTime();
  if (t < cycle.nominationsOpenAt.getTime()) return { open: false, reason: "NOT_OPEN" };
  if (t >= cycle.finalDeadline.getTime()) return { open: false, reason: "CLOSED" };
  if (t < cycle.earlyDeadline.getTime()) {
    return {
      open: true,
      tier: "EARLY",
      amountCents: cycle.earlyFeeCents,
      tierEndsAt: cycle.earlyDeadline,
    };
  }
  if (t < cycle.regularDeadline.getTime()) {
    return {
      open: true,
      tier: "REGULAR",
      amountCents: cycle.regularFeeCents,
      tierEndsAt: cycle.regularDeadline,
    };
  }
  return {
    open: true,
    tier: "LATE",
    amountCents: cycle.lateFeeCents,
    tierEndsAt: cycle.finalDeadline,
  };
}
