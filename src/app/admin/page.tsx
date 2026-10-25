import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHomePage() {
  const actor = await requireRole("ADMIN");
  return (
    <div className="container-page py-12">
      <PageHeader title="Program administration" intro={`Signed in as ${actor.email}.`} />
      <p className="text-slate">
        Triage, judging and results tools appear here as they are enabled.
      </p>
    </div>
  );
}
