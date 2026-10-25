import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatDateTime, formatDeadline } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { getAdminProgram } from "@/server/services/program-settings";

export const metadata: Metadata = { title: "Admin" };

const PHASE_LABEL: Record<string, string> = {
  NOMINATION: "Nominations and eligibility review",
  ROUND1_OPEN: "Round one judging open",
  ROUND1_CLOSED: "Round one closed",
  FINALISTS_ANNOUNCED: "Finalists announced",
  ROUND2_OPEN: "Round two judging open",
  ROUND2_CLOSED: "Round two closed",
  RESULTS_PUBLISHED: "Results published",
};

export default async function AdminHomePage() {
  const actor = await requireRole("ADMIN");
  const program = await getAdminProgram(actor);
  return (
    <div className="container-page py-12">
      <PageHeader title="Program administration" intro={`Signed in as ${actor.email}.`} />
      {!program ? (
        <p>No active award cycle. Load one with `npm run db:seed -- --program-only`.</p>
      ) : (
        <dl className="grid gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-3">
          {[
            ["Cycle", program.cycle.name],
            ["Stage", PHASE_LABEL[program.cycle.phase] ?? program.cycle.phase],
            ["Nominations open", formatDateTime(program.cycle.nominationsOpenAt)],
            ["Final deadline", formatDeadline(program.cycle.finalDeadline)],
            [
              "Fees",
              `${formatCents(program.cycle.earlyFeeCents)} / ${formatCents(program.cycle.regularFeeCents)} / ${formatCents(program.cycle.lateFeeCents)}`,
            ],
            ["Categories offered", String(program.categories.filter((c) => c.enabled).length)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface p-5">
              <dt className="text-sm text-slate">{k}</dt>
              <dd className="mt-1 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-8">
        <Link href="/admin/settings" className="font-semibold text-ink underline">
          Change dates and fees
        </Link>
      </p>
    </div>
  );
}
