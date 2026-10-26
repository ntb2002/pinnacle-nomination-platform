import { deadlineDay, formatDayRange, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { PublicCycle } from "@/server/services/public-program";

/** The nomination timeline as a definition list: dates and fees from the live cycle. */
export function KeyDates({ cycle }: { cycle: PublicCycle }) {
  const items = [
    { label: "Nominations open", value: formatShortDate(cycle.nominationsOpenAt), note: null },
    {
      label: "Early deadline",
      value: formatShortDate(deadlineDay(cycle.earlyDeadline)),
      note: `${formatCents(cycle.earlyFeeCents)} per entry`,
    },
    {
      label: "Regular deadline",
      value: formatShortDate(deadlineDay(cycle.regularDeadline)),
      note: `${formatCents(cycle.regularFeeCents)} per entry`,
    },
    {
      label: "Final deadline",
      value: formatShortDate(deadlineDay(cycle.finalDeadline)),
      note: `${formatCents(cycle.lateFeeCents)} per entry`,
    },
  ];
  if (cycle.judgingOpensAt && cycle.judgingClosesAt) {
    items.push({
      label: "Round one judging",
      value: formatDayRange(cycle.judgingOpensAt, cycle.judgingClosesAt),
      note: "Finalists are announced after judging",
    });
  }
  return (
    <dl
      className={`grid gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-2 ${items.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
    >
      {items.map((i) => (
        <div key={i.label} className="bg-surface p-5">
          <dt className="text-sm text-slate">{i.label}</dt>
          <dd className="mt-1 font-display text-2xl font-semibold">{i.value}</dd>
          {i.note && <dd className="mt-1 text-sm text-slate">{i.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
