/** Supporting-file rules (#8). One place, used by the form hints and the server. */
export const UPLOAD_RULES = {
  maxBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  maxNameLength: 120,
} as const;

export type AllowedType = "application/pdf" | "image/png" | "image/jpeg";

/** Extensions shown for each type; the first is used when a name lacks a matching one. */
const EXTENSIONS: Record<AllowedType, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
};

/**
 * The file's real type from its first bytes, or null when it is not an allowed type.
 * Never trusts the file name or the browser-supplied MIME type.
 */
export function sniffType(head: Uint8Array): AllowedType | null {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

/**
 * A safe name to show and to offer on download: no path, no control or reserved
 * characters, bounded length, and an extension that matches the sniffed type
 * ("report.html" that is really a PDF becomes "report.html.pdf").
 */
export function displayName(original: string, type: AllowedType): string {
  const base = original.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const ext = cleaned.includes(".") ? cleaned.split(".").pop()!.toLowerCase() : "";
  const allowed = EXTENSIONS[type];
  const suffix = allowed.includes(ext) ? "" : `.${allowed[0]}`;
  const name = (cleaned || "file").slice(0, UPLOAD_RULES.maxNameLength - suffix.length);
  return `${name}${suffix}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why an upload was refused. Codes travel in the redirect URL; messages never do. */
export const UPLOAD_ERRORS = {
  empty: "Choose a file to upload.",
  size: "That file is larger than 10 MB. Upload a smaller file.",
  type: "That file is not a PDF, PNG or JPEG. Upload one of those types.",
  count: `This entry already has ${UPLOAD_RULES.maxFiles} files. Remove one to add another.`,
  closed: "Files can only be changed while the entry is a draft or returned for changes.",
  failed: "The file could not be uploaded. Please try again.",
} as const;
export type UploadErrorCode = keyof typeof UPLOAD_ERRORS;

export function isUploadErrorCode(v: unknown): v is UploadErrorCode {
  return typeof v === "string" && Object.hasOwn(UPLOAD_ERRORS, v);
}
