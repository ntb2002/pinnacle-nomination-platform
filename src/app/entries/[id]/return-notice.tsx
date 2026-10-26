import { RETURN_REASON_LABEL, type ReturnReason } from "@/lib/entry-status";

/** The program team's request on a returned entry, shown above the review and edit pages. */
export function ReturnNotice({
  reason,
  message,
}: {
  reason: ReturnReason | null;
  message: string | null;
}) {
  return (
    <section
      aria-labelledby="return-heading"
      className="mb-8 rounded border-l-4 border-signal bg-surface px-5 py-4"
    >
      <h2 id="return-heading" className="text-lg font-semibold">
        The program team returned this entry
        {reason ? `: ${RETURN_REASON_LABEL[reason].toLowerCase()}` : ""}
      </h2>
      {message && <p className="mt-2 max-w-[68ch] whitespace-pre-line">{message}</p>}
      <p className="mt-2 text-sm">
        Make the changes, then resubmit from the entry page. There is no new fee.
        {reason === "WRONG_CATEGORY" &&
          " You can move the entry to another category on the edit page."}
      </p>
    </section>
  );
}
