import { executeApiRequest } from "../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../platform/auth/nativeProductionContractRuntime.js";
import { parseNativeEvidenceIntakeRequest } from "../../../../../../application/native/NativeEvidenceIntakeRequest.js";

export const runtime = "nodejs";

export async function POST(request) {
  return executeApiRequest(request, async () => {
    const input = await parseNativeEvidenceIntakeRequest(request);
    return (await getProductionNativeContractRuntime()).acceptEvidenceIntake({ request, input });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger, successStatus: 202 });
}
