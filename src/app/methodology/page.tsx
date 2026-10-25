import type { Metadata } from "next";
import Link from "next/link";
import { NoCycle } from "@/components/public/no-cycle";
import { PageIntro } from "@/components/public/page-intro";
import { Prose } from "@/components/public/prose";
import { RUBRIC_CRITERIA } from "@/lib/program-defaults";
import {
  getActiveCycle,
  getPublicCategories,
  getRubricProfiles,
} from "@/server/services/public-program";

export const metadata: Metadata = {
  title: "Judging methodology",
  description:
    "How Pinnacle Awards entries are judged: two rounds, a weighted rubric, conflict-of-interest recusal and a results embargo.",
};

const CRITERION_HELP: Record<string, string> = {
  impact: "Measurable business results over the past year, backed by the data points in the entry.",
  innovation: "New products, models or practices, and how far they move beyond what peers do.",
  influence: "Effect on the wider creator economy: standards, peers, partners and creators.",
  referenceValidation:
    "How well references from people who worked with the nominee support the claims.",
};

export default async function MethodologyPage() {
  const cycle = await getActiveCycle();
  if (!cycle) return <NoCycle />;
  const [profiles, categories] = await Promise.all([
    getRubricProfiles(cycle.id),
    getPublicCategories(cycle.id),
  ]);
  return (
    <>
      <PageIntro title="Judging methodology">
        <p>
          Every entry is judged the same way, by named judges, against the weights published here.
        </p>
      </PageIntro>
      <div className="container-page py-14">
        <Prose>
          <h2>The process</h2>
          <ol>
            <li>
              <strong>Eligibility review.</strong> Program staff check each paid entry for
              completeness and fit with its category. Entries can be returned to the nominator to
              fix before judging.
            </li>
            <li>
              <strong>Conflict declarations.</strong> Before seeing an entry, each judge declares
              whether they have a conflict of interest. Judges with a conflict are recused from that
              entry.
            </li>
            <li>
              <strong>Round one.</strong> At least two judges score each entry in their categories.
              Each category is narrowed to three to five finalists by average weighted score.
            </li>
            <li>
              <strong>Round two.</strong> Judges score the finalists again. The finalist with the
              highest average weighted score wins the category.
            </li>
            <li>
              <strong>Results.</strong> Winners are kept confidential until the program announces
              them.
            </li>
          </ol>
        </Prose>

        <section aria-labelledby="rubric-heading" className="mt-14">
          <h2 id="rubric-heading" className="font-display text-2xl font-semibold">
            The rubric
          </h2>
          <p className="mt-4 max-w-[68ch]">
            Judges score each criterion from 1 to 10. A judge&apos;s weighted score is the sum of
            each score times its weight, on a 0 to 100 scale. An entry&apos;s score is the average
            of its judges&apos; weighted scores.
          </p>
          {profiles.map((p) => {
            const used = categories.filter((c) => c.rubricProfileId === p.id);
            return (
              <div key={p.id} className="mt-10">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {used.length > 0 && (
                  <p className="mt-1 text-sm text-slate">
                    Used for {used.map((c) => c.name).join(", ")}.
                  </p>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <caption className="sr-only">Rubric weights: {p.name}</caption>
                    <thead>
                      <tr className="border-b-2 border-ink">
                        <th scope="col" className="py-3 pr-4">
                          Criterion
                        </th>
                        <th scope="col" className="py-3 text-right">
                          Weight
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {RUBRIC_CRITERIA.map((c) => (
                        <tr key={c.key} className="border-b border-line">
                          <th scope="row" className="py-4 pr-4 text-left align-top font-normal">
                            <span className="block font-semibold">{c.label}</span>
                            <span className="mt-1 block text-slate">{CRITERION_HELP[c.key]}</span>
                          </th>
                          <td className="py-4 text-right align-top font-display text-2xl font-semibold">
                            {p[c.weightKey]}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>

        <Prose>
          <h2>Finalists and ties</h2>
          <p>
            Each category has three to five finalists. If fewer than three eligible entries are
            received, all eligible entries may advance. When scores tie at the finalist cut-off or
            for the winner, a program administrator breaks the tie between the tied entries only,
            and records the reason.
          </p>
          <h2>Confidentiality</h2>
          <p>
            Entries, references and scores are visible only to program staff and to the assigned
            judges who have declared no conflict. Judges do not see nominator identities, payment
            details, references&apos; contact details, or other judges&apos; scores. Every staff and
            judge action is recorded in an audit log.
          </p>
          <h2>Disclosure</h2>
          <p>
            After finalists are announced, the program publishes the number of eligible entries and
            finalists in every category, and the resulting finalist rate. See the{" "}
            <Link href="/conflict-of-interest">conflict-of-interest policy</Link> and the{" "}
            <Link href="/judges">judging panel</Link>.
          </p>
        </Prose>
      </div>
    </>
  );
}
