import { executeApiRequest } from "../../../../../../../platform/http/apiResponse";
import { readBoundedJsonRequest } from "../../../../../../../platform/http/readBoundedJsonRequest.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

export const runtime = "nodejs";
export async function POST(request) {
  return executeApiRequest(request, async ({ requestId }) => {
    const payload = await readBoundedJsonRequest(request);
    return getNativeSandboxAuthRuntime().refresh({ refreshCredential: payload.refreshCredential, requestId });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
