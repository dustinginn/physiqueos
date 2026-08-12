import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runtimePath = path.join(root, "private", "founder", "runtime-store.json");
const isolatedDist = path.join(root, ".next-phase4-validation");
if (path.dirname(isolatedDist) !== path.resolve(root) || path.basename(isolatedDist) !== ".next-phase4-validation") throw new Error("Phase 4 build path escaped the repository.");
if (fs.existsSync(isolatedDist)) throw new Error(`Refusing to overwrite existing build directory: ${isolatedDist}`);
const runtimeBefore = checkpoint(runtimePath);
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const eslint = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const unit = (...files) => [process.execPath, [vitest, "--config", "vitest.unit.config.js", "run", "--no-file-parallelism", "--maxWorkers", "1", ...files]];
const steps = [
  ["Phase 1", process.execPath, [vitest, "--config", "vitest.foundation.config.js", "run"]],
  ["Phase 2", process.execPath, [vitest, "--config", "vitest.phase2.config.js", "run"]],
  ["Phase 3", process.execPath, [vitest, "--config", "vitest.phase3.config.js", "run"]],
  ["Phase 4", process.execPath, [vitest, "--config", "vitest.phase4.config.js", "run"]],
  ["persistence isolation", ...unit("src/data/repositories/FounderRuntimePersistenceGuard.test.js", "src/data/repositories/FounderStoreUnitOfWork.test.js")],
  ["adjacent services", ...unit("src/domain/services/EvidenceReviewService.test.js", "src/domain/services/PostConfirmationOrchestrator.test.js", "src/domain/services/MorningCheckInPersistenceService.test.js", "src/domain/services/RecoveryCheckInIngestionService.test.js")],
  ["targeted lint", process.execPath, [eslint, "src/contracts/v1", "src/application", "src/platform/database", "src/platform/migration", "scripts/importPhase4CanonicalPackage.mjs", "scripts/migratePhase4LocalMedia.mjs", "scripts/runPhase4CurrentCopyExport.mjs", "scripts/validatePhase4CommandParity.mjs", "scripts/validatePhase4Postgres.mjs", "scripts/validatePhase4ReadParity.mjs", "scripts/validatePhase4RehearsalLifecycle.mjs", "scripts/validatePhase4Security.mjs", "scripts/verifyPhase4PackageDeterminism.mjs", "vitest.phase4.config.js"]],
  ["production build", process.execPath, [next, "build"]],
  ["isolated smoke", process.execPath, ["scripts/smokePhase3ProductionBuild.mjs"]],
  ["diff check", "git", ["diff", "--check"]],
];
if (process.env.PHYSIQUEOS_PHASE4_DATABASE_URL) steps.splice(4, 0, ["guarded PostgreSQL rehearsal", process.execPath, ["scripts/validatePhase4Postgres.mjs"]]);
const childEnv = { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536", PHYSIQUEOS_BUILD_DIST_DIR: ".next-phase4-validation" };
try {
  for (const [label, command, args] of steps) {
    process.stdout.write(`\n[phase4-validation] ${label}\n`);
    const result = spawnSync(command, args, { cwd: root, env: childEnv, stdio: "inherit", windowsHide: true, timeout: 600_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
  }
} finally { if (fs.existsSync(isolatedDist)) fs.rmSync(isolatedDist, { recursive: true, force: true }); }
const runtimeAfter = checkpoint(runtimePath);
process.stdout.write(`\n[phase4-validation] PASS ${JSON.stringify({ runtimeBefore, runtimeAfter, concurrentFounderActivity: runtimeBefore.sha256 !== runtimeAfter.sha256 })}\n`);

function checkpoint(file) { const bytes = fs.readFileSync(file); const value = JSON.parse(bytes); return { version: value.version, revision: value.revision, updatedAt: value.updatedAt, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase() }; }
