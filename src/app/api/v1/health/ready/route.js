import { json } from "../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationReadiness } from "../../../../../platform/foundation/runtime";
import { getPhase2OperationalReadiness, isPhase2StagingEnabled } from "../../../../../platform/foundation/phase2Runtime";
import { resolveCorrelationId } from "../../../../../platform/observability/correlation";
import { getProviderProductReadiness } from "../../../../../platform/health/ProviderProductReadiness";

export const runtime = "nodejs";

export async function GET(request) {
  const requestId = resolveCorrelationId(request.headers.get("x-request-id"));
  const readiness = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1"
    ? await getProviderProductReadiness()
    : isPhase2StagingEnabled() ? await getPhase2OperationalReadiness() : foundationReadiness;
  const status = readiness.status === "ready" ? 200 : 503;
  return json(readiness, status, requestId, foundationBuildIdentity);
}
