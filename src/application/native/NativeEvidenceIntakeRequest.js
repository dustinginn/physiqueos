import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  assertEvidenceUploadReceiptMatchesManifest,
  createEvidenceUploadArtifactManifest,
} from "../../domain/services/EvidenceUploadArtifactManifest.js";
import { validateDexaPdfUpload } from "../../domain/services/DexaPdfIntakeService.js";
import { foundationLogger } from "../../platform/foundation/runtime.js";

const TYPES = new Set(["dexa_scan", "nutrition", "activity_day", "training"]);
const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
const MAX_SCREENSHOTS = 4;
// The largest single accepted file (the 50 MB DEXA PDF) plus headroom for
// multipart framing overhead (other form fields, boundaries, headers).
const MAX_REQUEST_BYTES = 51 * 1024 * 1024;

export async function parseNativeEvidenceIntakeRequest(request) {
  const contentTypeHeader = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentTypeHeader)) {
    throw problem(400, "CONTENT_TYPE_REQUIRED", "A multipart evidence intake is required.");
  }
  if (!/boundary=/i.test(contentTypeHeader)) {
    throw problem(400, "MULTIPART_BOUNDARY_MISSING", "The upload request is missing its multipart boundary.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw problem(413, "MULTIPART_REQUEST_TOO_LARGE", "The upload is larger than PhysiqueOS accepts.");
  }
  let formData;
  try {
    formData = await request.formData();
  } catch (error) {
    logMultipartParseFailure({ request, contentTypeHeader, declaredLength, error });
    const failure = new Error("The upload could not be read.");
    failure.code = "MULTIPART_PARSE_FAILED";
    throw failure;
  }
  const submissionIdentity = required(formData.get("submissionIdentity"), "submissionIdentity");
  const idempotencyKey = required(request.headers.get("idempotency-key"), "Idempotency-Key");
  if (idempotencyKey !== submissionIdentity) {
    throw problem(400, "IDEMPOTENCY_IDENTITY_MISMATCH", "Idempotency-Key must equal the evidence submission identity.");
  }
  const effectiveDate = required(formData.get("effectiveDate"), "effectiveDate");
  if (!isCalendarDate(effectiveDate)) {
    throw problem(400, "CONTRACT_VALIDATION_FAILED", "effectiveDate must be a valid YYYY-MM-DD calendar date.");
  }
  const expectedEvidenceType = String(formData.get("expectedEvidenceType") ?? "").trim();
  if (!TYPES.has(expectedEvidenceType)) {
    throw problem(400, "EVIDENCE_TYPE_UNAVAILABLE", "Native intake accepts dexa_scan, nutrition, activity_day, or training evidence only.");
  }
  const files = formData.getAll("evidenceFiles")
    .filter((file) => typeof file?.arrayBuffer === "function" && file.size > 0);
  await validateFiles({ expectedEvidenceType, files });
  const artifactManifest = createEvidenceUploadArtifactManifest(files);
  assertEvidenceUploadReceiptMatchesManifest({ manifest: artifactManifest, receivedFiles: files });
  return Object.freeze({
    submissionIdentity,
    effectiveDate,
    expectedEvidenceType,
    files,
    artifactManifest,
    typedEvidence: null,
    recoveryContext: null,
  });
}

// Every uploaded part's declared type is propagated verbatim into the
// stored object's HTTP Content-Type (ProviderCanonicalUploadService →
// Spaces), so it must be a real MIME type. A client that declares a
// platform type identifier instead (an Apple UTType such as
// "com.adobe.pdf", "public.data", or a dynamic "dyn.…") is violating the
// wire contract. That previously travelled five layers before dying deep
// inside provider upload with an error that named neither the offending
// value nor the file; the intake boundary owns this contract and rejects
// it here instead. An ABSENT type stays legal — downstream defaults it to
// application/octet-stream — so this only rejects a present-but-invalid
// declaration. The server deliberately does NOT rewrite the value: the
// platform-to-MIME translation belongs on the client, where the platform
// type actually exists.
const MIME_TYPE_SHAPE = /^[-\w.+]+\/[-\w.+]+$/;

function assertDeclaredTypesAreMIME(files) {
  for (const file of files) {
    const declared = String(file?.type ?? "").trim();
    if (declared && !MIME_TYPE_SHAPE.test(declared)) {
      throw problem(
        400,
        "EVIDENCE_UPLOAD_CONTENT_TYPE_INVALID",
        "An uploaded file declared a platform type identifier instead of a media type."
      );
    }
  }
}

async function validateFiles({ expectedEvidenceType, files }) {
  assertDeclaredTypesAreMIME(files);
  if (expectedEvidenceType === "dexa_scan") {
    if (files.length !== 1) throw problem(400, "DEXA_PDF_REQUIRED", "DEXA intake requires exactly one BodySpec PDF.");
    validateDexaPdfUpload({
      bytes: Buffer.from(await files[0].arrayBuffer()),
      fileName: files[0].name,
      mimeType: files[0].type,
    });
    return;
  }
  if (files.length < 1 || files.length > MAX_SCREENSHOTS) {
    throw problem(400, "SCREENSHOT_COUNT_INVALID", `Native ${expectedEvidenceType} intake requires one to ${MAX_SCREENSHOTS} screenshots.`);
  }
  for (const file of files) {
    if (file.size > MAX_SCREENSHOT_BYTES) throw problem(413, "SCREENSHOT_TOO_LARGE", "Each screenshot must be 15 MB or smaller.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!isSupportedImage(bytes, file.type)) {
      throw problem(400, "SCREENSHOT_INVALID", "Only valid PNG, JPEG, or WebP screenshots are accepted.");
    }
  }
}

function isSupportedImage(bytes, mimeType) {
  const type = String(mimeType ?? "").toLowerCase();
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return (type === "image/jpeg" && jpeg) || (type === "image/png" && png) || (type === "image/webp" && webp);
}

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

// Logs only facts that are safe to record: header presence/shape and error
// class, never the PDF/image bytes, the multipart body, or the raw parser
// message (which can echo back fragments of the body it failed to parse).
function logMultipartParseFailure({ request, contentTypeHeader, declaredLength, error }) {
  let path = null;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = null;
  }
  foundationLogger?.warn("evidence.intake.multipart.parse_failed", {
    method: request.method,
    path,
    multipartDeclared: /^multipart\/form-data(?:;|$)/i.test(contentTypeHeader),
    boundaryDeclared: /boundary=/i.test(contentTypeHeader),
    declaredLength: Number.isFinite(declaredLength) ? declaredLength : null,
    errorName: error?.name ?? null,
  });
}
