import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition } from "@/lib/file-rules";
import { clientIpFrom } from "@/server/request";
import { getActor } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { openAttachment } from "@/server/services/attachments";

/**
 * Downloads a supporting file for anyone allowed to read its entry (see
 * entryAccessFor). Always a download, never rendered inline, and never cached.
 * Anything else, signed out included, is a plain 404.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/attachments/[id]">) {
  const { id } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new NextResponse("Not found.", { status: 404 });
  try {
    const file = await openAttachment(actor, id, clientIpFrom(request.headers));
    return new NextResponse(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return new NextResponse("Not found.", { status: 404 });
    throw err;
  }
}
