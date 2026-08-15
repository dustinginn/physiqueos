import { createDEXAScan } from "../models/dexaScan";
import { interpretPdfEvidence } from "../interpreters/PdfInterpreter";

export const MAX_DEXA_PDF_BYTES = 50 * 1024 * 1024;

export function validateDexaPdfUpload({ bytes, fileName = "", mimeType = "" } = {}) {
  const buffer = Buffer.from(bytes ?? []);
  if (buffer.length === 0) throw intakeError("DEXA_PDF_REQUIRED", "Choose a BodySpec PDF to continue.");
  if (buffer.length > MAX_DEXA_PDF_BYTES) throw intakeError("DEXA_PDF_TOO_LARGE", "The DEXA PDF is larger than 50 MB.");
  const looksLikePdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const declaredPdf = /\.pdf$/i.test(String(fileName)) || String(mimeType).toLowerCase() === "application/pdf";
  if (!looksLikePdf || !declaredPdf) throw intakeError("DEXA_PDF_INVALID", "Choose a valid PDF exported by BodySpec.");
  return buffer;
}

export async function createDexaPdfReviewPackage({
  bytes,
  capturedAt,
  existingScans = [],
  originalFileName,
  sourcePath,
  submissionId,
  userId,
} = {}) {
  const buffer = validateDexaPdfUpload({ bytes, fileName: originalFileName, mimeType: "application/pdf" });
  const interpretation = await interpretPdfEvidence({
    capturedAt,
    files: [{
      buffer,
      capturedAt,
      fileName: sourcePath,
      id: submissionId,
      userId,
    }],
    id: submissionId,
    userId,
  });
  const extracted = interpretation.scan ?? interpretation.reviewCandidates?.[0] ?? null;
  const candidate = extracted
    ? withReviewSource(extracted, { originalFileName, sourcePath })
    : createUnresolvedCandidate({ capturedAt, originalFileName, sourcePath, submissionId, userId, interpretation });
  const measuredAt = candidate.measuredAt || candidate.observed_at || null;
  const evidenceObject = {
    ...candidate,
    evidence_type: "dexa_scan",
    observed_at: measuredAt,
    captured_at: candidate.createdAt ?? capturedAt,
    parser_confidence: interpretation.scan ? "high" : extracted ? "partial" : "low",
    review_required: true,
  };
  return {
    ...interpretation.evidencePackage,
    package_id: `${submissionId}_review`,
    captured_at: capturedAt,
    detected_source_application: interpretation.detectedSourceApplication ?? "BodySpec PDF",
    detected_evidence_type: "dexa_scan",
    detected_evidence_objects: [{ evidence_type: "dexa_scan", canonical_name: "DEXAScan", count: 1 }],
    evidence_objects: [evidenceObject],
    quality: {
      ...(interpretation.evidencePackage?.quality ?? {}),
      status: interpretation.scan ? "rich" : "needs_review",
    },
    provenance: {
      ...(interpretation.evidencePackage?.provenance ?? {}),
      submission_id: submissionId,
      source_artifacts: [{
        id: sourcePath,
        kind: "pdf",
        file_name: originalFileName,
        mime_type: "application/pdf",
        storage_path: sourcePath,
        uploaded_at: capturedAt,
      }],
    },
    review_metadata: {
      duplicateCandidate: Boolean(measuredAt && existingScans.some((scan) => scan.measuredAt === measuredAt)),
      extractionStatus: interpretation.status,
      originalFileName,
    },
  };
}

export function applyDexaReviewMeasurements(object, values = {}) {
  const measuredAt = optionalText(values.measuredAt);
  const numeric = (key) => optionalNumber(values[key]);
  return {
    ...object,
    measuredAt,
    observed_at: measuredAt,
    totalMass: metric(numeric("totalMass"), "lb"),
    bodyFatPercentage: numeric("bodyFatPercentage"),
    fatMass: metric(numeric("fatMass"), "lb"),
    leanMass: metric(numeric("leanMass"), "lb"),
    boneMineralContent: metric(numeric("boneMineralContent"), "lb"),
    restingMetabolicRate: metric(numeric("restingMetabolicRate"), "kcal/day"),
    visceralAdiposeTissue: {
      ...(object.visceralAdiposeTissue ?? {}),
      mass: metric(numeric("vatMass"), "lb"),
      volume: metric(numeric("vatVolume"), "in3"),
    },
    parser_confidence: "user_corrected",
    review_required: true,
  };
}

function createUnresolvedCandidate({ capturedAt, originalFileName, sourcePath, submissionId, userId, interpretation }) {
  return createDEXAScan({
    id: `${submissionId}_unresolved`,
    userId,
    measuredAt: null,
    provider: "BodySpec",
    sourceFileId: sourcePath,
    source: {
      confidence: "low",
      name: "BodySpec PDF",
      type: "dexa",
      modality: "pdf",
      originalFileName,
      source_artifact_refs: [sourcePath],
    },
    provenance: {
      extraction_engine: "pdfjs-dist",
      fixture: false,
      source_artifact_refs: [sourcePath],
    },
    quality: {
      status: "needs_review",
      limitations: interpretation.evidencePackage?.quality?.limitations ?? ["BodySpec values could not be extracted."],
    },
    createdAt: capturedAt,
    updatedAt: capturedAt,
  });
}

function withReviewSource(scan, { originalFileName, sourcePath }) {
  return {
    ...scan,
    sourceFileId: sourcePath,
    rawReportPath: sourcePath,
    source: {
      ...(scan.source ?? {}),
      originalFileName,
      source_artifact_refs: [sourcePath],
    },
    provenance: {
      ...(scan.provenance ?? {}),
      source_artifact_refs: [sourcePath],
    },
  };
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
function optionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
function metric(value, unit) { return { value, unit }; }
function intakeError(code, message) { const error = new Error(message); error.code = code; return error; }
