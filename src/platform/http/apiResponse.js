import { NextResponse } from "next/server";
import { toProblemDetails } from "../../contracts/v1/problem";
import { resolveCorrelationId } from "../observability/correlation";

export async function executeApiRequest(request, handler, { buildIdentity, logger, successStatus = 200 } = {}) {
  const requestId = resolveCorrelationId(request.headers.get("x-request-id"));
  try {
    const value = await handler({ requestId });
    return json(value, successStatus, requestId, buildIdentity);
  } catch (error) {
    const problem = toProblemDetails(error, { requestId, instance: new URL(request.url).pathname });
    if (problem.recovery?.kind === "healthkit_daily_revision_collision") {
      logger?.warn("healthkit.daily_revision_collision", {
        requestId,
        observationType: problem.recovery.observationType,
        localDate: problem.recovery.localDate,
        receivedSourceRevision: problem.recovery.receivedSourceRevision,
        nextExpectedRevision: problem.recovery.nextExpectedRevision,
        identityDigest: problem.recovery.identityDigest,
      });
    }
    logger?.warn("api.request.failed", { requestId, code: problem.code, status: problem.status, error });
    return json(problem, problem.status, requestId, buildIdentity, "application/problem+json");
  }
}

export function json(value, status, requestId, buildIdentity, contentType = "application/json") {
  return NextResponse.json(value, {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-request-id": requestId,
      "x-physiqueos-api-version": buildIdentity?.apiVersion ?? "v1",
      "x-physiqueos-build-id": buildIdentity?.buildId ?? "development",
    },
  });
}
