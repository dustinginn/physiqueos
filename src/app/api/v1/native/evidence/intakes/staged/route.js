import { executeApiRequest } from "../../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../../platform/auth/nativeProductionContractRuntime.js";
import { parseNativeStagedEvidenceIntakeRequest } from "../../../../../../../application/native/NativeStagedEvidenceIntakeRequest.js";
import { toEvidenceIntakeProblem } from "../../../../../../../domain/services/EvidenceIntakeProblemMapping.js";

export const runtime = "nodejs";

// Declares a staged-media intake: the deterministic intake identity and its
// expected artifact set, with no photo bytes. Replaying the same declaration
// returns the same intake and its current artifact progress.
export async function POST(request) {
  return executeApiRequest(request, async () => {
    try {
      const input = await parseNativeStagedEvidenceIntakeRequest(request);
      return await (await getProductionNativeContractRuntime()).stageEvidenceIntake({ request, input });
    } catch (error) {
      throw toEvidenceIntakeProblem(error);
    }
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger, successStatus: 202 });
}
