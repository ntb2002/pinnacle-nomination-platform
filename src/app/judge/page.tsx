import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Judging" };

export default async function JudgeHomePage() {
  await requireRole("JUDGE");
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Judging"
        intro="Your assigned categories and entries will appear here when judging opens."
      />
    </div>
  );
}
