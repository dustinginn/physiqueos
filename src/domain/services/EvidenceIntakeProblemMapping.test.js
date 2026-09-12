import { describe, expect, it } from "vitest";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { toEvidenceIntakeProblem } from "./EvidenceIntakeProblemMapping.js";
import { validateDexaPdfUpload } from "./DexaPdfIntakeService.js";
import {
  assertEvidenceUploadReceiptMatchesManifest,
  createEvidenceUploadArtifactManifest,
} from "./EvidenceUploadArtifactManifest.js";
import { createProviderCanonicalUploadService } from "../../application/media/ProviderCanonicalUploadService.js";

function thrown(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

describe("toEvidenceIntakeProblem", () => {
  it("maps a real DEXA_PDF_REQUIRED failure (empty buffer) to a 400 ApplicationProblem", () => {
    const error = thrown(() => validateDexaPdfUpload({ bytes: Buffer.alloc(0) }));
    expect(error).not.toBeInstanceOf(ApplicationProblem);
    expect(error.code).toBe("DEXA_PDF_REQUIRED");
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("DEXA_PDF_REQUIRED");
  });

  it("maps a real DEXA_PDF_TOO_LARGE failure to a 413 ApplicationProblem", () => {
    const error = thrown(() => validateDexaPdfUpload({ bytes: Buffer.alloc(50 * 1024 * 1024 + 1) }));
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(413);
    expect(problem.code).toBe("DEXA_PDF_TOO_LARGE");
  });

  it("maps a real DEXA_PDF_INVALID failure (not a PDF) to a 400 ApplicationProblem", () => {
    const error = thrown(() =>
      validateDexaPdfUpload({ bytes: Buffer.from("not a pdf"), fileName: "scan.jpg", mimeType: "image/jpeg" }));
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("DEXA_PDF_INVALID");
  });

  it("maps a real evidence-upload manifest mismatch (EvidenceUploadArtifactCompletenessError) to a 400 ApplicationProblem", () => {
    const manifest = createEvidenceUploadArtifactManifest([{ name: "a.png", size: 10, type: "image/png" }]);
    const error = thrown(() => assertEvidenceUploadReceiptMatchesManifest({ manifest, receivedFiles: [] }));
    expect(error.name).toBe("EvidenceUploadArtifactCompletenessError");
    expect(error).not.toBeInstanceOf(ApplicationProblem);
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("EVIDENCE_UPLOAD_RECEIPT_MISMATCH");
    expect(problem.title).toBe("Not all selected files reached PhysiqueOS. Nothing was staged.");
  });

  it("maps EVIDENCE_INTAKE_SUBMISSION_ID_INVALID to a 400 ApplicationProblem", () => {
    const error = Object.assign(new Error("EVIDENCE_INTAKE_SUBMISSION_ID_INVALID"), { code: "EVIDENCE_INTAKE_SUBMISSION_ID_INVALID" });
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(400);
  });

  it.each([
    "EVIDENCE_INTAKE_IDENTITY_CONFLICT",
    "EVIDENCE_UPLOAD_STORAGE_MISMATCH",
    "EVIDENCE_INTAKE_UPLOAD_CLAIM_LOST",
    "EVIDENCE_INTAKE_CANONICAL_IDENTITY_CONFLICT",
  ])("maps known Postgres intake-store conflict %s to a 409 ApplicationProblem (conflict/stale identity, not internal error)", (code) => {
    const error = Object.assign(new Error(code), { code });
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(409);
    expect(problem.code).toBe(code);
  });

  it("maps the real production content-type defect (a UTI, not a MIME type) to a 400 ApplicationProblem", async () => {
    // Reproduces the exact real incident end-to-end using the actual
    // throwing function, not a synthetic Error.
    const service = createProviderCanonicalUploadService({
      pool: { connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => undefined }), query: async () => ({ rows: [], rowCount: 0 }) },
      objectProvider: { beginMultipartUpload: async () => ({}) },
      authorityStore: { claimCanonicalWriteBoundary: async () => ({}) },
      fetchImpl: async () => new Response(null, { status: 200 }),
    });
    let error = null;
    try {
      await service.store({
        ownerUserId: "user_founder_001",
        bytes: Buffer.from("%PDF-1.7\nreal-dexa-pdf-bytes"),
        contentType: "com.adobe.pdf",
        originalFilename: "BodySpec.pdf",
        category: "evidenceIntakes",
        relationshipId: "intake-1",
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).not.toBeNull();
    expect(error).not.toBeInstanceOf(ApplicationProblem);
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe("PROVIDER_UPLOAD_CONTENT_TYPE_INVALID");
  });

  it("maps MULTIPART_PARSE_FAILED to a distinct-code 500 ApplicationProblem, not the generic UNCLASSIFIED_ERROR shape", () => {
    const error = Object.assign(new Error("The upload could not be read."), { code: "MULTIPART_PARSE_FAILED" });
    const problem = toEvidenceIntakeProblem(error);
    expect(problem).toBeInstanceOf(ApplicationProblem);
    expect(problem.status).toBe(500);
    expect(problem.code).toBe("MULTIPART_PARSE_FAILED");
  });

  it("leaves an existing ApplicationProblem unchanged", () => {
    const problem = new ApplicationProblem({ status: 404, code: "NOT_FOUND", title: "x" });
    expect(toEvidenceIntakeProblem(problem)).toBe(problem);
  });

  it("does not convert a genuinely unexpected exception into a client error", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'foo')");
    expect(toEvidenceIntakeProblem(error)).toBe(error);
  });

  it("does not convert an error carrying an unrecognized code", () => {
    const error = Object.assign(new Error("weird"), { code: "SOME_UNRELATED_CODE" });
    expect(toEvidenceIntakeProblem(error)).toBe(error);
  });
});
