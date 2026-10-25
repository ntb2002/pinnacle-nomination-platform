"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isUploadErrorCode, UPLOAD_ERRORS, UPLOAD_RULES } from "@/lib/file-rules";

/**
 * Uploads one supporting file. Without JavaScript it is a plain multipart form whose
 * response redirects back here. With JavaScript it refuses an oversized file before
 * sending it, uploads with fetch, and refreshes the page in place, so anything typed
 * in the entry form above and not yet saved is kept.
 */
export function UploadForm({
  entryId,
  full,
  serverError,
}: {
  entryId: string;
  full: boolean;
  /** Id of the page's error notice from the last upload, to describe the input. */
  serverError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (full) return <p className="mt-4">{UPLOAD_ERRORS.count}</p>;
  const editUrl = (query: string) => `/entries/${entryId}/edit?${query}#files-message`;
  const describedBy = ["file-hint", error ? "file-error" : serverError].filter(Boolean).join(" ");
  return (
    <form
      method="post"
      action={`/api/entries/${entryId}/attachments`}
      encType="multipart/form-data"
      className="mt-6 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.elements.namedItem("file") as HTMLInputElement | null;
        const file = input?.files?.[0];
        const problem = !file
          ? UPLOAD_ERRORS.empty
          : file.size > UPLOAD_RULES.maxBytes
            ? UPLOAD_ERRORS.size
            : null;
        if (problem) {
          setError(problem);
          input?.focus();
          return;
        }
        setSending(true);
        let query = "uploadError=failed";
        try {
          const res = await fetch(form.action, {
            method: "POST",
            body: new FormData(form),
            headers: { "x-upload-client": "fetch" },
          });
          if (res.status === 401) {
            form.submit(); // signed out meanwhile: the plain post leads to sign-in
            return;
          }
          const body = (await res.json().catch(() => ({}))) as { ok?: true; error?: unknown };
          if (body.ok) query = "upload=ok";
          else if (isUploadErrorCode(body.error)) query = `uploadError=${body.error}`;
        } catch {
          // Network failure: report it like a failed upload.
        }
        form.reset();
        setSending(false);
        router.replace(editUrl(`${query}&t=${Date.now()}`), { scroll: false });
      }}
    >
      <label htmlFor="file" className="font-semibold">
        Add a file
      </label>
      <p id="file-hint" className="text-sm text-slate">
        PDF, PNG or JPEG, up to 10 MB. Up to {UPLOAD_RULES.maxFiles} files per entry. Judges see
        these files, so leave out anything confidential you do not want them to read.
      </p>
      {error && (
        <p id="file-error" className="font-semibold text-danger">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
      <input
        id="file"
        name="file"
        type="file"
        required
        accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
        aria-describedby={describedBy}
        aria-invalid={error || serverError ? true : undefined}
        onChange={() => setError(null)}
        className="max-w-full rounded border border-line bg-paper p-2 file:mr-4 file:rounded file:border-0 file:bg-ink file:px-4 file:py-2 file:font-semibold file:text-on-ink"
      />
      <div>
        <button
          type="submit"
          disabled={sending}
          className="rounded border-2 border-ink px-5 py-2 font-semibold disabled:opacity-60"
        >
          {sending ? "Uploading…" : "Upload the file"}
        </button>
      </div>
    </form>
  );
}
