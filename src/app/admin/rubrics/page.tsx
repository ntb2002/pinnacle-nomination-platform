import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/server/auth/session";
import { getAdminProgram } from "@/server/services/program-settings";
import { RubricForm } from "./rubric-form";

export const metadata: Metadata = { title: "Rubrics" };

export default async function AdminRubricsPage() {
  const actor = await requireRole("ADMIN");
  const program = await getAdminProgram(actor);
  if (!program) return <p className="container-page py-12">No active award cycle.</p>;
  return (
    <div className="container-page max-w-3xl py-12">
      <PageHeader
        title="Rubrics"
        intro="Weights for each category type. Each set must add up to 100%. The public methodology page shows these weights, and judging uses them."
      />
      {program.locked && (
        <p
          role="note"
          className="mb-8 rounded border-l-4 border-ink bg-surface px-4 py-3 font-semibold"
        >
          Judging has started, so the weights are locked for this cycle.
        </p>
      )}
      <div className="flex flex-col gap-8">
        {program.profiles.map((p) => (
          <RubricForm
            key={p.id}
            profileId={p.id}
            name={p.name}
            locked={program.locked}
            weights={{
              weightImpact: p.weightImpact,
              weightInnovation: p.weightInnovation,
              weightInfluence: p.weightInfluence,
              weightReferences: p.weightReferences,
            }}
          />
        ))}
      </div>
    </div>
  );
}
