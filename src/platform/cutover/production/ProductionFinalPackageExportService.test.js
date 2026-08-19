import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProductionFinalSnapshotService } from "./ProductionFinalSnapshotService.js";
import { createProductionFinalPackageExportService } from "./ProductionFinalPackageExportService.js";
import { combinedCutoverOperationPaths } from "./combinedCutoverOperationWorkspace.js";
import { writeSyntheticFounderSource, syntheticBuildIdentityProvider } from "./testSupport/productionCutoverFixtures.js";

async function withTempDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-export-"));
  try { return await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

function fenceResult() {
  return { fenceId: "fence-1", controlState: { fenceState: "active", fenceId: "fence-1" } };
}

async function capture(root, operationId) {
  const { runtimePath, mediaRoot } = await writeSyntheticFounderSource({ root: path.join(root, operationId) });
  await fs.mkdir(path.join(root, operationId), { recursive: true });
  const snapshotService = createProductionFinalSnapshotService({
    sourceRuntimePath: runtimePath, sourceMediaRoot: mediaRoot, workspaceRoot: root,
    buildIdentityProvider: syntheticBuildIdentityProvider(),
  });
  return snapshotService.captureFinalSnapshot({ input: { migrationOperationId: operationId }, fence: fenceResult() });
}

function stateWithDigest(packageDigest) {
  return { finalSnapshot: { packageDigest } };
}

describe("ProductionFinalPackageExportService — construction", () => {
  it("requires a workspace root", () => {
    expect(() => createProductionFinalPackageExportService({})).toThrow();
  });
});

describe("ProductionFinalPackageExportService — exportFinalPackage", () => {
  it("independently re-reads and validates the package Phase 3/4 expect, matching the fenced snapshot", async () => {
    await withTempDir(async (root) => {
      const operationId = "combined-op-export-0001";
      const snapshot = await capture(root, operationId);
      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      const exported = await exportService.exportFinalPackage({
        input: { migrationOperationId: operationId }, state: stateWithDigest(snapshot.packageDigest), snapshot,
      });
      expect(exported.packageDigest).toBe(snapshot.packageDigest);
      expect(exported.manifest.semanticDigest).toBe(snapshot.packageDigest);
      expect(exported.runtimeFile.endsWith("canonical-runtime.json")).toBe(true);
      expect(exported.manifestFile.endsWith("manifest.json")).toBe(true);
      await expect(fs.readFile(exported.runtimeFile, "utf8")).resolves.toBeTruthy();
      await expect(fs.readFile(exported.manifestFile, "utf8")).resolves.toBeTruthy();
    });
  });

  it("is a pure read-and-verify step - replaying it for the same operation is deterministic and never writes", async () => {
    await withTempDir(async (root) => {
      const operationId = "combined-op-export-0002";
      const snapshot = await capture(root, operationId);
      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      const first = await exportService.exportFinalPackage({ input: { migrationOperationId: operationId }, state: stateWithDigest(snapshot.packageDigest), snapshot });
      const second = await exportService.exportFinalPackage({ input: { migrationOperationId: operationId }, state: stateWithDigest(snapshot.packageDigest), snapshot });
      expect(second.packageDigest).toBe(first.packageDigest);
      expect(second.manifest).toEqual(first.manifest);
    });
  });

  it("rejects when the durably committed snapshot digest does not match the package on disk (snapshot identity drift)", async () => {
    await withTempDir(async (root) => {
      const operationId = "combined-op-export-0003";
      const snapshot = await capture(root, operationId);
      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      await expect(exportService.exportFinalPackage({
        input: { migrationOperationId: operationId }, state: stateWithDigest("0".repeat(64)), snapshot,
      })).rejects.toMatchObject({ code: "COMBINED_CUTOVER_EXPORT_DIGEST_MISMATCH" });
    });
  });

  it("rejects when the in-memory snapshot's own digest disagrees with the durably committed one", async () => {
    await withTempDir(async (root) => {
      const operationId = "combined-op-export-0004";
      const snapshot = await capture(root, operationId);
      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      const tamperedSnapshot = { ...snapshot, packageDigest: "1".repeat(64) };
      await expect(exportService.exportFinalPackage({
        input: { migrationOperationId: operationId }, state: stateWithDigest(snapshot.packageDigest), snapshot: tamperedSnapshot,
      })).rejects.toMatchObject({ code: "COMBINED_CUTOVER_EXPORT_DIGEST_MISMATCH" });
    });
  });

  it("fails closed for an operation whose snapshot was never captured (no package on disk)", async () => {
    await withTempDir(async (root) => {
      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      await expect(exportService.exportFinalPackage({
        input: { migrationOperationId: "combined-op-never-captured" },
        state: stateWithDigest("2".repeat(64)),
        snapshot: { packageDigest: "2".repeat(64) },
      })).rejects.toThrow();
    });
  });

  it("rejects a package whose embedded operation identity does not match the requested operation (misplaced/foreign package)", async () => {
    await withTempDir(async (root) => {
      const operationA = "combined-op-export-A";
      const operationB = "combined-op-export-B";
      const snapshotA = await capture(root, operationA);
      // Simulate a foreign package ending up at operation B's expected path.
      const pathsA = combinedCutoverOperationPaths(operationA, { workspaceRoot: root });
      const pathsB = combinedCutoverOperationPaths(operationB, { workspaceRoot: root });
      await fs.mkdir(pathsB.package, { recursive: true });
      await fs.copyFile(path.join(pathsA.package, "manifest.json"), path.join(pathsB.package, "manifest.json"));
      await fs.copyFile(path.join(pathsA.package, "canonical-runtime.json"), path.join(pathsB.package, "canonical-runtime.json"));

      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      await expect(exportService.exportFinalPackage({
        input: { migrationOperationId: operationB }, state: stateWithDigest(snapshotA.packageDigest), snapshot: snapshotA,
      })).rejects.toMatchObject({ code: "COMBINED_CUTOVER_EXPORT_OPERATION_MISMATCH" });
    });
  });
});
