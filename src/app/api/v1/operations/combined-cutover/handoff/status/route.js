import { NextResponse } from "next/server";
import { combinedCutoverHandoffHttpStatus } from "../../../../../../../platform/cutover/handoff/combinedCutoverHandoffService.js";
import { getCombinedCutoverHandoffService } from "../../../../../../../platform/cutover/handoff/combinedCutoverHandoffComposition.js";

export const runtime = "nodejs";

// Authenticated, READ-ONLY authority/routing handoff status - used for cross-process recovery
// diagnosis. There is deliberately no endpoint that triggers the handoff itself; see
// ProductionAuthorityHandoffService.js for why. Scoped strictly to the caller's own operation and
// environment; never exposes another operation's evidence.
export async function GET(request) {
  const service = getCombinedCutoverHandoffService();
  if (!service) return json(combinedCutoverHandoffHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  const url = new URL(request.url);
  const result = await service.status({
    authorizationHeader: request.headers.get("authorization"),
    operationId: url.searchParams.get("operationId"),
    environment: url.searchParams.get("environment"),
  });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
