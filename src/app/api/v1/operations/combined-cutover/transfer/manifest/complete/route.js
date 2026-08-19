import { NextResponse } from "next/server";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverManifestTransferService } from "../../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

const MAXIMUM_MANIFEST_COMPLETE_BODY_BYTES = 4 * 1024;

// Requests provider-independent cross-check completion of the whole declared package: every
// artifact's own already-verified byte-level receipt is checked against the declared manifest
// entry. The request body carries only the operation identity - never a client-asserted
// verification result.
export async function POST(request) {
  const service = getCombinedCutoverManifestTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return json(400, { code: "TRANSFER_CONTENT_TYPE_REQUIRED" });
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAXIMUM_MANIFEST_COMPLETE_BODY_BYTES) return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });
  let payload;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    return json(400, { code: "TRANSFER_PAYLOAD_INVALID" });
  }

  const result = await service.completeManifest({ authorizationHeader: request.headers.get("authorization"), operationId: payload?.operationId });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
