import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { captureReadOnlyFounderSnapshot, exportCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const {
  createFilesystemBuildIdentityProvider,
  deriveTrustedMigrationSourceIdentity,
} = await import("../src/platform/migration/MigrationSourceIdentity.js");
const { createFounderRuntimeStore } = await import("../src/data/repositories/founderRuntimeStore.js");

const root = process.cwd();
const outputRoot = path.resolve(process.argv[2] ?? path.join(root, ".tmp", "phase4-current-copy"));
const liveRuntime = path.join(root, "private", "founder", "runtime-store.json");
const liveMedia = path.join(root, "private", "founder");
if (!outputRoot.startsWith(path.join(root, ".tmp") + path.sep)) {
  throw new Error("Current-copy rehearsal output must remain under the ignored repository .tmp directory.");
}
await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
const sourceBeforeFinal = await inspectRuntime(liveRuntime);
const copyStarted = performance.now();
const snapshot = await captureReadOnlyFounderSnapshot({
  sourceRuntimePath: liveRuntime,
  sourceMediaRoot: liveMedia,
  snapshotRoot: path.join(outputRoot, "snapshot"),
  mediaInclude: (relativePath) => /^(?:evidence|photos|dexa)\//.test(relativePath),
});
const copyDurationMs = performance.now() - copyStarted;
const exportStarted = performance.now();
const sourceIdentity = await deriveTrustedMigrationSourceIdentity({
  runtimePath: snapshot.runtimePath,
  packageVersion: "phase4-canonical-package-v1",
  sourceSchemaVersion: "000003",
  buildIdentityProvider: createFilesystemBuildIdentityProvider({ repositoryRoot: root }),
});
const exported = await exportCanonicalPackage({
  runtimePath: snapshot.runtimePath,
  mediaRoot: snapshot.mediaRoot,
  outputRoot: path.join(outputRoot, "package"),
  sourceIdentity,
  normalizeRuntime: (persisted) => createFounderRuntimeStore(persisted),
});
const exportDurationMs = performance.now() - exportStarted;
const sourceAfterFinal = await inspectRuntime(liveRuntime);
const report = {
  classification: "phase4-local-read-only-copy-export",
  sourceBeforeCopy: snapshot.sourceBefore,
  sourceAfterCopy: snapshot.sourceAfter,
  sourceBeforeFinal,
  sourceAfterFinal,
  sourceChangedAfterCopy: sourceBeforeFinal.sha256 !== sourceAfterFinal.sha256,
  copiedMediaCount: snapshot.media.length,
  copiedMediaBytes: snapshot.media.reduce((sum, item) => sum + item.size, 0),
  manifestDigest: exported.manifest.semanticDigest,
  migrationId: exported.manifest.migrationId,
  sourceIdentity: exported.manifest.source,
  collectionCounts: Object.fromEntries(exported.manifest.collections.map((entry) => [entry.sourceCollection, entry.recordCount])),
  copyDurationMs: Math.round(copyDurationMs),
  exportDurationMs: Math.round(exportDurationMs),
};
await fs.writeFile(path.join(outputRoot, "copy-export-report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);

async function inspectRuntime(file) {
  const bytes = await fs.readFile(file);
  const parsed = JSON.parse(bytes);
  return { version: parsed.version, revision: parsed.revision, updatedAt: parsed.updatedAt, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
