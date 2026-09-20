import { ApplicationProblem } from "../../contracts/v1/problem.js";

/**
 * Reads a JSON object request body under an explicit size bound.
 *
 * `maximumBytes` is the ceiling: the body is read as a stream and the read is
 * aborted the moment it exceeds the ceiling, so memory is bounded by it even
 * without a Content-Length. A caller that cannot know the right bound until it
 * has seen the body (one endpoint serving several command types) may pass
 * `maximumBytesFor`, which receives the parsed object, or undefined when the
 * body is not a JSON object, and returns the bound for that request. The
 * narrower of the two applies, and the body is still parsed exactly once.
 */
export async function readBoundedJsonRequest(request, { maximumBytes = 4 * 1024, maximumBytesFor = null } = {}) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw problem(400, "CONTENT_TYPE_REQUIRED", "A JSON request is required.");
  }
  // A declared length over the ceiling is refused before any body is read.
  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
    throw tooLarge();
  }
  const bytes = await readBoundedBytes(request, maximumBytes);

  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    value = undefined;
  }
  const isObject = Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const boundedMaximum = maximumBytesFor
    ? Math.min(maximumBytes, requireBound(maximumBytesFor(isObject ? value : undefined)))
    : maximumBytes;
  // Size is judged before validity, as before: a malformed or non-object body
  // over its bound is 413, not 400.
  if (bytes.length > boundedMaximum) throw tooLarge();
  if (!isObject) throw problem(400, "REQUEST_INVALID", "The JSON request is invalid.");
  return value;
}

// Reads the body chunk by chunk and cancels the stream as soon as the running
// total passes the ceiling, instead of buffering an unbounded body first.
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

// A per-request bound that is not a usable number would silently disable the
// size check (every comparison with NaN is false), so it fails loudly instead.
function requireBound(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("maximumBytesFor must return a non-negative finite number of bytes.");
  }
  return value;
}

function tooLarge() {
  return problem(413, "REQUEST_TOO_LARGE", "The request is too large.");
}

function problem(status, code, title) {
  return new ApplicationProblem({ status, code, title });
}
