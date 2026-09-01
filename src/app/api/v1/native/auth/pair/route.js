import { executeApiRequest } from "../../../../../../platform/http/apiResponse";
import { readBoundedJsonRequest } from "../../../../../../platform/http/readBoundedJsonRequest.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../platform/foundation/runtime";
import { getProductionNativeFounderAuthRuntime } from "../../../../../../platform/auth/nativeFounderAuthRuntime.js";

export const runtime = "nodejs";

export async function POST(request) {
  return executeApiRequest(request, async ({ requestId }) => {
    const payload = await readBoundedJsonRequest(request);
    return getProductionNativeFounderAuthRuntime().pair({
      pairingCredential: payload.pairingCredential,
      platform: payload.platform,
      displayName: payload.displayName,
      requestId,
    });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
