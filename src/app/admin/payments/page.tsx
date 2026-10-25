import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { listPayments, paymentLabel } from "@/server/services/payments-admin";

export const metadata: Metadata = { title: "Payments" };

const TIER = { EARLY: "Early", REGULAR: "Regular", LATE: "Late" } as const;
const KIND = { ENTRY_FEE: "Entry fee", FINALIST_FEE: "Finalist package" } as const;

export default async function AdminPaymentsPage() {
  const actor = await requireRole("ADMIN");
  const { rows, totals } = await listPayments(actor);
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Payments"
        intro="Every checkout started in the active cycle. A row marked \u201cCharged, needs review\u201d took money that was not applied to an entry (a duplicate or a wrong amount): refund it in the Stripe dashboard."
      />
      <p className="mb-6">
        {totals.paid} paid, {formatCents(totals.paidCents)} in total.
      </p>
      {rows.length === 0 ? (
        <p>No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <caption className="sr-only">Payments, newest first</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                {[
                  "Entry",
                  "Nominator",
                  "Fee",
                  "Amount",
                  "Status",
                  "Started",
                  "Paid",
                  "Reference",
                ].map((h) => (
                  <th key={h} scope="col" className="py-3 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="font-semibold">{r.nomineeName ?? "Unnamed nominee"}</span>
                    <span className="block text-slate">{r.categoryName}</span>
                  </th>
                  <td className="break-all py-3 pr-4">{r.nominatorEmail}</td>
                  <td className="py-3 pr-4">
                    {KIND[r.kind]}
                    {r.tier && <span className="block text-slate">{TIER[r.tier]}</span>}
                  </td>
                  <td className="py-3 pr-4">{formatCents(r.amountCents)}</td>
                  <td className="py-3 pr-4">{paymentLabel(r)}</td>
                  <td className="py-3 pr-4">{formatShortDate(r.createdAt)}</td>
                  <td className="py-3 pr-4">{r.paidAt ? formatShortDate(r.paidAt) : "—"}</td>
                  <td className="break-all py-3 text-xs">{r.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
