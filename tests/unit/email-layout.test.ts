import { describe, expect, it } from "vitest";
import { renderEmail } from "@/server/email/layout";

describe("renderEmail", () => {
  it("escapes interpolated values in HTML and keeps plain text readable", () => {
    const r = renderEmail({
      subject: "Hi",
      paragraphs: ["<script>alert(1)</script> & co"],
      action: { label: "Go", url: 'https://x.example/?a=1&b="2"' },
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("a=1&amp;b=&quot;2&quot;");
    expect(r.text).toContain("<script>alert(1)</script> & co");
    expect(r.text).toContain('Go: https://x.example/?a=1&b="2"');
  });
});
