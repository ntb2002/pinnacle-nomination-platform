import { formatBytes } from "@/lib/file-rules";

export interface AttachmentRow {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
}

const TYPE_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
};

/**
 * An entry's supporting files as download links. `action` renders a control per file
 * (e.g. a remove button) when the list is editable.
 */
export function AttachmentList({
  files,
  action,
}: {
  files: AttachmentRow[];
  action?: (file: AttachmentRow) => React.ReactNode;
}) {
  if (files.length === 0) return <p className="mt-4">No files added.</p>;
  return (
    <ul className="mt-4 flex flex-col divide-y divide-line rounded border border-line bg-surface">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <a href={`/api/attachments/${f.id}`} className="break-all font-semibold underline">
              {f.name}
            </a>
            <span className="block text-sm text-slate">
              {TYPE_LABEL[f.contentType] ?? "File"}, {formatBytes(f.sizeBytes)}
            </span>
          </span>
          {action?.(f)}
        </li>
      ))}
    </ul>
  );
}
