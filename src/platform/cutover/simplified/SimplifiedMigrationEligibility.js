import { MigrationFenceState } from "../migrationControlState.js";

export const SIMPLIFIED_MIGRATION_MODE = "single-user-cold-backup-v1";
export const SIMPLIFIED_PROVIDER_EXECUTION_BOUNDARY = "digitalocean-app-platform";

export function assertSimplifiedProviderExecutionBoundary(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY !== SIMPLIFIED_PROVIDER_EXECUTION_BOUNDARY
    || env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1"
    || env.PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED !== "1") {
    fail("SIMPLIFIED_PROVIDER_EXECUTION_BOUNDARY_REQUIRED", "Simplified production migration must execute in the enabled DigitalOcean App Platform full-runtime boundary.");
  }
  return true;
}

export const SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS = Object.freeze([
  "000001_shared_platform_foundation",
  "000002_phase2_platform_operations",
  "000003_phase4_canonical_domains",
  "000004_phase5_provider_readiness",
  "000005_combined_runtime_authority",
  "000006_combined_cutover_transfer_staging",
  "000007_combined_cutover_preparation_evidence",
  "000008_combined_cutover_handoff_receipts",
  "000009_combined_cutover_handoff_recovery_evidence",
  "000010_combined_cutover_handoff_worker_evidence",
]);

export function assertSimplifiedFrozenSource({
  control,
  operationId,
  expectedRuntimeRevision,
  actualRuntimeRevision,
  expectedRuntimeSha256,
  actualRuntimeSha256,
  expectedControlSha256,
  actualControlSha256,
  expectedBackupInventorySha256,
  actualBackupInventorySha256,
  expectedSourceCommit,
  actualSourceCommit,
} = {}) {
  exact(String(actualRuntimeRevision), String(expectedRuntimeRevision), "runtime revision");
  digestExact(actualRuntimeSha256, expectedRuntimeSha256, "runtime SHA-256");
  digestExact(actualControlSha256, expectedControlSha256, "migration-control SHA-256");
  digestExact(actualBackupInventorySha256, expectedBackupInventorySha256, "final backup inventory SHA-256");
  commitExact(actualSourceCommit, expectedSourceCommit, "frozen source commit");
  assertSimplifiedRestartableControl(control, { operationId });
  return true;
}

export function assertSimplifiedRestartableControl(state, { operationId } = {}) {
  const expected = {
    schemaVersion: "production-migration-control-v1",
    environment: "production",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "legacy-json",
    canonicalStoreTarget: "legacy-json",
    writesEnabled: true,
    readsEnabled: true,
    firstPostgresWriteAt: null,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (state?.[field] !== value) fail("SIMPLIFIED_CONTROL_STATE_REJECTED", `Frozen migration control ${field} is not eligible.`);
  }
  if (state.fenceState === MigrationFenceState.INACTIVE) {
    for (const field of ["fenceId", "migrationOperationId", "expectedMigrationId"]) {
      if (state[field] != null) fail("SIMPLIFIED_CONTROL_STATE_REJECTED", `Inactive migration control unexpectedly retains ${field}.`);
    }
    return true;
  }
  if (state.fenceState !== MigrationFenceState.ABORTED) {
    fail("SIMPLIFIED_CONTROL_STATE_REJECTED", "Frozen migration control is neither pristine inactive nor a completed pre-write abort.");
  }
  for (const field of ["fenceId", "migrationOperationId", "expectedMigrationId", "abortedAt", "releasedAt"]) {
    if (!String(state[field] ?? "").trim()) fail("SIMPLIFIED_CONTROL_STATE_REJECTED", `Aborted migration control is missing ${field}.`);
  }
  if (state.migrationOperationId === operationId) {
    fail("SIMPLIFIED_CONTROL_OPERATION_REUSED", "The simplified migration must use a new operation after the prior abort.");
  }
  if (state.currentStep !== "aborted-to-legacy" || state.lastTransition !== "abort-to-legacy") {
    fail("SIMPLIFIED_CONTROL_STATE_REJECTED", "Aborted migration control does not record a completed abort-to-legacy transition.");
  }
  if (state.abortedAt !== state.releasedAt || !validInstant(state.abortedAt)) {
    fail("SIMPLIFIED_CONTROL_STATE_REJECTED", "Aborted migration control does not have an unambiguous release instant.");
  }
  return true;
}

export function assertSimplifiedSchema(migrationNames) {
  if (!Array.isArray(migrationNames)) fail("SIMPLIFIED_SCHEMA_REJECTED", "Provider schema inventory is unavailable.");
  const required = SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS;
  const missing = required.filter((name) => !migrationNames.includes(name));
  const unexpected = migrationNames.filter((name) => !required.includes(name));
  if (missing.length) fail("SIMPLIFIED_SCHEMA_REJECTED", `Provider schema is missing ${missing[0]}.`);
  if (unexpected.length) fail("SIMPLIFIED_SCHEMA_REJECTED", `Provider schema contains incompatible migration ${unexpected[0]}.`);
  if (migrationNames.length !== required.length || migrationNames.some((name, index) => name !== required[index])) {
    fail("SIMPLIFIED_SCHEMA_REJECTED", "Provider schema migration order does not match 000001 through 000010.");
  }
  return true;
}

export function assertSimplifiedDisposableTarget({
  authorityStates = [],
  firstWriteMarkers = [],
  founderScopedRowCount,
  founderSpaceObjectCount,
  syntheticUserCount,
  nonSyntheticUserCount,
  syntheticDataDistinguishable,
  primaryKeyCollisionCount,
  outbox = {},
} = {}) {
  const acceptedNonProviderAuthorities = new Set(["provider-compatibility-nonauthoritative", "windows-legacy-authoritative"]);
  if (authorityStates.some((value) => !acceptedNonProviderAuthorities.has(value))) {
    fail("SIMPLIFIED_TARGET_AUTHORITY_REJECTED", "Provider target already contains production authority state.");
  }
  if (firstWriteMarkers.some((value) => value != null)) {
    fail("SIMPLIFIED_TARGET_FIRST_WRITE_REJECTED", "Provider target has crossed a canonical first-write boundary.");
  }
  if (Number(founderScopedRowCount) !== 0 || Number(founderSpaceObjectCount) !== 0 || Number(nonSyntheticUserCount) !== 0) {
    fail("SIMPLIFIED_TARGET_FOUNDER_DATA_REJECTED", "Provider target contains pre-existing Founder-scoped data.");
  }
  if (Number(syntheticUserCount) < 0 || syntheticDataDistinguishable !== true || Number(primaryKeyCollisionCount) !== 0) {
    fail("SIMPLIFIED_TARGET_SYNTHETIC_DATA_REJECTED", "Provider rehearsal data is not safely distinguishable from the Founder import.");
  }
  if (Number(outbox.failed ?? 0) !== 0 || Number(outbox.dead ?? 0) !== 0 || Number(outbox.expiredLeases ?? 0) !== 0) {
    fail("SIMPLIFIED_TARGET_OUTBOX_REJECTED", "Provider outbox has a failed/dead command or expired processing lease.");
  }
  return Object.freeze({
    ready: true,
    status: "PASS",
    kind: "simplified-empty-nonauthoritative-target",
    managedTargetBackupRequired: false,
    reason: "Only distinguishable rehearsal data exists; the verified frozen Windows backup is the rollback source.",
  });
}

function validInstant(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function exact(actual, expected, field) { if (actual !== expected) fail("SIMPLIFIED_SOURCE_IDENTITY_MISMATCH", `${field} does not match the accepted frozen source.`); }
function digestExact(actual, expected, field) {
  const left = String(actual ?? "").toLowerCase();
  const right = String(expected ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(left) || left !== right) fail("SIMPLIFIED_SOURCE_IDENTITY_MISMATCH", `${field} does not match the accepted frozen source.`);
}
function commitExact(actual, expected, field) {
  const left = String(actual ?? "").toLowerCase();
  const right = String(expected ?? "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(left) || left !== right) fail("SIMPLIFIED_SOURCE_IDENTITY_MISMATCH", `${field} does not match the accepted frozen source.`);
}
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
