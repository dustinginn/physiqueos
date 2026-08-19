import { NextResponse } from "next/server";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverTransferService } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

// Authenticated read-only status, used for resume decisions. The credential's operation binding
// plus the store's own scoped lookup mean a request can never observe another operation's transfer
// state, even by guessing a valid-looking packageId.
export async function GET(request) {
  const service = getCombinedCutoverTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  const url = new URL(request.url);
  const result = await service.status({
    authorizationHeader: request.headers.get("authorization"),
    operationId: url.searchParams.get("operationId"),
    packageId: url.searchParams.get("packageId"),
  });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
