import { executeApiRequest } from "../../../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

export const runtime = "nodejs";
export async function DELETE(request) {
  return executeApiRequest(request, ({ requestId }) =>
    getNativeSandboxAuthRuntime().revokeSession({ request, requestId }),
  { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
