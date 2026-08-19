import { NextResponse } from "next/server";
import { combinedCutoverPreparationHttpStatus } from "../../../../../../../platform/cutover/preparation/combinedCutoverPreparationService.js";
import { getCombinedCutoverPreparationService } from "../../../../../../../platform/cutover/preparation/combinedCutoverPreparationComposition.js";

export const runtime = "nodejs";

const MAXIMUM_BODY_BYTES = 4 * 1024;

// Triggers real provider parity verification for one combined-cutover operation. Never accepts a
// client-supplied parity result; the response may include a bounded, non-dumping diagnostic on
// failure, never canonical payload content.
export async function POST(request) {
  const service = getCombinedCutoverPreparationService();
  if (!service) return json(combinedCutoverPreparationHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return json(400, { code: "TRANSFER_CONTENT_TYPE_REQUIRED" });
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAXIMUM_BODY_BYTES) return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });
  let payload;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    return json(400, { code: "TRANSFER_PAYLOAD_INVALID" });
  }

  const result = await service.parity({ authorizationHeader: request.headers.get("authorization"), payload });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
