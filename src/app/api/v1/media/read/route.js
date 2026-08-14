import { NextResponse } from "next/server";
import { createAuthenticationPrincipal } from "../../../../../application/auth/principal.js";
import { getProductionApplicationComposition } from "../../../../../application/composition/productionApplicationComposition.js";

export const runtime = "nodejs";

export async function GET(request) {
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") return new NextResponse("Not found", { status: 404 });
  try {
    const composition = await getProductionApplicationComposition();
    const principal = createAuthenticationPrincipal({
      userId: composition.ownerUserId,
      deviceId: "provider-web-compatibility",
      sessionId: "provider-web-compatibility",
      scopes: ["media:read"],
      authenticationMethod: "pre-auth-single-founder-compatibility",
      transport: "server-only",
    });
    const requestUrl = new URL(request.url);
    const access = await composition.mediaGateway.redeemRead({
      accessHandle: `${requestUrl.pathname}${requestUrl.search}`,
      principal,
    });
    const upstream = await fetch(access.url, { redirect: "error", cache: "no-store" });
    if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(upstream.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
