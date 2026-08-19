import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combinedCutoverOperationPaths, prepareCombinedCutoverOperationWorkspace } from "./combinedCutoverOperationWorkspace.js";

async function withTempDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-workspace-"));
  try { return await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

describe("combinedCutoverOperationPaths", () => {
  it("requires a valid operation ID", () => {
    expect(() => combinedCutoverOperationPaths("not a valid id!", { workspaceRoot: "/tmp" })).toThrow();
  });

  it("requires a workspace root", () => {
    expect(() => combinedCutoverOperationPaths("combined-op-0001", {})).toThrow();
  });

  it("derives deterministic, operation-scoped snapshot/package paths under .tmp/combined-cutover", async () => {
    await withTempDir(async (root) => {
      const paths = combinedCutoverOperationPaths("combined-op-0001", { workspaceRoot: root });
      expect(paths.root).toBe(path.resolve(root, ".tmp", "combined-cutover", "combined-op-0001"));
      expect(paths.snapshot).toBe(path.join(paths.root, "snapshot"));
      expect(paths.package).toBe(path.join(paths.root, "package"));
      // Calling it again for the SAME operation ID is deterministic.
      expect(combinedCutoverOperationPaths("combined-op-0001", { workspaceRoot: root })).toEqual(paths);
    });
  });

  it("never escapes the workspace root even via a path-traversal-shaped operation ID", () => {
    expect(() => combinedCutoverOperationPaths("../../etc", { workspaceRoot: "/tmp" })).toThrow();
  });
});

describe("prepareCombinedCutoverOperationWorkspace", () => {
  it("creates the operation workspace directory", async () => {
    await withTempDir(async (root) => {
      const paths = combinedCutoverOperationPaths("combined-op-0002", { workspaceRoot: root });
      await prepareCombinedCutoverOperationWorkspace(paths);
      const stat = await fs.stat(paths.root);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  it("fails closed (never silently reuses) when the operation workspace already exists", async () => {
    await withTempDir(async (root) => {
      const paths = combinedCutoverOperationPaths("combined-op-0003", { workspaceRoot: root });
      await prepareCombinedCutoverOperationWorkspace(paths);
      await expect(prepareCombinedCutoverOperationWorkspace(paths)).rejects.toMatchObject({ code: "EEXIST" });
    });
  });
});
