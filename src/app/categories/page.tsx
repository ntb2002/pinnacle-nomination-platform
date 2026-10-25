import type { Metadata } from "next";
import { NoCycle } from "@/components/public/no-cycle";
import { PageIntro } from "@/components/public/page-intro";
import { getActiveCycle, getPublicCategories } from "@/server/services/public-program";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "The Pinnacle Awards categories: seven core executive awards and optional awards for GenAI and campaigns.",
};

export default async function CategoriesPage() {
  const cycle = await getActiveCycle();
  const categories = cycle ? await getPublicCategories(cycle.id) : [];
  const groups = [
    { kind: "CORE", title: "Core categories", items: categories.filter((c) => c.kind === "CORE") },
    {
      kind: "OPTIONAL",
      title: "Additional categories",
      items: categories.filter((c) => c.kind === "OPTIONAL"),
    },
  ].filter((g) => g.items.length > 0);
  return (
    <>
      <PageIntro title="Categories">
        <p>
          Each entry nominates one person in one category. You can nominate the same person in more
          than one category with separate entries.
        </p>
      </PageIntro>
      {!cycle ? (
        <NoCycle />
      ) : (
        <div className="container-page py-14">
          {groups.map((g) => (
            <section key={g.kind} aria-labelledby={`${g.kind}-heading`} className="mb-14">
              <h2 id={`${g.kind}-heading`} className="font-display text-3xl font-semibold">
                {g.title}
              </h2>
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {g.items.map((c) => (
                  <li key={c.slug} className="grid gap-2 py-6 sm:grid-cols-[1fr_2fr] sm:gap-8">
                    <h3 className="text-xl font-semibold">{c.name}</h3>
                    <p className="text-slate">{c.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
