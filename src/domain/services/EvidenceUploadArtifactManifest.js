export const EVIDENCE_UPLOAD_MANIFEST_FIELD = "evidenceUploadManifestJson";
export const EVIDENCE_UPLOAD_MANIFEST_VERSION = "evidence-upload-manifest-v1";

export class EvidenceUploadArtifactCompletenessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EvidenceUploadArtifactCompletenessError";
    this.code = code;
    this.status = 400;
  }
}

export function createEvidenceUploadArtifactManifest(files = []) {
  const normalized = Array.from(files ?? []).map((file, index) =>
    Object.freeze({
      ordinal: index + 1,
      name: normalizeName(file?.name),
      size: normalizeSize(file?.size),
      type: normalizeType(file?.type),
    })
  );
  return Object.freeze({
    version: EVIDENCE_UPLOAD_MANIFEST_VERSION,
    selectedFileCount: normalized.length,
    files: Object.freeze(normalized),
  });
}

export function parseEvidenceUploadArtifactManifest(value) {
  let parsed;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    throw completenessError(
      "EVIDENCE_UPLOAD_MANIFEST_INVALID",
      "The selected-file manifest is invalid. Nothing was staged."
    );
  }
  if (
    parsed?.version !== EVIDENCE_UPLOAD_MANIFEST_VERSION ||
    !Number.isInteger(parsed.selectedFileCount) ||
    parsed.selectedFileCount < 0 ||
    !Array.isArray(parsed.files) ||
    parsed.files.length !== parsed.selectedFileCount
  ) {
    throw completenessError(
      "EVIDENCE_UPLOAD_MANIFEST_INVALID",
      "The selected-file manifest is invalid. Nothing was staged."
    );
  }
  const files = parsed.files.map((file, index) => normalizeManifestEntry(file, index));
  return Object.freeze({
    version: EVIDENCE_UPLOAD_MANIFEST_VERSION,
    selectedFileCount: files.length,
    files: Object.freeze(files),
  });
}

export function assertEvidenceUploadReceiptMatchesManifest({ manifest, receivedFiles = [] } = {}) {
  const received = createEvidenceUploadArtifactManifest(receivedFiles);
  assertManifestEntriesMatch({
    expected: manifest,
    actual: received,
    code: "EVIDENCE_UPLOAD_RECEIPT_MISMATCH",
    message: "Not all selected files reached PhysiqueOS. Nothing was staged.",
  });
  return received;
}

export function assertStoredEvidenceArtifactsMatchManifest({ manifest, storedArtifacts = [] } = {}) {
  const actualFiles = Array.from(storedArtifacts ?? []).map((artifact) => ({
    name: artifact?.fileName,
    size: artifact?.buffer?.length ?? artifact?.byteLength ?? artifact?.size,
    type: artifact?.mimeType,
  }));
  const stored = createEvidenceUploadArtifactManifest(actualFiles);
  assertManifestEntriesMatch({
    expected: manifest,
    actual: stored,
    code: "EVIDENCE_UPLOAD_STORAGE_MISMATCH",
    message: "Not all selected files were retained. Nothing was staged.",
  });
  return stored;
}

function assertManifestEntriesMatch({ expected, actual, code, message }) {
  if (!expected || expected.version !== EVIDENCE_UPLOAD_MANIFEST_VERSION) {
    throw completenessError(
      "EVIDENCE_UPLOAD_MANIFEST_REQUIRED",
      "A selected-file manifest is required. Nothing was staged."
    );
  }
  const same = expected.selectedFileCount === actual.selectedFileCount &&
    expected.files.every((file, index) =>
      file.ordinal === actual.files[index]?.ordinal &&
      file.name === actual.files[index]?.name &&
      file.size === actual.files[index]?.size &&
      file.type === actual.files[index]?.type
    );
  if (!same) throw completenessError(code, message);
}

function normalizeManifestEntry(file, index) {
  const normalized = {
    ordinal: Number(file?.ordinal),
    name: normalizeName(file?.name),
    size: normalizeSize(file?.size),
    type: normalizeType(file?.type),
  };
  if (normalized.ordinal !== index + 1 || !normalized.name) {
    throw completenessError(
      "EVIDENCE_UPLOAD_MANIFEST_INVALID",
      "The selected-file manifest is invalid. Nothing was staged."
    );
  }
  return Object.freeze(normalized);
}

function normalizeName(value) {
  return String(value ?? "").replaceAll("\\", "/").split("/").at(-1).trim();
}

function normalizeType(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSize(value) {
  const size = Number(value);
  return Number.isInteger(size) && size >= 0 ? size : -1;
}

function completenessError(code, message) {
  return new EvidenceUploadArtifactCompletenessError(code, message);
}
