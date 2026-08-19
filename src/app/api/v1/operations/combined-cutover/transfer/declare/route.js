import { NextResponse } from "next/server";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverTransferService } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

const MAXIMUM_DECLARE_BODY_BYTES = 16 * 1024;

// Declares one artifact's transfer geometry. Idempotent: an identical redeclare returns the
// existing receipt; a conflicting one (different digest, size, or chunk geometry) fails closed.
export async function POST(request) {
  const service = getCombinedCutoverTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return json(400, { code: "TRANSFER_CONTENT_TYPE_REQUIRED" });
  }
  const raw = await readBoundedText(request, MAXIMUM_DECLARE_BODY_BYTES);
  if (raw == null) return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { code: "TRANSFER_PAYLOAD_INVALID" });
  }

  const result = await service.declare({ authorizationHeader: request.headers.get("authorization"), payload });
  return json(result.status, result.body);
}

async function readBoundedText(request, maximumBytes) {
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > maximumBytes) return null;
  return buffer.toString("utf8");
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
