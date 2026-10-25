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
