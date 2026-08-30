import { describe, expect, it } from "vitest";
import {
  assertEvidenceUploadReceiptMatchesManifest,
  assertStoredEvidenceArtifactsMatchManifest,
  createEvidenceUploadArtifactManifest,
  parseEvidenceUploadArtifactManifest,
} from "./EvidenceUploadArtifactManifest";
import { processEvidenceIntakeSubmission } from "./EvidenceIntakeService";

function file(name, bytes, type = "image/png") {
  return new File([Uint8Array.from(bytes)], name, { type });
}

describe("Evidence upload artifact completeness manifest", () => {
  it("preserves selected count, stable identity, and order through receipt and storage", () => {
    const files = [file("IMG_1978.png", [1, 2]), file("IMG_1977.png", [3, 4, 5])];
    const manifest = parseEvidenceUploadArtifactManifest(JSON.stringify(
      createEvidenceUploadArtifactManifest(files)
    ));
    expect(assertEvidenceUploadReceiptMatchesManifest({ manifest, receivedFiles: files }))
      .toMatchObject({ selectedFileCount: 2 });
    expect(assertStoredEvidenceArtifactsMatchManifest({
      manifest,
      storedArtifacts: files.map((item) => ({
        fileName: item.name,
        mimeType: item.type,
        buffer: Buffer.alloc(item.size),
      })),
    })).toMatchObject({ selectedFileCount: 2 });
  });

  it("fails closed when a selected file never reaches the server", () => {
    const selected = [file("one.png", [1]), file("two.png", [2])];
    const manifest = createEvidenceUploadArtifactManifest(selected);
    expect(() => assertEvidenceUploadReceiptMatchesManifest({
      manifest,
      receivedFiles: selected.slice(0, 1),
    })).toThrow(expect.objectContaining({ code: "EVIDENCE_UPLOAD_RECEIPT_MISMATCH" }));
  });

  it("fails closed when retained artifacts differ in count or stable order", () => {
    const selected = [file("one.png", [1]), file("two.png", [2])];
    const manifest = createEvidenceUploadArtifactManifest(selected);
    expect(() => assertStoredEvidenceArtifactsMatchManifest({
      manifest,
      storedArtifacts: [{ fileName: "two.png", mimeType: "image/png", buffer: Buffer.from([2]) }],
    })).toThrow(expect.objectContaining({ code: "EVIDENCE_UPLOAD_STORAGE_MISMATCH" }));
  });

  it("fails before interpretation or package staging when storage does not retain the complete set", async () => {
    const selected = [file("one.png", [1]), file("two.png", [2])];
    const uploadManifest = createEvidenceUploadArtifactManifest(selected);
    await expect(processEvidenceIntakeSubmission({
      evidenceDate: "2026-08-21",
      files: selected,
      uploadManifest,
      storeArtifact: async ({ file: selectedFile, index }) => index === 0
        ? {
            fileName: selectedFile.name,
            mimeType: selectedFile.type,
            buffer: Buffer.from(await selectedFile.arrayBuffer()),
          }
        : null,
    })).rejects.toMatchObject({ code: "EVIDENCE_UPLOAD_STORAGE_MISMATCH" });
  });
});
