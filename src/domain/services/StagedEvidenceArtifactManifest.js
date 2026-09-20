import {
  DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES,
  PHOTO_CONTAINER_MIME_TYPES,
  PhotoContainerSizeClass,
  photoContainerSizeClass,
  requiresAnalysisDerivative,
} from "./ImageContainerDetection.js";

/**
 * Staged-media manifest: the expected artifact set of one intake, declared
 * before any byte is transferred. It reuses the receipt's existing
 * `artifact_manifest` column and the existing `stored_artifacts` bookkeeping
 * (ordinal-keyed), so no schema change is required. The `version` marker is
 * how the store and service tell a staged intake from the aggregate
 * multipart intake that shares the same table.
 *
 * Roles:
 *   original            the Founder's photo bytes, preserved verbatim
 *   analysis_derivative a bounded JPEG rendition of one original whose
 *                       container display and analysis cannot read directly
 *                       (HEIC/HEIF, Apple ProRAW DNG); the original stays
 *                       the canonical photo
 */
export const STAGED_EVIDENCE_MANIFEST_VERSION = "evidence-upload-manifest-staged-v1";
export const StagedArtifactRole = Object.freeze({
  ORIGINAL: "original",
  ANALYSIS_DERIVATIVE: "analysis_derivative",
});

/**
 * Per-artifact HTTP ceilings, derived from what a current iPhone actually
 * produces and from the request path this artifact PUT actually traverses:
 *
 *   compressed original (JPEG/PNG/WebP/HEIC/HEIF)
 *              48 MP is the largest sensor resolution an iPhone Camera
 *              writes. A 48 MP "Most Compatible" JPEG lands around 9-18 MB;
 *              a 48 MP HEIF Max is 5-8 MB; 24 MP and 12 MP photos are
 *              smaller still. 32 MiB is ~1.8x the largest realistic one.
 *   raw original (Apple ProRAW DNG)
 *              A 24 MP ProRAW from an iPhone 17 Pro measures 40.0-46.2 MB
 *              (the Founder's real set). The binding ceiling on the PUT
 *              path is application-owned: the object-storage gate
 *              (`ProviderCanonicalUploadService` MAX_UPLOAD_BYTES, 50 MiB)
 *              and this reader; DigitalOcean publishes no body limit (only
 *              a 600 s upload timeout) and demonstrably passed a >51 MiB
 *              multipart to the app in Build 43, and Next's proxy body
 *              limit applies only when the proxy clones a body, which ours
 *              never does. 48 MiB sits 2 MiB under the storage gate and
 *              leaves 4.08 MiB (8.1%) over the largest real file. 48 MP
 *              ProRAW Max (~75 MB) is deliberately outside this bound.
 *   derivative a 2048 px longest-edge JPEG at quality 0.9 is ~0.6-2.5 MB.
 *              8 MiB is >3x that.
 *
 * Bounds are enforced per request, never aggregated across a session, so a
 * five-photo set is five bounded transfers rather than one 200+ MB body.
 */
export const STAGED_ORIGINAL_MAXIMUM_BYTES = 32 * 1024 * 1024;
export const STAGED_RAW_ORIGINAL_MAXIMUM_BYTES = 48 * 1024 * 1024;
export const STAGED_DERIVATIVE_MAXIMUM_BYTES = 8 * 1024 * 1024;
// The largest body any staged artifact request may carry; the reader's
// absolute ceiling before the entry-specific one is known.
export const STAGED_ARTIFACT_ABSOLUTE_MAXIMUM_BYTES = Math.max(STAGED_ORIGINAL_MAXIMUM_BYTES, STAGED_RAW_ORIGINAL_MAXIMUM_BYTES, STAGED_DERIVATIVE_MAXIMUM_BYTES);
export const STAGED_MAXIMUM_ORIGINALS = 24;
export const STAGED_DERIVATIVE_MIME_TYPE = "image/jpeg";

// Server-side decoding of the non-consumable containers is not available in
// this runtime (the bundled libvips has libheif without an HEVC decoder and
// no RAW pipeline), so such an original must arrive with its analysis
// derivative. Directly consumable containers must not: the original already
// serves display and analysis.
export const STAGED_SERVER_DERIVATIVE_GENERATION = false;

/** The transport ceiling for one original, by its container's size class. */
export function stagedOriginalMaximumBytes(mimeType) {
  return photoContainerSizeClass(mimeType) === PhotoContainerSizeClass.RAW
    ? STAGED_RAW_ORIGINAL_MAXIMUM_BYTES
    : STAGED_ORIGINAL_MAXIMUM_BYTES;
}

export class StagedEvidenceManifestError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "StagedEvidenceManifestError";
    this.code = code;
    this.status = 400;
    this.field = field;
  }
}

export function isStagedEvidenceManifest(manifest) {
  return manifest?.version === STAGED_EVIDENCE_MANIFEST_VERSION;
}

/** Deterministic, intake-bound artifact identity. Ordinals are unique across roles. */
export function stagedArtifactId(submissionIdentity, ordinal) {
  return `artifact_${String(submissionIdentity).replaceAll("-", "")}_${ordinal}`;
}

/**
 * Validates a client-declared artifact set and returns the frozen manifest
 * the receipt stores. Identity is Server-derived: the client must declare
 * the exact artifactId this function derives for each ordinal, so a client
 * cannot mint arbitrary keys, and retries of the same set always name the
 * same artifacts.
 */
export function createStagedEvidenceArtifactManifest({ submissionIdentity, artifacts } = {}) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw invalid("STAGED_ARTIFACTS_REQUIRED", "Declare at least one photo artifact.", "artifacts");
  }
  if (artifacts.length > STAGED_MAXIMUM_ORIGINALS * 2) {
    throw invalid("STAGED_ARTIFACTS_TOO_MANY", `At most ${STAGED_MAXIMUM_ORIGINALS} photos may be staged.`, "artifacts");
  }
  const files = artifacts.map((entry, index) => normalizeEntry(entry, index, submissionIdentity));
  const byId = new Map(files.map((file) => [file.artifactId, file]));
  const originals = files.filter((file) => file.role === StagedArtifactRole.ORIGINAL);
  if (originals.length === 0) {
    throw invalid("STAGED_ARTIFACTS_REQUIRED", "Declare at least one original photo.", "artifacts");
  }
  if (originals.length > STAGED_MAXIMUM_ORIGINALS) {
    throw invalid("STAGED_ARTIFACTS_TOO_MANY", `At most ${STAGED_MAXIMUM_ORIGINALS} photos may be staged.`, "artifacts");
  }
  const derivativesByOriginal = new Map();
  for (const file of files) {
    if (file.role !== StagedArtifactRole.ANALYSIS_DERIVATIVE) continue;
    const original = byId.get(file.derivativeOf);
    if (!original || original.role !== StagedArtifactRole.ORIGINAL) {
      throw invalid("STAGED_DERIVATIVE_TARGET_INVALID", "An analysis derivative must name one original in the same set.", `artifacts[${file.ordinal - 1}].derivativeOf`);
    }
    if (derivativesByOriginal.has(original.artifactId)) {
      throw invalid("STAGED_DERIVATIVE_DUPLICATE", "Each original accepts at most one analysis derivative.", `artifacts[${file.ordinal - 1}].derivativeOf`);
    }
    if (!requiresAnalysisDerivative(original.type)) {
      throw invalid("STAGED_DERIVATIVE_UNEXPECTED", "Only an original that display and analysis cannot read directly (HEIC, HEIF, Apple ProRAW DNG) takes an analysis derivative.", `artifacts[${file.ordinal - 1}].derivativeOf`);
    }
    derivativesByOriginal.set(original.artifactId, file.artifactId);
  }
  for (const original of originals) {
    if (requiresAnalysisDerivative(original.type) && !derivativesByOriginal.has(original.artifactId) && !STAGED_SERVER_DERIVATIVE_GENERATION) {
      throw invalid("STAGED_DERIVATIVE_REQUIRED", "An HEIC, HEIF, or Apple ProRAW DNG original requires a JPEG analysis derivative.", `artifacts[${original.ordinal - 1}]`);
    }
  }
  const seenHashes = new Set();
  for (const file of originals) {
    if (seenHashes.has(file.sha256)) {
      throw invalid("STAGED_ARTIFACT_DUPLICATE_CONTENT", "The same photo was declared twice.", `artifacts[${file.ordinal - 1}].sha256`);
    }
    seenHashes.add(file.sha256);
  }
  return Object.freeze({
    version: STAGED_EVIDENCE_MANIFEST_VERSION,
    selectedFileCount: files.length,
    originalCount: originals.length,
    files: Object.freeze(files),
  });
}

/** The manifest entry an uploaded artifact must satisfy, or null when unknown. */
export function findStagedManifestEntry(manifest, artifactId) {
  if (!isStagedEvidenceManifest(manifest)) return null;
  return manifest.files.find((file) => file.artifactId === artifactId) ?? null;
}

export function stagedArtifactMaximumBytes(entry) {
  return entry?.role === StagedArtifactRole.ANALYSIS_DERIVATIVE ? STAGED_DERIVATIVE_MAXIMUM_BYTES : stagedOriginalMaximumBytes(entry?.type);
}

/**
 * True only when every declared artifact has a stored counterpart whose
 * identity, name, size, type, and content hash all agree with the manifest.
 * This is what "media complete" means for a staged intake; nothing weaker
 * may flip the receipt to `stored`.
 */
export function stagedManifestIsSatisfied(manifest, storedArtifacts = []) {
  if (!isStagedEvidenceManifest(manifest)) return false;
  const stored = new Map((storedArtifacts ?? []).map((artifact) => [artifact.id, artifact]));
  return manifest.files.every((file) => {
    const artifact = stored.get(file.artifactId);
    return Boolean(artifact) &&
      Number(artifact.ordinal) === file.ordinal &&
      artifact.fileName === file.name &&
      Number(artifact.byteLength) === file.size &&
      String(artifact.mimeType).toLowerCase() === file.type &&
      String(artifact.sha256).toLowerCase() === file.sha256;
  });
}

export function stagedArtifactProgress(manifest, storedArtifacts = []) {
  const stored = new Map((storedArtifacts ?? []).map((artifact) => [artifact.id, artifact]));
  return Object.freeze((manifest?.files ?? []).map((file) => Object.freeze({
    artifactId: file.artifactId,
    ordinal: file.ordinal,
    role: file.role,
    derivativeOf: file.derivativeOf,
    state: stored.has(file.artifactId) ? "stored" : "expected",
  })));
}

function normalizeEntry(entry, index, submissionIdentity) {
  const ordinal = index + 1;
  const field = (name) => `artifacts[${index}].${name}`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw invalid("STAGED_ARTIFACT_INVALID", "Each artifact must be an object.", `artifacts[${index}]`);
  }
  if (Number(entry.ordinal) !== ordinal) {
    throw invalid("STAGED_ARTIFACT_INVALID", "Artifact ordinals must be 1-based and contiguous.", field("ordinal"));
  }
  const expectedId = stagedArtifactId(submissionIdentity, ordinal);
  if (String(entry.artifactId ?? "") !== expectedId) {
    throw invalid("STAGED_ARTIFACT_IDENTITY_INVALID", "Artifact identity must be derived from the submission identity and ordinal.", field("artifactId"));
  }
  const role = String(entry.role ?? "");
  if (!Object.values(StagedArtifactRole).includes(role)) {
    throw invalid("STAGED_ARTIFACT_INVALID", "Artifact role is unsupported.", field("role"));
  }
  const name = String(entry.fileName ?? "").replaceAll("\\", "/").split("/").at(-1).trim();
  if (!name || name.length > 200) throw invalid("STAGED_ARTIFACT_INVALID", "Artifact file name is required.", field("fileName"));
  const type = String(entry.mimeType ?? "").trim().toLowerCase();
  const acceptedTypes = role === StagedArtifactRole.ANALYSIS_DERIVATIVE
    ? [STAGED_DERIVATIVE_MIME_TYPE]
    : PHOTO_CONTAINER_MIME_TYPES;
  if (!acceptedTypes.includes(type)) {
    throw invalid("STAGED_ARTIFACT_MEDIA_UNSUPPORTED", `Accepted photo types are ${PHOTO_CONTAINER_MIME_TYPES.join(", ")}.`, field("mimeType"));
  }
  const size = Number(entry.byteLength);
  const maximum = role === StagedArtifactRole.ANALYSIS_DERIVATIVE ? STAGED_DERIVATIVE_MAXIMUM_BYTES : stagedOriginalMaximumBytes(type);
  if (!Number.isSafeInteger(size) || size < 1) throw invalid("STAGED_ARTIFACT_INVALID", "Artifact byte length is required.", field("byteLength"));
  if (size > maximum) {
    throw invalid("STAGED_ARTIFACT_TOO_LARGE", `Each ${role === StagedArtifactRole.ORIGINAL ? "photo" : "analysis derivative"} must be ${Math.round(maximum / 1048576)} MiB or smaller.`, field("byteLength"));
  }
  const sha256 = String(entry.sha256 ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw invalid("STAGED_ARTIFACT_INVALID", "Artifact SHA-256 is required.", field("sha256"));
  const derivativeOf = entry.derivativeOf == null ? null : String(entry.derivativeOf);
  if (role === StagedArtifactRole.ORIGINAL && derivativeOf) {
    throw invalid("STAGED_ARTIFACT_INVALID", "An original cannot derive from another artifact.", field("derivativeOf"));
  }
  if (role === StagedArtifactRole.ANALYSIS_DERIVATIVE && !derivativeOf) {
    throw invalid("STAGED_DERIVATIVE_TARGET_INVALID", "An analysis derivative must name its original.", field("derivativeOf"));
  }
  return Object.freeze({ ordinal, artifactId: expectedId, role, derivativeOf, name, size, type, sha256 });
}

function invalid(code, message, field) {
  return new StagedEvidenceManifestError(code, message, field);
}

export { DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES };
