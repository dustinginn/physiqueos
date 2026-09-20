import { beforeEach, describe, expect, it, vi } from "vitest";
import { presentEvidenceObject } from "./EvidenceReviewPresentationService";

const mocks = vi.hoisted(() => ({
  interpretScreenshotsWithVision: vi.fn(),
  reconcileIndependentlyInterpretedScreenshotPackages: vi.fn(),
}));

vi.mock("../interpreters/ScreenshotInterpreterService", () => ({
  interpretScreenshotsWithVision: mocks.interpretScreenshotsWithVision,
  reconcileIndependentlyInterpretedScreenshotPackages:
    mocks.reconcileIndependentlyInterpretedScreenshotPackages,
}));

const { classifyImageArtifacts, resolveImageArtifactRole, interpretEvidenceIntakeStoredArtifacts } =
  await import("./EvidenceIntakeService.js");

// Native's real Health screenshots reach the Server as 2.3–4.1 MB PNGs named .jpg.
const largeHealthScreenshot = (ordinal) => ({
  id: `artifact_${ordinal}`, ordinal, fileName: `Apple Health Screenshot ${ordinal}.jpg`,
  mimeType: "image/png", buffer: Buffer.alloc(2_400_000 + ordinal),
  uploadedAt: "2026-09-16T22:54:00.000Z", observedDate: "2026-09-16",
  dataUrl: "data:image/png;base64,c3ludGhldGlj",
});

async function interpret(expectedEvidenceType, artifacts, evidenceType = expectedEvidenceType) {
  mocks.interpretScreenshotsWithVision.mockImplementation(async ({ screenshots, submissionId }) => ({
    provider: "openai",
    evidencePackage: {
      package_id: submissionId,
      captured_at: screenshots[0].uploadedAt,
      evidence_objects: [{
        id: `candidate-${screenshots[0].id}`, evidence_type: evidenceType,
        observed_at: screenshots[0].observedDate, provenance: { source_artifact_refs: ["screenshot_0"] },
      }],
      interpreter: { provider: "openai" },
      provenance: { submission_id: submissionId, source_artifacts: [] },
      quality: { status: "complete" },
    },
  }));
  mocks.reconcileIndependentlyInterpretedScreenshotPackages.mockImplementation(
    ({ packages, screenshots, submissionId }) => ({
      package_id: submissionId,
      captured_at: screenshots[0].uploadedAt,
      evidence_objects: packages.flatMap((item) => item.evidence_objects),
      interpreter: { provider: "openai" },
      provenance: { submission_id: submissionId, source_artifacts: [] },
      quality: { status: "complete" },
      diagnostics: { stages: [], warnings: [] },
    })
  );
  return interpretEvidenceIntakeStoredArtifacts({
    capturedAt: "2026-09-16T22:54:00.000Z", evidenceDate: "2026-09-16", expectedEvidenceType,
    submissionId: `synthetic-${expectedEvidenceType}`, userId: "founder",
    sourceArtifacts: artifacts, loadArtifact: async ({ artifact }) => artifact,
  });
}

describe("declared evidence type owns artifact provenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["training", "nutrition", "activity_day", "dexa_scan"])(
    "stamps large %s document images as screenshots, never Progress Photos",
    async (declaredType) => {
      const result = await interpret(declaredType, [1, 2, 3].map(largeHealthScreenshot));
      const artifacts = result.evidencePackage.provenance.source_artifacts;
      expect(artifacts).toHaveLength(3);
      expect(artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "screenshot", "screenshot"]);
      // Their MIME type is unchanged; only the semantic role is authoritative.
      expect(artifacts.map((artifact) => artifact.mime_type)).toEqual(["image/png", "image/png", "image/png"]);
    }
  );

  it("treats a declared photo_session as photographs whatever their container", () => {
    const photos = [
      { id: "p1", fileName: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(200) },
      { id: "p2", fileName: "IMG_0002.HEIC", mimeType: "image/heic" },
      { id: "p3", fileName: "IMG_0003.dng", mimeType: "image/x-adobe-dng" },
    ];
    const routed = classifyImageArtifacts(photos, { expectedEvidenceType: "photo_session" });
    expect(routed.screenshots).toEqual([]);
    expect(routed.progressPhotos.map((photo) => photo.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("still recognises real Progress Photos when nothing is declared", () => {
    const role = (artifact) => resolveImageArtifactRole(artifact, { expectedEvidenceType: "auto" });
    expect(role({ fileName: "front-relaxed.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(100) })).toBe("progress_photo");
    expect(role({ fileName: "IMG_4021.HEIC", mimeType: "image/heic" })).toBe("progress_photo");
    expect(role({ fileName: "progress-photo-1.dng", mimeType: "image/x-adobe-dng" })).toBe("progress_photo");
    expect(role({ fileName: "IMG_4023.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(3_000_000) })).toBe("progress_photo");
  });

  it("keeps ordinary screenshots as screenshots", () => {
    const role = (artifact, type) => resolveImageArtifactRole(artifact, { expectedEvidenceType: type });
    expect(role({ fileName: "IMG_2557.png", mimeType: "image/png", buffer: Buffer.alloc(603_000) }, "auto")).toBe("screenshot");
    expect(role({ fileName: "Photo 1", mimeType: "image/jpeg", buffer: Buffer.alloc(97_000) }, "nutrition")).toBe("screenshot");
  });

  it("reads the six contaminated Training packages as Screenshot evidence without mutating them", () => {
    // The stored production shape: a Training object whose 3 image/png artifacts
    // were stamped `progress_photo` by the earlier size heuristic.
    const evidencePackage = {
      package_id: "evidence_submission_CDA0400DF634424D9D9D5D93802E9DB1_images",
      provenance: {
        source_artifacts: [1, 2, 3].map((ordinal) => ({
          id: `artifact_${ordinal}`, kind: "progress_photo",
          file_name: `Apple Health Screenshot ${ordinal}.jpg`, mime_type: "image/png",
        })),
      },
    };
    const before = structuredClone(evidencePackage);
    const training = {
      id: "training_2026-09-15", evidence_type: "training", observed_at: "2026-09-15",
      source: { modality: "screenshot", application: "Apple Fitness" }, exercises: [],
      metadata: { activity_type: "Traditional Strength Training" },
    };
    expect(presentEvidenceObject(training, evidencePackage).sourceLabel).toBe("Screenshot");
    expect(evidencePackage).toEqual(before);

    // A real photo session keeps its photo reading.
    const photoSession = { id: "photo_session_1", evidence_type: "photo_session", observed_at: "2026-09-19", source: { modality: "photo" }, photos: [] };
    const photoPackage = { provenance: { source_artifacts: [{ id: "p1", kind: "progress_photo", file_name: "progress-photo-1.dng", mime_type: "image/x-adobe-dng" }] } };
    expect(presentEvidenceObject(photoSession, photoPackage).sourceLabel).toBe("Progress photos");
  });
});
