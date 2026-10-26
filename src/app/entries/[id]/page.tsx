import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";
import { NOMINATOR_STATUS, RELATIONSHIP_LABEL } from "@/lib/entry-status";
import { formatCents } from "@/lib/money";
import { readinessProblems, toSubmissionInput } from "@/lib/validation/entry";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { listAttachments } from "@/server/services/attachments";
import { getMyEntryPayment } from "@/server/services/checkout";
import { getMyTimeline, latestReturn } from "@/server/services/returned-entries";
import { EDITABLE_STATUSES, getMyEntry, getNominationWindow } from "@/server/services/entries";
import { AttachmentList } from "./attachment-list";
import { ReturnNotice } from "./return-notice";
import { SubmitPanel } from "./submit-panel";
import { Timeline } from "./timeline";
import { EntrySummary } from "./entry-summary";

export const metadata: Metadata = { title: "Your entry" };

const TIER = { EARLY: "Early", REGULAR: "Regular", LATE: "Late" } as const;

export default async function EntryPage({ params, searchParams }: PageProps<"/entries/[id]">) {
  const actor = await requireRole("NOMINATOR");
  const { id } = await params;
  const entry = await getMyEntry(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(entry.status);
  const problems = editable ? readinessProblems(toSubmissionInput(entry)) : {};
  if (editable && !entry.categoryEnabled) {
    problems.category = ["This category is no longer offered. Contact the program team."];
  }
  const [fee, files, pay, query] = await Promise.all([
    getNominationWindow(),
    listAttachments(actor, id),
    getMyEntryPayment(actor, id),
    searchParams,
  ]);
  const [timeline, returned] = await Promise.all([
    getMyTimeline(actor, id),
    entry.status === "RETURNED" ? latestReturn(actor, id) : null,
  ]);
  const status = NOMINATOR_STATUS[entry.status];
  const locked = !editable && query.locked === "1";
  const notice =
    query.resubmitted === "1" && entry.status === "SUBMITTED"
      ? "Entry resubmitted. The program team will review it again."
      : query.checkout === "cancelled" && entry.status === "DRAFT"
        ? "You left checkout without paying. Nothing was charged, and your entry is still a draft."
        : query.checkout === "ended" && entry.status === "DRAFT"
          ? "Checkout cancelled. You can edit the entry again."
          : query.checkout === "stale"
            ? entry.status === "DRAFT"
              ? pay.open
                ? "That checkout page was out of date, so nothing was charged. Use \u201cContinue to payment\u201d below to pay."
                : "That checkout had already ended, so nothing was charged. Start a new checkout to pay."
              : "This entry is already paid for. Nothing more was charged."
            : query.checkout === "done"
              ? entry.status !== "DRAFT"
                ? `Payment received. Your entry is submitted, and a receipt is on its way to ${actor.email}.`
                : pay.open
                  ? "We are confirming your payment. This usually takes a few seconds; refresh the page to see the result."
                  : null
              : null;

  return (
    <div className="container-page max-w-3xl py-12">
      <p className="mb-4">
        <Link href="/entries" className="font-semibold underline">
          Your entries
        </Link>
      </p>
      <PageHeader
        title={entry.categoryName}
        intro={`${RELATIONSHIP_LABEL[entry.relationship]}. Status: ${status.label}. ${status.next}`}
      />

      {locked && (
        <div className="mb-8">
          <FlashNotice
            id="locked-message"
            error
            text="This entry has been submitted, so it and its files can no longer be changed."
          />
        </div>
      )}
      {notice && (
        <div className="mb-8">
          <FlashNotice id="checkout-message" error={false} text={notice} />
        </div>
      )}
      {returned && <ReturnNotice reason={returned.reason} message={returned.message} />}
      {editable && (
        <SubmitPanel
          entry={entry}
          problems={problems}
          fee={fee}
          checkout={pay.open}
          attempts={pay.attempts}
          lastEnded={pay.lastEnded}
        />
      )}
      {pay.paid && (
        <section aria-labelledby="sum-payment" className="mb-10">
          <h2 id="sum-payment" className="font-display text-2xl font-semibold">
            Payment
          </h2>
          <p className="mt-3">
            {pay.paid.tier ? `${TIER[pay.paid.tier]} entry fee` : "Entry fee"}{" "}
            {formatCents(pay.paid.amountCents)}
            {pay.paid.paidAt && `, paid ${formatDateTime(pay.paid.paidAt)}`}.
            {pay.paid.reference && ` Reference ${pay.paid.reference}.`}
          </p>
        </section>
      )}
      <EntrySummary entry={entry} />
      <section aria-labelledby="sum-files" className="mt-10">
        <h2 id="sum-files" className="font-display text-2xl font-semibold">
          Supporting files
        </h2>
        <AttachmentList files={files} />
      </section>
      <Timeline steps={timeline} />
    </div>
  );
}
