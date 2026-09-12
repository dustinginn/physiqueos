import { executeApiRequest } from "../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../platform/auth/nativeProductionContractRuntime.js";
import { parseNativeEvidenceIntakeRequest } from "../../../../../../application/native/NativeEvidenceIntakeRequest.js";
import { toEvidenceIntakeProblem } from "../../../../../../domain/services/EvidenceIntakeProblemMapping.js";

export const runtime = "nodejs";

export async function POST(request) {
  return executeApiRequest(request, async () => {
    try {
      const input = await parseNativeEvidenceIntakeRequest(request);
      return await (await getProductionNativeContractRuntime()).acceptEvidenceIntake({ request, input });
    } catch (error) {
      throw toEvidenceIntakeProblem(error);
    }
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger, successStatus: 202 });
}
