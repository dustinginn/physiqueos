import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";

// Narrow, dry-run-safe-by-default administrative harness for
// PostPhase2CoreReconciliationService. It never derives reconciliation scope from operator
// input and never mutates Founder data on its own: it only resolves scope through
// PostPhase2CoreReconciliationScopeResolver and calls the existing service's dryRun/reconcile.
export const POST_PHASE_2_HARNESS_VERSION = "post_phase_2_core_reconciliation_harness_v2";
export const REAL_EXECUTION_AUTHORIZATION_SCOPE = "post_phase_2_core_reconciliation";
const VALID_MODES = new Set(["dry-run", "real"]);

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");

// The harness's own tracked source files. These are administrative-tool repository paths,
// not Founder production record IDs, so pinning them here (unlike production commit/build
// identity, which is never hardcoded — see evaluateProductionApplicationCheckpoint) is safe
// and is exactly what lets the harness prove *itself* is committed before real execution.
export const HARNESS_TRACKED_PATHS = Object.freeze([
  "scripts/runPostPhase2CoreReconciliationHarness.mjs",
  "src/domain/services/PostPhase2CoreReconciliationScopeResolver.js",
  "src/domain/services/PostPhase2CoreReconciliationScopeResolver.test.js",
  "scripts/runPostPhase2CoreReconciliationHarness.test.js",
]);

// Registered unconditionally (not only under the CLI guard) so that tests importing this
// module directly can also dynamically import the extension-less domain-layer modules.
register("./sourceModuleResolutionHook.mjs", import.meta.url);

export class HarnessSafetyError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = "PostPhase2HarnessSafetyError";
    this.code = code;
    this.diagnostics = Object.freeze({ ...diagnostics });
  }
}

export function resolveDefaultStorePath(root = defaultRoot) {
  return path.join(root, "private/founder/runtime-store.json");
}

export function resolveDefaultMigrationControlPath(root = defaultRoot) {
  return path.join(root, "private/founder/migration-control.json");
}

export function readStoreSnapshot(storePath) {
  const bytes = fs.readFileSync(storePath);
  return Object.freeze({ store: JSON.parse(bytes.toString("utf8")), bytes, hash: sha256(bytes) });
}

export function readMigrationControlState(controlPath) {
  const envelope = readOperationalJsonFileSync(controlPath, { stage: "post_phase_2_harness_migration_control" });
  return Object.freeze({ state: envelope.state ?? envelope });
}

// Verifies the DEPLOYED production application's canonical .next identity against explicit
// expected values supplied by the caller for this one administrative operation. This is
// deliberately never compared against the harness's own git HEAD: the harness/resolver
// source does not need to be deployed into the running Next.js application to be used
// administratively, so a harness-only commit must never appear to "break" production.
// A caller that omits either expectation gets matchesExpected: null (not evaluated), which
// dry-run may proceed past but real mode must always refuse — there is no default, so every
// invocation (and every future deployment) must supply fresh expected values.
export function evaluateProductionApplicationCheckpoint({
  root = defaultRoot, expectedSourceCommit = null, expectedBuildId = null,
} = {}) {
  const sourceCommitPath = path.join(root, ".next/SOURCE_COMMIT");
  const buildIdPath = path.join(root, ".next/BUILD_ID");
  const sourceCommit = fs.existsSync(sourceCommitPath) ? fs.readFileSync(sourceCommitPath, "utf8").trim() : null;
  const buildId = fs.existsSync(buildIdPath) ? fs.readFileSync(buildIdPath, "utf8").trim() : null;
  const available = Boolean(sourceCommit && buildId);
  const expectationsSupplied = Boolean(expectedSourceCommit && expectedBuildId);
  const matchesExpected = !expectationsSupplied ? null :
    (available && sourceCommit === expectedSourceCommit && buildId === expectedBuildId);
  return Object.freeze({
    available, sourceCommit, buildId,
    expectedSourceCommit: expectedSourceCommit ?? null,
    expectedBuildId: expectedBuildId ?? null,
    expectationsSupplied,
    matchesExpected,
  });
}

// Reports the administrative harness's OWN repository state: current commit, whether the
// tracked tree is clean (untracked files/directories never count against this — protected
// deployment/recovery directories may legitimately exist untracked), and whether the
// harness/resolver's own source files are committed at HEAD.
export function evaluateHarnessRepositoryCheckpoint({ root = defaultRoot } = {}) {
  let head = null;
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    head = null;
  }
  let trackedTreeClean = false;
  if (head) {
    try {
      const status = execFileSync("git", ["status", "--porcelain=v1", "-uno"],
        { cwd: root, encoding: "utf8" });
      trackedTreeClean = status.trim().length === 0;
    } catch {
      trackedTreeClean = false;
    }
  }
  const files = {};
  for (const relativePath of HARNESS_TRACKED_PATHS) {
    files[relativePath] = head ? isTrackedAtHead(root, head, relativePath) : false;
  }
  const allTracked = Object.values(files).every(Boolean);
  return Object.freeze({ head, trackedTreeClean, files: Object.freeze(files), allTracked });
}

export function realExecutionConfirmationPhrase(requestId) {
  return `AUTHORIZE PRODUCTION POST PHASE 2 CORE RECONCILIATION ${requestId}`;
}

async function loadDomainModules() {
  const [service, resolver] = await Promise.all([
    import("../src/domain/services/PostPhase2CoreReconciliationService.js"),
    import("../src/domain/services/PostPhase2CoreReconciliationScopeResolver.js"),
  ]);
  return { service, resolver };
}

// Core orchestration, safe to call directly from tests as well as from the CLI entry point.
// mode defaults to "dry-run" and dry-run is the only path reachable without every real-mode
// gate below being satisfied explicitly by the caller.
export async function runPostPhase2CoreReconciliationHarness({
  mode = "dry-run",
  storePath,
  migrationControlPath,
  root = defaultRoot,
  expectedProductionSourceCommit,
  expectedProductionBuildId,
  authorizationPath,
  confirmPhrase,
  now = () => new Date(),
} = {}) {
  if (!VALID_MODES.has(mode)) {
    throw new HarnessSafetyError("HARNESS_MODE_INVALID", `Unsupported harness mode: ${mode}.`);
  }
  const resolvedStorePath = storePath ?? resolveDefaultStorePath(root);
  const resolvedControlPath = migrationControlPath ?? resolveDefaultMigrationControlPath(root);
  const productionApplicationCheckpoint = evaluateProductionApplicationCheckpoint({
    root, expectedSourceCommit: expectedProductionSourceCommit, expectedBuildId: expectedProductionBuildId,
  });
  const harnessRepositoryCheckpoint = evaluateHarnessRepositoryCheckpoint({ root });

  const { service: serviceModule, resolver: resolverModule } = await loadDomainModules();

  // Revision freshness: the store is read from disk here, immediately before scope
  // resolution and command construction, never from a cached/earlier snapshot.
  const before = readStoreSnapshot(resolvedStorePath);
  const migrationControl = readMigrationControlState(resolvedControlPath);
  const { command, preflight } = resolverModule.resolvePostPhase2CoreReconciliationScope({
    store: before.store, now,
  });

  const service = serviceModule.createPostPhase2CoreReconciliationService({
    runtimeStorePath: resolvedStorePath,
    liveStore: before.store,
    readMigrationControl: async () => migrationControl,
    now,
  });

  const base = {
    status: "pending",
    harnessVersion: POST_PHASE_2_HARNESS_VERSION,
    mode,
    resolvedAt: now().toISOString(),
    productionApplicationCheckpoint,
    harnessRepositoryCheckpoint,
    migrationControlState: migrationControl.state,
    storeRevisionBeforeResolution: before.store.revision,
    storeHashBefore: before.hash,
    preflight,
    command,
  };

  if (mode === "dry-run") {
    const result = await service.dryRun(command);
    const after = readStoreSnapshot(resolvedStorePath);
    const bytesUnchanged = before.bytes.equals(after.bytes) && before.hash === after.hash;
    if (!bytesUnchanged) {
      throw new HarnessSafetyError("DRY_RUN_MUTATED_STORE",
        "Founder store bytes changed during a dry run. This should never happen.",
        { storeHashBefore: before.hash, storeHashAfter: after.hash });
    }
    return Object.freeze({
      ...base,
      status: "dry_run_complete",
      result,
      proposedChangeCount: result.proposedChanges?.length ?? 0,
      storeHashAfter: after.hash,
      bytesUnchanged: true,
      persisted: false,
    });
  }

  // mode === "real": every gate below must pass before service.reconcile is ever reached.
  if (!productionApplicationCheckpoint.expectationsSupplied) {
    throw new HarnessSafetyError("REAL_EXECUTION_EXPECTED_CHECKPOINT_REQUIRED",
      "Real execution refused: expectedProductionSourceCommit and expectedProductionBuildId must be supplied fresh for this invocation.");
  }
  if (productionApplicationCheckpoint.matchesExpected !== true) {
    throw new HarnessSafetyError("REAL_EXECUTION_PRODUCTION_CHECKPOINT_MISMATCH",
      "Real execution refused: the deployed production .next SOURCE_COMMIT/BUILD_ID do not match the explicitly expected accepted checkpoint.",
      { productionApplicationCheckpoint });
  }
  if (!harnessRepositoryCheckpoint.trackedTreeClean) {
    throw new HarnessSafetyError("REAL_EXECUTION_TRACKED_TREE_DIRTY",
      "Real execution refused: the repository's tracked tree has uncommitted changes.",
      { harnessRepositoryCheckpoint });
  }
  if (!harnessRepositoryCheckpoint.allTracked) {
    throw new HarnessSafetyError("REAL_EXECUTION_HARNESS_FILES_NOT_TRACKED",
      "Real execution refused: the harness/resolver source files are not all committed at HEAD.",
      { harnessRepositoryCheckpoint });
  }
  if (!authorizationPath) {
    throw new HarnessSafetyError("REAL_EXECUTION_AUTHORIZATION_REQUIRED",
      "Real execution refused: no request-bound authorization was supplied.");
  }
  const authorization = readOperationalJsonFileSync(authorizationPath,
    { stage: "post_phase_2_harness_real_authorization" });
  if (authorization?.authorized !== true ||
      authorization.scope !== REAL_EXECUTION_AUTHORIZATION_SCOPE ||
      authorization.requestId !== command.requestId) {
    throw new HarnessSafetyError("REAL_EXECUTION_AUTHORIZATION_INVALID",
      "Real execution refused: authorization must have authorized=true, the exact reconciliation scope, and a requestId matching this resolved command.",
      { requiredScope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requiredRequestId: command.requestId });
  }
  const expectedConfirm = realExecutionConfirmationPhrase(command.requestId);
  if (confirmPhrase !== expectedConfirm) {
    throw new HarnessSafetyError("REAL_EXECUTION_CONFIRMATION_REQUIRED",
      `Real execution refused: --confirm must exactly equal: ${expectedConfirm}`);
  }

  const result = await service.reconcile(command, { authorization });
  return Object.freeze({
    ...base,
    status: "real_execution_complete",
    result,
    persisted: result.committed === true,
  });
}

function isTrackedAtHead(root, head, relativePath) {
  try {
    execFileSync("git", ["cat-file", "-e", `${head}:${relativePath.replaceAll("\\", "/")}`],
      { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function parseArgs(values) {
  const args = { mode: "dry-run" };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === "--mode") { args.mode = values[++index]; continue; }
    if (key === "--authorization") { args.authorizationPath = values[++index]; continue; }
    if (key === "--confirm") { args.confirmPhrase = values[++index]; continue; }
    if (key === "--store") { args.storePath = values[++index]; continue; }
    if (key === "--expected-source-commit") { args.expectedProductionSourceCommit = values[++index]; continue; }
    if (key === "--expected-build-id") { args.expectedProductionBuildId = values[++index]; continue; }
    throw new HarnessSafetyError("HARNESS_ARGUMENT_INVALID", `Unknown argument: ${key}.`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPostPhase2CoreReconciliationHarness(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code ?? "HARNESS_FAILED",
      message: error.message, diagnostics: error.diagnostics ?? {} }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
