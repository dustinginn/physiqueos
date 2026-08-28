import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  interpretScreenshotsWithVision: vi.fn(),
  reconcileIndependentlyInterpretedScreenshotPackages: vi.fn(),
}));

vi.mock("../interpreters/ScreenshotInterpreterService", () => ({
  interpretScreenshotsWithVision: mocks.interpretScreenshotsWithVision,
  reconcileIndependentlyInterpretedScreenshotPackages:
    mocks.reconcileIndependentlyInterpretedScreenshotPackages,
}));

const { reinterpretEvidenceIntakeSubmissionFromStoredArtifacts } =
  await import("./EvidenceIntakeService.js");

describe("stored Apple Health evidence reinterpretation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.interpretScreenshotsWithVision.mockImplementation(async ({ screenshots, submissionId }) => ({
      provider: "openai",
      evidencePackage: {
        package_id: submissionId,
        captured_at: screenshots[0].uploadedAt,
        evidence_objects: [{
          id: `candidate-${screenshots[0].id}`,
          evidence_type: "training",
          observed_at: screenshots[0].evidenceDate,
          provenance: { source_artifact_refs: ["screenshot_0"] },
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
  });

  it("reuses all three stored artifacts, their historical date, and the package identity", async () => {
    const sourceArtifacts = [1, 2, 3].map((index) => ({
      id: `artifact-${index}`,
      kind: "screenshot",
      file_name: `apple-health-${index}.png`,
      mime_type: "image/png",
      observed_date: "2026-08-20",
      storage_path: `media://01a049eb-ea13-75e8-948d-6b82752ae10${index}`,
      uploaded_at: "2026-08-28T19:49:51.048Z",
    }));
    const loadArtifact = vi.fn(async () => ({
      buffer: Buffer.from([137, 80, 78, 71]),
      contentType: "image/png",
    }));
    const result = await reinterpretEvidenceIntakeSubmissionFromStoredArtifacts({
      evidencePackage: {
        package_id: "evidence_submission_20260828194951048_images",
        captured_at: "2026-08-28T19:49:51.048Z",
        observed_date: "2026-08-20",
        userId: "founder",
        provenance: {
          submission_id: "evidence_submission_20260828194951048_images",
          source_artifacts: sourceArtifacts,
        },
      },
      loadArtifact,
      userId: "founder",
    });

    expect(loadArtifact).toHaveBeenCalledTimes(3);
    expect(mocks.interpretScreenshotsWithVision).toHaveBeenCalledTimes(3);
    for (const call of mocks.interpretScreenshotsWithVision.mock.calls) {
      expect(call[0].screenshots[0].evidenceDate).toBe("2026-08-20");
    }
    expect(result.evidencePackage.package_id).toBe(
      "evidence_submission_20260828194951048_images"
    );
    expect(result.evidencePackage.evidence_objects).toHaveLength(3);
    expect(result.evidencePackage.provenance.source_artifacts).toEqual(
      expect.arrayContaining(sourceArtifacts.map((artifact) =>
        expect.objectContaining({
          id: artifact.id,
          observed_date: "2026-08-20",
          storage_path: artifact.storage_path,
        })
      ))
    );
  });

  it("rejects another owner's package before loading media", async () => {
    const loadArtifact = vi.fn();
    await expect(reinterpretEvidenceIntakeSubmissionFromStoredArtifacts({
      evidencePackage: {
        package_id: "evidence_submission_20260828194951048_images",
        userId: "another-owner",
      },
      loadArtifact,
      userId: "founder",
    })).rejects.toThrow("unavailable");
    expect(loadArtifact).not.toHaveBeenCalled();
  });

  it("leaves the persisted package untouched when a stored artifact fails mid-batch", async () => {
    const original = {
      package_id: "evidence_submission_20260828194951048_images",
      captured_at: "2026-08-28T19:49:51.048Z",
      observed_date: "2026-08-20",
      userId: "founder",
      evidence_objects: [],
      provenance: {
        submission_id: "evidence_submission_20260828194951048_images",
        source_artifacts: [1, 2, 3].map((index) => ({
          id: `artifact-${index}`,
          file_name: `apple-health-${index}.png`,
          mime_type: "image/png",
          observed_date: "2026-08-20",
          storage_path: `media://01a049eb-ea13-75e8-948d-6b82752ae10${index}`,
        })),
      },
    };
    const before = structuredClone(original);
    const loadArtifact = vi.fn(async ({ artifact }) => {
      if (artifact.id === "artifact-2") throw new Error("private object read failed");
      return { buffer: Buffer.from([1]), contentType: "image/png" };
    });

    await expect(reinterpretEvidenceIntakeSubmissionFromStoredArtifacts({
      evidencePackage: original,
      loadArtifact,
      userId: "founder",
    })).rejects.toThrow("private object read failed");
    expect(loadArtifact).toHaveBeenCalledTimes(2);
    expect(mocks.interpretScreenshotsWithVision).not.toHaveBeenCalled();
    expect(original).toEqual(before);
  });
});
