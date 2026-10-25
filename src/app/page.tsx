import Link from "next/link";
import { KeyDates } from "@/components/public/key-dates";
import { formatDate } from "@/lib/dates";
import { getActiveCycle, getPublicCategories } from "@/server/services/public-program";

export default async function HomePage() {
  const cycle = await getActiveCycle();
  const categories = cycle ? await getPublicCategories(cycle.id) : [];
  return (
    <>
      <section className="on-ink bg-ink text-on-ink">
        <div className="container-page pb-20 pt-16 sm:pb-28 sm:pt-24">
          <span className="summit-rule mb-8" />
          <h1 className="max-w-4xl font-display text-5xl leading-[1.05] font-semibold sm:text-7xl">
            Recognizing the executives who build the creator economy.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-on-ink-muted">
            The first academically credentialed executive awards for the creator economy, judged by
            a named panel against a published methodology.
          </p>
          {cycle && (
            <p className="mt-10 text-base">
              <span className="font-semibold text-signal">
                {cycle.name}: nominations open {formatDate(cycle.nominationsOpenAt)}.
              </span>
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/entries"
              className="rounded bg-signal px-5 py-3 font-semibold text-ink hover:bg-on-ink"
            >
              Start a nomination
            </Link>
            <Link
              href="/methodology"
              className="rounded border-2 border-on-ink-muted px-5 py-3 font-semibold text-on-ink hover:border-on-ink"
            >
              Read the methodology
            </Link>
          </div>
        </div>
      </section>

      {cycle && (
        <section aria-labelledby="dates-heading" className="container-page pt-16">
          <h2 id="dates-heading" className="font-display text-3xl font-semibold sm:text-4xl">
            Key dates
          </h2>
          <p className="mt-3 max-w-2xl text-slate">
            Each entry nominates one person in one category and is billed separately. The fee
            depends on the date you submit.
          </p>
          <div className="mt-8">
            <KeyDates cycle={cycle} />
          </div>
        </section>
      )}

      <section aria-labelledby="how-heading" className="container-page py-16 sm:py-20">
        <h2 id="how-heading" className="font-display text-3xl font-semibold sm:text-4xl">
          How winners are chosen
        </h2>
        <ul className="mt-8 grid gap-8 sm:grid-cols-3">
          <li>
            <h3 className="text-lg font-semibold">A published methodology</h3>
            <p className="mt-2 text-slate">
              Every entry is scored on the same weighted rubric: impact and results, innovation,
              industry influence, and reference validation.{" "}
              <Link href="/methodology" className="font-semibold text-ink underline">
                See the weights
              </Link>
              .
            </p>
          </li>
          <li>
            <h3 className="text-lg font-semibold">A named panel</h3>
            <p className="mt-2 text-slate">
              Judges are identified publicly. Each one declares conflicts of interest and is recused
              from any entry they are connected to.{" "}
              <Link href="/conflict-of-interest" className="font-semibold text-ink underline">
                Read the policy
              </Link>
              .
            </p>
          </li>
          <li>
            <h3 className="text-lg font-semibold">Two rounds of judging</h3>
            <p className="mt-2 text-slate">
              Round one selects three to five finalists per category. Round two selects one winner.
              Finalist rates are disclosed for every category.
            </p>
          </li>
        </ul>
      </section>

      {categories.length > 0 && (
        <section aria-labelledby="cat-heading" className="border-t border-line bg-surface">
          <div className="container-page py-16">
            <h2 id="cat-heading" className="font-display text-3xl font-semibold sm:text-4xl">
              {categories.length} categories
            </h2>
            <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => (
                <li key={c.slug} className="border-l-4 border-signal pl-4 text-lg font-semibold">
                  {c.name}
                </li>
              ))}
            </ul>
            <p className="mt-8">
              <Link href="/categories" className="font-semibold text-ink underline">
                What each category recognizes
              </Link>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
