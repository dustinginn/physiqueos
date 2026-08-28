import { describe, expect, it, vi } from "vitest";
import { processEvidenceIntakeSubmission } from "./EvidenceIntakeService";

describe("Evidence Intake recoverable artifact storage failure", () => {
  it("preserves completed artifacts in a failed noncanonical package and stops the remaining batch", async () => {
    const files = [file("one.png"), file("two.png"), file("three.png")];
    const storeArtifact = vi.fn(async ({ capturedAt, file: item, index, observedDate, submissionId }) => {
      if (index === 1) throw new Error("provider upload failed");
      return {
        buffer: Buffer.from(await item.arrayBuffer()),
        dataUrl: "data:image/png;base64,b25l",
        fileName: item.name,
        id: `artifact_${submissionId}_${index + 1}`,
        mimeType: item.type,
        observedDate,
        originalCaptureMetadata: null,
        relativePath: `media://object-${index + 1}`,
        text: "",
        uploadedAt: capturedAt,
      };
    });

    const result = await processEvidenceIntakeSubmission({
      artifactStorageFailureMode: "preserve-recoverable-package",
      evidenceDate: "2026-08-28",
      expectedEvidenceType: "training",
      files,
      storeArtifact,
      userId: "founder",
    });

    expect(storeArtifact).toHaveBeenCalledTimes(2);
    expect(result.storedArtifacts).toHaveLength(1);
    expect(result.evidencePackage).toMatchObject({
      detected_evidence_type: "failed_ingestion",
      evidence_objects: [],
      quality: { status: "failed" },
      recovery: { recoverable: true },
    });
    expect(result.evidencePackage.provenance.source_artifacts).toEqual([
      expect.objectContaining({ storage_path: "media://object-1" }),
    ]);
    expect(result.evidencePackage).not.toHaveProperty("canonicalId");
  });
});

function file(name) {
  return {
    name,
    type: "image/png",
    size: 3,
    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
  };
}
