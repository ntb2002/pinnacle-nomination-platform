import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/public/page-intro";
import { getPublicJudges } from "@/server/services/public-program";

export const metadata: Metadata = {
  title: "Judging panel",
  description: "The named judges of the Pinnacle Awards.",
};

export default async function JudgesPage() {
  const judges = await getPublicJudges();
  return (
    <>
      <PageIntro title="Judging panel">
        <p>
          The Pinnacle Awards are judged by named practitioners and scholars of the creator economy.
          Every judge follows the{" "}
          <Link href="/conflict-of-interest" className="font-semibold text-on-ink underline">
            conflict-of-interest policy
          </Link>
          .
        </p>
      </PageIntro>
      <div className="container-page py-14">
        {judges.length === 0 ? (
          <p className="text-slate">The judging panel will be announced before judging begins.</p>
        ) : (
          <ul className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {judges.map((j) => (
              <li key={`${j.name}-${j.organization}`} className="border-t-4 border-ink pt-5">
                <h2 className="font-display text-2xl font-semibold">{j.name}</h2>
                <p className="mt-1 font-semibold">
                  {j.title}
                  {j.title && j.organization ? ", " : ""}
                  {j.organization}
                </p>
                {j.bio && <p className="mt-3 text-slate">{j.bio}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
