import type { Metadata } from "next";
import { NoCycle } from "@/components/public/no-cycle";
import { PageIntro } from "@/components/public/page-intro";
import { formatDate, formatDateTime, formatDeadline } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { entryFeeFor } from "@/lib/pricing";
import { getActiveCycle } from "@/server/services/public-program";

export const metadata: Metadata = {
  title: "Fees and deadlines",
  description: "Pinnacle Awards entry fees by deadline, and the finalist package fee.",
};

// TODO(copy): fee, finalist package and refund wording to be approved by CCE (and counsel).
export default async function FeesPage() {
  const cycle = await getActiveCycle();
  if (!cycle) return <NoCycle />;
  const current = entryFeeFor(cycle, new Date());
  const tiers = [
    { tier: "EARLY", name: "Early", until: cycle.earlyDeadline, fee: cycle.earlyFeeCents },
    { tier: "REGULAR", name: "Regular", until: cycle.regularDeadline, fee: cycle.regularFeeCents },
    {
      tier: "LATE",
      name: "Late (final deadline)",
      until: cycle.finalDeadline,
      fee: cycle.lateFeeCents,
    },
  ] as const;
  return (
    <>
      <PageIntro title="Fees and deadlines">
        <p>
          Each entry is billed separately. You pay when you submit, and the fee is set when you
          start checkout. Nominations open {formatDateTime(cycle.nominationsOpenAt)}.
        </p>
      </PageIntro>
      <div className="container-page py-14">
        <p className="mb-6 text-lg">
          {current.open
            ? `The ${current.tier.toLowerCase()} fee of ${formatCents(current.amountCents)} applies to entries submitted now.`
            : current.reason === "NOT_OPEN"
              ? `Nominations are not open yet. They open ${formatDate(cycle.nominationsOpenAt)}.`
              : "Nominations for this cycle have closed."}
        </p>
        <div>
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Entry fee by deadline</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-3 pr-4">
                  Fee period
                </th>
                <th scope="col" className="py-3 pr-4">
                  Submit by the end of
                </th>
                <th scope="col" className="py-3 text-right">
                  Fee per entry
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => {
                const isCurrent = current.open && current.tier === t.tier;
                return (
                  <tr
                    key={t.tier}
                    className={`border-b border-line ${isCurrent ? "bg-surface" : ""}`}
                  >
                    <th scope="row" className="py-4 pr-4 font-semibold">
                      {t.name}
                      {isCurrent && (
                        <span className="ml-3 rounded bg-ink px-2 py-0.5 text-xs font-semibold text-on-ink">
                          Current
                        </span>
                      )}
                    </th>
                    <td className="py-4 pr-4">{formatDeadline(t.until)}</td>
                    <td className="py-4 text-right font-display text-2xl font-semibold">
                      {formatCents(t.fee)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section aria-labelledby="finalist-heading" className="mt-14 max-w-[68ch]">
          <h2 id="finalist-heading" className="font-display text-3xl font-semibold">
            Finalist package
          </h2>
          <p className="mt-4">
            Entries selected as finalists in round one are asked to purchase the finalist package
            for <strong>{formatCents(cycle.finalistFeeCents)}</strong> per finalist entry. Round two
            judges only finalists who have purchased the package or received a fee waiver from the
            program.
          </p>
          <h2 className="mt-12 font-display text-3xl font-semibold">Payment</h2>
          <p className="mt-4">
            Payment is by card through Stripe&apos;s secure checkout page. Card details go directly
            to Stripe and are never stored by the Pinnacle Awards.
          </p>
          <p className="mt-4 text-slate">
            {/* TODO(copy): refund and withdrawal policy from CCE finance. */}
            Questions about payments or refunds: contact the Pinnacle Awards team.
          </p>
        </section>
      </div>
    </>
  );
}
