import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { interpretPdfEvidence } from "../interpreters/PdfInterpreter";
import { validateDexaScan } from "./DEXAContract";
import {
  applyDexaReviewMeasurements,
  createDexaPdfReviewPackage,
  MAX_DEXA_PDF_BYTES,
  validateDexaPdfUpload,
} from "./DexaPdfIntakeService";

const retainedPdf = path.join(
  process.cwd(),
  "private",
  "founder",
  "dexa",
  "uploads",
  "dexa-2026-08-15-1786810841596.pdf"
);

describe("PDF-first DEXA intake", () => {
  it("rejects empty, oversized, and non-PDF uploads before storage", () => {
    expect(() => validateDexaPdfUpload({ bytes: Buffer.alloc(0), fileName: "scan.pdf" })).toThrowError(expect.objectContaining({ code: "DEXA_PDF_REQUIRED" }));
    expect(() => validateDexaPdfUpload({ bytes: Buffer.alloc(MAX_DEXA_PDF_BYTES + 1), fileName: "scan.pdf" })).toThrowError(expect.objectContaining({ code: "DEXA_PDF_TOO_LARGE" }));
    expect(() => validateDexaPdfUpload({ bytes: Buffer.from("not a pdf"), fileName: "scan.pdf" })).toThrowError(expect.objectContaining({ code: "DEXA_PDF_INVALID" }));
  });

  it.runIf(fs.existsSync(retainedPdf))("extracts the retained PDF into a noncanonical review package", async () => {
    const packageResult = await createDexaPdfReviewPackage({
      bytes: fs.readFileSync(retainedPdf),
      capturedAt: "2026-08-15T16:20:41.596Z",
      existingScans: [{ measuredAt: "2026-07-18" }],
      originalFileName: "BodySpec report.pdf",
      sourcePath: "private/founder/dexa/uploads/retained.pdf",
      submissionId: "dexa_submission_test",
      userId: "founder",
    });
    expect(packageResult.evidence_objects).toHaveLength(1);
    expect(packageResult.evidence_objects[0]).toMatchObject({
      evidence_type: "dexa_scan",
      measuredAt: "2026-07-18",
      parser_confidence: "high",
      review_required: true,
      sourceFileId: "private/founder/dexa/uploads/retained.pdf",
    });
    expect(packageResult.review_metadata).toMatchObject({
      duplicateCandidate: true,
      extractionStatus: "interpreted",
      originalFileName: "BodySpec report.pdf",
    });
    expect(validateDexaScan(packageResult.evidence_objects[0], { production: true }))
      .toMatchObject({ valid: true, issues: [] });
    expect(packageResult).not.toHaveProperty("canonicalId");
  });

  it("preserves partial BodySpec values as a review candidate with unknowns", async () => {
    const result = await interpretPdfEvidence({
      capturedAt: "2026-08-15T16:00:00.000Z",
      files: [{
        fileName: "partial.pdf",
        id: "partial",
        text: "Client Measured Date 8/15/2026\nSUMMARY RESULTS\n8/15/2026 7.6 168.3 12.8 148.3\nREGIONAL ASSESSMENT",
        userId: "founder",
      }],
    });
    expect(result.status).toBe("partial");
    expect(result.scans).toHaveLength(0);
    expect(result.reviewCandidates[0]).toMatchObject({
      measuredAt: "2026-08-15",
      totalMass: { value: 168.3 },
      bodyFatPercentage: 7.6,
      fatMass: { value: 12.8 },
      leanMass: { value: 148.3 },
      boneMineralContent: { value: null },
    });
  });

  it("allows review correction to satisfy the canonical contract without inventing optional values", () => {
    const corrected = applyDexaReviewMeasurements({
      id: "dexa_review_candidate",
      evidence_type: "dexa_scan",
      sourceFileId: "private/founder/dexa/uploads/report.pdf",
      provenance: { extraction_engine: "pdfjs-dist", fixture: false, source_artifact_refs: ["private/founder/dexa/uploads/report.pdf"] },
      visceralAdiposeTissue: {},
    }, {
      measuredAt: "2026-08-15",
      totalMass: "168.3",
      bodyFatPercentage: "7.6",
      fatMass: "12.8",
      leanMass: "148.3",
      boneMineralContent: "7.2",
      restingMetabolicRate: "",
      vatMass: "",
      vatVolume: "",
    });
    expect(validateDexaScan(corrected, { production: true })).toMatchObject({ valid: true });
    expect(corrected.restingMetabolicRate.value).toBeNull();
    expect(corrected.visceralAdiposeTissue.mass.value).toBeNull();
    expect(corrected.parser_confidence).toBe("user_corrected");
  });
});
