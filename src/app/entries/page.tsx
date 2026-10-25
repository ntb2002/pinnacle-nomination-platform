import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/lib/dates";
import { NOMINATOR_STATUS } from "@/lib/entry-status";
import { requireRole } from "@/server/auth/session";
import { getNominationWindow, listMyEntries } from "@/server/services/entries";

export const metadata: Metadata = { title: "Your entries" };

export default async function EntriesPage() {
  const actor = await requireRole("NOMINATOR");
  const [entries, fee] = await Promise.all([listMyEntries(actor), getNominationWindow()]);
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Your entries"
        intro="Nominations you start appear here with their status and next step."
      />
      {fee?.open && (
        <p className="mb-8">
          <Link
            href="/entries/new"
            className="inline-flex rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised"
          >
            Start a nomination
          </Link>
        </p>
      )}
      {entries.length === 0 ? (
        <p className="text-slate">You have not started a nomination yet.</p>
      ) : (
        // Scrolls sideways on narrow screens; focusable so keyboard users can scroll it.
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Your entries">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">Your entries</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-3 pr-4">
                  Nominee
                </th>
                <th scope="col" className="py-3 pr-4">
                  Category
                </th>
                <th scope="col" className="py-3 pr-4">
                  Status
                </th>
                <th scope="col" className="py-3">
                  Next step
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const s = NOMINATOR_STATUS[e.status];
                const editable = e.status === "DRAFT" || e.status === "RETURNED";
                return (
                  <tr key={e.id} className="border-b border-line align-top">
                    <th scope="row" className="py-4 pr-4 font-semibold">
                      <Link href={`/entries/${e.id}`} className="underline">
                        {e.nomineeName || "Unnamed nominee"}
                      </Link>
                      {e.nomineeCompany && (
                        <span className="block font-normal text-slate">{e.nomineeCompany}</span>
                      )}
                    </th>
                    <td className="py-4 pr-4">{e.categoryName}</td>
                    <td className="py-4 pr-4">
                      {s.label}
                      {e.submittedAt && (
                        <span className="block text-sm text-slate">
                          Submitted {formatShortDate(e.submittedAt)}
                        </span>
                      )}
                    </td>
                    <td className="py-4">
                      {editable ? (
                        <Link href={`/entries/${e.id}/edit`} className="font-semibold underline">
                          {e.status === "RETURNED"
                            ? "Make the requested changes"
                            : "Continue editing"}
                        </Link>
                      ) : (
                        <span className="text-slate">{s.next}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
