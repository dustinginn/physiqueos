import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  assertApplicationUploadEntryAllowed: vi.fn(),
  buildTrainingLoggerEvidencePackage: vi.fn(),
  createEvidenceReviewService: vi.fn(),
  createProductionAppleHealthReconciliation: vi.fn(),
  createStoredEvidenceArtifactDescriptor: vi.fn((value) => ({
    fileName: value.file.name,
    id: value.id,
    mimeType: value.file.type,
    observedDate: value.observedDate,
    relativePath: value.relativePath,
    uploadedAt: value.capturedAt,
  })),
  listCanonicalEvidenceObjects: vi.fn(),
  getEvidencePackageById: vi.fn(),
  reinterpretEvidenceIntakeSubmissionFromStoredArtifacts: vi.fn(),
  processEvidenceIntakeSubmission: vi.fn(),
  saveEvidencePackage: vi.fn(),
  stage: vi.fn(),
  storeApplicationUpload: vi.fn(),
  authorizeRead: vi.fn(),
  redeemRead: vi.fn(),
}));

vi.mock("../../../application/composition/productionApplicationComposition.js", () => ({
  getProductionApplicationComposition: vi.fn(async () => ({
    media: { authorizeRead: mocks.authorizeRead },
    mediaGateway: { redeemRead: mocks.redeemRead },
  })),
}));

vi.mock("../../../application/media/ApplicationUploadService", () => ({
  assertApplicationUploadEntryAllowed: mocks.assertApplicationUploadEntryAllowed,
  storeApplicationUpload: mocks.storeApplicationUpload,
}));
vi.mock("../../../data/repositories/founderRepositories", () => ({
  FounderRepositories: {
    users: { getCurrentUser: vi.fn(async () => ({ id: "founder" })) },
    canonicalEvidence: { listCanonicalEvidenceObjects: mocks.listCanonicalEvidenceObjects },
    evidencePackages: {
      getEvidencePackageById: mocks.getEvidencePackageById,
      saveEvidencePackage: mocks.saveEvidencePackage,
    },
    evidenceReviews: { listReviews: vi.fn(async () => []) },
  },
}));
vi.mock("../../../domain/services/EvidenceIntakeService", () => ({
  createStoredEvidenceArtifactDescriptor: mocks.createStoredEvidenceArtifactDescriptor,
  processEvidenceIntakeSubmission: mocks.processEvidenceIntakeSubmission,
  reinterpretEvidenceIntakeSubmissionFromStoredArtifacts:
    mocks.reinterpretEvidenceIntakeSubmissionFromStoredArtifacts,
}));
vi.mock("../../../domain/services/EvidenceReviewService", () => ({
  createEvidenceReviewService: mocks.createEvidenceReviewService,
}));
vi.mock("../../../domain/services/TrainingLoggerAppleHealthService", () => ({
  buildTrainingLoggerEvidencePackage: mocks.buildTrainingLoggerEvidencePackage,
  createProductionAppleHealthReconciliation: mocks.createProductionAppleHealthReconciliation,
}));

const { POST, PUT } = await import("./reconcile/route");

describe("Training Logger provider Apple Health evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCanonicalEvidenceObjects.mockResolvedValue([]);
    mocks.getEvidencePackageById.mockResolvedValue(null);
    mocks.createEvidenceReviewService.mockReturnValue({ stage: mocks.stage });
    mocks.storeApplicationUpload.mockImplementation(async ({ artifactId }) => ({
      reference: `media://${artifactId}`,
    }));
    mocks.createProductionAppleHealthReconciliation.mockReturnValue({
      finalized: false,
      matchState: "strong_match",
      normalizedEvidence: [],
      selectedStrengthSourceId: null,
      strengthCandidateIds: [],
    });
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    mocks.processEvidenceIntakeSubmission.mockImplementation(async (options) => {
      const storedArtifacts = [];
      for (let index = 0; index < options.files.length; index += 1) {
        storedArtifacts.push(await options.storeArtifact({
          capturedAt: "2026-08-28T19:30:00.000Z",
          observedDate: options.evidenceDate,
          file: options.files[index],
          index,
          submissionId: "apple-health-batch",
        }));
      }
      return {
        evidencePackage: {
          package_id: "apple-health-batch",
          quality: { status: "complete" },
          evidence_objects: [],
          provenance: { source_artifacts: storedArtifacts },
        },
        storedArtifacts,
      };
    });
  });

  it("reinterprets the existing three-image provider package without another upload", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const sourceArtifacts = [1, 2, 3].map((index) => ({
      id: `artifact-${index}`,
      file_name: `apple-${index}.png`,
      mime_type: "image/png",
      observed_date: "2026-08-20",
      storage_path: `media://01a049eb-ea13-75e8-948d-6b82752ae10${index}`,
      uploaded_at: "2026-08-28T19:49:51.048Z",
    }));
    const persisted = {
      package_id: "evidence_submission_20260828194951048_images",
      userId: "founder",
      provenance: { source_artifacts: sourceArtifacts },
    };
    mocks.getEvidencePackageById.mockResolvedValue(persisted);
    mocks.authorizeRead.mockResolvedValue({
      accessHandle: "/api/v1/media/read?grant=opaque",
      contentType: "image/png",
      size: bytes.length,
      sha256,
    });
    mocks.redeemRead.mockResolvedValue({ url: "https://private-storage.invalid/object" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );
    mocks.reinterpretEvidenceIntakeSubmissionFromStoredArtifacts.mockImplementation(
      async (options) => {
        for (const artifact of sourceArtifacts) {
          const loaded = await options.loadArtifact({ artifact });
          expect(loaded).toMatchObject({ contentType: "image/png" });
          expect([...loaded.buffer]).toEqual([...bytes]);
        }
        return {
          evidencePackage: {
            ...persisted,
            evidence_objects: [{ id: "strength", evidence_type: "training" }],
          },
        };
      }
    );
    mocks.createProductionAppleHealthReconciliation.mockReturnValue({
      batchId: persisted.package_id,
      finalized: false,
      matchState: "strong_match",
      normalizedEvidence: [{ sourceWorkoutId: "strength" }],
      selectedStrengthSourceId: "strength",
      strengthCandidateIds: ["strength"],
    });
    const form = new FormData();
    form.set("draftJson", JSON.stringify(draft({ mode: "retrospective", workoutDate: "2026-08-20" })));
    form.set("evidencePackageId", persisted.package_id);
    form.set("reprocessExisting", "1");

    try {
      const response = await POST(new Request("http://localhost/log/training/reconcile", {
        method: "POST",
        body: form,
      }));
      expect(response.status).toBe(200);
      expect(mocks.reinterpretEvidenceIntakeSubmissionFromStoredArtifacts).toHaveBeenCalledWith(
        expect.objectContaining({ evidencePackage: persisted, userId: "founder" })
      );
      expect(mocks.authorizeRead).toHaveBeenCalledTimes(3);
      expect(mocks.redeemRead).toHaveBeenCalledTimes(3);
      expect(mocks.storeApplicationUpload).not.toHaveBeenCalled();
      expect(mocks.saveEvidencePackage).toHaveBeenCalledTimes(1);
      expect(mocks.stage).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("stores all three screenshots through private provider uploads without canonical confirmation", async () => {
    const form = new FormData();
    form.set("draftJson", JSON.stringify(draft()));
    for (const name of ["strength.png", "cardio.png", "activity.png"]) {
      form.append("evidenceFiles", new File([Uint8Array.from([1, 2, 3])], name, { type: "image/png" }));
    }

    const response = await POST(new Request("http://localhost/log/training/reconcile", {
      method: "POST",
      body: form,
    }));

    expect(response.status).toBe(200);
    expect(mocks.assertApplicationUploadEntryAllowed).toHaveBeenCalledWith({
      operation: "training-reconciliation:create",
    });
    expect(mocks.processEvidenceIntakeSubmission).toHaveBeenCalledWith(expect.objectContaining({
      artifactStorageFailureMode: "preserve-recoverable-package",
      expectedEvidenceType: "training",
      userId: "founder",
    }));
    expect(mocks.storeApplicationUpload).toHaveBeenCalledTimes(3);
    for (const call of mocks.storeApplicationUpload.mock.calls) {
      expect(call[0]).toMatchObject({
        ownerUserId: "founder",
        category: "evidencePackages",
        relationshipId: "apple-health-batch",
      });
    }
    expect(mocks.saveEvidencePackage).toHaveBeenCalledTimes(1);
    expect(mocks.stage).not.toHaveBeenCalled();
  });

  it("keeps Evidence Review staging separate from canonical confirmation", async () => {
    const finalized = draft({
      reconciliation: {
        finalized: true,
        matchState: "no_match",
        continueWithoutStrength: true,
        strengthCandidateIds: [],
      },
    });
    mocks.buildTrainingLoggerEvidencePackage.mockReturnValue({
      package_id: "training_logger_submission_draft",
      evidence_objects: [],
    });
    mocks.stage.mockResolvedValue({ id: "review", status: "pending" });

    const response = await PUT(new Request("http://localhost/log/training/reconcile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: finalized, evidencePackageId: null }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.assertApplicationUploadEntryAllowed).toHaveBeenCalledWith({
      operation: "training-reconciliation:update",
    });
    expect(mocks.saveEvidencePackage).toHaveBeenCalledTimes(1);
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      source: "training_logger",
      userId: "founder",
    }));
    expect(mocks.listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);
  });
});

function draft(extra = {}) {
  return {
    draftId: "draft",
    workoutDate: "2026-08-28",
    mode: "live",
    exercises: [{ id: "exercise", sets: [{ reps: 5, load: 100 }] }],
    ...extra,
  };
}
