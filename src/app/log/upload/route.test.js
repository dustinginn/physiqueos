import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEvidenceUploadArtifactManifest,
  EVIDENCE_UPLOAD_MANIFEST_FIELD,
} from "../../../domain/services/EvidenceUploadArtifactManifest";

const mocks = vi.hoisted(() => ({
  processEvidenceIntakeSubmission: vi.fn(),
  saveEvidencePackage: vi.fn(),
  stage: vi.fn(),
  assertApplicationUploadEntryAllowed: vi.fn(),
  acceptAsyncIntake: vi.fn(),
  getCurrentUser: vi.fn(async () => ({ id: "founder" })),
}));

vi.mock("../../../data/repositories/founderRepositories", () => ({
  FounderRepositories: {
    users: { getCurrentUser: mocks.getCurrentUser },
    goals: { listGoals: vi.fn(async () => []) },
    executionItems: { listExecutionItems: vi.fn(async () => []) },
    evidencePackages: { saveEvidencePackage: mocks.saveEvidencePackage },
  },
}));
vi.mock("../../../application/composition/productionApplicationComposition.js", () => ({
  getProductionAsyncEvidenceIntakeService: vi.fn(() => ({
    ownerUserId: "founder",
    accept: mocks.acceptAsyncIntake,
  })),
}));
vi.mock("../../../domain/services/EvidenceIntakeService", () => ({
  createStoredEvidenceArtifactDescriptor: vi.fn((value) => value),
  processEvidenceIntakeSubmission: mocks.processEvidenceIntakeSubmission,
}));
vi.mock("../../../application/media/ApplicationUploadService", () => ({
  assertApplicationUploadEntryAllowed: mocks.assertApplicationUploadEntryAllowed,
  storeApplicationUpload: vi.fn(),
}));
vi.mock("../../../domain/services/EvidenceReviewService", () => ({
  createEvidenceReviewService: vi.fn(() => ({ stage: mocks.stage })),
}));

const { POST } = await import("./route");

function uploadRequest({ selected, received = selected }) {
  const form = new FormData();
  form.set("evidenceDate", "2026-08-21");
  for (const file of received) form.append("evidenceFiles", file);
  form.set(
    EVIDENCE_UPLOAD_MANIFEST_FIELD,
    JSON.stringify(createEvidenceUploadArtifactManifest(selected))
  );
  form.set("evidenceSubmissionIdentity", "01999999-9999-7999-8999-999999999999");
  return new Request("http://localhost/log/upload", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });
}

describe("universal Evidence upload completeness boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processEvidenceIntakeSubmission.mockResolvedValue({
      evidencePackage: {
        package_id: "evidence_submission_complete_images",
        evidence_objects: [{ id: "training", evidence_type: "training" }],
        provenance: { source_artifacts: [] },
      },
      storedArtifacts: [],
    });
    mocks.stage.mockResolvedValue({ id: "evidence_review_complete" });
    mocks.acceptAsyncIntake.mockResolvedValue({
      intakeId: "evidence_intake_01999999-9999-7999-8999-999999999999",
      status: "processing",
      processingUrl: "/log?upload=received",
    });
  });

  it("returns durable acceptance without interpretation, package staging, or broad principal resolution in provider mode", async () => {
    const previous = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    try {
      const selected = [new File([[1]], "meal.png", { type: "image/png" })];
      const response = await POST(uploadRequest({ selected }));
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({ status: "processing" });
      expect(mocks.acceptAsyncIntake).toHaveBeenCalledWith(expect.objectContaining({
        submissionIdentity: "01999999-9999-7999-8999-999999999999",
        effectiveDate: "2026-08-21",
      }));
      expect(mocks.acceptAsyncIntake.mock.calls[0][0].files.map((file) => file.name)).toEqual(["meal.png"]);
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
      expect(mocks.processEvidenceIntakeSubmission).not.toHaveBeenCalled();
      expect(mocks.saveEvidencePackage).not.toHaveBeenCalled();
      expect(mocks.stage).not.toHaveBeenCalled();
    } finally {
      if (previous == null) delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
      else process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = previous;
    }
  });

  it("fails before interpretation or review staging when one selected file is absent", async () => {
    const selected = [
      new File([[1]], "IMG_1978.png", { type: "image/png" }),
      new File([[2]], "IMG_1977.png", { type: "image/png" }),
    ];
    const response = await POST(uploadRequest({ selected, received: selected.slice(0, 1) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "EVIDENCE_UPLOAD_RECEIPT_MISMATCH",
    });
    expect(mocks.processEvidenceIntakeSubmission).not.toHaveBeenCalled();
    expect(mocks.saveEvidencePackage).not.toHaveBeenCalled();
    expect(mocks.stage).not.toHaveBeenCalled();
  });

  it("passes the verified manifest into package assembly for complete multi-file intake", async () => {
    const selected = [
      new File([[1]], "IMG_1978.png", { type: "image/png" }),
      new File([[2]], "IMG_1977.png", { type: "image/png" }),
    ];
    const response = await POST(uploadRequest({ selected }));
    expect(response.status).toBe(200);
    const options = mocks.processEvidenceIntakeSubmission.mock.calls[0][0];
    expect(options.uploadManifest).toMatchObject({ selectedFileCount: 2 });
    expect(options.files.map((file) => file.name))
      .toEqual(["IMG_1978.png", "IMG_1977.png"]);
    expect(mocks.saveEvidencePackage).toHaveBeenCalledTimes(1);
    expect(mocks.stage).toHaveBeenCalledTimes(1);
  });

  it("returns a stable JSON failure instead of redirect HTML for browser fetch errors", async () => {
    const selected = [new File([[1]], "photo.png", { type: "image/png" })];
    mocks.processEvidenceIntakeSubmission.mockRejectedValueOnce(
      new TypeError("Failed to parse body as FormData.")
    );
    const response = await POST(uploadRequest({ selected }));
    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Your upload could not be prepared for review.",
    });
    expect(mocks.saveEvidencePackage).not.toHaveBeenCalled();
    expect(mocks.stage).not.toHaveBeenCalled();
  });
});
