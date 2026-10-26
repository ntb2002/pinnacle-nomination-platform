import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { getJudgeHome } from "@/server/services/judging";

export const metadata: Metadata = { title: "Judging" };

export default async function JudgeHomePage() {
  const actor = await requireRole("JUDGE");
  const home = await getJudgeHome(actor);
  if (!home.active) {
    return (
      <div className="container-page py-12">
        <PageHeader
          title="Judging"
          intro="Your judging account is not active. Contact the program team if you expected to judge."
        />
      </div>
    );
  }
  const rounds = [1, 2] as const;
  return (
    <div className="container-page max-w-4xl py-12">
      <PageHeader
        title="Judging"
        intro={`Welcome, ${home.name}. For each entry you first say whether you have a conflict of interest; you are recused from any entry where you do.`}
      />
      {home.assignments.length === 0 && <p>You have no categories assigned yet.</p>}
      {rounds.map((round) => {
        const rows = home.assignments.filter((a) => a.round === round);
        if (rows.length === 0) return null;
        return (
          <section key={round} aria-labelledby={`round-${round}`} className="mb-10">
            <h2 id={`round-${round}`} className="font-display text-2xl font-semibold">
              Round {round}
              {round === 2 && (
                <span className="font-sans text-base font-normal text-slate"> (finalists)</span>
              )}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {rows.map((a) => (
                <li key={a.categoryId} className="rounded border border-line bg-surface p-5">
                  <Link
                    href={`/judge/categories/${a.categoryId}?round=${round}`}
                    className="text-lg font-semibold underline"
                  >
                    {a.categoryName}
                  </Link>
                  <p className="mt-1 text-sm text-slate">
                    {a.started ? "Judging open" : "Not open yet"}
                  </p>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt>Entries to judge</dt>
                    <dd className="text-right font-semibold">{a.total}</dd>
                    <dt>Conflict not yet declared</dt>
                    <dd className="text-right font-semibold">{a.undeclared}</dd>
                    <dt>Scored</dt>
                    <dd className="text-right font-semibold">
                      {a.scored} of {a.total}
                    </dd>
                    {a.recused > 0 && (
                      <>
                        <dt>Recused</dt>
                        <dd className="text-right font-semibold">{a.recused}</dd>
                      </>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
