import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { migratePackageMediaLocally } = await import("../src/platform/migration/phase4LocalMediaMigration.js");

const packageRoot = path.resolve(process.argv[2] ?? "");
const snapshotMediaRoot = path.resolve(process.argv[3] ?? "");
const objectRoot = path.resolve(process.argv[4] ?? "");
const ignoredRoot = path.join(process.cwd(), ".tmp") + path.sep;
if (![packageRoot, snapshotMediaRoot, objectRoot].every((value) => value.startsWith(ignoredRoot))) {
  throw new Error("Phase 4 media rehearsal inputs and target must remain under the ignored .tmp directory.");
}
await fs.rm(objectRoot, { recursive: true, force: true });
const started = performance.now();
const result = await migratePackageMediaLocally({ packageRoot, snapshotMediaRoot, objectRoot });
const report = { objectCount: result.objectCount, byteLength: result.byteLength, mediaCopyDurationMs: Math.round(performance.now() - started) };
await fs.writeFile(path.join(path.dirname(objectRoot), "media-copy-report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
