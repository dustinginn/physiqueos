import { ApplicationProblem } from "../../contracts/v1/problem.js";

const MAX_BYTES = 50 * 1024 * 1024;

export async function readNativeSandboxWeightCandidateRequest(request) {
  if (!/^multipart\/form-data(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw invalid(400, "CONTENT_TYPE_REQUIRED", "A multipart Weight evidence request is required.");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BYTES) throw invalid(413, "REQUEST_TOO_LARGE", "The Weight evidence request is too large.");
  const form = await request.formData();
  const candidateText = form.get("candidate");
  const file = form.get("asset");
  if (typeof candidateText !== "string" || !file || typeof file.arrayBuffer !== "function") {
    throw invalid(400, "REQUEST_INVALID", "Weight candidate metadata and one original asset are required.");
  }
  let submission;
  try { submission = JSON.parse(candidateText); }
  catch { throw invalid(400, "REQUEST_INVALID", "The Weight candidate metadata is invalid."); }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw invalid(413, "REQUEST_TOO_LARGE", "The Weight evidence asset is too large.");
  return Object.freeze({
    submission,
    asset: Object.freeze({ bytes, contentType: file.type, filename: file.name }),
  });
}

function invalid(status, code, title) { return new ApplicationProblem({ status, code, title }); }
