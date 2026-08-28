import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertLegacy: vi.fn(),
  getComposition: vi.fn(),
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
});
