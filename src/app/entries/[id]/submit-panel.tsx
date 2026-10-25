import Link from "next/link";
import { formatDateTime, formatDeadline } from "@/lib/dates";
import { entryFieldLabel } from "@/lib/entry-form";
import { formatCents } from "@/lib/money";
import type { EntryFee } from "@/lib/pricing";
import { DeleteDraft } from "./delete-draft";
import { OpenCheckout, PayButton } from "./payment-panel";

/**
 * The review page's "what next" box for an editable entry: the problems to fix, or the
 * fee and "Pay and submit", or the open checkout. Returned entries are resubmitted
 * without paying again (#10).
 */
export function SubmitPanel({
  entry,
  problems,
  fee,
  openUntil,
}: {
  entry: { id: string; status: string };
  problems: Record<string, string[]>;
  fee: EntryFee | null;
  openUntil: Date | null;
}) {
  const ready = Object.keys(problems).length === 0;
  const draft = entry.status === "DRAFT";
  return (
    <section
      aria-labelledby="ready-heading"
      className="mb-12 rounded border border-line bg-surface p-6"
    >
      <h2 id="ready-heading" className="font-display text-2xl font-semibold">
        {openUntil ? "Checkout in progress" : ready ? "Ready to submit" : "Before you can submit"}
      </h2>
      {openUntil ? (
        <OpenCheckout entryId={entry.id} until={formatDateTime(openUntil)} />
      ) : ready ? (
        <>
          <p className="mt-3">
            Everything required is complete.{" "}
            {!draft
              ? "Resubmitting a returned entry does not cost anything."
              : fee?.open
                ? `The ${fee.tier.toLowerCase()} fee of ${formatCents(fee.amountCents)} applies if you start checkout by ${formatDeadline(fee.tierEndsAt)}. The fee is set when checkout starts.`
                : "Nominations are closed, so this entry can no longer be submitted."}
          </p>
          {draft && fee?.open && (
            <PayButton
              entryId={entry.id}
              label={`Pay ${formatCents(fee.amountCents)} and submit`}
            />
          )}
        </>
      ) : (
        <ul className="mt-3 list-disc pl-6">
          {Object.entries(problems).map(([path, messages]) => (
            <li key={path}>
              <a href={`/entries/${entry.id}/edit#${path}`} className="underline">
                {path === "category" ? "Category" : entryFieldLabel(path)}: {messages[0]}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!openUntil && (
        <p className="mt-6">
          <Link
            href={`/entries/${entry.id}/edit`}
            className="inline-flex rounded border-2 border-ink px-5 py-3 font-semibold"
          >
            Edit the entry
          </Link>
        </p>
      )}
      {draft && !openUntil && <DeleteDraft entryId={entry.id} />}
    </section>
  );
}
