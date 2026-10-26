import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/lib/dates";
import { ADMIN_STATUS_LABEL, RELATIONSHIP_LABEL } from "@/lib/entry-status";
import { formatCents } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { clientIp } from "@/server/request";
import { paymentLabel } from "@/server/services/payments-admin";
import { getAdminEntry } from "@/server/services/triage-queue";
import { AttachmentList } from "../../../entries/[id]/attachment-list";
import { History } from "./history";
import { TriageForms } from "./triage-forms";

export const metadata: Metadata = { title: "Review entry" };

const DONE = {
  approved: "Entry approved. The nominator has been emailed.",
  returned: "Entry returned. The nominator has been emailed your message.",
} as const;
const h2 = "font-display text-2xl font-semibold";

export default async function AdminEntryPage({
  params,
  searchParams,
}: PageProps<"/admin/entries/[id]">) {
  const actor = await requireRole("ADMIN");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const showContacts = query.contacts === "1";
  const e = await getAdminEntry(actor, id, { showContacts, ip: await clientIp() }).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const done = query.done === "approved" || query.done === "returned" ? DONE[query.done] : null;
  const lastResubmit = [...e.history]
    .reverse()
    .find((h) => h.fromStatus === "RETURNED" && h.toStatus === "SUBMITTED");
  return (
    <div className="container-page max-w-4xl py-12">
      <p className="mb-4">
        <Link href="/admin/entries" className="font-semibold underline">
          All entries
        </Link>
      </p>
      <PageHeader
        title={e.entry.nomineeName ?? "Unnamed nominee"}
        intro={`${e.categoryName}. Status: ${ADMIN_STATUS_LABEL[e.entry.status]}. ${RELATIONSHIP_LABEL[e.entry.relationship]} by ${e.nominatorName || e.nominatorEmail} (${e.nominatorEmail}).`}
      />
      {done && (
        <div className="mb-8">
          <FlashNotice id="triage-message" error={false} text={done} />
        </div>
      )}
      <section aria-labelledby="triage-heading" className="mb-12">
        <h2 id="triage-heading" className={h2}>
          Eligibility review
        </h2>
        {lastResubmit && e.entry.status === "SUBMITTED" && (
          <p className="mt-3 rounded border-l-4 border-signal bg-surface px-4 py-3">
            Resubmitted after a return. {lastResubmit.note}
          </p>
        )}
        {e.entry.status === "SUBMITTED" && e.triageOpen ? (
          <div className="mt-6">
            <TriageForms entryId={e.entry.id} />
          </div>
        ) : (
          <p className="mt-3">
            {!e.triageOpen
              ? "Eligibility review closed when round one opened."
              : e.entry.status === "RETURNED"
                ? "Waiting for the nominator to make changes and resubmit."
                : "This entry is approved for judging."}
          </p>
        )}
      </section>
      <section aria-labelledby="nominee-heading" className="mb-10">
        <h2 id="nominee-heading" className={h2}>
          The nominee
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
          {[
            ["Name", e.entry.nomineeName],
            ["Title", e.entry.nomineeTitle],
            ["Company", e.entry.nomineeCompany],
            ["Email", e.entry.nomineeEmail],
            ["LinkedIn", e.entry.nomineeLinkedinUrl],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd className="break-words">{v || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="narrative-heading" className="mb-10">
        <h2 id="narrative-heading" className={h2}>
          Narrative
        </h2>
        <div className="mt-4 max-w-[68ch] whitespace-pre-line">
          {e.entry.narrative || "Not provided"}
        </div>
      </section>
      <section aria-labelledby="outcomes-heading" className="mb-10">
        <h2 id="outcomes-heading" className={h2}>
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
      <section aria-labelledby="references-heading" className="mb-10">
        <h2 id="references-heading" className={h2}>
          References
        </h2>
        {!showContacts && e.references.length > 0 && (
          <p className="mt-3">
            Contact details are hidden.{" "}
            <Link
              href={`/admin/entries/${e.entry.id}?contacts=1#references-heading`}
              className="font-semibold underline"
            >
              Show reference contact details
            </Link>{" "}
            (each view is recorded in the audit log).
          </p>
        )}
        <ul className="mt-4 grid gap-6 sm:grid-cols-2">
          {e.references.map((r) => (
            <li key={r.position} className="rounded border border-line bg-surface p-4">
              <p className="font-semibold">{r.name}</p>
              <p>
                {r.title}, {r.organization}
              </p>
              <p className="text-slate">{r.relationship}</p>
              {r.email && (
                <p className="mt-2 break-words text-sm">
                  {r.email} · {r.phone}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="files-heading" className="mb-10">
        <h2 id="files-heading" className={h2}>
          Supporting files
        </h2>
        <p className="mt-2 text-sm text-slate">Downloads are recorded in the audit log.</p>
        <AttachmentList files={e.files} />
      </section>
      <section aria-labelledby="payments-heading" className="mb-10">
        <h2 id="payments-heading" className={h2}>
          Payments
        </h2>
        {e.payments.length === 0 ? (
          <p className="mt-4">No payments.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {e.payments.map((p, i) => (
              <li key={i}>
                {p.kind === "ENTRY_FEE" ? "Entry fee" : "Finalist package"}{" "}
                {formatCents(p.amountCents)}: {paymentLabel(p)}
                {p.paidAt && `, ${formatShortDate(p.paidAt)}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className={h2}>
          Status history
        </h2>
        <History events={e.history} />
      </section>
    </div>
  );
}
