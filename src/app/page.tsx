import { connection } from "next/server";

export default async function HomePage() {
  // Pages render per request so the CSP nonce applies (src/proxy.ts).
  await connection();
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
    </>
  );
}
