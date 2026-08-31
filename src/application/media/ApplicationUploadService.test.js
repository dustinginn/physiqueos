import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  assertLegacy: vi.fn(),
  getComposition: vi.fn(),
  authorizeRead: vi.fn(),
  redeemRead: vi.fn(),
  providerStore: vi.fn(),
}));

vi.mock("../composition/productionApplicationComposition.js", () => ({
  getProductionApplicationComposition: mocks.getComposition,
}));
vi.mock("../../platform/cutover/canonicalWriteFence.js", () => ({
  assertProductionLegacyCanonicalWriteAllowed: mocks.assertLegacy,
}));

const {
  assertApplicationUploadEntryAllowed,
  createApplicationStoredArtifactLoader,
  storeApplicationUpload,
} = await import("./ApplicationUploadService.js");

describe("application upload provider boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getComposition.mockResolvedValue({ uploads: { store: mocks.providerStore } });
    mocks.providerStore.mockResolvedValue({ reference: "media://private-object" });
  });

  it("uses the private provider upload composition without resolving legacy control paths", async () => {
    const env = { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" };
    assertApplicationUploadEntryAllowed({ operation: "apple-health", env });
    await expect(storeApplicationUpload({
      ownerUserId: "founder",
      bytes: Buffer.from("image"),
      contentType: "image/png",
      originalFilename: "apple-health.png",
      category: "evidencePackages",
      relationshipId: "submission",
      artifactId: "artifact",
      env,
    })).resolves.toEqual({ reference: "media://private-object" });

    expect(mocks.assertLegacy).not.toHaveBeenCalled();
    expect(mocks.providerStore).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: "founder",
      category: "evidencePackages",
      relationshipId: "submission",
      artifactId: "artifact",
    }));
  });

  it("preserves the legacy/local write-fence behavior outside provider full runtime", () => {
    const env = { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "0" };
    assertApplicationUploadEntryAllowed({ operation: "legacy-upload", env });
    expect(mocks.assertLegacy).toHaveBeenCalledWith({ operation: "legacy-upload", env });
  });

  it("loads provider media through the authorized object-storage boundary with integrity verification", async () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    mocks.getComposition.mockResolvedValue({
      media: { authorizeRead: mocks.authorizeRead },
      mediaGateway: { redeemRead: mocks.redeemRead },
    });
    mocks.authorizeRead.mockResolvedValue({
      accessHandle: "/api/v1/media/read?grant=opaque",
      contentType: "image/png",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    mocks.redeemRead.mockResolvedValue({ url: "https://private-storage.invalid/object" });
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    const loadArtifact = createApplicationStoredArtifactLoader({
      userId: "founder",
      env: { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
      fetchImpl,
    });

    await expect(loadArtifact({
      artifact: { storage_path: "media://01a049eb-ea13-75e8-948d-6b82752ae101", mime_type: "image/png" },
    })).resolves.toEqual({ buffer: bytes, contentType: "image/png" });
    expect(mocks.authorizeRead).toHaveBeenCalledTimes(1);
    expect(mocks.redeemRead).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://private-storage.invalid/object",
      { cache: "no-store", redirect: "error" }
    );
  });

  it("fails closed when the provider media composition is unavailable", async () => {
    mocks.getComposition.mockResolvedValue({ media: null, mediaGateway: null });
    const loadArtifact = createApplicationStoredArtifactLoader({
      userId: "founder",
      env: { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
      fetchImpl: vi.fn(),
    });
    await expect(loadArtifact({
      artifact: { storage_path: "media://01a049eb-ea13-75e8-948d-6b82752ae101" },
    })).rejects.toMatchObject({ code: "PROVIDER_MEDIA_BINDING_UNAVAILABLE" });
  });

  it("fails clearly when the authorized provider object cannot be read", async () => {
    mocks.getComposition.mockResolvedValue({
      media: { authorizeRead: mocks.authorizeRead },
      mediaGateway: { redeemRead: mocks.redeemRead },
    });
    mocks.authorizeRead.mockResolvedValue({
      accessHandle: "opaque",
      contentType: "image/jpeg",
      size: 4,
      sha256: createHash("sha256").update(Buffer.from("safe")).digest("hex"),
    });
    mocks.redeemRead.mockResolvedValue({ url: "https://private-storage.invalid/missing" });
    const loadArtifact = createApplicationStoredArtifactLoader({
      userId: "founder",
      env: { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
      fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
    });
    await expect(loadArtifact({ artifact: { storage_path: "media://01a049eb-ea13-75e8-948d-6b82752ae101" } }))
      .rejects.toMatchObject({ code: "PROVIDER_MEDIA_READ_FAILED" });
  });

  it("fails closed when provider bytes do not match the authorized size and hash", async () => {
    mocks.getComposition.mockResolvedValue({
      media: { authorizeRead: mocks.authorizeRead },
      mediaGateway: { redeemRead: mocks.redeemRead },
    });
    mocks.authorizeRead.mockResolvedValue({
      accessHandle: "opaque",
      contentType: "image/png",
      size: 4,
      sha256: createHash("sha256").update(Buffer.from("safe")).digest("hex"),
    });
    mocks.redeemRead.mockResolvedValue({ url: "https://private-storage.invalid/corrupt" });
    const loadArtifact = createApplicationStoredArtifactLoader({
      userId: "founder",
      env: { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
      fetchImpl: vi.fn(async () => new Response(Buffer.from("unsafe"), { status: 200 })),
    });
    await expect(loadArtifact({ artifact: { storage_path: "media://01a049eb-ea13-75e8-948d-6b82752ae101" } }))
      .rejects.toMatchObject({ code: "PROVIDER_MEDIA_INTEGRITY_FAILED" });
  });
});
