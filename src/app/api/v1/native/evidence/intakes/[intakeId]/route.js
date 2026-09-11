import { executeApiRequest } from "../../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../../platform/auth/nativeProductionContractRuntime.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  return executeApiRequest(request, async () => {
    const { intakeId } = await params;
    return (await getProductionNativeContractRuntime()).evidenceIntakeStatus({ request, intakeId });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
