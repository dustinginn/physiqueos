import { NextResponse } from "next/server";
import { getProductionNativeContractRuntime } from "../../../../../../platform/auth/nativeProductionContractRuntime.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { mediaId } = await params;
    const access = await (await getProductionNativeContractRuntime()).media({ request, mediaId });
    const upstream = await fetch(access.url, { redirect: "error", cache: "no-store" });
    if (!upstream.ok || !upstream.body) return unavailable();
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    if (!/^(?:image\/(?:jpeg|png|heic|webp)|application\/pdf)$/.test(contentType)) return unavailable();
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": contentType,
        ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable();
  }
}

function unavailable() { return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
