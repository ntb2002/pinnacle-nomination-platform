import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-20">
      <span className="summit-rule mb-8" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">Page not found</h1>
      <p className="mt-4 max-w-xl text-slate">
        The page you asked for does not exist or has moved. Check the address, or return to the home
        page.
      </p>
      <p className="mt-8">
        <Link href="/" className="font-semibold text-ink underline">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
