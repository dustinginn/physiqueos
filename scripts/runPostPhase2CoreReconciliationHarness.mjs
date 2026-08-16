import fs from "node:fs";
import os from "node:os";
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
//
// Real execution is a two-stage prepare-then-execute handshake:
//   1. "prepare" resolves canonical scope, mints ONE requestId, proves the command is
//      ELIGIBLE via service.dryRun, and writes that exact command to an ignored preparation
//      artifact (with an integrity hash) — never mutating anything.
//   2. "real" loads that artifact verbatim (never re-resolving scope, never minting a new
//      requestId), re-verifies every checkpoint/freshness/authorization gate against current
//      state, and only then passes the UNCHANGED prepared command to service.reconcile.
// This is what lets a request-bound authorization file, built after seeing a specific
// requestId, ever actually match the command real mode ends up executing.
export const POST_PHASE_2_HARNESS_VERSION = "post_phase_2_core_reconciliation_harness_v3";
export const REAL_EXECUTION_AUTHORIZATION_SCOPE = "post_phase_2_core_reconciliation";
export const PREPARATION_ARTIFACT_SCHEMA_VERSION = "post_phase_2_core_reconciliation_preparation_v1";
const VALID_MODES = new Set(["dry-run", "prepare", "real"]);

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

const PREPARATION_COMMAND_FIELDS = Object.freeze([
  "requestId", "expectedStoreRevision", "goalId", "phase1Id", "phase2Id", "decisionId",
  "transactionId", "strategyId", "trajectoryId", "energyProtocolId", "energyV1Id", "energyV2Id",
  "currentStartDate", "targetStartDate", "caloricIntakeTarget", "activityExpenditureTarget",
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

// Mirrors PostPhase2CoreReconciliationService's own migration-control invariant, purely as
// an early, explicit harness-level gate. It duplicates a five-field boolean predicate, not
// any correction/mutation logic — the service itself remains the sole authority and re-checks
// this identically (and cannot be bypassed) inside dryRun/reconcile.
function isMigrationControlSafe(state) {
  return state?.fenceState === "inactive" && state?.canonicalStoreEpoch === "legacy-json" &&
    state?.compositionMode === "legacy-json" && state?.readsEnabled === true &&
    state?.writesEnabled === true && !state?.migrationOperationId && !state?.firstPostgresWriteAt;
}

// Verifies the DEPLOYED production application's canonical .next identity against explicit
// expected values supplied by the caller for this one administrative operation. This is
// deliberately never compared against the harness's own git HEAD: the harness/resolver
// source does not need to be deployed into the running Next.js application to be used
// administratively, so a harness-only commit must never appear to "break" production.
// A caller that omits either expectation gets matchesExpected: null (not evaluated), which
// dry-run may proceed past but prepare/real must always refuse — there is no default, so
// every invocation (and every future deployment) must supply fresh expected values.
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

// Deterministic (key-order-independent) integrity hash over a preparation payload, excluding
// the integrityHash field itself so the same function verifies what it produced.
export function computePreparationIntegrityHash(payload) {
  const { integrityHash: _integrityHash, ...rest } = payload;
  return sha256(Buffer.from(stableStringify(rest)));
}

// Loads and fully validates a preparation artifact: schema/version, structural completeness,
// integrity hash, and that it was captured from an eligible dry run. Never trusts the file
// path/name alone. Fails closed with a specific code for every distinct failure mode.
export function readPreparationArtifact(preparationArtifactPath) {
  let artifact;
  try {
    artifact = readOperationalJsonFileSync(preparationArtifactPath,
      { stage: "post_phase_2_harness_preparation_artifact" });
  } catch (error) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_MALFORMED",
      `Preparation artifact could not be read or parsed: ${error.message}`);
  }
  if (artifact?.schemaVersion !== PREPARATION_ARTIFACT_SCHEMA_VERSION) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_MALFORMED",
      "Preparation artifact schema version is missing or not recognized by this harness.");
  }
  const commandComplete = artifact.command && typeof artifact.command === "object" &&
    PREPARATION_COMMAND_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(artifact.command, field));
  const expectedComplete = artifact.expected && typeof artifact.expected === "object" &&
    ["productionSourceCommit", "productionBuildId", "harnessRepositoryHead", "storeRevision"]
      .every((field) => Object.prototype.hasOwnProperty.call(artifact.expected, field));
  const dryRunComplete = artifact.dryRun && typeof artifact.dryRun.outcome === "string" &&
    Number.isInteger(artifact.dryRun.proposedChangeCount);
  if (!artifact.requestId || !commandComplete || !expectedComplete || !dryRunComplete ||
      typeof artifact.integrityHash !== "string" || !artifact.createdAt) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_MALFORMED",
      "Preparation artifact is missing required fields.");
  }
  if (artifact.requestId !== artifact.command.requestId) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_MALFORMED",
      "Preparation artifact requestId does not match its own command.requestId.");
  }
  if (computePreparationIntegrityHash(artifact) !== artifact.integrityHash) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_INTEGRITY_FAILED",
      "Preparation artifact integrity hash does not match its contents. It may be corrupted or tampered with.");
  }
  if (artifact.dryRun.outcome !== "eligible") {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_NOT_ELIGIBLE",
      `Preparation artifact was not captured from an eligible dry run (outcome: ${artifact.dryRun.outcome}).`);
  }
  return artifact;
}

async function loadDomainModules() {
  const [service, resolver] = await Promise.all([
    import("../src/domain/services/PostPhase2CoreReconciliationService.js"),
    import("../src/domain/services/PostPhase2CoreReconciliationScopeResolver.js"),
  ]);
  return { service, resolver };
}

// Core orchestration, safe to call directly from tests as well as from the CLI entry point.
// mode defaults to "dry-run" and dry-run/prepare are the only paths reachable without every
// real-mode gate below being satisfied explicitly by the caller. Possessing a preparation
// artifact alone is never sufficient for real execution — a separate, distinct authorization
// file and exact confirmation phrase are still both required.
export async function runPostPhase2CoreReconciliationHarness({
  mode = "dry-run",
  storePath,
  migrationControlPath,
  root = defaultRoot,
  expectedProductionSourceCommit,
  expectedProductionBuildId,
  preparationArtifactPath,
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
  const migrationControl = readMigrationControlState(resolvedControlPath);

  if (mode === "real") {
    return runRealExecution({
      root, resolvedStorePath, expectedProductionSourceCommit, expectedProductionBuildId,
      productionApplicationCheckpoint, harnessRepositoryCheckpoint, migrationControl,
      serviceModule, preparationArtifactPath, authorizationPath, confirmPhrase, now,
    });
  }

  // dry-run and prepare share the same resolve-then-inspect path: both read the store fresh
  // immediately before resolving scope, mint exactly one requestId, and call service.dryRun.
  const before = readStoreSnapshot(resolvedStorePath);
  const { command, preflight } = resolverModule.resolvePostPhase2CoreReconciliationScope({
    store: before.store, now,
  });
  const service = serviceModule.createPostPhase2CoreReconciliationService({
    runtimeStorePath: resolvedStorePath,
    liveStore: before.store,
    readMigrationControl: async () => migrationControl,
    now,
  });
  const result = await service.dryRun(command);
  const after = readStoreSnapshot(resolvedStorePath);
  const bytesUnchanged = before.bytes.equals(after.bytes) && before.hash === after.hash;
  if (!bytesUnchanged) {
    throw new HarnessSafetyError("DRY_RUN_MUTATED_STORE",
      "Founder store bytes changed during a dry run. This should never happen.",
      { storeHashBefore: before.hash, storeHashAfter: after.hash });
  }

  const base = Object.freeze({
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
    result,
    proposedChangeCount: result.proposedChanges?.length ?? 0,
    storeHashAfter: after.hash,
    bytesUnchanged: true,
    persisted: false,
  });

  if (mode === "dry-run") {
    return Object.freeze({ ...base, status: "dry_run_complete" });
  }

  // mode === "prepare"
  if (result.outcome !== "eligible") {
    return Object.freeze({ ...base, status: "prepare_not_eligible", preparationArtifactPath: null });
  }
  if (!productionApplicationCheckpoint.expectationsSupplied) {
    throw new HarnessSafetyError("PREPARE_EXPECTED_CHECKPOINT_REQUIRED",
      "Prepare refused: expectedProductionSourceCommit and expectedProductionBuildId must be supplied fresh for this invocation.");
  }
  if (productionApplicationCheckpoint.matchesExpected !== true) {
    throw new HarnessSafetyError("PREPARE_PRODUCTION_CHECKPOINT_MISMATCH",
      "Prepare refused: the deployed production .next SOURCE_COMMIT/BUILD_ID do not match the explicitly expected checkpoint.",
      { productionApplicationCheckpoint });
  }
  const resolvedPreparationArtifactPath = preparationArtifactPath ??
    path.join(os.tmpdir(), `physiqueos-post-phase-2-preparation-${Date.now()}.json`);
  const preparation = {
    schemaVersion: PREPARATION_ARTIFACT_SCHEMA_VERSION,
    createdAt: now().toISOString(),
    requestId: command.requestId,
    command,
    expected: {
      productionSourceCommit: expectedProductionSourceCommit,
      productionBuildId: expectedProductionBuildId,
      harnessRepositoryHead: harnessRepositoryCheckpoint.head,
      storeRevision: command.expectedStoreRevision,
    },
    dryRun: {
      outcome: result.outcome,
      proposedChangeCount: result.proposedChanges?.length ?? 0,
    },
  };
  preparation.integrityHash = computePreparationIntegrityHash(preparation);
  fs.writeFileSync(resolvedPreparationArtifactPath, JSON.stringify(preparation, null, 2));
  return Object.freeze({
    ...base,
    status: "prepare_complete",
    preparationArtifactPath: resolvedPreparationArtifactPath,
    preparation: Object.freeze(preparation),
  });
}

// mode === "real": every gate below must pass, in order, before service.reconcile is ever
// reached — and it is always called with the UNCHANGED command loaded from the preparation
// artifact, never a freshly re-resolved one.
async function runRealExecution({
  root, resolvedStorePath, expectedProductionSourceCommit, expectedProductionBuildId,
  productionApplicationCheckpoint, harnessRepositoryCheckpoint, migrationControl,
  serviceModule, preparationArtifactPath, authorizationPath, confirmPhrase, now,
}) {
  if (!preparationArtifactPath) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_REQUIRED",
      "Real execution refused: no preparation artifact was supplied.");
  }
  const preparation = readPreparationArtifact(preparationArtifactPath);

  if (!productionApplicationCheckpoint.expectationsSupplied) {
    throw new HarnessSafetyError("REAL_EXECUTION_EXPECTED_CHECKPOINT_REQUIRED",
      "Real execution refused: expectedProductionSourceCommit and expectedProductionBuildId must be supplied fresh for this invocation.");
  }
  if (expectedProductionSourceCommit !== preparation.expected.productionSourceCommit ||
      expectedProductionBuildId !== preparation.expected.productionBuildId) {
    throw new HarnessSafetyError("REAL_EXECUTION_PREPARATION_CHECKPOINT_DRIFT",
      "Real execution refused: the expected production checkpoint supplied now does not match what was recorded during preparation.",
      { supplied: { expectedProductionSourceCommit, expectedProductionBuildId }, prepared: preparation.expected });
  }
  if (productionApplicationCheckpoint.matchesExpected !== true) {
    throw new HarnessSafetyError("REAL_EXECUTION_PRODUCTION_CHECKPOINT_MISMATCH",
      "Real execution refused: the deployed production .next SOURCE_COMMIT/BUILD_ID no longer match the expected checkpoint.",
      { productionApplicationCheckpoint });
  }
  if (harnessRepositoryCheckpoint.head !== preparation.expected.harnessRepositoryHead) {
    throw new HarnessSafetyError("REAL_EXECUTION_HARNESS_REPOSITORY_CHECKPOINT_MISMATCH",
      "Real execution refused: the administrative harness repository HEAD has changed since preparation.",
      { currentHead: harnessRepositoryCheckpoint.head, preparedHead: preparation.expected.harnessRepositoryHead });
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

  // Freshness rule: the prepared operation is valid only while Founder remains at the exact
  // prepared revision. No automatic retry, no silent re-resolution against a newer revision.
  const before = readStoreSnapshot(resolvedStorePath);
  if (before.store.revision !== preparation.expected.storeRevision) {
    throw new HarnessSafetyError("REAL_EXECUTION_STALE_REVISION",
      "Real execution refused: Founder revision has advanced since the preparation artifact was created. A fresh prepare/dry-run is required.",
      { preparedRevision: preparation.expected.storeRevision, currentRevision: before.store.revision });
  }
  if (!isMigrationControlSafe(migrationControl.state)) {
    throw new HarnessSafetyError("REAL_EXECUTION_MIGRATION_CONTROL_UNSAFE",
      "Real execution refused: migration control is not in the expected safe, inactive legacy-JSON state.",
      { migrationControlState: migrationControl.state });
  }
  if (!authorizationPath) {
    throw new HarnessSafetyError("REAL_EXECUTION_AUTHORIZATION_REQUIRED",
      "Real execution refused: no request-bound authorization was supplied.");
  }
  const authorization = readOperationalJsonFileSync(authorizationPath,
    { stage: "post_phase_2_harness_real_authorization" });
  if (authorization?.authorized !== true ||
      authorization.scope !== REAL_EXECUTION_AUTHORIZATION_SCOPE ||
      authorization.requestId !== preparation.requestId) {
    throw new HarnessSafetyError("REAL_EXECUTION_AUTHORIZATION_INVALID",
      "Real execution refused: authorization must have authorized=true, the exact reconciliation scope, and a requestId matching the prepared command.",
      { requiredScope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requiredRequestId: preparation.requestId });
  }
  const expectedConfirm = realExecutionConfirmationPhrase(preparation.requestId);
  if (confirmPhrase !== expectedConfirm) {
    throw new HarnessSafetyError("REAL_EXECUTION_CONFIRMATION_REQUIRED",
      `Real execution refused: --confirm must exactly equal: ${expectedConfirm}`);
  }

  const service = serviceModule.createPostPhase2CoreReconciliationService({
    runtimeStorePath: resolvedStorePath,
    liveStore: before.store,
    readMigrationControl: async () => migrationControl,
    now,
  });
  const result = await service.reconcile(preparation.command, { authorization });
  return Object.freeze({
    status: "real_execution_complete",
    harnessVersion: POST_PHASE_2_HARNESS_VERSION,
    mode: "real",
    resolvedAt: now().toISOString(),
    productionApplicationCheckpoint,
    harnessRepositoryCheckpoint,
    migrationControlState: migrationControl.state,
    preparationArtifactPath,
    preparation,
    command: preparation.command,
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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
    if (key === "--migration-control") { args.migrationControlPath = values[++index]; continue; }
    if (key === "--preparation-artifact") { args.preparationArtifactPath = values[++index]; continue; }
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
