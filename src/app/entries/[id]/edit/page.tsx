import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FocusFromHash } from "@/components/focus-from-hash";
import { PageHeader } from "@/components/page-header";
import { RELATIONSHIP_LABEL } from "@/lib/entry-status";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { listAttachments } from "@/server/services/attachments";
import { getMyEntryPayment } from "@/server/services/checkout";
import { latestReturn, moveTargets } from "@/server/services/returned-entries";
import { EDITABLE_STATUSES, getMyEntry } from "@/server/services/entries";
import { EntryForm } from "./entry-form";
import { ReturnNotice } from "../return-notice";
import { FilesSection } from "./files-section";
import { MoveCategory } from "./move-category";

export const metadata: Metadata = { title: "Edit entry" };

export default async function EditEntryPage({
  params,
  searchParams,
}: PageProps<"/entries/[id]/edit">) {
  const actor = await requireRole("NOMINATOR");
  const { id } = await params;
  const entry = await getMyEntry(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  // Arriving here for an entry that can no longer change (e.g. a remove clicked on a
  // stale page) lands on its review page with a notice saying so.
  if (!(EDITABLE_STATUSES as readonly string[]).includes(entry.status)) {
    redirect(`/entries/${id}?locked=1`);
  }
  if (entry.status === "RETURNED" && !entry.triageOpen) redirect(`/entries/${id}?locked=closed`);
  // While a checkout is open the entry is frozen; the review page explains and offers cancel.
  if ((await getMyEntryPayment(actor, id)).open) redirect(`/entries/${id}`);
  const [files, query, returned] = await Promise.all([
    listAttachments(actor, id),
    searchParams,
    entry.status === "RETURNED" ? latestReturn(actor, id) : null,
  ]);

  const initial: Record<string, string> = {
    nomineeName: entry.nomineeName ?? "",
    nomineeTitle: entry.nomineeTitle ?? "",
    nomineeCompany: entry.nomineeCompany ?? "",
    nomineeEmail: entry.nomineeEmail ?? "",
    nomineeLinkedinUrl: entry.nomineeLinkedinUrl ?? "",
    narrative: entry.narrative ?? "",
  };
  for (const o of entry.outcomes) {
    initial[`outcomes.${o.position - 1}.description`] = o.description;
    initial[`outcomes.${o.position - 1}.dataPoint`] = o.dataPoint;
  }
  for (const r of entry.references) {
    for (const k of ["name", "title", "organization", "email", "phone", "relationship"] as const) {
      initial[`references.${r.position - 1}.${k}`] = r[k];
    }
  }

  return (
    <div className="container-page max-w-3xl py-12">
      <p className="mb-4">
        <Link href="/entries" className="font-semibold underline">
          Your entries
        </Link>
      </p>
      <PageHeader
        title={entry.categoryName}
        intro={
          entry.status === "RETURNED"
            ? `${RELATIONSHIP_LABEL[entry.relationship]}. Save your changes, then resubmit from the entry page.`
            : `${RELATIONSHIP_LABEL[entry.relationship]}. Save at any time; nothing is submitted until you review and pay.`
        }
      />
      {returned && <ReturnNotice reason={returned.reason} message={returned.message} />}
      {returned?.reason === "WRONG_CATEGORY" && (
        <MoveCategory
          entryId={entry.id}
          current={entry.categoryName}
          options={await moveTargets(actor, entry.id)}
        />
      )}
      {!entry.categoryEnabled && (
        <p
          role="note"
          className="mb-8 rounded border-l-4 border-danger bg-danger-bg px-4 py-3 text-danger"
        >
          This category is no longer offered, so this entry cannot be submitted.
        </p>
      )}
      <FocusFromHash />
      <EntryForm
        entryId={entry.id}
        initial={initial}
        emailLock={entry.relationship === "SELF" ? "self" : entry.submittedAt ? "submitted" : null}
      />
      <FilesSection entryId={entry.id} files={files} query={query} />
    </div>
  );
}
