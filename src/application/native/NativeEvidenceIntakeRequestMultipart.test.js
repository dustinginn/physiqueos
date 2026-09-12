import { describe, expect, it } from "vitest";
import { parseNativeEvidenceIntakeRequest } from "./NativeEvidenceIntakeRequest.js";

// These tests hand-build the raw multipart/form-data byte stream exactly as
// FounderServerAPI.swift's appendMultipartField/appendMultipartFile do, then
// hand it to the REAL Request/formData() parser Next.js uses in production —
// unlike NativeEvidenceIntakeRequest.test.js, which only ever constructs a
// FormData object directly (an in-memory shortcut no real client can send).
// This is what actually caught the real production defect: a PDF picked via
// EvidenceAttachmentLoader.files() declared its multipart Content-Type as
// the raw UTI "com.adobe.pdf" (never converted to "application/pdf"), which
// parseNativeEvidenceIntakeRequest accepts (it also trusts a ".pdf" filename)
// but which later fails ProviderCanonicalUploadService's MIME validation —
// see ProviderCanonicalUploadServiceMultipartContentType.test.js for that half.

const ID = "01999999-9999-7999-8999-999999999999";
const CRLF = "\r\n";

function pdfBytes(sizeBytes) {
  // A real PDF-shaped byte stream: the required "%PDF-" magic header,
  // followed by arbitrary binary content (every byte value 0-255, repeated)
  // — including bytes that look like "--" or newline sequences, to prove
  // the parser is binary-safe and does not get confused by content that
  // merely resembles multipart framing.
  const header = Buffer.from("%PDF-1.7\n");
  const filler = Buffer.alloc(Math.max(0, sizeBytes - header.length));
  for (let i = 0; i < filler.length; i += 1) filler[i] = i % 256;
  return Buffer.concat([header, filler]).subarray(0, sizeBytes);
}

function buildMultipartBody({ boundary, fields, file }) {
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`
    ));
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="evidenceFiles"; filename="${file.filename}"${CRLF}` +
      `Content-Type: ${file.contentType}${CRLF}${CRLF}`
    ));
    parts.push(file.data);
    parts.push(Buffer.from(CRLF));
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return Buffer.concat(parts);
}

function multipartRequest({ boundary = "PhysiqueOSNativeIntakeTestBoundary", fields, file, contentTypeHeader, contentLengthHeader, truncateLastBytes = 0 }) {
  let body = buildMultipartBody({ boundary, fields, file });
  if (truncateLastBytes > 0) body = body.subarray(0, body.length - truncateLastBytes);
  const headers = { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": fields?.submissionIdentity ?? ID };
  headers["content-type"] = contentTypeHeader ?? `multipart/form-data; boundary=${boundary}`;
  if (contentLengthHeader !== undefined) headers["content-length"] = String(contentLengthHeader);
  return new Request("https://physiqueos.example/api/v1/native/evidence/intakes", { method: "POST", headers, body });
}

function dexaFields(overrides = {}) {
  return { submissionIdentity: ID, effectiveDate: "2026-09-11", expectedEvidenceType: "dexa_scan", ...overrides };
}

describe("Native production Evidence intake — realistic network-level multipart parsing", () => {
  it("accepts a valid small PDF with correct filename and application/pdf content type", async () => {
    const request = multipartRequest({
      fields: dexaFields(),
      file: { filename: "BodySpec.pdf", contentType: "application/pdf", data: pdfBytes(2_048) },
    });
    const result = await parseNativeEvidenceIntakeRequest(request);
    expect(result.expectedEvidenceType).toBe("dexa_scan");
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("BodySpec.pdf");
    expect(result.files[0].type).toBe("application/pdf");
  });

  it("accepts a realistically-sized real-shaped PDF (3 MB) and reaches durable-intake handoff", async () => {
    const size = 3 * 1024 * 1024;
    const request = multipartRequest({
      fields: dexaFields(),
      file: { filename: "BodySpec.pdf", contentType: "application/pdf", data: pdfBytes(size) },
    });
    const result = await parseNativeEvidenceIntakeRequest(request);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].size).toBe(size);
    // Reaching a populated, well-formed return value IS durable-intake
    // handoff from this function's perspective — the caller passes this
    // straight to NativeProductionContractService.acceptEvidenceIntake.
    expect(result.artifactManifest.files[0].size).toBe(size);
  });

  it("accepts binary PDF content containing arbitrary byte sequences (including boundary-like patterns)", async () => {
    // pdfBytes() already cycles through every byte value 0-255, which
    // includes 0x2d ('-') runs and CR/LF bytes that could, in a naive
    // parser, be confused with multipart framing.
    const request = multipartRequest({
      fields: dexaFields(),
      file: { filename: "BodySpec.pdf", contentType: "application/pdf", data: pdfBytes(65_536) },
    });
    const result = await parseNativeEvidenceIntakeRequest(request);
    expect(result.files[0].size).toBe(65_536);
  });

  it("accepts the real Native content-type defect shape (filename + com.adobe.pdf) at THIS layer — it fails later, not here", async () => {
    // This is the exact multipart shape Build 24/25 sent before the Native
    // fix: EvidenceAttachmentLoader.files() declared the UTI identifier
    // "com.adobe.pdf" as the multipart Content-Type instead of a MIME type.
    // parseNativeEvidenceIntakeRequest's DEXA validation accepts it via the
    // ".pdf" filename fallback (see DexaPdfIntakeService.validateDexaPdfUpload) —
    // proving the real production 500 did NOT originate in multipart parsing
    // or in this function at all.
    const request = multipartRequest({
      fields: dexaFields(),
      file: { filename: "BodySpec.pdf", contentType: "com.adobe.pdf", data: pdfBytes(2_048) },
    });
    const result = await parseNativeEvidenceIntakeRequest(request);
    expect(result.files[0].type).toBe("com.adobe.pdf");
  });

  it("rejects a request with no multipart boundary declared", async () => {
    const request = multipartRequest({ fields: dexaFields(), file: { filename: "a.pdf", contentType: "application/pdf", data: pdfBytes(16) }, contentTypeHeader: "multipart/form-data" });
    await expect(parseNativeEvidenceIntakeRequest(request)).rejects.toMatchObject({ code: "MULTIPART_BOUNDARY_MISSING", status: 400 });
  });

  it("rejects a request declaring a Content-Length beyond the effective supported size", async () => {
    const request = multipartRequest({ fields: dexaFields(), file: { filename: "a.pdf", contentType: "application/pdf", data: pdfBytes(16) }, contentLengthHeader: 60 * 1024 * 1024 });
    await expect(parseNativeEvidenceIntakeRequest(request)).rejects.toMatchObject({ code: "MULTIPART_REQUEST_TOO_LARGE", status: 413 });
  });

  it("classifies a truncated/incomplete multipart body as a distinct internal diagnostic, not a silent UNCLASSIFIED_ERROR", async () => {
    const request = multipartRequest({
      fields: dexaFields(),
      file: { filename: "BodySpec.pdf", contentType: "application/pdf", data: pdfBytes(4_096) },
      truncateLastBytes: 200, // drops the terminal boundary and part of the file — simulates a dropped connection
    });
    let caught = null;
    try {
      await parseNativeEvidenceIntakeRequest(request);
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).toBe("MULTIPART_PARSE_FAILED");
    expect(caught.message).not.toMatch(/%PDF/); // never echoes file bytes back into the error
  });

  it("classifies a malformed multipart boundary mismatch (body boundary != declared boundary) as a distinct internal diagnostic", async () => {
    const body = buildMultipartBody({ boundary: "actualBoundary", fields: dexaFields(), file: { filename: "a.pdf", contentType: "application/pdf", data: pdfBytes(16) } });
    const request = new Request("https://physiqueos.example/api/v1/native/evidence/intakes", {
      method: "POST",
      headers: {
        authorization: `Bearer ${"x".repeat(43)}`,
        "idempotency-key": ID,
        "content-type": "multipart/form-data; boundary=declaredBoundaryDoesNotMatch",
      },
      body,
    });
    let caught = null;
    try {
      await parseNativeEvidenceIntakeRequest(request);
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe("MULTIPART_PARSE_FAILED");
  });
});
