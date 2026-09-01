import { ApplicationProblem } from "../../contracts/v1/problem.js";

export async function readBoundedJsonRequest(request, { maximumBytes = 4 * 1024 } = {}) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw problem(400, "CONTENT_TYPE_REQUIRED", "A JSON request is required.");
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > maximumBytes) {
    throw problem(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value;
  } catch {
    throw problem(400, "REQUEST_INVALID", "The JSON request is invalid.");
  }
}

function problem(status, code, title) {
  return new ApplicationProblem({ status, code, title });
}
