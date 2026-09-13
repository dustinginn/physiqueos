import { describe, expect, it, vi } from "vitest";
import { parseNativeEvidenceIntakeRequest } from "./NativeEvidenceIntakeRequest.js";
import { createAsyncEvidenceIntakeService } from "../evidence/AsyncEvidenceIntakeService.js";
import { createProviderCanonicalUploadService } from "../media/ProviderCanonicalUploadService.js";
import { toEvidenceIntakeProblem } from "../../domain/services/EvidenceIntakeProblemMapping.js";

// The real Build 26 production failure (request
// 01a09829-e94c-703b-a33d-cbbcd79d8c20, 2026-09-13T00:27:58Z) proved that
// stopping a test at request.formData() proves nothing: multipart parsing
// SUCCEEDED and the upload still died four layers later, inside provider
// upload validation. These tests therefore carry a byte-for-byte
// Native-shaped multipart request all the way across that boundary.

const ID = "01999999-9999-7999-8999-999999999999";
const CRLF = "\r\n";
const OWNER = "user_founder_001";

function pdfBytes(sizeBytes = 4096) {
  const header = Buffer.from("%PDF-1.7\n");
  const filler = Buffer.alloc(Math.max(0, sizeBytes - header.length));
  for (let i = 0; i < filler.length; i += 1) filler[i] = i % 256;
  return Buffer.concat([header, filler]).subarray(0, sizeBytes);
}

/// Mirrors FounderServerAPI.swift's appendMultipartField/appendMultipartFile
/// byte for byte, including CRLF placement and the unquoted Content-Type.
function nativeShapedMultipart({ boundary = "PhysiqueOSNativeIntakeTest", fields, file }) {
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}Content-Type: text/plain${CRLF}${CRLF}${value}${CRLF}`));
  }
  parts.push(Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="evidenceFiles"; filename="${file.filename}"${CRLF}` +
    `Content-Type: ${file.contentType}${CRLF}${CRLF}`
  ));
  parts.push(file.data);
  parts.push(Buffer.from(CRLF));
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return { body: Buffer.concat(parts), boundary };
}

function intakeRequest({ contentType, filename = "BodySpec.pdf", data = pdfBytes() }) {
  const { body, boundary } = nativeShapedMultipart({
    fields: { submissionIdentity: ID, effectiveDate: "2026-09-11", expectedEvidenceType: "dexa_scan" },
    file: { filename, contentType, data },
  });
  return new Request("https://physiqueos.example/api/v1/native/evidence/intakes", {
    method: "POST",
    headers: {
      authorization: `Bearer ${"x".repeat(43)}`,
      "idempotency-key": ID,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
}

/// Minimal in-memory receipt store matching PostgresEvidenceIntakeStore's
/// contract, so the real AsyncEvidenceIntakeService drives the real
/// ProviderCanonicalUploadService.
function fakeReceiptStore() {
  const receipts = new Map();
  return {
    ownerUserId: OWNER,
    failures: [],
    async beginUpload(input) {
      const id = `evidence_intake_${input.submissionIdentity}`;
      const receipt = receipts.get(id) ?? {
        id,
        submissionIdentity: input.submissionIdentity,
        ownerUserId: OWNER,
        effectiveDate: input.effectiveDate,
        expectedEvidenceType: input.expectedEvidenceType,
        artifactManifest: input.artifactManifest,
        mediaState: "receiving",
        storedArtifacts: [],
        interpretationState: "waiting_for_media",
      };
      receipts.set(id, receipt);
      return Object.freeze({ receipt, claimed: true, claimToken: "claim-1" });
    },
    async recordStoredArtifact({ receiptId, artifact }) {
      const receipt = receipts.get(receiptId);
      receipt.storedArtifacts = [...receipt.storedArtifacts, artifact];
      return receipt;
    },
    async completeUpload({ receiptId }) {
      const receipt = receipts.get(receiptId);
      receipt.mediaState = "stored";
      receipt.interpretationState = "pending";
      return receipt;
    },
    async failUpload({ receiptId, errorCode }) {
      this.failures.push({ receiptId, errorCode });
      const receipt = receipts.get(receiptId);
      if (receipt) receipt.mediaState = "failed";
    },
  };
}

function realProviderUploads() {
  const canonicalMedia = [];
  const query = vi.fn(async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized) || normalized.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
    if (normalized.startsWith("INSERT INTO physiqueos.stored_objects")) return { rows: [{ id: values[0], user_id: values[1], state: "created", version: 1 }], rowCount: 1 };
    if (normalized.startsWith("INSERT INTO physiqueos.upload_intents")) return { rows: [{ id: values[0], state: "created" }], rowCount: 1 };
    if (normalized.includes("SET state = 'uploading'")) return { rows: [{ id: values[0], state: "uploading" }], rowCount: 1 };
    if (normalized.includes("SET state = 'completing'")) return { rows: [{ id: values[0], state: "completing" }], rowCount: 1 };
    if (normalized.includes("SET state = 'completed'")) return { rows: [{ id: values[0], state: "completed" }], rowCount: 1 };
    if (normalized.startsWith("UPDATE physiqueos.stored_objects SET state = 'verified'")) return { rows: [{ id: values[0], state: "verified", version: 2 }], rowCount: 1 };
    if (normalized.startsWith("INSERT INTO physiqueos.canonical_media_objects")) { canonicalMedia.push({ contentType: values[5] }); return { rows: [], rowCount: 1 }; }
    if (normalized.includes("SET state='failed'")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  let uploadedContentType = null;
  const service = createProviderCanonicalUploadService({
    pool: { query, connect: async () => client },
    objectProvider: {
      beginMultipartUpload: vi.fn(async ({ ownerUserId, objectId }) => ({ bucket: "b", objectKey: `private/${ownerUserId}/${objectId}/original`, providerUploadId: "u1" })),
      authorizeUploadPart: vi.fn(async () => ({ url: "https://upload.invalid", partNumber: 1 })),
      completeMultipartUpload: vi.fn(async () => ({ etag: "etag", providerVersion: "v1" })),
      inspectObject: vi.fn(async () => ({ byteLength: uploadedByteLength, sha256: uploadedSha256, contentType: uploadedContentType })),
      abortMultipartUpload: vi.fn(async () => undefined),
      deleteObject: vi.fn(async () => undefined),
    },
    authorityStore: { claimCanonicalWriteBoundary: vi.fn(async () => ({ outcome: "recorded" })) },
    fetchImpl: async (url, init) => {
      uploadedContentType = init.headers["content-type"];
      return new Response(null, { status: 200, headers: { etag: '"etag"' } });
    },
  });
  let uploadedByteLength = 0;
  let uploadedSha256 = "";
  return {
    canonicalMedia,
    get uploadedContentType() { return uploadedContentType; },
    async store(input) {
      uploadedByteLength = input.bytes.length;
      uploadedSha256 = (await import("node:crypto")).createHash("sha256").update(input.bytes).digest("hex");
      return service.store(input);
    },
  };
}

describe("Native evidence intake — end to end across the real provider-upload boundary", () => {
  it("carries a valid Native-shaped PDF upload all the way to durable-intake handoff", async () => {
    const input = await parseNativeEvidenceIntakeRequest(intakeRequest({ contentType: "application/pdf" }));
    expect(input.files[0].type).toBe("application/pdf");
    expect(input.files[0].name).toBe("BodySpec.pdf");

    const store = fakeReceiptStore();
    const uploads = realProviderUploads();
    const service = createAsyncEvidenceIntakeService({ store, uploads });
    const result = await service.accept({ ...input, ownerUserId: OWNER });

    expect(result.status).toBe("processing");
    expect(result.intakeId).toContain(ID);
    expect(store.failures).toHaveLength(0);
    // Proves the declared type survived intact all the way into the stored
    // object's own HTTP Content-Type — the value the real upload got wrong.
    expect(uploads.uploadedContentType).toBe("application/pdf");
  });

  it("rejects the exact real Build 26 defect shape (a UTType identifier) at the intake boundary, before any provider upload", async () => {
    // The real production request declared "com.adobe.pdf"-class values and
    // was only caught four layers later. It must now fail fast, with a code
    // that names the actual problem.
    for (const platformIdentifier of ["com.adobe.pdf", "public.data", "dyn.ah62d4rv4ge80e55etf31a3pd"]) {
      let caught = null;
      try {
        await parseNativeEvidenceIntakeRequest(intakeRequest({ contentType: platformIdentifier }));
      } catch (error) {
        caught = error;
      }
      expect(caught, `${platformIdentifier} must be rejected`).not.toBeNull();
      expect(caught.code).toBe("EVIDENCE_UPLOAD_CONTENT_TYPE_INVALID");
      expect(toEvidenceIntakeProblem(caught).status).toBe(400);
    }
  });

  it("still rejects a non-PDF that merely claims a .pdf filename and a PDF media type", async () => {
    let caught = null;
    try {
      await parseNativeEvidenceIntakeRequest(intakeRequest({ contentType: "application/pdf", data: Buffer.from("this is not a pdf") }));
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe("DEXA_PDF_INVALID");
  });

  it("still accepts an absent declared type (downstream defaults it) rather than over-rejecting", async () => {
    const { body, boundary } = nativeShapedMultipart({
      fields: { submissionIdentity: ID, effectiveDate: "2026-09-11", expectedEvidenceType: "dexa_scan" },
      file: { filename: "BodySpec.pdf", contentType: "", data: pdfBytes() },
    });
    const request = new Request("https://physiqueos.example/api/v1/native/evidence/intakes", {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": ID, "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const input = await parseNativeEvidenceIntakeRequest(request);
    expect(input.files).toHaveLength(1);
  });

  it("realistic 3 MB PDF crosses the whole path unchanged", async () => {
    const size = 3 * 1024 * 1024;
    const input = await parseNativeEvidenceIntakeRequest(intakeRequest({ contentType: "application/pdf", data: pdfBytes(size) }));
    const store = fakeReceiptStore();
    const uploads = realProviderUploads();
    const service = createAsyncEvidenceIntakeService({ store, uploads });
    const result = await service.accept({ ...input, ownerUserId: OWNER });
    expect(result.status).toBe("processing");
    expect(store.failures).toHaveLength(0);
  });
});
