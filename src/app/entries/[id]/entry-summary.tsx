/** Read-only view of an entry's content, for its nominator. */
export interface EntryView {
  nomineeName: string | null;
  nomineeTitle: string | null;
  nomineeCompany: string | null;
  nomineeEmail: string | null;
  nomineeLinkedinUrl: string | null;
  narrative: string | null;
  outcomes: { position: number; description: string; dataPoint: string }[];
  references: {
    position: number;
    name: string;
    title: string;
    organization: string;
    email: string;
    phone: string;
    relationship: string;
  }[];
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "Not provided");

export function EntrySummary({ entry }: { entry: EntryView }) {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="sum-nominee">
        <h2 id="sum-nominee" className="font-display text-2xl font-semibold">
          The nominee
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
          {[
            ["Name", entry.nomineeName],
            ["Title", entry.nomineeTitle],
            ["Company", entry.nomineeCompany],
            ["Email", entry.nomineeEmail],
            ["LinkedIn", entry.nomineeLinkedinUrl],
          ].map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd className="break-words">{dash(val)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="sum-narrative">
        <h2 id="sum-narrative" className="font-display text-2xl font-semibold">
          The narrative
        </h2>
        <div className="mt-4 max-w-[68ch] whitespace-pre-line">{dash(entry.narrative)}</div>
      </section>
      <section aria-labelledby="sum-outcomes">
        <h2 id="sum-outcomes" className="font-display text-2xl font-semibold">
          Outcomes
        </h2>
        {entry.outcomes.length === 0 ? (
          <p className="mt-4">Not provided</p>
        ) : (
          <ol className="mt-4 flex list-decimal flex-col gap-3 pl-6">
            {entry.outcomes.map((o) => (
              <li key={o.position}>
                <p className="font-semibold">{o.description}</p>
                <p className="text-slate">{o.dataPoint}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section aria-labelledby="sum-references">
        <h2 id="sum-references" className="font-display text-2xl font-semibold">
          References
        </h2>
        {entry.references.length === 0 ? (
          <p className="mt-4">Not provided</p>
        ) : (
          <ul className="mt-4 grid gap-6 sm:grid-cols-2">
            {entry.references.map((r) => (
              <li key={r.position} className="rounded border border-line bg-surface p-4">
                <p className="font-semibold">{r.name}</p>
                <p>
                  {r.title}, {r.organization}
                </p>
                <p className="text-slate">{r.relationship}</p>
                <p className="mt-2 break-words text-sm">
                  {r.email} · {r.phone}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
