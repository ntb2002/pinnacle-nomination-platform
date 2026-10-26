import type { Metadata } from "next";
import { FlashNotice } from "@/components/flash-notice";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";
import { requireRole } from "@/server/auth/session";
import { listUndeliveredEmails } from "@/server/services/email-admin";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Emails" };

const TEMPLATE: Record<string, string> = {
  "sign-in": "Sign-in link",
  payment_receipt: "Payment receipt",
  entry_status: "Entry status update",
  entry_resubmitted: "Resubmitted entry (to the program team)",
  finalist: "Finalist result",
  not_advanced: "Round one result",
  "role-granted": "Access granted",
  "judge-invite": "Judge invitation",
};

const DONE: Record<string, { error: boolean; text: string }> = {
  sent: { error: false, text: "Email delivered." },
  failed: { error: true, text: "The email still could not be delivered. Its error is below." },
};

export default async function AdminEmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const actor = await requireRole("ADMIN");
  const [{ rows, smtp, maxAttempts }, query] = await Promise.all([
    listUndeliveredEmails(actor),
    searchParams,
  ]);
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Undelivered emails"
        intro={`Emails the mail server did not accept. Each is retried automatically, with growing gaps, up to ${maxAttempts} times; after that, or at any time, you can resend it here. Sign-in links are not kept: the person requests a new one.`}
      />
      {done && (
        <div className="mb-8">
          <FlashNotice id="email-message" error={done.error} text={done.text} />
        </div>
      )}
      {!smtp && (
        <p role="note" className="mb-6 rounded border-l-4 border-signal px-4 py-3">
          This server writes email to the development mailbox, so nothing can fail here.
        </p>
      )}
      {rows.length === 0 ? (
        <p>Every email has been delivered.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Emails table">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <caption className="sr-only">Undelivered emails, newest first</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                {["Email", "To", "Attempts", "Last error", "Next try", ""].map((h, i) => (
                  <th key={i} scope="col" className="py-3 pr-4">
                    {h || <span className="sr-only">Action</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="font-semibold">{TEMPLATE[r.template] ?? r.template}</span>
                    <span className="block text-slate">{r.subject}</span>
                    <span className="block text-slate">Queued {formatDateTime(r.createdAt)}</span>
                  </th>
                  <td className="py-3 pr-4 break-all">{r.toAddress}</td>
                  <td className="py-3 pr-4">{r.attempts}</td>
                  <td className="py-3 pr-4">{r.error ?? "Interrupted"}</td>
                  <td className="py-3 pr-4">
                    {r.autoRetry && r.nextAttemptAt ? formatDateTime(r.nextAttemptAt) : "None"}
                  </td>
                  <td className="py-3">
                    {r.resendable ? (
                      <ResendForm emailId={r.id} label={`${r.subject} to ${r.toAddress}`} />
                    ) : (
                      <span className="text-slate">Not kept</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
