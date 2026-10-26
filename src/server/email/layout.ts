/** Shared plain-text + HTML email wrapper. Every interpolated value is escaped. */

export interface EmailContent {
  subject: string;
  /** Short paragraphs of plain text. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the action. */
  footnote?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FOOTER = "Pinnacle Awards, Center for the Creator Economy, Syracuse University";

export function renderEmail(content: EmailContent): RenderedEmail {
  const text = [
    ...content.paragraphs,
    ...(content.action ? [`${content.action.label}: ${content.action.url}`] : []),
    ...(content.footnote ? [content.footnote] : []),
    "--",
    FOOTER,
  ].join("\n\n");

  const p = (t: string) =>
    `<p style="margin:0 0 16px;font:16px/1.5 Arial,Helvetica,sans-serif;color:#000e54">${escapeHtml(t)}</p>`;
  const button = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:#000e54;color:#ffffff;padding:12px 20px;border-radius:4px;font:bold 16px Arial,Helvetica,sans-serif;text-decoration:none">${escapeHtml(content.action.label)}</a></p>`
    : "";
  const foot = content.footnote
    ? `<p style="margin:0 0 16px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#4a5170">${escapeHtml(content.footnote)}</p>`
    : "";
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f6f7fa"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-top:6px solid #f76900"><p style="margin:0 0 24px;font:bold 20px Georgia,serif;color:#000e54">Pinnacle Awards</p>${content.paragraphs.map(p).join("")}${button}${foot}<p style="margin:32px 0 0;font:12px Arial,Helvetica,sans-serif;color:#4a5170">${escapeHtml(FOOTER)}</p></div></body></html>`;

  return { subject: content.subject, text, html };
}
