import { NextResponse } from "next/server";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverTransferService } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

const MAXIMUM_COMPLETE_BODY_BYTES = 4 * 1024;

// Requests assembly and independent digest verification of every chunk already received for one
// (operationId, packageId). Never treats byte receipt alone as a completed transfer - only a
// recomputed whole-package digest match moves the receipt to `verified`.
export async function POST(request) {
  const service = getCombinedCutoverTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return json(400, { code: "TRANSFER_CONTENT_TYPE_REQUIRED" });
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAXIMUM_COMPLETE_BODY_BYTES) return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });
  let payload;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    return json(400, { code: "TRANSFER_PAYLOAD_INVALID" });
  }

  const result = await service.complete({
    authorizationHeader: request.headers.get("authorization"),
    operationId: payload?.operationId,
    packageId: payload?.packageId,
  });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
