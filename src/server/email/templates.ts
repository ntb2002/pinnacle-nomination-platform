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
