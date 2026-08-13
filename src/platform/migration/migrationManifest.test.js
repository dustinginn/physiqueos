import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifestFile } from "../../../scripts/validateMigrationManifest.mjs";
import { createMigrationManifest, validateMigrationSourceKeys } from "./migrationManifest";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";

const HASH = "a".repeat(64);
const MIGRATION_ID = "018f3f2a-7b4c-7def-8123-456789abcdef";

describe("deterministic migration manifest foundation", () => {
  it("captures counts, exact IDs, ownership/file hashes, and a verifiable digest", () => {
    const manifest = createSyntheticManifest();
    expect(manifest.collections).toEqual([
      expect.objectContaining({ sourceCollection: "goals", recordCount: 1, exactIds: ["synthetic-goal"] }),
      expect.objectContaining({ sourceCollection: "user", recordCount: 1, exactIds: ["synthetic-user"] }),
    ]);
    expect(manifest.files[0]).toMatchObject({ ownerUserId: "synthetic-user", sha256: HASH, mimeType: "image/png" });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-manifest-"));
    const file = path.join(directory, "manifest.json");
    fs.writeFileSync(file, JSON.stringify(manifest));
    expect(validateManifestFile(file)).toEqual({ valid: true, migrationId: MIGRATION_ID, collectionCount: 2, fileCount: 1 });
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("fails closed for unknown source collections and runtime keys", () => {
    expect(() => createMigrationManifest({ source: source(), collections: { unexpectedFounderBlob: [] }, createdAt: "2026-08-10T00:00:00Z" }, { migrationId: MIGRATION_ID })).toThrow("Unknown migration source collections");
    expect(() => validateMigrationSourceKeys({ version: "founder-seed-v2", user: {}, unknownFutureCollection: [] })).toThrow("Unknown runtime source keys");
    expect(() => validateMigrationSourceKeys({ version: "founder-seed-v2", revision: 1, user: {} })).toThrow("missing required collections");
    expect(validateMigrationSourceKeys(completeRuntime())).toBe(true);
  });

  it("is deterministic for collection key ordering", () => {
    const first = createSyntheticManifest({ user: [{ id: "synthetic-user" }], goals: [{ id: "synthetic-goal", status: "active" }] });
    const second = createSyntheticManifest({ goals: [{ status: "active", id: "synthetic-goal" }], user: [{ id: "synthetic-user" }] });
    expect(first.semanticDigest).toBe(second.semanticDigest);
  });
});

function createSyntheticManifest(collections = { user: [{ id: "synthetic-user" }], goals: [{ id: "synthetic-goal", status: "active" }] }) {
  return createMigrationManifest({
    source: source(), collections, createdAt: "2026-08-10T00:00:00Z",
    files: [{ relativePath: "synthetic/photo.png", size: 10, sha256: HASH, mimeType: "image/png", ownerUserId: "synthetic-user", relationshipIds: ["synthetic-goal"] }],
    relationships: [{ from: "synthetic-goal", to: "synthetic-user", type: "owned_by" }], criticalValues: { activeGoalId: "synthetic-goal" },
  }, { migrationId: MIGRATION_ID });
}

function completeRuntime() {
  return { version: "founder-seed-v2", revision: 1, ...Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, name === "user" ? {} : []])) };
}

function source() {
  return {
    identityVersion: "migration-source-identity-v1",
    runtime: { version: "founder-seed-v2", revision: "0", sha256: HASH, updatedAt: "2026-08-10T00:00:00.000Z" },
    repository: { commit: "a".repeat(40) },
    application: { buildId: "synthetic-build", sourceCommit: "b".repeat(40) },
    migration: { scriptCommit: "c".repeat(40), operationId: null },
    package: { version: "foundation-1" },
    schema: { sourceVersion: "000001" },
  };
}
