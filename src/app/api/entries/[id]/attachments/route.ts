import { NextResponse, type NextRequest } from "next/server";
import { UPLOAD_RULES, type UploadErrorCode } from "@/lib/file-rules";
import { isUuid } from "@/lib/ids";
import { env } from "@/lib/env";
import { getActor } from "@/server/auth/session";
import { uploadAttachment, UploadRejected } from "@/server/services/attachments";

/** Room for the multipart boundary and the other form fields around the file. */
const ENVELOPE_BYTES = 64 * 1024;

/**
 * Uploads one supporting file from the plain multipart form on the edit page, then
 * redirects back to it (303) with ?upload=ok or ?uploadError=<code>. Works without
 * JavaScript; the page's script sends `x-upload-client: fetch` and gets JSON instead. Excluded from the proxy (src/proxy.ts) so the proxy does not buffer
 * the body; this handler checks origin, size and session itself.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/entries/[id]/attachments">,
) {
  const { id } = await ctx.params;
  const appOrigin = new URL(env().APP_URL).origin;
  // Same-origin form posts only: browsers always send Origin on POST.
  if (request.headers.get("origin") !== appOrigin) {
    return new NextResponse("Cross-origin upload refused.", { status: 403 });
  }
  if (!isUuid(id)) return new NextResponse("Not found.", { status: 404 });
  // The page's script uploads with fetch (so unsaved form edits survive) and asks for
  // JSON; a plain form post gets a redirect.
  const wantsJson = request.headers.get("x-upload-client") === "fetch";
  const back = (result: { ok: true } | { error: UploadErrorCode }) => {
    if (wantsJson) return NextResponse.json(result, { status: "ok" in result ? 200 : 400 });
    const url = new URL(`/entries/${id}/edit`, appOrigin);
    if ("ok" in result) url.searchParams.set("upload", "ok");
    else url.searchParams.set("uploadError", result.error);
    url.hash = "files-message";
    return NextResponse.redirect(url, 303);
  };

  const actor = await getActor();
  if (!actor) {
    if (wantsJson) return NextResponse.json({ error: "signin" }, { status: 401 });
    const signIn = new URL("/sign-in", appOrigin);
    signIn.searchParams.set("next", `/entries/${id}/edit`);
    return NextResponse.redirect(signIn, 303);
  }
  if (actor.role !== "NOMINATOR") return new NextResponse("Forbidden.", { status: 403 });

  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length)) return new NextResponse("Length required.", { status: 411 });
  if (length > UPLOAD_RULES.maxBytes + ENVELOPE_BYTES) return back({ error: "size" });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return back({ error: "failed" });
  }
  if (!(file instanceof File) || file.size === 0) return back({ error: "empty" });
  try {
    await uploadAttachment(actor, id, {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } catch (err) {
    if (err instanceof UploadRejected) return back({ error: err.code });
    const e = err as { name?: string; code?: string };
    console.error("Upload failed:", e?.name ?? typeof err, e?.code ?? "");
    return back({ error: "failed" });
  }
  return back({ ok: true });
}
