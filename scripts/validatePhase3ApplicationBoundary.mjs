import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runtimePath = path.join(root, "private", "founder", "runtime-store.json");
const isolatedDist = path.join(root, ".next-phase3-validation");
if (path.dirname(isolatedDist) !== path.resolve(root) || path.basename(isolatedDist) !== ".next-phase3-validation") {
  throw new Error("The isolated validation build path escaped the repository root.");
}
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const eslint = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const runtimeBefore = readRuntimeCheckpoint(runtimePath);

if (fs.existsSync(isolatedDist)) throw new Error(`Refusing to overwrite existing isolated build directory: ${isolatedDist}`);
process.stdout.write(`[phase3-validation] Founder baseline ${JSON.stringify(runtimeBefore)}\n`);

const unit = (...files) => [process.execPath, [vitest, "--config", "vitest.unit.config.js", "run", "--no-file-parallelism", "--maxWorkers", "1", ...files]];
const steps = [
  ["Phase 1 foundation", process.execPath, [vitest, "--config", "vitest.foundation.config.js", "run"]],
  ["Phase 2 foundation", process.execPath, [vitest, "--config", "vitest.phase2.config.js", "run"]],
  ["Phase 3 application boundary", process.execPath, [vitest, "--config", "vitest.phase3.config.js", "run"]],
  ["persistence isolation", ...unit("src/data/repositories/FounderRuntimePersistenceGuard.test.js", "src/data/repositories/FounderStoreUnitOfWork.test.js")],
  ["adjacent application services", ...unit("src/domain/services/EvidenceReviewService.test.js", "src/domain/services/PostConfirmationOrchestrator.test.js", "src/domain/services/MorningCheckInPersistenceService.test.js", "src/domain/services/RecoveryCheckInIngestionService.test.js")],
  ["Confidence production read parity", ...unit("src/domain/services/OverallGoalConfidenceParity.test.js")],
  ["extracted web presentation regressions", ...unit("src/screens/GoalsHubScreen.test.js", "src/screens/GoalsTransitionEntryPoint.test.js", "src/screens/OperatingPlanExecutionPresentation.test.js", "src/screens/SupplementStrategyPresentation.test.js")],
  ["targeted lint", process.execPath, [eslint, "src/contracts/v1", "src/application", "src/platform/object-storage", "src/app/api/v1", "src/app/log/page.js", "src/app/profile/operating-plan/page.js", "src/screens/GoalsHubScreen.jsx", "src/screens/OperatingPlanScreen.jsx", "scripts/validatePhase3ApplicationBoundary.mjs", "scripts/smokePhase3ProductionBuild.mjs", "vitest.phase3.config.js"]],
  ["isolated production build", process.execPath, [next, "build"]],
  ["isolated production smoke", process.execPath, ["scripts/smokePhase3ProductionBuild.mjs"]],
  ["diff check", "git", ["diff", "--check"]],
];

const childEnv = { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536", PHYSIQUEOS_BUILD_DIST_DIR: ".next-phase3-validation" };
try {
  for (const [label, command, args] of steps) {
    process.stdout.write(`\n[phase3-validation] ${label}\n`);
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true, timeout: 600_000, env: childEnv });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
  }
} finally {
  if (fs.existsSync(isolatedDist)) fs.rmSync(isolatedDist, { recursive: true, force: true });
}

const runtimeAfter = readRuntimeCheckpoint(runtimePath);
if (JSON.stringify(runtimeAfter) !== JSON.stringify(runtimeBefore)) {
  throw new Error(`Founder runtime changed during Phase 3 validation; inspect provenance before classification. Before=${JSON.stringify(runtimeBefore)} After=${JSON.stringify(runtimeAfter)}`);
}
process.stdout.write(`\n[phase3-validation] PASS ${JSON.stringify(runtimeAfter)}\n`);

function readRuntimeCheckpoint(filePath) {
  const bytes = fs.readFileSync(filePath);
  const parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  const stat = fs.statSync(filePath);
  return Object.freeze({ version: parsed.version ?? null, revision: parsed.revision ?? null, updatedAt: parsed.updatedAt ?? null, size: stat.size, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase() });
}
