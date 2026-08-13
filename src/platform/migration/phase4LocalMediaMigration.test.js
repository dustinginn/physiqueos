import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { FOUNDATION_SOURCE_COLLECTIONS, inspectFoundationSourceInventory } from "./foundationSourceCollections.js";
import { migratePackageMediaLocally } from "./phase4LocalMediaMigration.js";

describe("Phase 4 local private-media migration", () => {
  it("copies immutable bytes to opaque owner-scoped keys without changing the source", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase4-media-"));
    try {
      const source = path.join(root, "snapshot");
      const packageRoot = path.join(root, "package");
      await fs.mkdir(source); await fs.mkdir(packageRoot);
      const bytes = Buffer.from("synthetic-private-evidence");
      await fs.writeFile(path.join(source, "evidence.png"), bytes);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const collections = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, name === "user" ? { id: "owner" } : []]));
      const unsigned = {
        manifestVersion: "2", migrationId: "synthetic", createdAt: "2026-08-11T00:00:00.000Z",
        importerVersion: "phase4-canonical-package-v2", targetSchemaVersion: "000003",
        source: {
          identityVersion: "migration-source-identity-v1",
          runtime: { version: "test", revision: "1", sha256: "a".repeat(64), updatedAt: "2026-08-11T00:00:00.000Z" },
          repository: { commit: "a".repeat(40) },
          application: { buildId: "test-build", sourceCommit: "a".repeat(40) },
          migration: { scriptCommit: "a".repeat(40), operationId: null },
          package: { version: "phase4-canonical-package-v2" },
          schema: { sourceVersion: "000003" },
        },
        collectionInventory: inspectFoundationSourceInventory(collections),
        collections: [], relationships: [], criticalValues: { canonicalStateDigest: createPayloadHash(collections) },
        files: [{ relativePath: "evidence.png", size: bytes.length, sha256, mimeType: "image/png", ownerUserId: "owner", relationshipIds: [], migrationResult: "pending", validationResult: "pending" }],
        result: "pending", validationResult: "pending",
      };
      await fs.writeFile(path.join(packageRoot, "manifest.json"), canonicalJson({ ...unsigned, semanticDigest: createPayloadHash(unsigned) }));
      await fs.writeFile(path.join(packageRoot, "canonical-runtime.json"), canonicalJson(collections));
      const result = await migratePackageMediaLocally({ packageRoot, snapshotMediaRoot: source, objectRoot: path.join(root, "objects") });
      expect(result).toMatchObject({ objectCount: 1, byteLength: bytes.length });
      expect(result.objects[0].storageKey).toMatch(/^private\/owner\/media-/);
      expect(result.objects[0]).not.toHaveProperty("sourcePath");
      expect(await fs.readFile(path.join(source, "evidence.png"))).toEqual(bytes);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
