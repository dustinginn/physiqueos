import { executeApiRequest } from "../../../../platform/http/apiResponse";
import {
  foundationAuthenticator,
  foundationBuildIdentity,
  foundationLogger,
  getFoundationPlatformStatus,
} from "../../../../platform/foundation/runtime";

export const runtime = "nodejs";

export async function GET(request) {
  return executeApiRequest(request, async () => {
    const principal = await foundationAuthenticator.authenticate(request);
    return getFoundationPlatformStatus({ principal });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
