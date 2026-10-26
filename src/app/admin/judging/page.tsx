import type { Metadata } from "next";
import Link from "next/link";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { getRoundOneOverview } from "@/server/services/rounds";
import { RoundControls } from "./round-controls";

export const metadata: Metadata = { title: "Judging" };

const PHASE: Record<string, string> = {
  NOMINATION: "Nominations and eligibility review",
  ROUND1_OPEN: "Round one open for scoring",
  ROUND1_CLOSED: "Round one closed: choose finalists",
  FINALISTS_ANNOUNCED: "Finalists announced",
  ROUND2_OPEN: "Round two open",
  ROUND2_CLOSED: "Round two closed",
  RESULTS_PUBLISHED: "Results published",
};
const DONE: Record<string, string> = {
  open: "Round one is open. Judges can score.",
  close: "Round one is closed. Choose each category's finalists.",
  announce: "Finalists announced. Every nominator has been emailed.",
};

export default async function AdminJudgingPage({ searchParams }: PageProps<"/admin/judging">) {
  const actor = await requireRole("ADMIN");
  const [o, query] = await Promise.all([getRoundOneOverview(actor), searchParams]);
  if (!o) return <p className="container-page py-12">No active award cycle.</p>;
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;
  const ready = o.categories.every((c) => c.entries === 0 || (c.selection && c.blockers === 0));
  return (
    <div className="container-page max-w-4xl py-12">
      <PageHeader title="Judging" intro={`Now: ${PHASE[o.phase] ?? o.phase}.`} />
      {done && (
        <div className="mb-8">
          <FlashNotice id="round-message" error={false} text={done} />
        </div>
      )}
      <RoundControls
        phase={o.phase}
        nominationsClosed={o.nominationsClosed}
        pendingReview={o.pendingReview}
        readyToAnnounce={ready}
      />
      <section aria-labelledby="cats-heading" className="mt-10">
        <h2 id="cats-heading" className="font-display text-2xl font-semibold">
          Round one by category
        </h2>
        <div
          className="mt-4 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Categories table"
        >
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <caption className="sr-only">
              Scoring progress and finalist selection per category
            </caption>
            <thead>
              <tr className="border-b-2 border-ink">
                {["Category", "Approved entries", "Fewer than 2 scores", "Finalists"].map((h) => (
                  <th key={h} scope="col" className="py-3 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.categories.map((c) => (
                <tr key={c.id} className="border-b border-line">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <Link href={`/admin/judging/${c.id}`} className="font-semibold underline">
                      {c.name}
                    </Link>
                  </th>
                  <td className="py-3 pr-4">{c.entries}</td>
                  <td className={`py-3 pr-4 ${c.blockers ? "font-semibold text-danger" : ""}`}>
                    {c.blockers}
                  </td>
                  <td className="py-3">
                    {c.selection
                      ? `${c.selection.entryIds.length} chosen`
                      : c.entries
                        ? "Not chosen"
                        : "No entries"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
