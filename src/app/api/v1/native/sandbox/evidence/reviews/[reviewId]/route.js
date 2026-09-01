import { executeApiRequest } from "../../../../../../../../platform/http/apiResponse";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

export const runtime = "nodejs";
export async function GET(request, { params }) {
  return executeApiRequest(request, async ({ requestId }) => {
    const { reviewId } = await params;
    return getNativeSandboxAuthRuntime().getWeightReview({ request, reviewId, requestId });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
