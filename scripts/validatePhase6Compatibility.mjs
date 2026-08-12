import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runtimePath = path.join(root, "private", "founder", "runtime-store.json");
const isolatedDist = path.join(root, ".next-phase6-validation");
if (path.dirname(isolatedDist) !== path.resolve(root) || path.basename(isolatedDist) !== ".next-phase6-validation") throw new Error("Phase 6 build path escaped the repository.");
if (fs.existsSync(isolatedDist)) throw new Error(`Refusing to overwrite existing build directory: ${isolatedDist}`);
const runtimeBefore = checkpoint(runtimePath);
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const eslint = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const steps = [
  ["Phase 1", process.execPath, [vitest, "--config", "vitest.foundation.config.js", "run"]],
  ["Phase 2", process.execPath, [vitest, "--config", "vitest.phase2.config.js", "run"]],
  ["Phase 3", process.execPath, [vitest, "--config", "vitest.phase3.config.js", "run"]],
  ["Phase 4", process.execPath, [vitest, "--config", "vitest.phase4.config.js", "run"]],
  ["Phase 5", process.execPath, [vitest, "--config", "vitest.phase5.config.js", "run"]],
  ["Phase 6 compatibility", process.execPath, [vitest, "--config", "vitest.phase6.config.js", "run"]],
  ["Training compatibility", process.execPath, [vitest, "--config", "vitest.phase6.training.config.js", "run"]],
  ["Photo compatibility", process.execPath, [vitest, "--config", "vitest.phase6.photo.config.js", "run"]],
  ["runtime ownership", process.execPath, [vitest, "--config", "vitest.unit.config.js", "run", "--no-file-parallelism", "--maxWorkers", "1", "scripts/physiqueosRuntimeOwnership.test.js"]],
  ["persistence isolation", process.execPath, [vitest, "--config", "vitest.unit.config.js", "run", "--no-file-parallelism", "--maxWorkers", "1", "src/data/repositories/FounderRuntimePersistenceGuard.test.js", "src/data/repositories/FounderStoreUnitOfWork.test.js"]],
  ["targeted lint", process.execPath, [eslint, "src/app/api/health/route.js", "src/app/api/health/route.test.js", "scripts/deployPhysiqueOS.test.js", "scripts/smokePhase6ProductionBuild.mjs", "scripts/validatePhase6Compatibility.mjs", "scripts/validatePhase6WebSurface.mjs", "vitest.phase6.config.js", "vitest.phase6.training.config.js", "vitest.phase6.photo.config.js"]],
  ["isolated production build", process.execPath, [next, "build"]],
  ["isolated route and asset smoke", process.execPath, ["scripts/smokePhase6ProductionBuild.mjs"]],
  ["diff check", "git", ["diff", "--check"]],
];
const childEnv = {
  ...process.env,
  NODE_OPTIONS: "--max-old-space-size=1536",
  PHYSIQUEOS_BUILD_DIST_DIR: ".next-phase6-validation",
  PHYSIQUEOS_PHASE2_STAGING_ENABLED: "0",
  PHYSIQUEOS_DATABASE_ENABLED: "0",
  PHYSIQUEOS_OBJECT_STORAGE_ENABLED: "0",
};
let buildId = null;
try {
  for (const [label, command, args] of steps) {
    process.stdout.write(`\n[phase6-validation] ${label}\n`);
    const result = spawnSync(command, args, { cwd: root, env: childEnv, stdio: "inherit", windowsHide: true, timeout: 600_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
    if (label === "isolated production build") {
      buildId = fs.readFileSync(path.join(isolatedDist, "BUILD_ID"), "utf8").trim();
      const sourceCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true });
      if (sourceCommit.status !== 0) throw new Error("Unable to capture Phase 6 build source identity.");
      fs.writeFileSync(path.join(isolatedDist, "SOURCE_COMMIT"), sourceCommit.stdout.trim(), "ascii");
    }
  }
} finally {
  if (fs.existsSync(isolatedDist)) fs.rmSync(isolatedDist, { recursive: true, force: true });
}
const runtimeAfter = checkpoint(runtimePath);
if (runtimeBefore.sha256 !== runtimeAfter.sha256) throw new Error("Founder runtime changed during bounded Phase 6 validation.");
process.stdout.write(`\n[phase6-validation] PASS ${JSON.stringify({ buildId, runtimeBefore, runtimeAfter, concurrentFounderActivity: false })}\n`);

function checkpoint(file) {
  const bytes = fs.readFileSync(file);
  const value = JSON.parse(bytes);
  return { version: value.version, revision: value.revision, updatedAt: value.updatedAt, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase() };
}
