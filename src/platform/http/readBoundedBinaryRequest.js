import { ApplicationProblem } from "../../contracts/v1/problem.js";

/**
 * Reads one raw request body under an explicit byte ceiling.
 *
 * The body is consumed as a stream and cancelled the moment the running
 * total passes `maximumBytes`, so buffered memory is bounded by the ceiling
 * with or without a Content-Length. A declared Content-Length over the
 * ceiling is refused before any body byte is read. This is the binary
 * counterpart of readBoundedJsonRequest and deliberately does not share
 * code with it: the JSON reader is the HealthKit command boundary and stays
 * untouched by the staged-media transport.
 */
export async function readBoundedBinaryRequest(request, {
  maximumBytes,
  contentType = /^[-\w.+]+\/[-\w.+]+$/,
  requireContentLength = true,
} = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("readBoundedBinaryRequest requires a positive byte ceiling.");
  }
  const declaredType = String(request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!declaredType || !contentType.test(declaredType)) {
    throw problem(400, "CONTENT_TYPE_REQUIRED", "A media content type is required.");
  }
  const declaredLength = request.headers.get("content-length");
  const declaredBytes = declaredLength == null ? null : Number(declaredLength);
  if (declaredBytes != null && (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0)) {
    throw problem(400, "CONTENT_LENGTH_INVALID", "The request length is invalid.");
  }
  if (declaredBytes == null && requireContentLength) {
    throw problem(411, "CONTENT_LENGTH_REQUIRED", "The request length is required.");
  }
  if (declaredBytes != null && declaredBytes > maximumBytes) throw tooLarge();

  const bytes = await readBoundedBytes(request, maximumBytes);
  if (declaredBytes != null && bytes.length !== declaredBytes) {
    throw problem(400, "CONTENT_LENGTH_MISMATCH", "The request body did not match its declared length.");
  }
  if (bytes.length === 0) throw problem(400, "REQUEST_EMPTY", "The request body is empty.");
  return Object.freeze({ bytes, contentType: declaredType });
}

async function readBoundedBytes(request, maximumBytes) {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

function tooLarge() {
  return problem(413, "REQUEST_TOO_LARGE", "The request is too large.");
}

function problem(status, code, title) {
  return new ApplicationProblem({ status, code, title });
}
