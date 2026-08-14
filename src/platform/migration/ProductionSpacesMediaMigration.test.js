import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { FOUNDATION_SOURCE_COLLECTIONS, inspectFoundationSourceInventory } from "./foundationSourceCollections.js";
import { migrateCanonicalPackageMediaToSpaces, rollbackMigratedSpacesMedia } from "./ProductionSpacesMediaMigration.js";

describe("production Spaces media migration", () => {
  it("tracks a completed provider version before database metadata so a failure can roll it back", async () => {
    const fixture = await packageFixture();
    const provider = objectProvider(fixture);
    const pool = { query: vi.fn(async () => { throw new Error("database metadata failure"); }) };
    try {
      let failure;
      try {
        await migrateCanonicalPackageMediaToSpaces({
          packageRoot: fixture.packageRoot,
          snapshotMediaRoot: fixture.mediaRoot,
          pool,
          objectProvider: provider,
          fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => '"part-etag"' } }),
        });
      } catch (error) { failure = error; }
      expect(failure?.uploadedProviderObjects).toHaveLength(1);
      expect(failure.uploadedProviderObjects[0]).toMatchObject({ providerVersion: "version-one", sha256: fixture.sha256 });
      await expect(rollbackMigratedSpacesMedia({ objectProvider: provider, uploaded: failure.uploadedProviderObjects }))
        .resolves.toEqual({ deletedVersionCount: 1 });
      expect(provider.deleteObject).toHaveBeenCalledWith({ objectKey: "private/owner/media/original", providerVersion: "version-one" });
    } finally { await fs.rm(fixture.root, { recursive: true, force: true }); }
  });
});

function objectProvider(fixture) {
  return {
    beginMultipartUpload: vi.fn(async () => ({ objectKey: "private/owner/media/original", providerUploadId: "upload-one" })),
    authorizeUploadPart: vi.fn(async () => ({ url: "https://upload.invalid/part" })),
    completeMultipartUpload: vi.fn(async () => ({ providerVersion: "version-one", etag: "complete-etag" })),
    inspectObject: vi.fn(async () => ({ byteLength: fixture.bytes.length, sha256: fixture.sha256 })),
    abortMultipartUpload: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
  };
}

async function packageFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "production-spaces-migration-"));
  const packageRoot = path.join(root, "package");
  const mediaRoot = path.join(root, "media");
  await fs.mkdir(packageRoot); await fs.mkdir(mediaRoot);
  const bytes = Buffer.from("private-evidence-bytes");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(path.join(mediaRoot, "evidence.png"), bytes);
  const collections = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, name === "user" ? { id: "owner" } : []]));
  const applicationContext = { operatingRhythm: null, adaptiveTrustProfile: null, retiredMilestones: [] };
  const unsigned = {
    manifestVersion: "2", migrationId: "synthetic", createdAt: "2026-08-13T00:00:00.000Z",
    importerVersion: "phase4-canonical-package-v2", targetSchemaVersion: "000003",
    source: {
      identityVersion: "migration-source-identity-v1",
      runtime: { version: "test", revision: "1", sha256: "a".repeat(64), updatedAt: "2026-08-13T00:00:00.000Z" },
      repository: { commit: "a".repeat(40) }, application: { buildId: "test-build", sourceCommit: "a".repeat(40) },
      migration: { scriptCommit: "a".repeat(40), operationId: "test-operation" },
      package: { version: "phase4-canonical-package-v2" }, schema: { sourceVersion: "000003" },
    },
    collectionInventory: inspectFoundationSourceInventory(collections),
    applicationContext,
    collections: [], relationships: [], criticalValues: { canonicalStateDigest: createPayloadHash(collections), applicationContextDigest: createPayloadHash(applicationContext) },
    files: [{ relativePath: "evidence.png", size: bytes.length, sha256, mimeType: "image/png", ownerUserId: "owner", relationshipIds: [], migrationResult: "pending", validationResult: "pending" }],
    result: "pending", validationResult: "pending",
  };
  await fs.writeFile(path.join(packageRoot, "manifest.json"), canonicalJson({ ...unsigned, semanticDigest: createPayloadHash(unsigned) }));
  await fs.writeFile(path.join(packageRoot, "canonical-runtime.json"), canonicalJson(collections));
  return { root, packageRoot, mediaRoot, bytes, sha256 };
}
