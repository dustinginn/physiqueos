import { createHash, randomUUID } from "node:crypto";

export const MIGRATION_CONTROL_SCHEMA_VERSION = "production-migration-control-v1";

export const MigrationFenceState = Object.freeze({
  INACTIVE: "inactive",
  ACTIVE: "active",
  CUTOVER_IN_PROGRESS: "cutover-in-progress",
  COMPLETED: "completed",
  ABORTED: "aborted",
  RECOVERY_REQUIRED: "recovery-required",
});

export const CanonicalStoreEpoch = Object.freeze({
  LEGACY_JSON: "legacy-json",
  MIGRATION_FENCE: "migration-fence",
  POSTGRES_CANONICAL: "postgres-canonical",
});

export const CanonicalCompositionMode = Object.freeze({
  LEGACY_JSON: "legacy-json",
  POSTGRES: "postgres",
});

export const MigrationControlAction = Object.freeze({
  ACTIVATE_FENCE: "activate-fence",
  BEGIN_CUTOVER: "begin-cutover",
  SWITCH_TO_POSTGRES: "switch-to-postgres",
  RECORD_FIRST_POSTGRES_WRITE: "record-first-postgres-write",
  RELEASE_FENCE: "release-fence",
  ABORT_TO_LEGACY: "abort-to-legacy",
  REQUIRE_RECOVERY: "require-recovery",
});

const RESTARTABLE_STATES = new Set([
  MigrationFenceState.INACTIVE,
  MigrationFenceState.ABORTED,
  MigrationFenceState.COMPLETED,
]);

export function createInitialMigrationControlState({
  environment,
  operator,
  sourceIdentity,
  now = new Date().toISOString(),
} = {}) {
  requiredIdentity(environment, "environment");
  requiredIdentity(operator, "operator");
  return freeze({
    schemaVersion: MIGRATION_CONTROL_SCHEMA_VERSION,
    version: 1,
    environment,
    fenceId: null,
    migrationOperationId: null,
    expectedMigrationId: null,
    correlationId: null,
    commandId: null,
    fenceState: MigrationFenceState.INACTIVE,
    canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
    compositionMode: CanonicalCompositionMode.LEGACY_JSON,
    canonicalStoreTarget: CanonicalCompositionMode.LEGACY_JSON,
    writesEnabled: true,
    readsEnabled: true,
    createdAt: now,
    activatedAt: null,
    releasedAt: null,
    abortedAt: null,
    firstPostgresWriteAt: null,
    currentStep: "legacy-runtime-active",
    backupPreflightState: "not-verified",
    migrationTargetReadiness: "unknown",
    reason: "Migration control initialized with legacy JSON/file canonical.",
    lastOperator: operator,
    lastTransition: "initialized",
    updatedAt: now,
    sourceIdentity: sanitizeSourceIdentity(sourceIdentity),
    auditMetadata: {},
  });
}

export function applyMigrationControlTransition(current, command, {
  now = new Date().toISOString(),
  createFenceId = () => randomUUID(),
} = {}) {
  validateMigrationControlState(current);
  validateCommand(current, command);
  const base = {
    ...current,
    version: current.version + 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    lastOperator: command.operator,
    reason: command.reason,
    lastTransition: command.action,
    updatedAt: now,
    sourceIdentity: sanitizeSourceIdentity(command.sourceIdentity ?? current.sourceIdentity),
    auditMetadata: sanitizeAuditMetadata(command.auditMetadata),
  };

  let next;
  switch (command.action) {
    case MigrationControlAction.ACTIVATE_FENCE:
      assertState(RESTARTABLE_STATES.has(current.fenceState), "Fence activation requires an inactive, aborted, or completed control state.");
      assertState(current.canonicalStoreEpoch === CanonicalStoreEpoch.LEGACY_JSON, "Fence activation requires the legacy JSON epoch.");
      assertState(current.compositionMode === CanonicalCompositionMode.LEGACY_JSON, "Fence activation requires the legacy JSON composition.");
      next = {
        ...base,
        fenceId: command.fenceId ?? createFenceId(),
        migrationOperationId: command.migrationOperationId,
        expectedMigrationId: command.expectedMigrationId,
        fenceState: MigrationFenceState.ACTIVE,
        canonicalStoreEpoch: CanonicalStoreEpoch.MIGRATION_FENCE,
        canonicalStoreTarget: CanonicalCompositionMode.LEGACY_JSON,
        compositionMode: CanonicalCompositionMode.LEGACY_JSON,
        writesEnabled: false,
        readsEnabled: true,
        activatedAt: now,
        releasedAt: null,
        abortedAt: null,
        firstPostgresWriteAt: null,
        currentStep: "write-fence-active",
        backupPreflightState: command.backupPreflightState ?? "verified",
        migrationTargetReadiness: command.migrationTargetReadiness ?? "ready",
      };
      break;
    case MigrationControlAction.BEGIN_CUTOVER:
      assertState(current.fenceState === MigrationFenceState.ACTIVE, "Cutover may begin only from an active fence.");
      assertSameOperation(current, command);
      next = { ...base, fenceState: MigrationFenceState.CUTOVER_IN_PROGRESS, currentStep: command.step ?? "final-source-capture" };
      break;
    case MigrationControlAction.SWITCH_TO_POSTGRES:
      assertState(current.fenceState === MigrationFenceState.CUTOVER_IN_PROGRESS, "Composition may switch only while cutover is in progress.");
      assertState(current.canonicalStoreEpoch === CanonicalStoreEpoch.MIGRATION_FENCE, "Composition switch requires the migration-fence epoch.");
      assertState(current.firstPostgresWriteAt == null, "Composition cannot switch after a PostgreSQL first-write boundary already exists.");
      assertSameOperation(current, command);
      next = {
        ...base,
        canonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES_CANONICAL,
        canonicalStoreTarget: CanonicalCompositionMode.POSTGRES,
        compositionMode: CanonicalCompositionMode.POSTGRES,
        writesEnabled: false,
        currentStep: "postgres-composition-selected",
      };
      break;
    case MigrationControlAction.RECORD_FIRST_POSTGRES_WRITE:
      assertState(current.fenceState === MigrationFenceState.CUTOVER_IN_PROGRESS, "The first PostgreSQL write boundary requires cutover in progress.");
      assertState(current.canonicalStoreEpoch === CanonicalStoreEpoch.POSTGRES_CANONICAL, "The first PostgreSQL write boundary requires the PostgreSQL epoch.");
      assertState(current.compositionMode === CanonicalCompositionMode.POSTGRES, "The first PostgreSQL write boundary requires PostgreSQL composition.");
      assertSameOperation(current, command);
      next = { ...base, firstPostgresWriteAt: current.firstPostgresWriteAt ?? now, currentStep: "postgres-first-write-recorded" };
      break;
    case MigrationControlAction.RELEASE_FENCE:
      assertSameOperation(current, command);
      next = releaseFence(current, base, command, now);
      break;
    case MigrationControlAction.ABORT_TO_LEGACY:
      assertState([MigrationFenceState.ACTIVE, MigrationFenceState.CUTOVER_IN_PROGRESS].includes(current.fenceState), "Abort requires an active migration fence.");
      assertState(current.firstPostgresWriteAt == null, "Automatic legacy abort is forbidden after the first PostgreSQL canonical write.");
      assertSameOperation(current, command);
      next = {
        ...base,
        fenceState: MigrationFenceState.ABORTED,
        canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
        canonicalStoreTarget: CanonicalCompositionMode.LEGACY_JSON,
        compositionMode: CanonicalCompositionMode.LEGACY_JSON,
        writesEnabled: true,
        readsEnabled: true,
        abortedAt: now,
        releasedAt: now,
        currentStep: "aborted-to-legacy",
      };
      break;
    case MigrationControlAction.REQUIRE_RECOVERY:
      assertState(current.canonicalStoreEpoch === CanonicalStoreEpoch.POSTGRES_CANONICAL, "Recovery-required state is reserved for the PostgreSQL canonical epoch.");
      assertState(current.firstPostgresWriteAt != null, "Recovery-required state requires a recorded PostgreSQL canonical write.");
      assertSameOperation(current, command);
      next = {
        ...base,
        fenceState: MigrationFenceState.RECOVERY_REQUIRED,
        canonicalStoreTarget: CanonicalCompositionMode.POSTGRES,
        compositionMode: CanonicalCompositionMode.POSTGRES,
        writesEnabled: false,
        readsEnabled: true,
        currentStep: "forward-repair-required",
      };
      break;
    default:
      throw controlError("MIGRATION_CONTROL_ACTION_UNKNOWN", `Unknown migration-control action: ${command.action ?? "missing"}.`);
  }
  validateMigrationControlState(next);
  return freeze(next);
}

export function validateMigrationControlState(value) {
  if (!value || value.schemaVersion !== MIGRATION_CONTROL_SCHEMA_VERSION) {
    throw controlError("MIGRATION_CONTROL_INVALID", "Migration-control state has an unsupported schema.");
  }
  if (!Number.isSafeInteger(value.version) || value.version < 1) {
    throw controlError("MIGRATION_CONTROL_INVALID", "Migration-control version is invalid.");
  }
  if (!Object.values(MigrationFenceState).includes(value.fenceState)) {
    throw controlError("MIGRATION_CONTROL_INVALID", "Migration fence state is unknown.");
  }
  if (!Object.values(CanonicalStoreEpoch).includes(value.canonicalStoreEpoch)) {
    throw controlError("MIGRATION_CONTROL_INVALID", "Canonical-store epoch is unknown.");
  }
  if (!Object.values(CanonicalCompositionMode).includes(value.compositionMode)) {
    throw controlError("MIGRATION_CONTROL_INVALID", "Canonical composition mode is unknown.");
  }
  if (value.writesEnabled && value.fenceState === MigrationFenceState.RECOVERY_REQUIRED) {
    throw controlError("MIGRATION_CONTROL_INVALID", "Recovery-required state must fail closed for writes.");
  }
  if (value.compositionMode === CanonicalCompositionMode.POSTGRES && value.canonicalStoreEpoch !== CanonicalStoreEpoch.POSTGRES_CANONICAL) {
    throw controlError("MIGRATION_CONTROL_INVALID", "PostgreSQL composition requires the PostgreSQL canonical epoch.");
  }
  return value;
}

export function migrationCommandFingerprint(command) {
  const value = {
    action: command.action,
    expectedVersion: command.expectedVersion,
    expectedFenceState: command.expectedFenceState,
    expectedCanonicalStoreEpoch: command.expectedCanonicalStoreEpoch,
    expectedCompositionMode: command.expectedCompositionMode,
    migrationOperationId: command.migrationOperationId,
    expectedMigrationId: command.expectedMigrationId,
    expectedCanonicalStoreOutcome: command.expectedCanonicalStoreOutcome,
    reason: command.reason,
  };
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function releaseFence(current, base, command, now) {
  const outcome = command.expectedCanonicalStoreOutcome;
  if (outcome === CanonicalCompositionMode.LEGACY_JSON) {
    assertState(current.firstPostgresWriteAt == null, "Legacy release is forbidden after the first PostgreSQL canonical write.");
    assertState(current.compositionMode === CanonicalCompositionMode.LEGACY_JSON, "Legacy release requires legacy composition.");
    return {
      ...base,
      fenceState: MigrationFenceState.ABORTED,
      canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
      canonicalStoreTarget: CanonicalCompositionMode.LEGACY_JSON,
      compositionMode: CanonicalCompositionMode.LEGACY_JSON,
      writesEnabled: true,
      readsEnabled: true,
      releasedAt: now,
      abortedAt: now,
      currentStep: "legacy-writes-released",
    };
  }
  assertState(outcome === CanonicalCompositionMode.POSTGRES, "Fence release requires an explicit canonical-store outcome.");
  assertState(current.fenceState === MigrationFenceState.CUTOVER_IN_PROGRESS, "PostgreSQL release requires cutover in progress.");
  assertState(current.canonicalStoreEpoch === CanonicalStoreEpoch.POSTGRES_CANONICAL, "PostgreSQL release requires the PostgreSQL epoch.");
  assertState(current.compositionMode === CanonicalCompositionMode.POSTGRES, "PostgreSQL release requires PostgreSQL composition.");
  assertState(current.firstPostgresWriteAt != null, "PostgreSQL release requires the recorded first canonical write boundary.");
  return {
    ...base,
    fenceState: MigrationFenceState.COMPLETED,
    canonicalStoreTarget: CanonicalCompositionMode.POSTGRES,
    writesEnabled: true,
    readsEnabled: true,
    releasedAt: now,
    currentStep: "stabilization",
  };
}

function validateCommand(current, command = {}) {
  requiredIdentity(command.commandId, "commandId");
  requiredIdentity(command.correlationId, "correlationId");
  requiredIdentity(command.operator, "operator");
  requiredIdentity(command.reason, "reason");
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== current.version) {
    throw controlError("MIGRATION_CONTROL_VERSION_CONFLICT", "Migration-control expected version does not match current state.");
  }
  if (command.expectedFenceState !== current.fenceState) {
    throw controlError("MIGRATION_CONTROL_STATE_CONFLICT", "Migration-control expected fence state does not match current state.");
  }
  if (command.expectedCanonicalStoreEpoch !== current.canonicalStoreEpoch) {
    throw controlError("CANONICAL_STORE_EPOCH_CONFLICT", "Expected canonical-store epoch does not match current state.");
  }
  if (command.expectedCompositionMode !== current.compositionMode) {
    throw controlError("CANONICAL_COMPOSITION_CONFLICT", "Expected composition mode does not match current state.");
  }
  if (command.action === MigrationControlAction.ACTIVATE_FENCE) {
    requiredIdentity(command.migrationOperationId, "migrationOperationId");
    requiredIdentity(command.expectedMigrationId, "expectedMigrationId");
  }
}

function assertSameOperation(current, command) {
  if (command.migrationOperationId !== current.migrationOperationId) {
    throw controlError("MIGRATION_OPERATION_CONFLICT", "Migration operation does not match the active fence.");
  }
}

function requiredIdentity(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw controlError("MIGRATION_CONTROL_INPUT_INVALID", `${field} is required.`);
  }
}

function assertState(condition, message) {
  if (!condition) throw controlError("MIGRATION_CONTROL_TRANSITION_REJECTED", message);
}

function sanitizeSourceIdentity(value = {}) {
  return freeze({
    commit: value?.commit == null ? null : String(value.commit),
    buildId: value?.buildId == null ? null : String(value.buildId),
  });
}

function sanitizeAuditMetadata(value = {}) {
  const allowed = ["approvalId", "ticketId", "backupManifestDigest", "sourceRuntimeSha256", "sourceRuntimeRevision"];
  return freeze(Object.fromEntries(allowed.filter((key) => value?.[key] != null).map((key) => [key, String(value[key])])));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function freeze(value) {
  return Object.freeze(value);
}

function controlError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
