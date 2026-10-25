/** Navy title band for public pages: the program's voice, set in the display face. */
export function PageIntro({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="on-ink bg-ink text-on-ink">
      <div className="container-page pb-14 pt-12 sm:pb-16 sm:pt-14">
        <span className="summit-rule mb-6" />
        <h1 className="max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-6xl">
          {title}
        </h1>
        {children && <div className="mt-5 max-w-2xl text-lg text-on-ink-muted">{children}</div>}
      </div>
    </section>
  );
}
