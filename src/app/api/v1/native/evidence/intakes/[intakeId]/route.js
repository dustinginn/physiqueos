import { executeApiRequest } from "../../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../../platform/auth/nativeProductionContractRuntime.js";
import { toEvidenceIntakeProblem } from "../../../../../../../domain/services/EvidenceIntakeProblemMapping.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  return executeApiRequest(request, async () => {
    try {
      const { intakeId } = await params;
      return await (await getProductionNativeContractRuntime()).evidenceIntakeStatus({ request, intakeId });
    } catch (error) {
      throw toEvidenceIntakeProblem(error);
    }
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
