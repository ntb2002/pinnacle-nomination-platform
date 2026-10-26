import { formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { EmailContent } from "./layout";

/** Sign-in link. The link opens a confirmation page; the token is only spent on its button. */
export function signInEmail(link: string): EmailContent {
  return {
    subject: "Your Pinnacle Awards sign-in link",
    paragraphs: [
      "Use this link to sign in to the Pinnacle Awards. It works once and expires in 15 minutes.",
    ],
    action: { label: "Sign in", url: link },
    footnote:
      "If you did not ask to sign in, you can ignore this email. Nobody can sign in without this link.",
  };
}

export function roleGrantedEmail(roleLabel: string, appUrl: string): EmailContent {
  return {
    subject: `You now have ${roleLabel} access to the Pinnacle Awards`,
    paragraphs: [
      `A Pinnacle Awards administrator gave your account ${roleLabel} access.`,
      "Sign in with this email address to get started.",
    ],
    action: { label: "Sign in", url: `${appUrl}/sign-in` },
  };
}

const TIER_LABEL = { EARLY: "Early", REGULAR: "Regular", LATE: "Late" } as const;

/** Receipt after an entry fee is paid (sent from the verified webhook, never the redirect). */
export function receiptEmail(r: {
  categoryName: string;
  nomineeName: string;
  amountCents: number;
  tier: keyof typeof TIER_LABEL | null;
  paidAt: Date;
  reference: string;
  entryUrl: string;
}): EmailContent {
  const tier = r.tier ? `${TIER_LABEL[r.tier]} entry fee` : "Entry fee";
  return {
    subject: `Receipt: Pinnacle Awards entry for ${r.categoryName}`,
    paragraphs: [
      `Thank you. We received your payment and your entry is submitted.`,
      `Entry: ${r.nomineeName}, ${r.categoryName}.`,
      `${tier}: ${formatCents(r.amountCents)}, paid ${formatDateTime(r.paidAt)}.`,
      `Payment reference: ${r.reference}.`,
      "The program team reviews each entry for completeness before judging. We will email you if anything needs to change.",
    ],
    action: { label: "View your entry", url: r.entryUrl },
    footnote:
      "Keep this email as your receipt. Card details are handled by our payment processor and are never stored by the Pinnacle Awards.",
  };
}

/** To the nominator: the entry passed the eligibility review. */
export function entryApprovedEmail(r: {
  categoryName: string;
  nomineeName: string;
  entryUrl: string;
}): EmailContent {
  return {
    subject: `Accepted for judging: ${r.nomineeName}, ${r.categoryName}`,
    paragraphs: [
      `Your entry for ${r.nomineeName} in ${r.categoryName} passed the program team's eligibility review and will be judged.`,
      "Judging runs in two rounds. We will email you when finalists are announced.",
    ],
    action: { label: "View your entry", url: r.entryUrl },
  };
}

/** To the nominator: the entry needs changes before judging, with the team's message. */
export function entryReturnedEmail(r: {
  categoryName: string;
  nomineeName: string;
  reasonLabel: string;
  message: string;
  entryUrl: string;
}): EmailContent {
  return {
    subject: `Changes needed: ${r.nomineeName}, ${r.categoryName}`,
    paragraphs: [
      `The program team reviewed your entry for ${r.nomineeName} in ${r.categoryName} and returned it for changes (${r.reasonLabel.toLowerCase()}).`,
      "Their message:",
      // One paragraph per line, so the team's line breaks survive in the HTML email.
      ...r.message
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
      "Update the entry and resubmit it. There is no new fee. Entries must be resubmitted before judging opens.",
    ],
    action: { label: "Update your entry", url: r.entryUrl },
  };
}

/** To the program team: a returned entry came back. */
export function entryResubmittedEmail(r: {
  categoryName: string;
  nomineeName: string;
  changes: string;
  adminUrl: string;
}): EmailContent {
  return {
    subject: `Resubmitted for review: ${r.nomineeName}, ${r.categoryName}`,
    paragraphs: [`A returned entry was resubmitted and is waiting for review.`, r.changes],
    action: { label: "Review the entry", url: r.adminUrl },
  };
}

/** To a new judge: what the role involves and how to sign in. */
export function judgeInviteEmail(r: { name: string; signInUrl: string }): EmailContent {
  return {
    subject: "You are invited to judge the Pinnacle Awards",
    paragraphs: [
      `${r.name}, the Pinnacle Awards program team has added you to the judging panel.`,
      "Before you read an entry you will be asked, for each one, whether you have a conflict of interest. You only see the nominee's name, title and company until you answer.",
      "Sign in with this email address to see your categories.",
    ],
    action: { label: "Sign in to judge", url: r.signInUrl },
  };
}

/** To a finalist's nominator: the result, and the finalist package fee for round two. */
export function finalistEmail(r: {
  categoryName: string;
  nomineeName: string;
  feeCents: number;
  entryUrl: string;
}): EmailContent {
  return {
    subject: `Finalist: ${r.nomineeName}, ${r.categoryName}`,
    paragraphs: [
      `Congratulations. ${r.nomineeName} is a finalist for ${r.categoryName} in the Pinnacle Awards.`,
      `Round two judging selects one winner per category. To take part, pay the finalist package fee of ${formatCents(r.feeCents)} from the entry page.`,
      "Please keep the result confidential until the program announces finalists publicly.",
    ],
    action: { label: "Pay the finalist package fee", url: r.entryUrl },
  };
}

/** To a nominator whose entry did not advance to round two. */
export function notAdvancedEmail(r: {
  categoryName: string;
  nomineeName: string;
  entryUrl: string;
}): EmailContent {
  return {
    subject: `Pinnacle Awards round one result: ${r.categoryName}`,
    paragraphs: [
      `Thank you for nominating ${r.nomineeName} for ${r.categoryName}. The judges scored every entry, and this entry did not advance to the finalist round.`,
      "The methodology and the finalist rate for each category are published on the awards site.",
    ],
    action: { label: "View your entry", url: r.entryUrl },
  };
}
