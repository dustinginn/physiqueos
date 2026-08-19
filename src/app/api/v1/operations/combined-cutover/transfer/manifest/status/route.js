import { NextResponse } from "next/server";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverManifestTransferService } from "../../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

// Authenticated read-only operation-level status, scoped strictly to the caller's own operation.
export async function GET(request) {
  const service = getCombinedCutoverManifestTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  const url = new URL(request.url);
  const result = await service.manifestStatus({
    authorizationHeader: request.headers.get("authorization"),
    operationId: url.searchParams.get("operationId"),
  });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
