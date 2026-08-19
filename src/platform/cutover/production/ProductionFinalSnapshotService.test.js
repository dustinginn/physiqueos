import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProductionFinalSnapshotService } from "./ProductionFinalSnapshotService.js";
import { writeSyntheticFounderSource, syntheticBuildIdentityProvider } from "./testSupport/productionCutoverFixtures.js";

async function withTempDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-snapshot-"));
  try { return await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

function fenceResult(overrides = {}) {
  return { fenceId: "fence-1", controlState: { fenceState: "active", fenceId: "fence-1", migrationOperationId: "combined-op-snap-0001", ...overrides } };
}

async function service(root, overrides = {}) {
  const { runtimePath, mediaRoot } = await writeSyntheticFounderSource({ root });
  return {
    runtimePath, mediaRoot,
    service: createProductionFinalSnapshotService({
      sourceRuntimePath: runtimePath, sourceMediaRoot: mediaRoot, workspaceRoot: root,
      buildIdentityProvider: syntheticBuildIdentityProvider(), mediaInclude: () => true, ...overrides,
    }),
  };
}

describe("ProductionFinalSnapshotService — construction", () => {
  it("requires a source runtime path and a workspace root", () => {
    expect(() => createProductionFinalSnapshotService({})).toThrow();
    expect(() => createProductionFinalSnapshotService({ sourceRuntimePath: "/x/runtime.json" })).toThrow();
  });
});

describe("ProductionFinalSnapshotService — captureFinalSnapshot", () => {
  it("requires the fenced Windows write-fence result before capturing", async () => {
    await withTempDir(async (root) => {
      const { service: svc } = await service(root);
      await expect(svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-0001" } })).rejects.toThrow(/write-fence/);
    });
  });

  it("captures a fenced snapshot binding all five required identity fields", async () => {
    await withTempDir(async (root) => {
      const { service: svc } = await service(root);
      const result = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-0001" }, fence: fenceResult() });
      expect(result.runtimeSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.runtimeRevision).toBe(1);
      expect(result.mediaInventorySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.migrationControlSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.packageDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.operationId).toBe("combined-op-snap-0001");
    });
  });

  it("writes the exported package to disk so exportFinalPackage can independently re-read it", async () => {
    await withTempDir(async (root) => {
      const { service: svc } = await service(root);
      const result = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-0001" }, fence: fenceResult() });
      const manifest = JSON.parse(await fs.readFile(path.join(result.packageRoot, "manifest.json"), "utf8"));
      expect(manifest.semanticDigest).toBe(result.packageDigest);
    });
  });

  it("binds the package digest to the exact combined-cutover operation - a different operation ID produces a different digest", async () => {
    await withTempDir(async (root) => {
      const { service: svc } = await service(root);
      const a = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-A" }, fence: fenceResult() });
      const b = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-B" }, fence: fenceResult() });
      expect(a.packageDigest).not.toBe(b.packageDigest);
    });
  });

  it("binds the migration-control digest to the exact fenced control state supplied", async () => {
    await withTempDir(async (root) => {
      const { service: svc } = await service(root);
      const a = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-C" }, fence: fenceResult({ fenceId: "fence-c" }) });
      const b = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-D" }, fence: fenceResult({ fenceId: "fence-d" }) });
      expect(a.migrationControlSha256).not.toBe(b.migrationControlSha256);
    });
  });

  it("fails closed (stale-workspace protection) when the same operation is captured twice", async () => {
    await withTempDir(async (root) => {
      const { service: svc } = await service(root);
      await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-0001" }, fence: fenceResult() });
      await expect(svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-0001" }, fence: fenceResult() })).rejects.toMatchObject({ code: "EEXIST" });
    });
  });

  it("uses only synthetic fixtures - never reads outside the supplied source paths", async () => {
    await withTempDir(async (root) => {
      const { service: svc, runtimePath } = await service(root);
      const result = await svc.captureFinalSnapshot({ input: { migrationOperationId: "combined-op-snap-0001" }, fence: fenceResult() });
      expect(result.packageRoot.startsWith(root)).toBe(true);
      expect(runtimePath.startsWith(root)).toBe(true);
    });
  });
});
