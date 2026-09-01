import { executeApiRequest } from "../../../../../../../../../platform/http/apiResponse";
import { readBoundedJsonRequest } from "../../../../../../../../../platform/http/readBoundedJsonRequest.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

export const runtime = "nodejs";
export async function POST(request, { params }) {
  return executeApiRequest(request, async ({ requestId }) => {
    const [{ reviewId }, payload] = await Promise.all([params, readBoundedJsonRequest(request)]);
    return getNativeSandboxAuthRuntime().discardWeightReview({
      request,
      reviewId,
      expectedVersion: payload.expectedVersion,
      requestId,
    });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
