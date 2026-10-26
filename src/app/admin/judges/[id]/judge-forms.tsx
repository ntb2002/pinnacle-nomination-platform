"use client";

import { useActionState } from "react";
import { Checkbox, TextArea } from "@/components/form/controls";
import { Field } from "@/components/form/field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { activeAction, assignmentsAction, conflictAction, updateProfileAction } from "../actions";

const box = "flex flex-col gap-4 rounded border border-line bg-surface p-6";
const h3 = "font-display text-xl font-semibold";

export function ProfileForm({
  judgeId,
  p,
}: {
  judgeId: string;
  p: {
    displayName: string;
    title: string;
    organization: string;
    bio: string;
    isPublic: boolean;
    sortOrder: number;
  };
}) {
  const [state, action] = useActionState(updateProfileAction, idleState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className={box} noValidate key={JSON.stringify(state)}>
      <input type="hidden" name="judgeId" value={judgeId} />
      <h3 className={h3}>Public profile</h3>
      <FormMessage
        state={state}
        idPrefix="profile-"
        labels={{
          displayName: "Name",
          title: "Title",
          organization: "Organization",
          bio: "Bio",
          sortOrder: "Order",
        }}
      />
      <Field
        id="profile-displayName"
        name="displayName"
        label="Name"
        defaultValue={v.displayName ?? p.displayName}
        errors={e.displayName}
        maxLength={120}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="profile-title"
          name="title"
          label="Title"
          defaultValue={v.title ?? p.title}
          errors={e.title}
          maxLength={120}
        />
        <Field
          id="profile-organization"
          name="organization"
          label="Organization"
          defaultValue={v.organization ?? p.organization}
          errors={e.organization}
          maxLength={160}
        />
      </div>
      <TextArea
        id="profile-bio"
        name="bio"
        label="Bio"
        rows={4}
        maxLength={1500}
        defaultValue={v.bio ?? p.bio}
        errors={e.bio}
      />
      <Field
        id="profile-sortOrder"
        name="sortOrder"
        label="Order on the public panel"
        hint="Lower numbers are listed first."
        inputMode="numeric"
        defaultValue={v.sortOrder ?? String(p.sortOrder)}
        errors={e.sortOrder}
      />
      <Checkbox
        id="profile-isPublic"
        name="isPublic"
        label="Show on the public judges page"
        defaultChecked={v.isPublic ? v.isPublic === "on" : p.isPublic}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save the profile</SubmitButton>
      </div>
    </form>
  );
}

export function AssignmentsForm({
  judgeId,
  round,
  categories,
  selected,
  locked,
}: {
  judgeId: string;
  round: 1 | 2;
  categories: { id: string; name: string }[];
  selected: string[];
  locked: boolean;
}) {
  const [state, action] = useActionState(assignmentsAction, idleState);
  return (
    <form action={action} className={box}>
      <input type="hidden" name="judgeId" value={judgeId} />
      <input type="hidden" name="round" value={round} />
      <fieldset disabled={locked} className="flex flex-col gap-3">
        <legend className={`${h3} mb-2`}>Round {round} categories</legend>
        <FormMessage state={state} />
        {locked && <p>Round {round} has closed, so these are fixed.</p>}
        {categories.map((c) => (
          <Checkbox
            key={c.id}
            id={`r${round}-${c.id}`}
            name="categoryId"
            value={c.id}
            label={c.name}
            defaultChecked={selected.includes(c.id)}
          />
        ))}
      </fieldset>
      {!locked && (
        <div>
          <SubmitButton pendingLabel="Saving…">Save round {round}</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function ActiveForm({ judgeId, active }: { judgeId: string; active: boolean }) {
  const [state, action] = useActionState(activeAction, idleState);
  return (
    <form action={action} className={box}>
      <input type="hidden" name="judgeId" value={judgeId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <h3 className={h3}>{active ? "Deactivate" : "Reactivate"}</h3>
      <FormMessage state={state} />
      <p>
        {active
          ? "An inactive judge sees no entries and is removed from the public panel. Their declarations and scores stay on record."
          : "This judge is inactive. Reactivating restores their assignments."}
      </p>
      <div>
        <SubmitButton pendingLabel="Saving…">
          {active ? "Deactivate the judge" : "Reactivate the judge"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Record a recusal for one entry, or clear a declared conflict. Both need a reason. */
export function ConflictForm({
  judgeId,
  entryId,
  hasConflict,
  label,
}: {
  judgeId: string;
  entryId: string;
  hasConflict: boolean;
  label: string;
}) {
  const [state, action] = useActionState(conflictAction, idleState);
  const id = `${entryId}-reason`;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-semibold underline">
        {hasConflict ? "Clear this conflict" : "Record a recusal"}
        <span className="sr-only"> for {label}</span>
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="judgeId" value={judgeId} />
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="intent" value={hasConflict ? "clear" : "record"} />
        <FormMessage state={state} idPrefix={`${entryId}-`} labels={{ reason: "Reason" }} />
        <TextArea
          id={id}
          name="reason"
          label="Reason (recorded in the audit log)"
          rows={2}
          maxLength={500}
          errors={state.fieldErrors?.reason}
        />
        <div>
          <SubmitButton pendingLabel="Saving…">
            {hasConflict ? "Clear the conflict" : "Record the recusal"}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
