import { ApplicationProblem } from "../../contracts/v1/problem.js";

// Several evidence-intake call sites (DexaPdfIntakeService, the async intake
// service, the evidence-upload manifest, and the Postgres intake store) throw
// a plain `Error`/custom `Error` subclass carrying a recognizable `.code` —
// it reads like it was designed to become a typed HTTP response, but
// `executeApiRequest` only special-cases `instanceof ApplicationProblem`, so
// every one of these silently collapsed into a generic 500/UNCLASSIFIED_ERROR
// indistinguishable from a genuine bug. This maps ONLY the known, expected
// codes below to the correct `ApplicationProblem`; anything else (an
// unrecognized code, or no code at all) is returned unchanged so a genuinely
// unexpected exception still surfaces as an internal error rather than being
// misreported as the Founder's mistake.

const VALIDATION_PROBLEMS = new Map([
  ["DEXA_PDF_REQUIRED", { status: 400, title: "Choose a BodySpec PDF to continue." }],
  ["DEXA_PDF_TOO_LARGE", { status: 413, title: "The DEXA PDF is larger than 50 MB." }],
  ["DEXA_PDF_INVALID", { status: 400, title: "Choose a valid PDF exported by BodySpec." }],
  ["EVIDENCE_INTAKE_SUBMISSION_ID_INVALID", { status: 400, title: "The evidence submission identity is invalid." }],
]);

// These indicate the request conflicts with durable state already recorded
// for this submission (a retried/replayed intake whose identity, stored
// artifacts, or upload lease no longer match) — a client/stale-state
// condition, not an internal failure.
const CONFLICT_PROBLEMS = new Map([
  ["EVIDENCE_INTAKE_IDENTITY_CONFLICT", "This evidence was already submitted with different files."],
  ["EVIDENCE_UPLOAD_STORAGE_MISMATCH", "The stored evidence files no longer match what was declared."],
  ["EVIDENCE_INTAKE_UPLOAD_CLAIM_LOST", "The upload session expired or was claimed by another request."],
  ["EVIDENCE_INTAKE_CANONICAL_IDENTITY_CONFLICT", "This evidence already has a different canonical identity."],
]);

const MANIFEST_ERROR_NAME = "EvidenceUploadArtifactCompletenessError";

export function toEvidenceIntakeProblem(error) {
  if (error instanceof ApplicationProblem) return error;
  if (error?.name === MANIFEST_ERROR_NAME) {
    return new ApplicationProblem({
      status: Number(error.status ?? 400),
      code: String(error.code ?? "EVIDENCE_UPLOAD_MANIFEST_INVALID"),
      title: String(error.message ?? "The selected-file manifest is invalid."),
      cause: error,
    });
  }
  const code = error?.code;
  if (typeof code === "string" && VALIDATION_PROBLEMS.has(code)) {
    const { status, title } = VALIDATION_PROBLEMS.get(code);
    return new ApplicationProblem({ status, code, title, cause: error });
  }
  if (typeof code === "string" && CONFLICT_PROBLEMS.has(code)) {
    return new ApplicationProblem({ status: 409, code, title: CONFLICT_PROBLEMS.get(code), cause: error });
  }
  return error;
}
