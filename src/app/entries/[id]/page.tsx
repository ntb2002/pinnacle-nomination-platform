import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { formatDeadline } from "@/lib/dates";
import { NOMINATOR_STATUS, RELATIONSHIP_LABEL } from "@/lib/entry-status";
import { formatCents } from "@/lib/money";
import { entryFieldLabel } from "@/lib/entry-form";
import { readinessProblems, toSubmissionInput } from "@/lib/validation/entry";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { listAttachments } from "@/server/services/attachments";
import { EDITABLE_STATUSES, getMyEntry, getNominationWindow } from "@/server/services/entries";
import { AttachmentList } from "./attachment-list";
import { DeleteDraft } from "./delete-draft";
import { EntrySummary } from "./entry-summary";

export const metadata: Metadata = { title: "Your entry" };

export default async function EntryPage({ params }: PageProps<"/entries/[id]">) {
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
  const ready = editable && Object.keys(problems).length === 0;
  const [fee, files] = await Promise.all([getNominationWindow(), listAttachments(actor, id)]);
  const status = NOMINATOR_STATUS[entry.status];

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

      {editable && (
        <section
          aria-labelledby="ready-heading"
          className="mb-12 rounded border border-line bg-surface p-6"
        >
          <h2 id="ready-heading" className="font-display text-2xl font-semibold">
            {ready ? "Ready to submit" : "Before you can submit"}
          </h2>
          {ready ? (
            <p className="mt-3">
              Everything required is complete.{" "}
              {fee?.open
                ? `The ${fee.tier.toLowerCase()} fee of ${formatCents(fee.amountCents)} applies if you pay by ${formatDeadline(fee.tierEndsAt)}.`
                : "Nominations are closed, so this entry can no longer be submitted."}
            </p>
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
          <p className="mt-6">
            <Link
              href={`/entries/${entry.id}/edit`}
              className="inline-flex rounded border-2 border-ink px-5 py-3 font-semibold"
            >
              Edit the entry
            </Link>
          </p>
          {entry.status === "DRAFT" && <DeleteDraft entryId={entry.id} />}
        </section>
      )}
      <EntrySummary entry={entry} />
      <section aria-labelledby="sum-files" className="mt-10">
        <h2 id="sum-files" className="font-display text-2xl font-semibold">
          Supporting files
        </h2>
        <AttachmentList files={files} />
      </section>
    </div>
  );
}
