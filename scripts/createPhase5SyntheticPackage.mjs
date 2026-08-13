import path from "node:path";
import { register } from "node:module";
import { execFileSync } from "node:child_process";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { writePhase5SyntheticPackage } = await import("../src/platform/migration/phase5SyntheticPackage.js");

const outputRoot = process.argv[2];
if (!outputRoot) throw new Error("Usage: node scripts/createPhase5SyntheticPackage.mjs <ignored-output-root> [records-per-collection]");
const result = await writePhase5SyntheticPackage({
  outputRoot: path.resolve(outputRoot),
  repositoryRevision: process.env.PHYSIQUEOS_GIT_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  recordsPerCollection: Number(process.argv[3] ?? 3),
});
process.stdout.write(`${JSON.stringify({
  packageRoot: result.packageRoot,
  collectionCount: result.manifest.collections.length,
  recordCount: result.manifest.collections.reduce((sum, item) => sum + item.recordCount, 0),
  mediaCount: result.manifest.files.length,
  mediaBytes: result.manifest.files.reduce((sum, item) => sum + item.size, 0),
  packageDigest: result.manifest.semanticDigest,
  canonicalStateDigest: result.manifest.criticalValues.canonicalStateDigest,
})}\n`);
