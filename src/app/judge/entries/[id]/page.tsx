import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { clientIp } from "@/server/request";
import { getJudgeEntry } from "@/server/services/judging";
import { getMyScore } from "@/server/services/scoring";
import { ScoreForm } from "./score-form";
import { AttachmentList } from "../../../entries/[id]/attachment-list";

export const metadata: Metadata = { title: "Entry" };
const h2 = "font-display text-2xl font-semibold";

/**
 * What a judge reads: the nominee, narrative, outcomes, references (no contact details)
 * and files. Never the nominator, payments or the nominee's email.
 */
export default async function JudgeEntryPage({
  params,
  searchParams,
}: PageProps<"/judge/entries/[id]">) {
  const actor = await requireRole("JUDGE");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const round = query.round === "2" ? 2 : 1;
  const e = await getJudgeEntry(actor, id, round, await clientIp()).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const mine = await getMyScore(actor, id, round);
  const sc = mine.score;
  const initial: Record<string, string> = {
    impact: sc?.impact?.toString() ?? "",
    innovation: sc?.innovation?.toString() ?? "",
    influence: sc?.influence?.toString() ?? "",
    referenceValidation: sc?.referenceValidation?.toString() ?? "",
    comment: sc?.comment ?? "",
  };
  return (
    <div className="container-page max-w-3xl py-12">
      <p className="mb-4">
        <Link
          href={`/judge/categories/${e.categoryId}?round=${round}`}
          className="font-semibold underline"
        >
          {e.categoryName}, round {round}
        </Link>
      </p>
      <PageHeader
        title={e.nomineeName ?? "Unnamed nominee"}
        intro={[e.nomineeTitle, e.nomineeCompany].filter(Boolean).join(", ")}
      />
      {e.nomineeLinkedinUrl && (
        <p className="-mt-4 mb-8">
          <a
            href={e.nomineeLinkedinUrl}
            className="underline"
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            LinkedIn profile<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      )}
      <section aria-labelledby="narrative" className="mb-10">
        <h2 id="narrative" className={h2}>
          Narrative
        </h2>
        <div className="mt-4 max-w-[68ch] whitespace-pre-line">{e.narrative}</div>
      </section>
      <section aria-labelledby="outcomes" className="mb-10">
        <h2 id="outcomes" className={h2}>
          Outcomes
        </h2>
        <ol className="mt-4 flex list-decimal flex-col gap-3 pl-6">
          {e.outcomes.map((o) => (
            <li key={o.position}>
              <p className="font-semibold">{o.description}</p>
              <p className="text-slate">{o.dataPoint}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="references" className="mb-10">
        <h2 id="references" className={h2}>
          References
        </h2>
        <p className="mt-2 text-sm text-slate">
          The program team verifies references; contact details are not shown to judges.
        </p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {e.references.map((r) => (
            <li key={r.position} className="rounded border border-line bg-surface p-4">
              <p className="font-semibold">{r.name}</p>
              <p>
                {r.title}, {r.organization}
              </p>
              <p className="text-slate">{r.relationship}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="mb-10">
        {mine.open ? (
          <ScoreForm
            entryId={e.id}
            round={round}
            weights={mine.weights}
            initial={initial}
            submitted={!!sc?.submittedAt}
          />
        ) : (
          <p className="rounded border border-line bg-surface p-4">
            {sc?.submittedAt
              ? `Round ${round} is closed. Your submitted score is final.`
              : `Scoring for round ${round} is not open.`}
          </p>
        )}
      </div>
      <section aria-labelledby="files">
        <h2 id="files" className={h2}>
          Supporting files
        </h2>
        <AttachmentList files={e.files} />
      </section>
    </div>
  );
}
