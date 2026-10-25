import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { getAdminProgram } from "@/server/services/program-settings";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const actor = await requireRole("ADMIN");
  const program = await getAdminProgram(actor);
  if (!program) return <p className="container-page py-12">No active award cycle.</p>;
  const profiles = program.profiles.map((r) => ({ id: r.id, name: r.name }));
  return (
    <div className="container-page max-w-3xl py-12">
      <PageHeader
        title="Categories"
        intro="Edit public descriptions, choose each category's rubric, and decide whether to offer the optional categories."
      />
      <div className="flex flex-col gap-8">
        {program.categories.map((c) => (
          <CategoryForm
            key={c.id}
            id={c.id}
            name={c.name}
            kind={c.kind}
            description={c.description}
            enabled={c.enabled}
            rubricProfileId={c.rubricProfileId}
            profiles={profiles}
            locked={program.locked}
          />
        ))}
      </div>
    </div>
  );
}
