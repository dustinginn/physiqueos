import { executeApiRequest } from "../../../../../../../platform/http/apiResponse";
import { readBoundedJsonRequest } from "../../../../../../../platform/http/readBoundedJsonRequest.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime";
import { getNativeSandboxAuthRuntime } from "../../../../../../../platform/auth/nativeSandboxAuthRuntime.js";

// Scalar manual Weight (measurementDate, value, unit only - no asset, no
// OCR provenance). See POST .../weight/candidates for the separate
// artifact-backed evidence path, which this route does not replace.
export const runtime = "nodejs";
export async function POST(request) {
  return executeApiRequest(request, async ({ requestId }) => {
    const submission = await readBoundedJsonRequest(request);
    return getNativeSandboxAuthRuntime().submitManualWeight({ request, submission, requestId });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
