import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatDateTime, formatDeadline } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { getNominationOptions } from "@/server/services/entries";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Start a nomination" };

export default async function NewEntryPage() {
  await requireRole("NOMINATOR");
  const { cycle, fee, categories } = await getNominationOptions();
  return (
    <div className="container-page max-w-3xl py-12">
      <PageHeader
        title="Start a nomination"
        intro="Each entry nominates one person in one category and is billed separately. You can save your work and come back to it."
      />
      {fee.open ? (
        <>
          <p className="mb-8 rounded border-l-4 border-ink bg-surface px-4 py-3">
            The {fee.tier.toLowerCase()} fee of <strong>{formatCents(fee.amountCents)}</strong>{" "}
            applies to entries paid by {formatDeadline(fee.tierEndsAt)}.
          </p>
          <StartForm categories={categories} />
        </>
      ) : (
        <p className="rounded border-l-4 border-ink bg-surface px-4 py-3">
          {fee.reason === "NOT_OPEN"
            ? `Nominations for the ${cycle.name} open ${formatDateTime(cycle.nominationsOpenAt)}.`
            : `Nominations for the ${cycle.name} have closed.`}{" "}
          <Link href="/entries" className="font-semibold underline">
            Back to your entries
          </Link>
        </p>
      )}
    </div>
  );
}
