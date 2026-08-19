import { NextResponse } from "next/server";
import { combinedCutoverPreparationHttpStatus } from "../../../../../../../platform/cutover/preparation/combinedCutoverPreparationService.js";
import { getCombinedCutoverPreparationService } from "../../../../../../../platform/cutover/preparation/combinedCutoverPreparationComposition.js";

export const runtime = "nodejs";

// Authenticated read-only preparation status, used for resume/diagnosis after a process restart.
// Scoped strictly to the caller's own operation; never exposes another operation's evidence.
export async function GET(request) {
  const service = getCombinedCutoverPreparationService();
  if (!service) return json(combinedCutoverPreparationHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  const url = new URL(request.url);
  const result = await service.status({
    authorizationHeader: request.headers.get("authorization"),
    operationId: url.searchParams.get("operationId"),
  });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
