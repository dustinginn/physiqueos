import { executeApiRequest } from "../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../platform/auth/nativeProductionContractRuntime.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  return executeApiRequest(request, async () => {
    const { resource } = await params;
    const url = new URL(request.url);
    return (await getProductionNativeContractRuntime()).read({
      request,
      resource,
      input: Object.fromEntries(url.searchParams.entries()),
    });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
