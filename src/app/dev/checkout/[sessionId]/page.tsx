import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getMockCheckout } from "@/server/services/mock-checkout";
import { cancelMockAction, payMockAction } from "./actions";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

/**
 * Stand-in for Stripe's hosted checkout page when PAYMENTS_PROVIDER=mock (never in
 * production). No card details are asked for; paying sends a signed test event.
 */
export default async function MockCheckoutPage({ params }: PageProps<"/dev/checkout/[sessionId]">) {
  const actor = await requireRole("NOMINATOR");
  const { sessionId } = await params;
  const s = await getMockCheckout(actor, sessionId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="container-page max-w-xl py-12">
      <p
        role="note"
        className="mb-8 rounded border-l-4 border-signal bg-surface px-4 py-3 font-semibold"
      >
        Test checkout. No money changes hands. In production this step is Stripe&apos;s secure
        payment page.
      </p>
      <h1 className="font-display text-4xl font-semibold">Pay the entry fee</h1>
      <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-x-6 gap-y-3">
        <dt className="font-semibold">Entry</dt>
        <dd>
          {s.nomineeName ?? "Unnamed nominee"}, {s.categoryName}
        </dd>
        <dt className="font-semibold">Amount</dt>
        <dd>{formatCents(s.amountCents)}</dd>
        {s.expiresAt && (
          <>
            <dt className="font-semibold">Pay by</dt>
            <dd>{formatDateTime(s.expiresAt)}</dd>
          </>
        )}
      </dl>
      {s.payable ? (
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <form action={payMockAction.bind(null, sessionId)}>
            <button
              type="submit"
              className="rounded bg-ink px-6 py-3 font-semibold text-on-ink hover:bg-ink-raised"
            >
              Pay {formatCents(s.amountCents)} (test)
            </button>
          </form>
          <form action={cancelMockAction.bind(null, sessionId)}>
            <button type="submit" className="font-semibold underline">
              Cancel and go back
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-10">
          This checkout has ended.{" "}
          <a href={`/entries/${s.entryId}`} className="font-semibold underline">
            Return to your entry
          </a>
        </p>
      )}
    </div>
  );
}
