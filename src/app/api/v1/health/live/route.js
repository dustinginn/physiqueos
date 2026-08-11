import { json } from "../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationLiveness } from "../../../../../platform/foundation/runtime";
import { resolveCorrelationId } from "../../../../../platform/observability/correlation";

export const runtime = "nodejs";

export async function GET(request) {
  const requestId = resolveCorrelationId(request.headers.get("x-request-id"));
  return json(foundationLiveness, 200, requestId, foundationBuildIdentity);
}
