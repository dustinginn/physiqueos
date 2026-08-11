import { json } from "../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationReadiness } from "../../../../../platform/foundation/runtime";
import { resolveCorrelationId } from "../../../../../platform/observability/correlation";

export const runtime = "nodejs";

export async function GET(request) {
  const requestId = resolveCorrelationId(request.headers.get("x-request-id"));
  const status = foundationReadiness.status === "ready" ? 200 : 503;
  return json(foundationReadiness, status, requestId, foundationBuildIdentity);
}
