import { executeApiRequest } from "../../../../../platform/http/apiResponse.js";
import { readBoundedJsonRequest } from "../../../../../platform/http/readBoundedJsonRequest.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../platform/auth/nativeProductionContractRuntime.js";

export const runtime = "nodejs";

export async function POST(request) {
  return executeApiRequest(request, async ({ requestId }) => {
    const body = await readBoundedJsonRequest(request);
    return (await getProductionNativeContractRuntime()).command({
      request,
      commandType: body.commandType,
      metadata: {
        ...(body.metadata ?? {}),
        idempotencyKey: request.headers.get("idempotency-key") ?? body.metadata?.idempotencyKey,
        expectedVersion: request.headers.get("if-match")?.replace(/^W\//, "").replaceAll('"', "") ?? body.metadata?.expectedVersion,
        correlationId: requestId,
      },
      payload: body.payload ?? {},
    });
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
