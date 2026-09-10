import { executeApiRequest } from "../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../platform/auth/nativeProductionContractRuntime.js";

export const runtime = "nodejs";

export async function GET(request) {
  return executeApiRequest(request, async () => (await getProductionNativeContractRuntime()).manifest({ request }), {
    buildIdentity: foundationBuildIdentity,
    logger: foundationLogger,
  });
}
