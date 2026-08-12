import { executeApiRequest } from "../../../../platform/http/apiResponse";
import {
  foundationAuthenticator,
  foundationBuildIdentity,
  foundationLogger,
} from "../../../../platform/foundation/runtime";
import { getApplicationCapabilities } from "../../../../application/platform/getApplicationCapabilities";

export const runtime = "nodejs";

export async function GET(request) {
  return executeApiRequest(request, async () => {
    const principal = await foundationAuthenticator.authenticate(request);
    return getApplicationCapabilities({ principal, buildIdentity: foundationBuildIdentity });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
