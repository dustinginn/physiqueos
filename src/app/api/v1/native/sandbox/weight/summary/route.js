import { executeApiRequest } from "../../../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

export const runtime = "nodejs";
export async function GET(request) {
  return executeApiRequest(request, ({ requestId }) =>
    getNativeSandboxAuthRuntime().readWeightSummary({ request, requestId }),
  { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
