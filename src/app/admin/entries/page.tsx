import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/lib/dates";
import { ADMIN_STATUS_LABEL } from "@/lib/entry-status";
import { requireRole } from "@/server/auth/session";
import {
  listTriageQueue,
  parseQueueFilters,
  QUEUE_PAGE_SIZE,
  type QueueFilters,
} from "@/server/services/triage-queue";

export const metadata: Metadata = { title: "Entries" };

const STATUS_OPTIONS = [
  ["SUBMITTED", "Needs review"],
  ["RETURNED", "Returned"],
  ["APPROVED", "Approved"],
  ["ALL", "All submitted entries"],
] as const;

const select = "rounded border-2 border-control bg-surface px-3 py-2";

function pageHref(f: QueueFilters, page: number) {
  const q = new URLSearchParams({ status: f.status, sort: f.sort, page: String(page) });
  if (f.category) q.set("category", f.category);
  return `/admin/entries?${q}`;
}

export default async function AdminEntriesPage({ searchParams }: PageProps<"/admin/entries">) {
  const actor = await requireRole("ADMIN");
  const filters = parseQueueFilters(await searchParams);
  const queue = await listTriageQueue(actor, filters);
  if (!queue) return <p className="container-page py-12">No active award cycle.</p>;
  const pages = Math.max(1, Math.ceil(queue.total / QUEUE_PAGE_SIZE));
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Entries"
        intro={
          queue.triageOpen
            ? "Check each paid entry for completeness and category before judges see it."
            : "Eligibility review closed when round one opened. Entries are read-only here."
        }
      />
      <form
        method="get"
        className="mb-8 flex flex-wrap items-end gap-4"
        aria-label="Filter entries"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="font-semibold">
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status} className={select}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="font-semibold">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={filters.category ?? ""}
            className={select}
          >
            <option value="">All categories</option>
            {queue.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="font-semibold">
            Order
          </label>
          <select id="sort" name="sort" defaultValue={filters.sort} className={select}>
            <option value="oldest">Oldest submitted first</option>
            <option value="newest">Newest submitted first</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-ink px-5 py-2.5 font-semibold text-on-ink hover:bg-ink-raised"
        >
          Show entries
        </button>
      </form>
      <p className="mb-4" role="status">
        {queue.total === 1 ? "1 entry" : `${queue.total} entries`}
        {pages > 1 && `, page ${filters.page} of ${pages}`}.
      </p>
      {queue.rows.length === 0 && filters.page > 1 && (
        <p className="mb-4">
          There are no entries on this page.{" "}
          <Link href={pageHref(filters, 1)} className="font-semibold underline">
            Go to the first page
          </Link>
        </p>
      )}
      {queue.rows.length > 0 && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Entries table">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">
              Entries, {filters.sort === "oldest" ? "oldest" : "newest"} submitted first
            </caption>
            <thead>
              <tr className="border-b-2 border-ink">
                {["Nominee", "Category", "Status", "Submitted", "Nominator"].map((h) => (
                  <th key={h} scope="col" className="py-3 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queue.rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <Link href={`/admin/entries/${r.id}`} className="font-semibold underline">
                      {r.nomineeName ?? "Unnamed nominee"}
                    </Link>
                    {r.nomineeCompany && (
                      <span className="block text-sm text-slate">{r.nomineeCompany}</span>
                    )}
                  </th>
                  <td className="py-3 pr-4">{r.categoryName}</td>
                  <td className="py-3 pr-4">{ADMIN_STATUS_LABEL[r.status]}</td>
                  <td className="py-3 pr-4">
                    {r.submittedAt ? formatShortDate(r.submittedAt) : "—"}
                  </td>
                  <td className="break-all py-3 text-sm">{r.nominatorEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex gap-6">
          {filters.page > 1 && (
            <Link href={pageHref(filters, filters.page - 1)} className="font-semibold underline">
              Previous page
            </Link>
          )}
          {filters.page < pages && (
            <Link href={pageHref(filters, filters.page + 1)} className="font-semibold underline">
              Next page
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
