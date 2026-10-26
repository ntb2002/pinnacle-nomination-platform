import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/paths";
import { getActor } from "@/server/auth/session";
import { pendingSignInEmail } from "@/server/auth/sign-in-link";

export const metadata: Metadata = { title: "Confirm sign-in", robots: { index: false } };

/**
 * Landing page for emailed links. Spending the single-use token needs a button press,
 * so email link scanners that open the link do not sign the person in or burn the link.
 * The page names the account the link belongs to, and warns before replacing a
 * different signed-in account (defense against someone sending you their own link).
 */
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/sign-in/confirm">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const [email, actor] = await Promise.all([pendingSignInEmail(token), getActor()]);

  return (
    <div className="container-page max-w-xl py-16">
      <span className="summit-rule mb-8" />
      <h1 className="font-display text-4xl font-semibold">Finish signing in</h1>
      {email ? (
        <>
          <p className="mt-4 text-slate">
            This link signs you in as <strong className="text-ink">{email}</strong>. Press the
            button to continue on this device.
          </p>
          {actor && actor.email !== email && (
            <div
              role="alert"
              className="mt-6 rounded border-l-4 border-danger bg-danger-bg px-4 py-3 text-danger"
            >
              <p className="font-semibold">
                You are signed in as {actor.email}. Continuing signs you out of that account. If you
                did not request this link, close this page.
              </p>
            </div>
          )}
          <form method="get" action="/api/auth/magic-link/verify" className="mt-8">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="callbackURL" value={next} />
            <input type="hidden" name="errorCallbackURL" value="/sign-in?error=link" />
            <button
              type="submit"
              className="rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised"
            >
              Sign in as {email}
            </button>
          </form>
        </>
      ) : (
        <p className="mt-4 text-slate">
          This sign-in link has expired or was already used.{" "}
          <Link href="/sign-in" className="font-semibold text-ink underline">
            Request a new sign-in link
          </Link>
          .
        </p>
      )}
    </div>
  );
}
