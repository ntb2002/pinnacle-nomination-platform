/** Standard heading block for signed-in areas. */
export function PageHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-10">
      <span className="summit-rule mb-6" />
      <h1 className="font-display text-4xl font-semibold">{title}</h1>
      {intro && <p className="mt-3 max-w-2xl text-slate">{intro}</p>}
    </div>
  );
}
