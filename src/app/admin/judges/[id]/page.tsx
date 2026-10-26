import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/lib/dates";
import { assignmentsOpen } from "@/lib/phases";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { declarationsForJudge } from "@/server/services/conflicts";
import { getJudge } from "@/server/services/judges-admin";
import { ActiveForm, AssignmentsForm, ConflictForm, ProfileForm } from "./judge-forms";

export const metadata: Metadata = { title: "Judge" };

export default async function AdminJudgePage({
  params,
  searchParams,
}: PageProps<"/admin/judges/[id]">) {
  const actor = await requireRole("ADMIN");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const j = await getJudge(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const declarations = await declarationsForJudge(actor, id);
  const p = j.profile ?? {
    displayName: j.email,
    title: "",
    organization: "",
    bio: "",
    isPublic: false,
    sortOrder: 0,
    active: true,
  };
  return (
    <div className="container-page max-w-4xl py-12">
      <p className="mb-4">
        <Link href="/admin/judges" className="font-semibold underline">
          All judges
        </Link>
      </p>
      <PageHeader
        title={p.displayName}
        intro={`${j.email}. ${p.active ? "Active." : "Inactive."}`}
      />
      {query.done === "invited" && (
        <div className="mb-8">
          <FlashNotice
            id="judge-message"
            error={false}
            text="Judge invited. They have been emailed a sign-in link."
          />
        </div>
      )}
      <div className="flex flex-col gap-8">
        <ProfileForm judgeId={j.id} p={p} />
        <div className="grid gap-8 md:grid-cols-2">
          <AssignmentsForm
            judgeId={j.id}
            round={1}
            categories={j.categories}
            selected={j.round1}
            locked={!assignmentsOpen(j.phase, 1)}
          />
          <AssignmentsForm
            judgeId={j.id}
            round={2}
            categories={j.categories}
            selected={j.round2}
            locked={!assignmentsOpen(j.phase, 2)}
          />
        </div>
        <section aria-labelledby="declarations-heading">
          <h2 id="declarations-heading" className="font-display text-2xl font-semibold">
            Conflict declarations
          </h2>
          <p className="mt-2">
            Approved entries in this judge&apos;s categories. A judge cannot undo a conflict; an
            admin can, with a reason.
          </p>
          {declarations.length === 0 ? (
            <p className="mt-4">No approved entries in this judge&apos;s categories yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line rounded border border-line bg-surface">
              {declarations.map((d) => {
                const label = `${d.nomineeName ?? "Unnamed nominee"}, ${d.categoryName}`;
                return (
                  <li key={d.entryId} className="px-4 py-3">
                    <p className="font-semibold">{label}</p>
                    <p className="text-sm">
                      {d.hasConflict === null
                        ? "Not declared yet"
                        : d.hasConflict
                          ? "Conflict (recused)"
                          : "No conflict"}
                      {d.declaredAt && `, ${formatShortDate(d.declaredAt)}`}
                      {d.recordedById && " (set by an admin)"}
                    </p>
                    {d.reason && (
                      <p className="text-sm text-slate">
                        {d.hasConflict ? "Judge's reason" : "Judge's earlier reason"}: {d.reason}
                      </p>
                    )}
                    {d.adminNote && <p className="text-sm text-slate">Admin note: {d.adminNote}</p>}
                    <ConflictForm
                      judgeId={j.id}
                      entryId={d.entryId}
                      hasConflict={d.hasConflict === true}
                      label={label}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <ActiveForm judgeId={j.id} active={p.active} />
      </div>
    </div>
  );
}
