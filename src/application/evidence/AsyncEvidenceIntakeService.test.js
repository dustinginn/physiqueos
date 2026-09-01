import { describe, expect, it, vi } from "vitest";
import { createAsyncEvidenceIntakeService } from "./AsyncEvidenceIntakeService.js";

const ID = "01999999-9999-7999-8999-999999999999";

describe("asynchronous Evidence intake foreground", () => {
  it("stores complete media, enqueues work, and never invokes interpretation", async () => {
    const receipt = baseReceipt();
    const store = {
      ownerUserId: "owner",
      beginUpload: vi.fn(async () => ({ receipt, claimed: true, claimToken: "claim" })),
      recordStoredArtifact: vi.fn(async ({ artifact }) => ({ ...receipt, storedArtifacts: [artifact] })),
      completeUpload: vi.fn(async () => ({ ...receipt, mediaState: "stored", interpretationState: "pending" })),
      failUpload: vi.fn(),
    };
    const uploads = { store: vi.fn(async () => ({ objectId: "01a", reference: "media://01a", contentType: "image/png", byteLength: 3, sha256: "a".repeat(64) })) };
    const service = createAsyncEvidenceIntakeService({ store, uploads, now: () => new Date("2026-08-31T20:00:00Z") });
    const result = await service.accept({ submissionIdentity: ID, effectiveDate: "2026-08-31",
      files: [new File([[1, 2, 3]], "meal.png", { type: "image/png" })], artifactManifest: manifest() });
    expect(uploads.store).toHaveBeenCalledOnce();
    expect(store.completeUpload).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "processing", intakeId: receipt.id });
    expect(JSON.stringify(service)).not.toMatch(/interpret/i);
  });

  it("same identity replay returns the existing processing intake without another media copy", async () => {
    const receipt = { ...baseReceipt(), mediaState: "stored", interpretationState: "pending" };
    const uploads = { store: vi.fn() };
    const service = createAsyncEvidenceIntakeService({
      store: { ownerUserId: "owner", beginUpload: async () => ({ receipt, claimed: false, claimToken: null }) }, uploads,
    });
    await expect(service.accept({ submissionIdentity: ID, effectiveDate: "2026-08-31", files: [], artifactManifest: manifest() }))
      .resolves.toMatchObject({ intakeId: receipt.id, status: "processing" });
    expect(uploads.store).not.toHaveBeenCalled();
  });

  it("completed replay returns the existing review", async () => {
    const receipt = { ...baseReceipt(), mediaState: "stored", interpretationState: "completed", reviewId: "review-one" };
    const service = createAsyncEvidenceIntakeService({
      store: { ownerUserId: "owner", beginUpload: async () => ({ receipt, claimed: false }) }, uploads: { store: vi.fn() },
    });
    await expect(service.accept({ submissionIdentity: ID, effectiveDate: "2026-08-31", files: [], artifactManifest: manifest() }))
      .resolves.toMatchObject({ status: "ready", reviewId: "review-one", reviewUrl: "/evidence/review/review-one" });
  });

  it("reports a durable background failure without asking for another upload", async () => {
    const receipt = { ...baseReceipt(), mediaState: "stored", interpretationState: "failed" };
    const service = createAsyncEvidenceIntakeService({
      store: { ownerUserId: "owner", beginUpload: vi.fn(), getReceipt: async () => receipt },
      uploads: { store: vi.fn() },
    });
    await expect(service.getStatus(receipt.id)).resolves.toMatchObject({
      intakeId: receipt.id,
      status: "processing_failed",
    });
  });

  it("keeps four real-sized artifacts inside the three-second foreground application budget", async () => {
    const receipt = baseReceipt();
    const artifacts = [];
    const store = {
      ownerUserId: "owner",
      beginUpload: async () => ({ receipt, claimed: true, claimToken: "claim" }),
      recordStoredArtifact: async ({ artifact }) => { artifacts.push(artifact); return { ...receipt, storedArtifacts: [...artifacts] }; },
      completeUpload: async () => ({ ...receipt, mediaState: "stored", interpretationState: "pending", storedArtifacts: artifacts }),
      failUpload: vi.fn(),
    };
    const uploads = { store: vi.fn(async ({ bytes, contentType }) => ({
      objectId: `object-${uploads.store.mock.calls.length}`,
      reference: `media://object-${uploads.store.mock.calls.length}`,
      contentType,
      byteLength: bytes.length,
      sha256: "a".repeat(64),
    })) };
    const service = createAsyncEvidenceIntakeService({ store, uploads });
    const files = Array.from({ length: 4 }, (_, index) =>
      new File([new Uint8Array(750_000)], `artifact-${index + 1}.png`, { type: "image/png" }));
    const artifactManifest = { version: "evidence-upload-manifest-v1", selectedFileCount: 4,
      files: files.map((file, index) => ({ ordinal: index + 1, name: file.name, size: file.size, type: file.type })) };
    const startedAt = performance.now();
    await expect(service.accept({ submissionIdentity: ID, effectiveDate: "2026-08-31", files, artifactManifest }))
      .resolves.toMatchObject({ status: "processing" });
    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(uploads.store).toHaveBeenCalledTimes(4);
  });
});

function manifest() { return { version: "evidence-upload-manifest-v1", selectedFileCount: 1, files: [{ ordinal: 1, name: "meal.png", size: 3, type: "image/png" }] }; }
function baseReceipt() { return { id: `evidence_intake_${ID}`, submissionIdentity: ID, ownerUserId: "owner", effectiveDate: "2026-08-31", expectedEvidenceType: "auto", source: "universal_intake", mediaState: "receiving", interpretationState: "waiting_for_media", storedArtifacts: [], createdAt: "2026-08-31T20:00:00.000Z" }; }
