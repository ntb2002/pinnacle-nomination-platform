import type { Metadata } from "next";
import { PageIntro } from "@/components/public/page-intro";
import { Prose } from "@/components/public/prose";

export const metadata: Metadata = {
  title: "Conflict-of-interest policy",
  description: "How Pinnacle Awards judges declare conflicts of interest and are recused.",
};

// TODO(copy): policy text to be approved by CCE and Syracuse University counsel.
export default function ConflictOfInterestPage() {
  return (
    <>
      <PageIntro title="Conflict-of-interest policy">
        <p>Judges never score an entry they have a personal or financial connection to.</p>
      </PageIntro>
      <div className="container-page py-14">
        <Prose>
          <h2>What counts as a conflict</h2>
          <p>
            A judge has a conflict of interest with an entry when any of the following is true now
            or was true in the past three years:
          </p>
          <ul>
            <li>
              They are employed by, or have a financial interest in, the nominee&apos;s organization
              or a direct competitor.
            </li>
            <li>They have reported to, managed, or worked closely with the nominee.</li>
            <li>
              They represent, are represented by, or have a commercial agreement with the nominee.
            </li>
            <li>
              They are a family member or close personal friend of the nominee or the nominator.
            </li>
            <li>They are listed as a reference on the entry, or helped prepare it.</li>
            <li>
              Any other relationship that a reasonable person would see as affecting their judgment.
            </li>
          </ul>
          <h2>Declaring and recusal</h2>
          <p>
            Before a judge can open any entry, they see only the nominee&apos;s name, title and
            organization, and must declare for each entry whether they have a conflict. A judge who
            declares a conflict is recused: the system does not let them view, download or score
            that entry, and it is excluded from their totals.
          </p>
          <p>
            A judge cannot withdraw a declared conflict. Program staff may record a recusal on a
            judge&apos;s behalf, and every declaration and change is kept in an audit log.
          </p>
          <h2>Coverage</h2>
          <p>
            Program staff check that every eligible entry is scored by at least two judges without a
            conflict, and assign additional judges where recusals leave a gap.
          </p>
          <h2>Nominations by judges</h2>
          <p>Judges may not submit nominations in the cycle they judge.</p>
          <h2>Questions</h2>
          <p>
            Judges who are unsure whether a relationship is a conflict should declare it. Questions
            about this policy go to the Pinnacle Awards team at the Center for the Creator Economy.
          </p>
        </Prose>
      </div>
    </>
  );
}
