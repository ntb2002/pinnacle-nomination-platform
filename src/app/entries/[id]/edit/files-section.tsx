import { FlashNotice } from "@/components/flash-notice";
import { isUploadErrorCode, UPLOAD_ERRORS, UPLOAD_RULES } from "@/lib/file-rules";
import { removeAttachmentAction } from "../../actions";
import { AttachmentList, type AttachmentRow } from "../attachment-list";
import { UploadForm } from "./upload-form";

/** The result of the last upload or removal, from the redirect's query string. */
function notice(query: Record<string, string | string[] | undefined>) {
  if (query.upload === "ok") return { error: false, text: "File uploaded." };
  if (query.removed === "1") return { error: false, text: "File removed." };
  if (isUploadErrorCode(query.uploadError)) {
    return { error: true, text: UPLOAD_ERRORS[query.uploadError] };
  }
  return null;
}

/**
 * Supporting files on the edit page. Separate from the entry form: files are saved
 * the moment they are uploaded, and an upload is its own multipart request.
 */
export function FilesSection({
  entryId,
  files,
  query,
}: {
  entryId: string;
  files: AttachmentRow[];
  query: Record<string, string | string[] | undefined>;
}) {
  const n = notice(query);
  return (
    <section
      id="files"
      aria-labelledby="files-heading"
      className="mt-10 rounded border border-line bg-surface p-6"
    >
      <h2 id="files-heading" className="font-display text-2xl font-semibold">
        Supporting files (optional)
      </h2>
      <p className="mt-2">
        Evidence for the outcomes above, such as a results summary or press coverage. Files are
        saved as soon as they are uploaded.
      </p>
      {n && (
        <FlashNotice
          key={`${n.text}:${String(query.t ?? "")}:${files.map((f) => f.id).join(",")}`}
          id="files-message"
          error={n.error}
          text={n.text}
        />
      )}
      <AttachmentList
        files={files}
        action={(f) => (
          <form action={removeAttachmentAction.bind(null, entryId, f.id)}>
            <button type="submit" className="font-semibold text-danger underline">
              Remove<span className="sr-only"> {f.name}</span>
            </button>
          </form>
        )}
      />
      <UploadForm
        entryId={entryId}
        full={files.length >= UPLOAD_RULES.maxFiles}
        serverError={n?.error ? "files-message" : undefined}
      />
    </section>
  );
}
