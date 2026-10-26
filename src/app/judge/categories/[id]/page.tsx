import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getJudgeQueue } from "@/server/services/judging";
import { DeclareForm } from "./declare-form";

export const metadata: Metadata = { title: "Category" };

export default async function JudgeCategoryPage({
  params,
  searchParams,
}: PageProps<"/judge/categories/[id]">) {
  const actor = await requireRole("JUDGE");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const round = query.round === "2" ? 2 : 1;
  const notice =
    query.declared === "conflict"
      ? "Conflict recorded. You are recused from that entry, and it is no longer in your list."
      : query.declared === "clear"
        ? "Thank you. Your answer is saved."
        : query.declared === "final"
          ? "You declared a conflict for that entry earlier, which only the program team can change."
          : null;
  const q = await getJudgeQueue(actor, id, round).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="container-page max-w-3xl py-12">
      <p className="mb-4">
        <Link href="/judge" className="font-semibold underline">
          Your categories
        </Link>
      </p>
      <PageHeader
        title={q.categoryName}
        intro={`Round ${round}. Declare any conflict of interest for each entry before reading it. ${q.started ? "Judging is open." : "Entries open for reading when the round opens."}`}
      />
      {notice && (
        <div className="mb-8">
          <FlashNotice id="declared-message" error={false} text={notice} />
        </div>
      )}
      {q.queue.length === 0 ? (
        <p>No entries to judge here yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {q.queue.map((e) => {
            const nominee = e.nomineeName ?? "Unnamed nominee";
            return (
              <li key={e.id} className="rounded border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold">{nominee}</h2>
                <p className="text-slate">
                  {[e.nomineeTitle, e.nomineeCompany].filter(Boolean).join(", ")}
                </p>
                {e.hasConflict === false && (
                  <p className="mt-2">
                    No conflict declared.{" "}
                    {q.started ? (
                      <Link
                        href={`/judge/entries/${e.id}?round=${round}`}
                        className="font-semibold underline"
                      >
                        Read the entry<span className="sr-only">: {nominee}</span>
                      </Link>
                    ) : (
                      "You can read it when the round opens."
                    )}
                    {e.scored && " Scored."}
                  </p>
                )}
                <DeclareForm
                  entryId={e.id}
                  categoryId={id}
                  round={round}
                  nominee={nominee}
                  current={e.hasConflict}
                />
              </li>
            );
          })}
        </ul>
      )}
      {q.recused.length > 0 && (
        <section aria-labelledby="recused-heading" className="mt-10">
          <h2 id="recused-heading" className="font-display text-xl font-semibold">
            Recused
          </h2>
          <p className="mt-2">
            You declared a conflict for these entries. They are not part of your judging. Contact
            the program team if this was a mistake.
          </p>
          <ul className="mt-3 list-disc pl-6">
            {q.recused.map((r) => (
              <li key={r.id}>{r.nomineeName ?? "Unnamed nominee"}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
