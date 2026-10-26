import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/lib/dates";
import { NOMINATOR_STATUS } from "@/lib/entry-status";
import { requireRole } from "@/server/auth/session";
import { getNominationWindow, listMyEntries } from "@/server/services/entries";

export const metadata: Metadata = { title: "Your entries" };

type Row = Awaited<ReturnType<typeof listMyEntries>>[number];

function NextStep({ e }: { e: Row }) {
  const s = NOMINATOR_STATUS[e.status];
  if (e.status === "RETURNED" && !e.triageOpen) {
    return (
      <span className="text-slate">
        Judging has started; this entry can no longer be resubmitted.
      </span>
    );
  }
  if (e.status === "DRAFT" || e.status === "RETURNED") {
    return (
      <Link href={`/entries/${e.id}/edit`} className="font-semibold underline">
        {e.status === "RETURNED" ? "Make the requested changes" : "Continue editing"}
      </Link>
    );
  }
  return <span className="text-slate">{s.next}</span>;
}

function Nominee({ e }: { e: Row }) {
  return (
    <>
      <Link href={`/entries/${e.id}`} className="font-semibold underline">
        {e.nomineeName || "Unnamed nominee"}
      </Link>
      {e.nomineeCompany && <span className="block text-slate">{e.nomineeCompany}</span>}
    </>
  );
}

function Status({ e }: { e: Row }) {
  return (
    <>
      {NOMINATOR_STATUS[e.status].label}
      {e.status === "RETURNED" && e.returnMessage && (
        <span className="mt-1 block text-sm">
          <span className="font-semibold">Message from the program team: </span>
          {e.returnMessage}
        </span>
      )}
      {e.submittedAt && (
        <span className="block text-sm text-slate">Submitted {formatShortDate(e.submittedAt)}</span>
      )}
    </>
  );
}

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
        <>
          {/* Small screens: one card per entry. */}
          <ul className="flex flex-col gap-4 sm:hidden">
            {entries.map((e) => (
              <li key={e.id} className="rounded border border-line bg-surface p-4">
                <Nominee e={e} />
                <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="font-semibold">Category</dt>
                  <dd>{e.categoryName}</dd>
                  <dt className="font-semibold">Status</dt>
                  <dd>
                    <Status e={e} />
                  </dd>
                  <dt className="font-semibold">Next step</dt>
                  <dd>
                    <NextStep e={e} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          {/* Wider screens: a table. */}
          <table className="hidden w-full border-collapse text-left sm:table">
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
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line align-top">
                  <th scope="row" className="py-4 pr-4 font-normal">
                    <Nominee e={e} />
                  </th>
                  <td className="py-4 pr-4">{e.categoryName}</td>
                  <td className="py-4 pr-4">
                    <Status e={e} />
                  </td>
                  <td className="py-4">
                    <NextStep e={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
