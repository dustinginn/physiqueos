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
  ["EVIDENCE_REPLACEMENT_IDENTITY_INVALID", { status: 400, title: "The evidence replacement identity is invalid." }],
  ["MULTIPART_BOUNDARY_MISSING", { status: 400, title: "The upload request is missing its multipart boundary." }],
  ["MULTIPART_REQUEST_TOO_LARGE", { status: 413, title: "The upload is larger than PhysiqueOS accepts." }],
  ["PROVIDER_UPLOAD_CONTENT_TYPE_INVALID", { status: 400, title: "The uploaded file's declared type is invalid." }],
  ["EVIDENCE_UPLOAD_CONTENT_TYPE_INVALID", { status: 400, title: "An uploaded file declared a platform type identifier instead of a media type." }],
  // Staged media transport: the artifact bytes disagree with their declaration.
  ["EVIDENCE_INTAKE_ARTIFACT_SIZE_MISMATCH", { status: 400, title: "The photo bytes do not match the declared length." }],
  ["EVIDENCE_INTAKE_ARTIFACT_HASH_MISMATCH", { status: 400, title: "The photo bytes do not match the declared content hash." }],
  ["EVIDENCE_INTAKE_ARTIFACT_TYPE_MISMATCH", { status: 400, title: "The photo content type does not match its declaration." }],
  ["EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID", { status: 400, title: "The photo bytes are not a valid image of the declared type." }],
  ["EVIDENCE_INTAKE_NOT_FOUND", { status: 404, title: "The evidence intake is unavailable." }],
  ["EVIDENCE_INTAKE_ARTIFACT_UNKNOWN", { status: 404, title: "The declared artifact is unavailable." }],
  ["EVIDENCE_INTAKE_STAGING_UNAVAILABLE", { status: 503, title: "Staged media intake is unavailable." }],
]);

// A parser/storage failure whose cause IS understood (unlike a true unknown
// bug), but that is not the Founder's mistake to fix by resubmitting the
// same way — it stays a real internal error (500) rather than being
// reported as a 400, but keeps its own specific code instead of collapsing
// into the generic, indistinguishable UNCLASSIFIED_ERROR.
const INTERNAL_DIAGNOSTIC_PROBLEMS = new Set(["MULTIPART_PARSE_FAILED"]);

// These indicate the request conflicts with durable state already recorded
// for this submission (a retried/replayed intake whose identity, stored
// artifacts, or upload lease no longer match) — a client/stale-state
// condition, not an internal failure.
const CONFLICT_PROBLEMS = new Map([
  ["EVIDENCE_INTAKE_REPLACEMENT_REQUIRED", "This dismissed evidence can be replaced with a new submission."],
  ["EVIDENCE_INTAKE_REPLACEMENT_PREDECESSOR_INVALID", "The dismissed evidence is no longer eligible for replacement."],
  ["EVIDENCE_INTAKE_REPLACEMENT_ALREADY_EXISTS", "Replacement evidence is already being processed."],
  ["EVIDENCE_INTAKE_IDENTITY_CONFLICT", "This evidence was already submitted with different files."],
  ["EVIDENCE_UPLOAD_STORAGE_MISMATCH", "The stored evidence files no longer match what was declared."],
  ["EVIDENCE_INTAKE_UPLOAD_CLAIM_LOST", "The upload session expired or was claimed by another request."],
  ["EVIDENCE_INTAKE_CANONICAL_IDENTITY_CONFLICT", "This evidence already has a different canonical identity."],
  ["EVIDENCE_INTAKE_TRANSPORT_CONFLICT", "This evidence was already submitted through a different transport."],
  ["EVIDENCE_INTAKE_MEDIA_ALREADY_COMPLETE", "This evidence already received all of its photos."],
]);

const MANIFEST_ERROR_NAMES = new Set(["EvidenceUploadArtifactCompletenessError", "StagedEvidenceManifestError"]);

export function toEvidenceIntakeProblem(error) {
  if (error instanceof ApplicationProblem) return error;
  if (MANIFEST_ERROR_NAMES.has(error?.name)) {
    return new ApplicationProblem({
      status: Number(error.status ?? 400),
      code: String(error.code ?? "EVIDENCE_UPLOAD_MANIFEST_INVALID"),
      title: String(error.message ?? "The selected-file manifest is invalid."),
      cause: error,
      ...(error.field ? { fieldErrors: [{ field: String(error.field), code: "invalid", detail: String(error.message) }] } : {}),
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
  if (typeof code === "string" && INTERNAL_DIAGNOSTIC_PROBLEMS.has(code)) {
    return new ApplicationProblem({ status: 500, code, title: "The upload could not be completed. Try again.", cause: error });
  }
  return error;
}
