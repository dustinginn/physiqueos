import { executeApiRequest } from "../../../../../../../platform/http/apiResponse";
import { readNativeSandboxWeightCandidateRequest } from "../../../../../../../platform/http/readNativeSandboxWeightCandidateRequest.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

export const runtime = "nodejs";
export async function POST(request) {
  return executeApiRequest(request, async ({ requestId }) => {
    const input = await readNativeSandboxWeightCandidateRequest(request);
    return getNativeSandboxAuthRuntime().submitWeightCandidate({ request, ...input, requestId });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
