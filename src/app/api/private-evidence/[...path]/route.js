import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isPrivateMediaObjectId } from "../../../../contracts/v1/mediaIdentifiers.js";

const MIME_TYPES = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request, { params }) {
  const { path: pathParts = [] } = await params;
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1") {
    return providerMediaResponse(pathParts);
  }
  const privateRoot = path.join(process.cwd(), "private");
  const requestedPath = path.join(privateRoot, ...pathParts);
  const resolvedPath = path.resolve(requestedPath);

  if (!isWithinRoot(privateRoot, resolvedPath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const bytes = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

async function providerMediaResponse(pathParts) {
  const objectId = pathParts.length === 2 && pathParts[0] === "media" ? String(pathParts[1]) : null;
  if (!isPrivateMediaObjectId(objectId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const [{ getProductionProviderMediaDelivery }, { createAuthenticationPrincipal }] = await Promise.all([
      import("../../../../application/composition/productionApplicationComposition.js"),
      import("../../../../application/auth/principal.js"),
    ]);
    const delivery = getProductionProviderMediaDelivery();
    const principal = createAuthenticationPrincipal({
      userId: delivery.ownerUserId,
      deviceId: "provider-web-compatibility",
      sessionId: "provider-web-compatibility",
      scopes: ["media:read"],
      authenticationMethod: "pre-auth-single-founder-compatibility",
      transport: "server-only",
    });
    const access = await delivery.openRead({ principal, objectId, lifetimeSeconds: 60 });
    const upstream = await fetch(access.url, { redirect: "error", cache: "no-store" });
    if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(upstream.body, {
      headers: {
        "Cache-Control": "private, max-age=86400, immutable",
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
