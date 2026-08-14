import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

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
    return providerMediaResponse(pathParts, _request);
  }
  const privateRoot = path.join(process.cwd(), "private");
  const requestedPath = path.join(privateRoot, ...pathParts);
  const resolvedPath = path.resolve(requestedPath);

  if (!resolvedPath.startsWith(path.resolve(privateRoot))) {
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

async function providerMediaResponse(pathParts, request) {
  const objectId = pathParts.length === 2 && pathParts[0] === "media" ? String(pathParts[1]) : null;
  if (!objectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const [{ getProductionApplicationComposition }, { createAuthenticationPrincipal }] = await Promise.all([
      import("../../../../application/composition/productionApplicationComposition.js"),
      import("../../../../application/auth/principal.js"),
    ]);
    const composition = await getProductionApplicationComposition();
    const principal = createAuthenticationPrincipal({
      userId: composition.ownerUserId,
      deviceId: "provider-web-compatibility",
      sessionId: "provider-web-compatibility",
      scopes: ["media:read"],
      authenticationMethod: "pre-auth-single-founder-compatibility",
      transport: "server-only",
    });
    const descriptor = await composition.media.authorizeRead({ principal, objectId, lifetimeSeconds: 60 });
    return NextResponse.redirect(new URL(descriptor.accessHandle, request.url), 307);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
