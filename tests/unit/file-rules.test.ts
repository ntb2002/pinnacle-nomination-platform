import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  displayName,
  formatBytes,
  isUploadErrorCode,
  sniffType,
} from "@/lib/file-rules";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(path.join(import.meta.dirname, "../fixtures", name)));

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffType", () => {
  it("accepts real PDF, PNG and JPEG files and refuses HTML renamed .pdf", () => {
    expect(sniffType(fixture("sample.pdf"))).toBe("application/pdf");
    expect(sniffType(fixture("sample.png"))).toBe("image/png");
    expect(sniffType(fixture("sample.jpg"))).toBe("image/jpeg");
    expect(sniffType(fixture("disguised.pdf"))).toBeNull();
  });

  it("recognizes PDF, PNG and JPEG by their first bytes", () => {
    expect(sniffType(text("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });

  it("refuses anything else, whatever it is called", () => {
    expect(sniffType(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffType(text("<svg xmlns="))).toBeNull();
    expect(sniffType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip / docx
    expect(sniffType(text("%PDF"))).toBeNull(); // truncated signature
    expect(sniffType(new Uint8Array())).toBeNull();
  });
});

describe("displayName", () => {
  it("keeps a sensible name", () => {
    expect(displayName("Q3 results.pdf", "application/pdf")).toBe("Q3 results.pdf");
    expect(displayName("photo.JPEG", "image/jpeg")).toBe("photo.JPEG");
  });

  it("strips paths, control and reserved characters", () => {
    expect(displayName("../../etc/passwd.pdf", "application/pdf")).toBe("passwd.pdf");
    expect(displayName("C:\\Users\\x\\a<b>.png", "image/png")).toBe("ab.png");
    expect(displayName('evil"\r\nname.pdf', "application/pdf")).toBe("evilname.pdf");
  });

  it("appends the real extension when the name disagrees with the content", () => {
    expect(displayName("page.html", "application/pdf")).toBe("page.html.pdf");
    expect(displayName("noext", "image/png")).toBe("noext.png");
    expect(displayName("", "image/jpeg")).toBe("file.jpg");
  });

  it("bounds the length and keeps the extension", () => {
    const name = displayName(`${"a".repeat(300)}.pdf`, "application/pdf");
    expect(name.length).toBeLessThanOrEqual(120);
    const long = displayName("b".repeat(300), "application/pdf");
    expect(long.length).toBe(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("displayName against display spoofing", () => {
  it("removes bidi overrides and invisible characters", () => {
    // "invoice<U+202E>fdp.png" would display as "invoicegnp.pdf".
    expect(displayName("invoice\u202Efdp.png", "image/png")).toBe("invoicefdp.png");
    expect(displayName("a\u200Bb\uFEFF\u2066c.pdf", "application/pdf")).toBe("abc.pdf");
  });

  it("never splits a character when shortening", () => {
    const name = displayName("😀".repeat(200), "image/png");
    expect(name.endsWith(".png")).toBe(true);
    expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("contentDisposition", () => {
  it("is an attachment with an ASCII fallback and an RFC 5987 name", () => {
    expect(contentDisposition("Q3 results.pdf")).toBe(
      `attachment; filename="Q3 results.pdf"; filename*=UTF-8''Q3%20results.pdf`,
    );
    expect(contentDisposition("O'Brien (final).pdf")).toBe(
      `attachment; filename="O'Brien (final).pdf"; filename*=UTF-8''O%27Brien%20%28final%29.pdf`,
    );
    expect(contentDisposition('Résumé \\ "x".pdf')).toBe(
      `attachment; filename="R_sum_ _ _x_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%5C%20%22x%22.pdf`,
    );
  });
});

describe("helpers", () => {
  it("formats sizes and validates error codes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(isUploadErrorCode("size")).toBe(true);
    expect(isUploadErrorCode("toString")).toBe(false);
    expect(isUploadErrorCode("<script>")).toBe(false);
  });
});
