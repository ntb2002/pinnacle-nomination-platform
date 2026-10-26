import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { allowedCounts, CRITERIA, cutoffTie, displayRanks, to2dp } from "@/lib/scoring";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getCategoryRanking, MIN_SCORES } from "@/server/services/rankings";
import { SelectionForm } from "./selection-form";

export const metadata: Metadata = { title: "Rankings" };

export default async function CategoryRankingPage({
  params,
  searchParams,
}: PageProps<"/admin/judging/[categoryId]">) {
  const actor = await requireRole("ADMIN");
  const [{ categoryId }, query] = await Promise.all([params, searchParams]);
  const r = await getCategoryRanking(actor, categoryId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const counts = allowedCounts(r.ranked.length);
  const asked = Number(query.n);
  const count = counts.includes(asked)
    ? asked
    : (r.selection?.entryIds.length ?? counts.at(-1) ?? 0);
  const tie = count ? cutoffTie(r.ranked, count) : null;
  const preselected =
    r.selection && r.selection.entryIds.length === count
      ? r.selection.entryIds
      : tie
        ? [...tie.above, ...tie.tied.slice(0, tie.slots)]
        : r.ranked.slice(0, count).map((x) => x.entryId);
  const label = (x: (typeof r.ranked)[number]) =>
    `${x.nomineeName ?? "Unnamed nominee"}${x.mean === null ? "" : `, ${to2dp(x.mean).toFixed(2)}`}`;
  const ranks = displayRanks(r.ranked);
  const canSelect = r.phase === "ROUND1_CLOSED" && r.blockers.length === 0 && counts.length > 0;
  return (
    <div className="container-page max-w-4xl py-12">
      <p className="mb-4">
        <Link href="/admin/judging" className="font-semibold underline">
          Judging
        </Link>
      </p>
      <PageHeader
        title={r.name}
        intro={`Round one ranking. Weights: ${CRITERIA.map((c) => `${c.label} ${r.weights[c.weight]}%`).join(", ")}. Scores are the mean of submitted scores from judges without a conflict.`}
      />
      {query.done === "selected" && (
        <div className="mb-8">
          <FlashNotice
            id="selection-message"
            error={false}
            text="Finalists saved. They are announced for all categories together."
          />
        </div>
      )}
      {r.blockers.length > 0 && (
        <p
          role="note"
          className="mb-6 rounded border-l-4 border-danger bg-danger-bg px-4 py-3 text-danger"
        >
          {r.blockers.length} {r.blockers.length === 1 ? "entry has" : "entries have"} fewer than{" "}
          {MIN_SCORES} scores, so finalists cannot be chosen or announced yet.
        </p>
      )}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Ranking table">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">Entries ranked by mean score</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              {[
                "Rank",
                "Nominee",
                "Mean (of 100)",
                "Judges",
                "Spread (population SD)",
                "Missing scores",
              ].map((h) => (
                <th key={h} scope="col" className="py-3 pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.ranked.map((x, i) => (
              <tr
                key={x.entryId}
                className={`border-b border-line align-top ${tie?.tied.includes(x.entryId) ? "bg-surface" : ""}`}
              >
                <td className="py-3 pr-4">{ranks[i]}</td>
                <th scope="row" className="py-3 pr-4 font-normal">
                  <Link href={`/admin/entries/${x.entryId}`} className="font-semibold underline">
                    {x.nomineeName ?? "Unnamed nominee"}
                  </Link>
                  {x.nomineeCompany && (
                    <span className="block text-sm text-slate">{x.nomineeCompany}</span>
                  )}
                </th>
                <td className="py-3 pr-4">{x.mean === null ? "—" : to2dp(x.mean).toFixed(2)}</td>
                <td
                  className={`py-3 pr-4 ${x.count < MIN_SCORES ? "font-semibold text-danger" : ""}`}
                >
                  {x.count}
                </td>
                <td className="py-3 pr-4">
                  {x.sd === null || x.count < 2 ? "—" : x.sd.toFixed(1)}
                </td>
                <td className="py-3 text-sm">{x.missing.length ? x.missing.join(", ") : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section aria-labelledby="select-heading" className="mt-10">
        <h2 id="select-heading" className="font-display text-2xl font-semibold">
          Finalists
        </h2>
        {r.selection && (
          <p className="mt-3">
            {r.selection.entryIds.length} chosen
            {r.selection.tiebreakReason
              ? `, with a tie-break: ${r.selection.tiebreakReason.replace(/\.$/, "")}`
              : ""}
            .
          </p>
        )}
        {r.selectionStale && (
          <p
            role="note"
            className="mt-3 rounded border-l-4 border-danger bg-danger-bg px-4 py-3 text-danger"
          >
            The scores changed after these finalists were chosen (for example, a late conflict).
            Choose again before announcing.
          </p>
        )}
        {canSelect ? (
          <div className="mt-4 flex flex-col gap-4">
            {counts.length > 1 && (
              <nav aria-label="Number of finalists" className="flex flex-wrap gap-4">
                {counts.map((n) => (
                  <Link
                    key={n}
                    href={`?n=${n}`}
                    aria-current={n === count ? "true" : undefined}
                    className="font-semibold underline aria-[current=true]:decoration-signal aria-[current=true]:decoration-2"
                  >
                    {n} finalists
                  </Link>
                ))}
              </nav>
            )}
            {r.ranked.length < 3 && (
              <p role="note">
                This category has fewer than 3 approved entries, so all of them advance.
              </p>
            )}
            <SelectionForm
              categoryId={categoryId}
              count={count}
              preselected={preselected}
              tie={tie}
              rows={r.ranked.map((x) => ({ entryId: x.entryId, label: label(x) }))}
            />
          </div>
        ) : (
          <p className="mt-3">
            {r.phase === "ROUND1_CLOSED"
              ? "Finalists can be chosen once every entry has enough scores."
              : r.phase === "NOMINATION" || r.phase === "ROUND1_OPEN"
                ? "Finalists are chosen after round one closes."
                : "Finalists have been announced."}
          </p>
        )}
      </section>
    </div>
  );
}
