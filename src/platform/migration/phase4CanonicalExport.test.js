import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { captureReadOnlyFounderSnapshot, exportCanonicalPackage, readAndValidateCanonicalPackage } from "./phase4CanonicalExport.js";
import { createFixedBuildIdentityProvider, deriveTrustedMigrationSourceIdentity } from "./MigrationSourceIdentity.js";
import { importCanonicalPackage } from "./phase4CanonicalImport.js";

describe("Phase 4 deterministic copy-only export", () => {
  it("captures an isolated source, inventories immutable media, and exports deterministically", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase4-export-"));
    try {
      const source = path.join(root, "source");
      await fs.mkdir(path.join(source, "media"), { recursive: true });
      const runtime = syntheticRuntime();
      await fs.writeFile(path.join(source, "runtime.json"), JSON.stringify(runtime));
      await fs.writeFile(path.join(source, "media", "photo.jpg"), "synthetic-photo-bytes");
      const snapshot = await captureReadOnlyFounderSnapshot({ sourceRuntimePath: path.join(source, "runtime.json"), sourceMediaRoot: path.join(source, "media"), snapshotRoot: path.join(root, "snapshot") });
      expect(snapshot.sourceBefore).toEqual(snapshot.sourceAfter);
      const sourceIdentity = await identity(snapshot.runtimePath);
      const first = await exportCanonicalPackage({ runtimePath: snapshot.runtimePath, mediaRoot: snapshot.mediaRoot, outputRoot: path.join(root, "package-a"), sourceIdentity });
      const second = await exportCanonicalPackage({ runtimePath: snapshot.runtimePath, mediaRoot: snapshot.mediaRoot, outputRoot: path.join(root, "package-b"), sourceIdentity });
      expect(first.manifest.semanticDigest).toBe(second.manifest.semanticDigest);
      expect(first.manifest.collections).toHaveLength(FOUNDATION_SOURCE_COLLECTIONS.length);
      expect(first.manifest.files[0]).toMatchObject({ relativePath: "photo.jpg", ownerUserId: "synthetic-user", mimeType: "image/jpeg" });
      await expect(readAndValidateCanonicalPackage(path.join(root, "package-a"))).resolves.toMatchObject({ manifest: { validationResult: "pending" } });
      const wrongExpectedIdentity = structuredClone(sourceIdentity);
      wrongExpectedIdentity.application.buildId = "stale-pre-fence-build";
      const connect = vi.fn();
      await expect(importCanonicalPackage({
        pool: { connect },
        packageRoot: path.join(root, "package-a"),
        expectedSourceIdentity: wrongExpectedIdentity,
      })).rejects.toThrow(/source identity mismatch/i);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await fs.chmod(path.join(root, "snapshot", "runtime-store.json"), 0o666).catch(() => undefined);
      await fs.chmod(path.join(root, "snapshot", "media", "photo.jpg"), 0o666).catch(() => undefined);
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed on an unknown source key", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase4-unknown-"));
    try {
      const runtimeFile = path.join(root, "runtime.json");
      await fs.writeFile(runtimeFile, JSON.stringify({ ...syntheticRuntime(), futureUnknownState: [] }));
      await expect(exportCanonicalPackage({ runtimePath: runtimeFile, outputRoot: path.join(root, "package"), sourceIdentity: await identity(runtimeFile) })).rejects.toThrow("Unknown runtime source keys");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});

function syntheticRuntime() {
  const collections = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, singleton(name) ? null : []]));
  return {
    version: "founder-seed-v2", revision: 1, lastCommitId: "synthetic", importedAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z",
    ...collections,
    user: { id: "synthetic-user", displayName: "Synthetic", timeZone: "America/Los_Angeles", avatarUrl: "photo.jpg", version: 1 },
    goals: [{ id: "synthetic-goal", userId: "synthetic-user", status: "active", version: 1 }],
  };
}
function singleton(name) { return ["user", "nutritionContext", "operatingPlan", "operatingRhythm", "adaptiveTrustProfile"].includes(name); }
function identity(runtimePath) {
  return deriveTrustedMigrationSourceIdentity({
    runtimePath,
    packageVersion: "phase4-canonical-package-v1",
    sourceSchemaVersion: "000003",
    buildIdentityProvider: createFixedBuildIdentityProvider({
      repositoryCommit: "d".repeat(40),
      applicationBuildId: "synthetic-build",
      applicationSourceCommit: "d".repeat(40),
      migrationScriptCommit: "d".repeat(40),
    }),
  });
}
