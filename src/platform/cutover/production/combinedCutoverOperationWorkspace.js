// Operation-scoped, path-safe local workspace for the combined-cutover Windows-side
// snapshot/export adapters (`captureFinalSnapshot`, `exportFinalPackage`). Mirrors the exact
// stale-workspace protection `scripts/productionMigrationEnvironmentAdapters.mjs`'s `operationPaths`/
// `prepareOperationWorkspace` already established for the older single-machine migration path - that
// pair cannot be imported directly from src/-owned production code (the .mjs script calls
// `register(...)` at module load), so this is a small, source-owned equivalent rather than a
// duplication of any export/hashing/digest logic (which IS reused directly from
// `phase4CanonicalExport.js`/`MigrationSourceIdentity.js`).
import fs from "node:fs/promises";
import path from "node:path";
import { requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";

export function combinedCutoverOperationPaths(migrationOperationId, { workspaceRoot } = {}) {
  const operationId = requireTransferOperationId(migrationOperationId);
  if (!String(workspaceRoot ?? "").trim()) throw new Error("A combined-cutover operation workspace root is required.");
  const parent = path.resolve(workspaceRoot, ".tmp", "combined-cutover");
  const operationRoot = path.resolve(parent, operationId);
  if (!operationRoot.startsWith(`${parent}${path.sep}`)) throw new Error("Combined-cutover operation path escaped its workspace root.");
  return Object.freeze({
    parent, root: operationRoot,
    snapshot: path.join(operationRoot, "snapshot"),
    package: path.join(operationRoot, "package"),
  });
}

// The workspace parent is created recursively (idempotent), but the unique operation directory is
// created NON-recursively so an already-existing operation workspace fails EEXIST and is never
// silently reused - a stale workspace from a prior failed/aborted attempt must never be mistaken for
// a fresh one.
export async function prepareCombinedCutoverOperationWorkspace(paths) {
  await fs.mkdir(paths.parent, { recursive: true });
  await fs.mkdir(paths.root, { recursive: false });
  return paths;
}
