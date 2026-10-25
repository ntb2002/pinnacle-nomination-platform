import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Your entries" };

export default async function EntriesPage() {
  await requireRole("NOMINATOR");
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Your entries"
        intro="Nominations you start appear here with their status and next step."
      />
      <p className="text-slate">You have not started a nomination yet.</p>
    </div>
  );
}
