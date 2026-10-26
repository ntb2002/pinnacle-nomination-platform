import { formatDateTime } from "@/lib/dates";
import { NOMINATOR_STATUS, RETURN_REASON_LABEL, type ReturnReason } from "@/lib/entry-status";

interface Step {
  id: string;
  fromStatus: keyof typeof NOMINATOR_STATUS | null;
  toStatus: keyof typeof NOMINATOR_STATUS;
  returnReason: ReturnReason | null;
  message: string | null;
  at: Date;
}

const WHAT: Record<string, string> = {
  "DRAFT>SUBMITTED": "Paid and submitted",
  "SUBMITTED>APPROVED": "Accepted for judging",
  "SUBMITTED>RETURNED": "Returned for changes",
  "RETURNED>SUBMITTED": "Resubmitted",
};

/** The nominator's view of their entry's history. Never names who acted. */
export function Timeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <section aria-labelledby="timeline-heading" className="mt-10">
      <h2 id="timeline-heading" className="font-display text-2xl font-semibold">
        History
      </h2>
      <ol className="mt-4 flex flex-col gap-4 border-l-2 border-line pl-6">
        {steps.map((s) => (
          <li key={s.id}>
            <p className="font-semibold">
              {WHAT[`${s.fromStatus}>${s.toStatus}`] ?? NOMINATOR_STATUS[s.toStatus].label}
              {s.returnReason && `: ${RETURN_REASON_LABEL[s.returnReason]}`}
            </p>
            <p className="text-sm text-slate">{formatDateTime(s.at)}</p>
            {s.message && <p className="mt-1 max-w-[68ch] whitespace-pre-line">{s.message}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
