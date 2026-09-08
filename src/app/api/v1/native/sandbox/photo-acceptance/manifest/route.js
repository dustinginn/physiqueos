import { executeApiRequest } from "../../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime.js";
import { getNativeFounderPhotoAcceptanceRuntime } from "../../../../../../../platform/auth/nativeFounderPhotoAcceptanceRuntime.js";

export const runtime = "nodejs";

export async function GET(request) {
  return executeApiRequest(request, ({ requestId }) =>
    getNativeFounderPhotoAcceptanceRuntime().getManifest({ request, requestId }),
  { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
