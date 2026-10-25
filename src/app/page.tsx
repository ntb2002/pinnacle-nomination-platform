export default function HomePage() {
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
          <p className="mt-10 text-base">
            <span className="font-semibold text-signal">Nominations open January 26, 2027.</span>
          </p>
        </div>
      </section>
      <section aria-labelledby="how-heading" className="container-page py-16 sm:py-20">
        <h2 id="how-heading" className="font-display text-3xl font-semibold sm:text-4xl">
          How winners are chosen
        </h2>
        <ul className="mt-8 grid gap-8 sm:grid-cols-3">
          <li>
            <h3 className="text-lg font-semibold">A published methodology</h3>
            <p className="mt-2 text-slate">
              Every entry is scored on the same weighted rubric: impact and results, innovation,
              industry influence, and reference validation.
            </p>
          </li>
          <li>
            <h3 className="text-lg font-semibold">A named panel</h3>
            <p className="mt-2 text-slate">
              Judges are identified publicly. Each one declares conflicts of interest and is recused
              from any entry they are connected to.
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
    </>
  );
}
