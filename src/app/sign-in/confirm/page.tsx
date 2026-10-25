import type { Metadata } from "next";
import { safeNextPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Confirm sign-in", robots: { index: false } };

/**
 * Landing page for emailed links. Spending the single-use token needs a button press,
 * so email link scanners that open the link do not sign the person in or burn the link.
 */
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/sign-in/confirm">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <div className="container-page max-w-xl py-16">
      <span className="summit-rule mb-8" />
      <h1 className="font-display text-4xl font-semibold">Finish signing in</h1>
      {token ? (
        <>
          <p className="mt-4 text-slate">Press the button to sign in on this device.</p>
          <form method="get" action="/api/auth/magic-link/verify" className="mt-8">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="callbackURL" value={next} />
            <input type="hidden" name="errorCallbackURL" value="/sign-in?error=link" />
            <button
              type="submit"
              className="rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised"
            >
              Sign in
            </button>
          </form>
        </>
      ) : (
        <p className="mt-4 text-slate">
          This link is incomplete.{" "}
          <a href="/sign-in" className="font-semibold text-ink underline">
            Request a new sign-in link
          </a>
          .
        </p>
      )}
    </div>
  );
}
