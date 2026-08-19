import { NextResponse } from "next/server";
import {
  MAXIMUM_TRANSFER_CHUNK_BYTES,
  requireTransferInteger,
} from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferContract.js";
import { combinedCutoverTransferHttpStatus } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { getCombinedCutoverTransferService } from "../../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js";

export const runtime = "nodejs";

// Accepts one raw chunk body. Metadata travels in headers, not the body, so the body is pure bytes
// and its declared Content-Length is checked BEFORE the stream is read into memory - a caller
// cannot force a large buffer allocation merely by lying about a small length.
export async function POST(request) {
  const service = getCombinedCutoverTransferService();
  if (!service) return json(combinedCutoverTransferHttpStatus("TRANSFER_NOT_CONFIGURED"), { code: "TRANSFER_NOT_CONFIGURED" });

  if (!/^application\/octet-stream$/i.test(request.headers.get("content-type") ?? "")) {
    return json(400, { code: "TRANSFER_CONTENT_TYPE_REQUIRED" });
  }
  let contentLength;
  try {
    contentLength = requireTransferInteger(request.headers.get("content-length"), "contentLength", { minimum: 1, maximum: MAXIMUM_TRANSFER_CHUNK_BYTES });
  } catch {
    return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAXIMUM_TRANSFER_CHUNK_BYTES) return json(413, { code: "TRANSFER_PAYLOAD_TOO_LARGE" });

  const result = await service.receiveChunk({
    authorizationHeader: request.headers.get("authorization"),
    operationId: request.headers.get("x-physiqueos-operation-id"),
    packageId: request.headers.get("x-physiqueos-package-id"),
    chunkIndex: Number(request.headers.get("x-physiqueos-chunk-index")),
    chunkDigest: request.headers.get("x-physiqueos-chunk-digest"),
    contentLength,
    bytes: buffer,
  });
  return json(result.status, result.body);
}

function json(status, body) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
