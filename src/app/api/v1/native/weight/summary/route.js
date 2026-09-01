import { executeApiRequest } from "../../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../platform/foundation/runtime";
import { getProductionNativeFounderAuthRuntime } from "../../../../../../platform/auth/nativeFounderAuthRuntime.js";

export const runtime = "nodejs";

export async function GET(request) {
  return executeApiRequest(request, ({ requestId }) =>
    getProductionNativeFounderAuthRuntime().readWeightSummary({ request, requestId }),
  { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
