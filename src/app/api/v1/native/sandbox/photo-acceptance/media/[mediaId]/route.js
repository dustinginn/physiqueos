import { NextResponse } from "next/server";
import { ApplicationProblem, toProblemDetails } from "../../../../../../../../contracts/v1/problem.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../../platform/foundation/runtime.js";
import { getNativeFounderPhotoAcceptanceRuntime } from "../../../../../../../../platform/auth/nativeFounderPhotoAcceptanceRuntime.js";
import { resolveCorrelationId } from "../../../../../../../../platform/observability/correlation.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const requestId = resolveCorrelationId(request.headers.get("x-request-id"));
  try {
    const { mediaId } = await params;
    const access = await getNativeFounderPhotoAcceptanceRuntime().openMedia({
      request,
      mediaId,
      requestId,
    });
    const upstream = await fetch(access.url, { redirect: "error", cache: "no-store" });
    const upstreamContentType = mediaType(upstream.headers.get("content-type"));
    const upstreamLength = integer(upstream.headers.get("content-length"));
    if (!upstream.ok || !upstream.body || upstreamContentType !== access.contentType ||
        (upstreamLength != null && upstreamLength !== access.contentLength)) {
      throw unavailable();
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": access.contentType,
        "Content-Length": String(access.contentLength),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
        "X-PhysiqueOS-Api-Version": foundationBuildIdentity.apiVersion ?? "v1",
        "X-PhysiqueOS-Build-Id": foundationBuildIdentity.buildId ?? "development",
      },
    });
  } catch (error) {
    const problem = toProblemDetails(error, {
      requestId,
      instance: new URL(request.url).pathname,
    });
    foundationLogger.warn("api.request.failed", {
      requestId,
      code: problem.code,
      status: problem.status,
      error,
    });
    return NextResponse.json(problem, {
      status: problem.status,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
  }
}

function mediaType(value) {
  return String(value ?? "").split(";", 1)[0].trim().toLowerCase();
}

function integer(value) {
  if (value == null || value === "") return null;
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;
}

function unavailable() {
  return new ApplicationProblem({
    status: 404,
    code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE",
    title: "The selected progress photo is unavailable.",
  });
}
