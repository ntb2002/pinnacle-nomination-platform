import { describe, expect, it } from "vitest";
import { displayName, formatBytes, isUploadErrorCode, sniffType } from "@/lib/file-rules";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffType", () => {
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
