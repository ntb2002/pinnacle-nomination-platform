import { formatDateTime } from "@/lib/dates";
import { ADMIN_STATUS_LABEL, RETURN_REASON_LABEL, type ReturnReason } from "@/lib/entry-status";

interface Event {
  id: string;
  fromStatus: keyof typeof ADMIN_STATUS_LABEL | null;
  toStatus: keyof typeof ADMIN_STATUS_LABEL;
  returnReason: ReturnReason | null;
  note: string | null;
  at: Date;
  actorName: string | null;
  actorRole: string | null;
}

const who = (e: Event) =>
  e.actorName
    ? `${e.actorName}${e.actorRole ? ` (${e.actorRole.toLowerCase()})` : ""}`
    : "System (payment)";

/** Admin view of an entry's status history: who, when, from → to, reason and note. */
export function History({ events }: { events: Event[] }) {
  if (events.length === 0) return <p className="mt-4">No status changes yet.</p>;
  return (
    <ol className="mt-4 flex flex-col gap-4 border-l-2 border-line pl-6">
      {events.map((e) => (
        <li key={e.id}>
          <p className="font-semibold">
            {e.fromStatus ? `${ADMIN_STATUS_LABEL[e.fromStatus]} → ` : ""}
            {ADMIN_STATUS_LABEL[e.toStatus]}
            {e.returnReason && `: ${RETURN_REASON_LABEL[e.returnReason]}`}
          </p>
          <p className="text-sm text-slate">
            {formatDateTime(e.at)} by {who(e)}
          </p>
          {e.note && <p className="mt-1 max-w-[68ch] whitespace-pre-line">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
