import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { readBoundedJsonRequest } from "../../platform/http/readBoundedJsonRequest.js";
import { readBoundedBinaryRequest } from "../../platform/http/readBoundedBinaryRequest.js";
import { normalizePhotoSessionContext } from "./NativeEvidenceIntakeRequest.js";
import {
  STAGED_ARTIFACT_ABSOLUTE_MAXIMUM_BYTES,
  StagedArtifactRole,
  createStagedEvidenceArtifactManifest,
} from "../../domain/services/StagedEvidenceArtifactManifest.js";
import { PHOTO_CONTAINER_MIME_TYPES } from "../../domain/services/ImageContainerDetection.js";

/**
 * Staged-media intake: one small JSON request declares the intake and its
 * expected artifact set; each artifact then travels in its own bounded
 * request. The declaration is bounded generously for 24 photos with
 * confirmed identities plus their derivatives (about 25 KB encoded).
 */
export const STAGED_INTAKE_CREATE_MAXIMUM_BYTES = 64 * 1024;
const STAGED_EVIDENCE_TYPES = new Set(["photo_session"]);
const SUBMISSION_IDENTITY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARTIFACT_ID = /^artifact_[0-9a-f]{32}_[1-9]\d{0,2}$/i;
const INTAKE_ID = /^evidence_intake_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_CONTENT_TYPE = new RegExp(`^(?:${PHOTO_CONTAINER_MIME_TYPES.map((type) => type.replace("/", "\\/")).join("|")})$`);

export async function parseNativeStagedEvidenceIntakeRequest(request) {
  const body = await readBoundedJsonRequest(request, { maximumBytes: STAGED_INTAKE_CREATE_MAXIMUM_BYTES });
  const submissionIdentity = required(body.submissionIdentity, "submissionIdentity");
  if (!SUBMISSION_IDENTITY.test(submissionIdentity)) {
    throw problem(400, "EVIDENCE_INTAKE_SUBMISSION_ID_INVALID", "The evidence submission identity is invalid.");
  }
  const idempotencyKey = required(request.headers.get("idempotency-key"), "Idempotency-Key");
  if (idempotencyKey !== submissionIdentity) {
    throw problem(400, "IDEMPOTENCY_IDENTITY_MISMATCH", "Idempotency-Key must equal the evidence submission identity.");
  }
  const effectiveDate = required(body.effectiveDate, "effectiveDate");
  if (!isCalendarDate(effectiveDate)) {
    throw problem(400, "CONTRACT_VALIDATION_FAILED", "effectiveDate must be a valid YYYY-MM-DD calendar date.");
  }
  const expectedEvidenceType = String(body.expectedEvidenceType ?? "").trim();
  if (!STAGED_EVIDENCE_TYPES.has(expectedEvidenceType)) {
    throw problem(400, "EVIDENCE_TYPE_UNAVAILABLE", "Staged media intake accepts photo_session evidence only.");
  }
  const artifactManifest = createStagedEvidenceArtifactManifest({ submissionIdentity, artifacts: body.artifacts });
  const session = body.photoSession;
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw problem(400, "PHOTO_SESSION_REQUIRED", "Progress Photos session details are required.");
  }
  const recoveryContext = normalizePhotoSessionContext({
    originalUnedited: session.originalUnedited === true,
    timeOfDay: String(session.timeOfDay ?? "").trim(),
    fasted: session.fasted,
    postWorkout: session.postWorkout,
    pump: session.pump,
    photoIdentities: session.photoIdentities,
    photoCount: artifactManifest.originalCount,
  });
  const replacementForSubmissionIdentity = String(body.replacementForSubmissionIdentity ?? "").trim();
  if (replacementForSubmissionIdentity && !SUBMISSION_IDENTITY.test(replacementForSubmissionIdentity)) {
    throw problem(400, "EVIDENCE_REPLACEMENT_IDENTITY_INVALID", "The replacement predecessor identity is invalid.");
  }
  if (replacementForSubmissionIdentity === submissionIdentity) {
    throw problem(400, "EVIDENCE_REPLACEMENT_IDENTITY_INVALID", "Replacement evidence requires a new submission identity.");
  }
  return Object.freeze({
    submissionIdentity,
    effectiveDate,
    expectedEvidenceType,
    artifactManifest,
    // A dismissed predecessor is linked as lineage the same way the
    // multipart transport links it; the photo session context itself is
    // what interpretation consumes.
    recoveryContext: replacementForSubmissionIdentity
      ? Object.freeze({ ...recoveryContext, replacement: Object.freeze({
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: replacementForSubmissionIdentity,
      }) })
      : recoveryContext,
  });
}

export function parseStagedArtifactPath({ intakeId, artifactId } = {}) {
  const intake = String(intakeId ?? "").trim();
  const artifact = String(artifactId ?? "").trim();
  if (!INTAKE_ID.test(intake)) throw problem(404, "EVIDENCE_INTAKE_NOT_FOUND", "The evidence intake is unavailable.");
  if (!ARTIFACT_ID.test(artifact)) throw problem(404, "EVIDENCE_INTAKE_ARTIFACT_UNKNOWN", "The declared artifact is unavailable.");
  return Object.freeze({ intakeId: intake, artifactId: artifact.toLowerCase() });
}

/**
 * Reads one artifact body. The caller supplies the entry-specific ceiling
 * once the manifest entry is known (by role and container size class); the
 * absolute ceiling is the largest any artifact may be, so no entry can ever
 * be read past its own smaller limit.
 */
export function readStagedArtifactBody(request, { maximumBytes = STAGED_ARTIFACT_ABSOLUTE_MAXIMUM_BYTES } = {}) {
  return readBoundedBinaryRequest(request, {
    maximumBytes: Math.min(maximumBytes, STAGED_ARTIFACT_ABSOLUTE_MAXIMUM_BYTES),
    contentType: PHOTO_CONTENT_TYPE,
    requireContentLength: true,
  });
}

export { StagedArtifactRole };

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw problem(400, "CONTRACT_VALIDATION_FAILED", `${field} is required.`);
  return text;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function problem(status, code, title) {
  return new ApplicationProblem({ status, code, title });
}
