import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="container-page py-20">
      <span className="summit-rule mb-8" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        You don&apos;t have access to this page
      </h1>
      <p className="mt-4 max-w-xl text-slate">
        Your account is signed in but does not have permission to view this area. If you think this
        is a mistake, contact the Pinnacle Awards team.
      </p>
      <p className="mt-8">
        <Link href="/" className="font-semibold text-ink underline">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
