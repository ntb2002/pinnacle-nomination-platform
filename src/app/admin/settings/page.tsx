import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { deadlineToDateInput, toZonedDateInput, toZonedTimeInput } from "@/lib/zoned-time";
import { requireRole } from "@/server/auth/session";
import { getAdminProgram } from "@/server/services/program-settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Dates and fees" };

export default async function AdminSettingsPage() {
  const actor = await requireRole("ADMIN");
  const program = await getAdminProgram(actor);
  if (!program) return <p className="container-page py-12">No active award cycle.</p>;
  const c = program.cycle;
  const dollars = (cents: number) => String(cents / 100);
  return (
    <div className="container-page max-w-3xl py-12">
      <PageHeader
        title="Dates and fees"
        intro={`${c.name}. Times are Eastern. Changes apply immediately to the public site and to new checkouts; entries already paid keep the fee they paid.`}
      />
      <SettingsForm
        initial={{
          opensDate: toZonedDateInput(c.nominationsOpenAt),
          opensTime: toZonedTimeInput(c.nominationsOpenAt),
          earlyDate: deadlineToDateInput(c.earlyDeadline),
          regularDate: deadlineToDateInput(c.regularDeadline),
          finalDate: deadlineToDateInput(c.finalDeadline),
          earlyFee: dollars(c.earlyFeeCents),
          regularFee: dollars(c.regularFeeCents),
          lateFee: dollars(c.lateFeeCents),
          finalistFee: dollars(c.finalistFeeCents),
        }}
      />
    </div>
  );
}
