"use client";

import { useState } from "react";
import { UPLOAD_ERRORS, UPLOAD_RULES } from "@/lib/file-rules";

/**
 * A plain multipart form posting to the upload route, so it works without JavaScript.
 * With JavaScript it also refuses an oversized file before sending it and shows that
 * the upload is in progress.
 */
export function UploadForm({ entryId, full }: { entryId: string; full: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (full) return <p className="mt-4">{UPLOAD_ERRORS.count}</p>;
  return (
    <form
      method="post"
      action={`/api/entries/${entryId}/attachments`}
      encType="multipart/form-data"
      className="mt-6 flex flex-col gap-3"
      onSubmit={(e) => {
        const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
        const file = input?.files?.[0];
        const problem = !file
          ? UPLOAD_ERRORS.empty
          : file.size > UPLOAD_RULES.maxBytes
            ? UPLOAD_ERRORS.size
            : null;
        if (problem) {
          e.preventDefault();
          setError(problem);
          input?.focus();
          return;
        }
        setSending(true);
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
        aria-describedby={error ? "file-hint file-error" : "file-hint"}
        aria-invalid={error ? true : undefined}
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
