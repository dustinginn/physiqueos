import { NextResponse } from "next/server";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverManifestTransferService } from "../../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

const MAXIMUM_MANIFEST_DECLARE_BODY_BYTES = 512 * 1024;

// Declares the operation-level artifact manifest (every file's path/size/sha256 plus the whole
// package's digests) via the existing `PostgresCombinedTransferReceiptStore`. Idempotent on an
// identical redeclare; a conflicting one fails closed.
export async function POST(request) {
  const service = getCombinedCutoverManifestTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return json(400, { code: "TRANSFER_CONTENT_TYPE_REQUIRED" });
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAXIMUM_MANIFEST_DECLARE_BODY_BYTES) return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });
  let payload;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    return json(400, { code: "TRANSFER_PAYLOAD_INVALID" });
  }

  const result = await service.declareManifest({ authorizationHeader: request.headers.get("authorization"), payload });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
