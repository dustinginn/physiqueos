import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runtimePath = path.join(root, "private", "founder", "runtime-store.json");
const isolatedDist = path.join(root, ".next-phase1-validation");
if (path.dirname(isolatedDist) !== path.resolve(root) || path.basename(isolatedDist) !== ".next-phase1-validation") {
  throw new Error("The Phase 1 isolated validation build path escaped the repository root.");
}
if (fs.existsSync(isolatedDist)) throw new Error(`Refusing to overwrite existing isolated build directory: ${isolatedDist}`);
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const eslint = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const runtimeBefore = readRuntimeCheckpoint(runtimePath);

const steps = [
  ["focused foundation", process.execPath, [vitest, "--config", "vitest.foundation.config.js", "run"]],
  ["persistence isolation", process.execPath, [vitest, "--config", "vitest.unit.config.js", "run", "--no-file-parallelism", "--maxWorkers", "1", "src/data/repositories/FounderRuntimePersistenceGuard.test.js", "src/data/repositories/FounderStoreUnitOfWork.test.js"]],
  ["adjacent application services", process.execPath, [vitest, "--config", "vitest.unit.config.js", "run", "--no-file-parallelism", "--maxWorkers", "1", "src/domain/services/EvidenceReviewService.test.js", "src/domain/services/PostConfirmationOrchestrator.test.js", "src/domain/services/MorningCheckInPersistenceService.test.js", "src/domain/services/RecoveryCheckInIngestionService.test.js"]],
  ["targeted lint", process.execPath, [eslint, "src/contracts/v1", "src/application/auth", "src/application/commands", "src/application/platform", "src/platform/auth", "src/platform/commands", "src/platform/database", "src/platform/features", "src/platform/foundation", "src/platform/http", "src/platform/migration", "src/platform/object-storage", "src/platform/observability", "src/app/api/v1", "scripts/validateMigrationManifest.mjs", "scripts/validateFoundationPhase1.mjs", "vitest.foundation.config.js"]],
  ["production build", process.execPath, [next, "build"]],
  ["diff check", "git", ["diff", "--check"]],
];

const childEnv = { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536", PHYSIQUEOS_BUILD_DIST_DIR: ".next-phase1-validation" };
try {
  for (const [label, command, args] of steps) {
    process.stdout.write(`\n[foundation-validation] ${label}\n`);
    const result = spawnSync(command, args, { cwd: root, env: childEnv, stdio: "inherit", windowsHide: true, timeout: 600_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
  }
} finally {
  if (fs.existsSync(isolatedDist)) fs.rmSync(isolatedDist, { recursive: true, force: true });
}

const runtimeAfter = readRuntimeCheckpoint(runtimePath);
if (JSON.stringify(runtimeAfter) !== JSON.stringify(runtimeBefore)) {
  throw new Error(`Founder runtime changed during foundation validation. Before=${JSON.stringify(runtimeBefore)} After=${JSON.stringify(runtimeAfter)}`);
}

process.stdout.write(`\n[foundation-validation] PASS ${JSON.stringify(runtimeAfter)}\n`);

function readRuntimeCheckpoint(filePath) {
  const bytes = fs.readFileSync(filePath);
  const parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  const stat = fs.statSync(filePath);
  return Object.freeze({
    version: parsed.version ?? null,
    revision: parsed.revision ?? null,
    updatedAt: parsed.updatedAt ?? null,
    size: stat.size,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
  });
}
