import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { coverageWarnings, MIN_ELIGIBLE_JUDGES } from "@/server/services/conflicts";
import { listJudges } from "@/server/services/judges-admin";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Judges" };

export default async function AdminJudgesPage() {
  const actor = await requireRole("ADMIN");
  const [judges, warnings] = await Promise.all([listJudges(actor), coverageWarnings(actor)]);
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Judges"
        intro="Build the named panel, assign categories for each round, and check every entry has enough judges without a conflict."
      />
      <section aria-labelledby="coverage-heading" className="mb-12">
        <h2 id="coverage-heading" className="font-display text-2xl font-semibold">
          Coverage
        </h2>
        {warnings.length === 0 ? (
          <p className="mt-3">
            Every approved entry has at least {MIN_ELIGIBLE_JUDGES} eligible judges.
          </p>
        ) : (
          <div
            className="mt-3 rounded border-l-4 border-danger bg-danger-bg px-4 py-3 text-danger"
            role="note"
          >
            <p className="font-semibold">
              {warnings.length === 1 ? "1 entry has" : `${warnings.length} entries have`} fewer than{" "}
              {MIN_ELIGIBLE_JUDGES} eligible judges (assigned, active, not recused).
            </p>
            <ul className="mt-2 list-disc pl-5">
              {warnings.slice(0, 50).map((w) => (
                <li key={`${w.entryId}-${w.round}`}>
                  <Link href={`/admin/entries/${w.entryId}`} className="underline">
                    {w.nomineeName ?? "Unnamed nominee"}
                  </Link>
                  , {w.categoryName}, round {w.round}: {w.eligible} eligible
                </li>
              ))}
            </ul>
            {warnings.length > 50 && <p className="mt-2">and {warnings.length - 50} more.</p>}
          </div>
        )}
      </section>
      <section aria-labelledby="panel-heading" className="mb-12">
        <h2 id="panel-heading" className="font-display text-2xl font-semibold">
          The panel
        </h2>
        {judges.length === 0 ? (
          <p className="mt-3">No judges yet.</p>
        ) : (
          <div
            className="mt-4 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Judges table"
          >
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <caption className="sr-only">Judges and their assigned categories</caption>
              <thead>
                <tr className="border-b-2 border-ink">
                  {["Judge", "Round 1", "Round 2", "Status"].map((h) => (
                    <th key={h} scope="col" className="py-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {judges.map((j) => (
                  <tr key={j.id} className="border-b border-line align-top">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <Link href={`/admin/judges/${j.id}`} className="font-semibold underline">
                        {j.displayName ?? j.email}
                      </Link>
                      <span className="block text-sm text-slate">
                        {[j.title, j.organization].filter(Boolean).join(", ") || j.email}
                      </span>
                    </th>
                    <td className="py-3 pr-4 text-sm">{j.round1.join(", ") || "None"}</td>
                    <td className="py-3 pr-4 text-sm">{j.round2.join(", ") || "None"}</td>
                    <td className="py-3 text-sm">
                      {j.disabledAt
                        ? "Sign-in disabled"
                        : j.active === false
                          ? "Inactive"
                          : j.active
                            ? j.isPublic
                              ? "Active, on public panel"
                              : "Active"
                            : "No profile yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <InviteForm />
    </div>
  );
}
