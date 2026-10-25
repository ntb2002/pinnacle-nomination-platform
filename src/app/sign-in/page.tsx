import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/paths";
import { getActor } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to submit nominations, judge entries or administer the Pinnacle Awards.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (await getActor()) redirect(next);
  const linkError = params.error !== undefined;
  return (
    <div className="container-page max-w-xl py-16">
      <span className="summit-rule mb-8" />
      <h1 className="font-display text-4xl font-semibold">Sign in</h1>
      <p className="mt-4 text-slate">
        Nominators, judges and program staff all sign in with an emailed link.
      </p>
      {linkError && (
        <div
          role="alert"
          className="mt-6 rounded border-l-4 border-danger bg-danger-bg px-4 py-3 text-danger"
        >
          <p className="font-semibold">
            That sign-in link has expired or was already used. Request a new one below.
          </p>
        </div>
      )}
      <div className="mt-8">
        <SignInForm next={next} />
      </div>
    </div>
  );
}
