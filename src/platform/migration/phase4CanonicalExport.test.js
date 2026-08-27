import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS, FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { PHASE4_PACKAGE_VERSION, captureReadOnlyFounderSnapshot, exportCanonicalPackage, readAndValidateCanonicalPackage } from "./phase4CanonicalExport.js";
import { readCanonicalRuntimeJson } from "./readCanonicalRuntimeJson.js";
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
      expect(first.manifest.collectionInventory.required).toMatchObject({ expectedCount: 39, presentCount: 39, missing: [] });
      expect(first.manifest.collectionInventory.excluded.map((entry) => entry.sourceCollection)).toEqual(FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS.map((entry) => entry.sourceCollection));
      expect(first.manifest.collectionInventory.excluded.every((entry) => entry.sourcePresent === false)).toBe(true);
      expect(Object.keys(JSON.parse(await fs.readFile(first.runtimeFile, "utf8")))).not.toEqual(expect.arrayContaining(["operatingRhythm", "adaptiveTrustProfile", "milestones"]));
      expect(first.manifest.files[0]).toMatchObject({ relativePath: "photo.jpg", ownerUserId: "synthetic-user", mimeType: "image/jpeg" });
      const observePhase = vi.fn(async () => undefined);
      const packageData = await readAndValidateCanonicalPackage(path.join(root, "package-a"), { observePhase });
      expect(packageData).toMatchObject({ manifest: { validationResult: "pending" } });
      expect(observePhase.mock.calls.map(([phase]) => phase)).toEqual([
        "CANONICAL_FILE_READ_STARTED",
        "CANONICAL_JSON_PARSE_STARTED",
        "CANONICAL_FILE_READ_COMPLETE",
        "CANONICAL_JSON_PARSE_COMPLETE",
        "CANONICAL_DIGEST_STARTED",
        "CANONICAL_DIGEST_COMPLETE",
        "CANONICAL_CONTRACT_VALIDATION_STARTED",
        "CANONICAL_CONTRACT_VALIDATION_COMPLETE",
      ]);
      const wrongExpectedIdentity = structuredClone(sourceIdentity);
      wrongExpectedIdentity.application.buildId = "stale-pre-fence-build";
      const connect = vi.fn();
      await fs.rm(path.join(root, "package-a"), { recursive: true, force: true });
      await expect(importCanonicalPackage({
        pool: { connect },
        packageRoot: path.join(root, "package-a"),
        packageData,
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

  it("records but never exports recognized noncanonical hydrated entries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase4-excluded-"));
    try {
      const runtimeFile = path.join(root, "runtime.json");
      await fs.writeFile(runtimeFile, JSON.stringify({
        ...syntheticRuntime(), operatingRhythm: { id: "seed-only" }, adaptiveTrustProfile: {}, milestones: [],
      }));
      const result = await exportCanonicalPackage({ runtimePath: runtimeFile, outputRoot: path.join(root, "package"), sourceIdentity: await identity(runtimeFile) });
      const exported = JSON.parse(await fs.readFile(result.runtimeFile, "utf8"));
      expect(result.manifest.collectionInventory.excluded.every((entry) => entry.sourcePresent)).toBe(true);
      expect(exported).not.toHaveProperty("operatingRhythm");
      expect(exported).not.toHaveProperty("adaptiveTrustProfile");
      expect(exported).not.toHaveProperty("milestones");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("fails closed instead of creating a placeholder for a missing mandatory collection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase4-missing-"));
    try {
      const runtimeFile = path.join(root, "runtime.json");
      const runtime = syntheticRuntime();
      delete runtime.goals;
      await fs.writeFile(runtimeFile, JSON.stringify(runtime));
      await expect(exportCanonicalPackage({ runtimePath: runtimeFile, outputRoot: path.join(root, "package"), sourceIdentity: await identity(runtimeFile) })).rejects.toThrow("missing required collections: goals");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});

describe("canonical package hashing memory repair", () => {
  it("parses top-level canonical collections incrementally across tiny UTF-8 chunks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-canonical-stream-"));
    try {
      const file = path.join(root, "canonical-runtime.json");
      const expected = { user: { id: "founder-ü", note: "escaped \\\" value" }, goals: [{ id: "g1", nested: { enabled: true } }], empty: [] };
      await fs.writeFile(file, `${JSON.stringify(expected)}\n`);
      await expect(readCanonicalRuntimeJson(file, { highWaterMark: 7 })).resolves.toEqual(expected);
      await fs.writeFile(file, '{"user":{},"user":{}}');
      await expect(readCanonicalRuntimeJson(file, { highWaterMark: 5 })).rejects.toThrow(/duplicate collection user/i);
      await fs.writeFile(file, '{"user":{},}');
      await expect(readCanonicalRuntimeJson(file, { highWaterMark: 4 })).rejects.toThrow(/trailing object separator/i);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("retains exact digest semantics for a large nested runtime shape", () => {
    const value = {
      collections: Array.from({ length: 4000 }, (_, index) => ({
        id: `record-${index}`,
        payload: "x".repeat(1024),
        nested: { index, enabled: index % 2 === 0, values: [index, null, `v-${index}`] },
      })),
    };
    expect(createPayloadHash(value)).toBe(createHash("sha256").update(canonicalJson(value)).digest("hex"));
  });

  it("retains precise lazy error paths", () => {
    expect(() => createPayloadHash({ collections: [{ nested: { invalid: Number.POSITIVE_INFINITY } }] }))
      .toThrow("$.collections[0].nested.invalid must contain only finite numbers.");
    expect(() => createPayloadHash({ collections: [{ invalid: undefined }] }))
      .toThrow("$.collections[0].invalid is not JSON serializable.");
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
function singleton(name) { return ["user", "nutritionContext", "operatingPlan"].includes(name); }
function identity(runtimePath) {
  return deriveTrustedMigrationSourceIdentity({
    runtimePath,
    packageVersion: PHASE4_PACKAGE_VERSION,
    sourceSchemaVersion: "000003",
    buildIdentityProvider: createFixedBuildIdentityProvider({
      repositoryCommit: "d".repeat(40),
      applicationBuildId: "synthetic-build",
      applicationSourceCommit: "d".repeat(40),
      migrationScriptCommit: "d".repeat(40),
    }),
  });
}
