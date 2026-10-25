import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { formatDeadline } from "@/lib/dates";
import { NOMINATOR_STATUS, RELATIONSHIP_LABEL } from "@/lib/entry-status";
import { formatCents } from "@/lib/money";
import { readinessProblems } from "@/lib/validation/entry";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { EDITABLE_STATUSES, getMyEntry, getNominationOptions } from "@/server/services/entries";
import { EntrySummary } from "./entry-summary";

export const metadata: Metadata = { title: "Your entry" };

const FIELD_LABEL: Record<string, string> = {
  nomineeName: "Nominee's name",
  nomineeTitle: "Nominee's title",
  nomineeCompany: "Nominee's company",
  nomineeEmail: "Nominee's email",
  nomineeLinkedinUrl: "LinkedIn profile",
  narrative: "Narrative",
  outcomes: "Outcomes",
  references: "References",
};

function labelFor(path: string) {
  const [root, index, field] = path.split(".");
  if (index !== undefined && field) {
    const kind = root === "outcomes" ? "Outcome" : "Reference";
    return `${kind} ${Number(index) + 1}, ${field.replace(/([A-Z])/g, " $1").toLowerCase()}`;
  }
  return FIELD_LABEL[root ?? ""] ?? root;
}

export default async function EntryPage({ params }: PageProps<"/entries/[id]">) {
  const actor = await requireRole("NOMINATOR");
  const { id } = await params;
  const entry = await getMyEntry(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(entry.status);
  const problems = editable
    ? readinessProblems({
        ...entry,
        nomineeLinkedinUrl: entry.nomineeLinkedinUrl ?? "",
        narrative: entry.narrative ?? "",
      })
    : {};
  const ready = editable && Object.keys(problems).length === 0;
  const { fee } = await getNominationOptions();
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
              {fee.open
                ? `The ${fee.tier.toLowerCase()} fee of ${formatCents(fee.amountCents)} applies if you pay by ${formatDeadline(fee.tierEndsAt)}.`
                : "Nominations are closed, so this entry can no longer be submitted."}
            </p>
          ) : (
            <ul className="mt-3 list-disc pl-6">
              {Object.entries(problems).map(([path, messages]) => (
                <li key={path}>
                  <Link href={`/entries/${entry.id}/edit#${path}`} className="underline">
                    {labelFor(path)}: {messages[0]}
                  </Link>
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
        </section>
      )}
      <EntrySummary entry={entry} />
    </div>
  );
}
