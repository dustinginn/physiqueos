import { getProductionFounderAuthService } from "../../../../../../application/composition/productionApplicationComposition.js";
import { authorizeFounderWebPairingRequest } from "../../../../../../platform/auth/founderWebPairingAuthorization.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../platform/foundation/runtime.js";
import { executeApiRequest } from "../../../../../../platform/http/apiResponse.js";

export const runtime = "nodejs";

export async function POST(request) {
  return executeApiRequest(request, async ({ requestId }) => {
    const issuer = await authorizeFounderWebPairingRequest(request);
    return getProductionFounderAuthService().issuePairingCredentialFromFounderWeb({
      ...issuer,
      correlationId: requestId,
    });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
