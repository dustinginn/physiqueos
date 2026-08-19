import { createHash } from "node:crypto";
import { isCompatibilityShapedEnvironment } from "./compatibilityEnvironmentShape.js";

export const COMBINED_RUNTIME_AUTHORITY_SCHEMA_VERSION = "combined-runtime-authority-v1";

export const RuntimeAuthority = Object.freeze({
  WINDOWS_LEGACY: "windows-legacy-authoritative",
  CUTOVER_IN_PROGRESS: "combined-cutover-in-progress",
  PROVIDER_PREPARED: "provider-prepared",
  PROVIDER: "provider-authoritative",
  COMPATIBILITY: "provider-compatibility-nonauthoritative",
  RECOVERY_REQUIRED: "recovery-required",
});

export function createCompatibilityRuntimeAuthorityState({
  environment,
  providerSource,
  target,
  now = new Date().toISOString(),
} = {}) {
  requiredCompatibilityEnvironment(environment);
  requiredSource(providerSource, "providerSource");
  requiredTarget(target);
  requiredCompatibilityDatabase(target.databaseName);
  return freeze({
    schemaVersion: COMBINED_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    version: 1,
    environment,
    authority: RuntimeAuthority.COMPATIBILITY,
    publicRuntimeAuthority: "windows",
    migrationControlAuthority: "windows",
    workerAuthority: "compatibility",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "postgres",
    writesEnabled: false,
    readsEnabled: true,
    compatibilityWritesEnabled: true,
    productionWritesAllowed: false,
    combinedExecutionAllowed: false,
    migrationOperationId: null,
    authorizationFingerprint: null,
    fenceId: null,
    finalSnapshot: null,
    providerAcknowledgement: null,
    windowsSource: null,
    providerSource: sanitizeSource(providerSource),
    target: freeze(structuredClone(target)),
    routingTarget: null,
    firstProviderCanonicalWriteAt: null,
    firstProviderCommandId: null,
    createdAt: now,
    updatedAt: now,
    lastAction: "initialized-provider-compatibility",
    reason: "Isolated provider compatibility state is non-authoritative for production.",
  });
}

export const RuntimeAuthorityAction = Object.freeze({
  BEGIN_CUTOVER: "begin-combined-cutover",
  ACKNOWLEDGE_PROVIDER: "acknowledge-provider-prepared",
  TRANSFER_TO_PROVIDER: "transfer-to-provider",
  RECORD_FIRST_PROVIDER_WRITE: "record-first-provider-write",
  ABORT_TO_WINDOWS: "abort-to-windows",
  REQUIRE_RECOVERY: "require-provider-recovery",
});

export function createInitialCombinedRuntimeAuthorityState({
  environment,
  windowsSource,
  now = new Date().toISOString(),
} = {}) {
  required(environment, "environment");
  requiredSource(windowsSource, "windowsSource");
  return freeze({
    schemaVersion: COMBINED_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    version: 1,
    environment,
    authority: RuntimeAuthority.WINDOWS_LEGACY,
    publicRuntimeAuthority: "windows",
    migrationControlAuthority: "windows",
    workerAuthority: "windows",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "legacy-json",
    writesEnabled: true,
    readsEnabled: true,
    migrationOperationId: null,
    authorizationFingerprint: null,
    fenceId: null,
    finalSnapshot: null,
    providerAcknowledgement: null,
    windowsSource: sanitizeSource(windowsSource),
    providerSource: null,
    target: null,
    routingTarget: null,
    firstProviderCanonicalWriteAt: null,
    firstProviderCommandId: null,
    createdAt: now,
    updatedAt: now,
    lastAction: "initialized",
    reason: "Windows legacy JSON/file runtime remains authoritative.",
  });
}

export function applyCombinedRuntimeAuthorityTransition(current, command, {
  now = new Date().toISOString(),
} = {}) {
  validateCombinedRuntimeAuthorityState(current);
  validateCommand(current, command);
  const base = {
    ...current,
    version: current.version + 1,
    updatedAt: now,
    lastAction: command.action,
    reason: command.reason,
  };
  let next;

  switch (command.action) {
    case RuntimeAuthorityAction.BEGIN_CUTOVER:
      requireState(current.authority === RuntimeAuthority.WINDOWS_LEGACY, "Combined cutover requires Windows legacy authority.");
      requireState(current.writesEnabled === true, "Combined cutover cannot begin while legacy writes are already paused.");
      required(command.migrationOperationId, "migrationOperationId");
      requiredDigest(command.authorizationFingerprint, "authorizationFingerprint");
      required(command.fenceId, "fenceId");
      requiredSnapshot(command.finalSnapshot);
      requiredSource(command.providerSource, "providerSource");
      requiredTarget(command.target);
      next = {
        ...base,
        authority: RuntimeAuthority.CUTOVER_IN_PROGRESS,
        writesEnabled: false,
        migrationOperationId: command.migrationOperationId,
        authorizationFingerprint: command.authorizationFingerprint,
        fenceId: command.fenceId,
        finalSnapshot: freeze(structuredClone(command.finalSnapshot)),
        providerSource: sanitizeSource(command.providerSource),
        target: freeze(structuredClone(command.target)),
        routingTarget: command.routingTarget ?? null,
      };
      break;

    case RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER:
      requireState(current.authority === RuntimeAuthority.CUTOVER_IN_PROGRESS, "Provider acknowledgement requires combined cutover in progress.");
      assertSameOperation(current, command);
      requiredAcknowledgement(command.providerAcknowledgement, current);
      next = {
        ...base,
        authority: RuntimeAuthority.PROVIDER_PREPARED,
        migrationControlAuthority: "provider",
        workerAuthority: "paused",
        providerAcknowledgement: freeze(structuredClone(command.providerAcknowledgement)),
      };
      break;

    case RuntimeAuthorityAction.TRANSFER_TO_PROVIDER:
      requireState(current.authority === RuntimeAuthority.PROVIDER_PREPARED, "Authority transfer requires an acknowledged provider runtime.");
      assertSameOperation(current, command);
      requireState(current.firstProviderCanonicalWriteAt == null, "Provider authority cannot be transferred after an existing first-write boundary.");
      required(command.routingTarget ?? current.routingTarget, "routingTarget");
      next = {
        ...base,
        authority: RuntimeAuthority.PROVIDER,
        publicRuntimeAuthority: "provider",
        migrationControlAuthority: "provider",
        workerAuthority: "provider",
        canonicalStoreEpoch: "postgres-canonical",
        compositionMode: "postgres",
        writesEnabled: true,
        routingTarget: command.routingTarget ?? current.routingTarget,
      };
      break;

    case RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE:
      requireState(current.authority === RuntimeAuthority.PROVIDER, "First provider write requires provider authority.");
      requireState(current.canonicalStoreEpoch === "postgres-canonical" && current.compositionMode === "postgres", "First provider write requires PostgreSQL canonical composition.");
      assertSameOperation(current, command);
      required(command.commandId, "commandId");
      next = {
        ...base,
        firstProviderCanonicalWriteAt: current.firstProviderCanonicalWriteAt ?? now,
        firstProviderCommandId: current.firstProviderCommandId ?? command.commandId,
      };
      break;

    case RuntimeAuthorityAction.ABORT_TO_WINDOWS:
      requireState([RuntimeAuthority.CUTOVER_IN_PROGRESS, RuntimeAuthority.PROVIDER_PREPARED, RuntimeAuthority.PROVIDER].includes(current.authority), "Legacy abort requires an active combined cutover.");
      requireState(current.firstProviderCanonicalWriteAt == null, "Stale Windows rollback is forbidden after the first provider canonical write.");
      assertSameOperation(current, command);
      next = {
        ...base,
        authority: RuntimeAuthority.WINDOWS_LEGACY,
        publicRuntimeAuthority: "windows",
        migrationControlAuthority: "windows",
        workerAuthority: "windows",
        canonicalStoreEpoch: "legacy-json",
        compositionMode: "legacy-json",
        writesEnabled: true,
        readsEnabled: true,
        providerAcknowledgement: null,
      };
      break;

    case RuntimeAuthorityAction.REQUIRE_RECOVERY:
      requireState(current.authority === RuntimeAuthority.PROVIDER, "Recovery-required state requires provider authority.");
      requireState(current.firstProviderCanonicalWriteAt != null, "Recovery-required state requires the irreversible provider write boundary.");
      assertSameOperation(current, command);
      next = {
        ...base,
        authority: RuntimeAuthority.RECOVERY_REQUIRED,
        publicRuntimeAuthority: "provider",
        migrationControlAuthority: "provider",
        workerAuthority: "paused",
        canonicalStoreEpoch: "postgres-canonical",
        compositionMode: "postgres",
        writesEnabled: false,
        readsEnabled: true,
      };
      break;

    default:
      throw authorityError("RUNTIME_AUTHORITY_ACTION_UNKNOWN", `Unknown runtime-authority action: ${command.action ?? "missing"}.`);
  }

  validateCombinedRuntimeAuthorityState(next);
  return freeze(next);
}

export function validateCombinedRuntimeAuthorityState(value) {
  if (!value || value.schemaVersion !== COMBINED_RUNTIME_AUTHORITY_SCHEMA_VERSION) {
    throw authorityError("RUNTIME_AUTHORITY_INVALID", "Runtime-authority state has an unsupported schema.");
  }
  if (!Number.isSafeInteger(value.version) || value.version < 1) {
    throw authorityError("RUNTIME_AUTHORITY_INVALID", "Runtime-authority version is invalid.");
  }
  if (!Object.values(RuntimeAuthority).includes(value.authority)) {
    throw authorityError("RUNTIME_AUTHORITY_INVALID", "Runtime authority is unknown.");
  }
  if (value.authority === RuntimeAuthority.WINDOWS_LEGACY) {
    requireState(value.publicRuntimeAuthority === "windows", "Windows authority requires Windows public routing.");
    requireState(value.canonicalStoreEpoch === "legacy-json" && value.compositionMode === "legacy-json", "Windows authority requires legacy canonical persistence.");
  }
  if (value.authority === RuntimeAuthority.COMPATIBILITY) {
    assertCompatibilityRuntimeAuthorityState(value);
  }
  if ([RuntimeAuthority.PROVIDER, RuntimeAuthority.RECOVERY_REQUIRED].includes(value.authority)) {
    requireState(value.publicRuntimeAuthority === "provider", "Provider authority requires provider public routing.");
    requireState(value.migrationControlAuthority === "provider", "Provider authority requires provider migration control.");
    requireState(value.canonicalStoreEpoch === "postgres-canonical" && value.compositionMode === "postgres", "Provider authority requires PostgreSQL canonical persistence.");
  }
  if (value.firstProviderCanonicalWriteAt != null) {
    requireState(value.publicRuntimeAuthority === "provider", "A provider write boundary permanently forbids Windows public authority.");
    requireState(value.canonicalStoreEpoch === "postgres-canonical", "A provider write boundary permanently binds PostgreSQL canonical persistence.");
  }
  if (value.authority === RuntimeAuthority.RECOVERY_REQUIRED) {
    requireState(value.writesEnabled === false && value.workerAuthority === "paused", "Recovery-required state must pause writes and worker effects.");
  }
  return value;
}

export function assertCompatibilityRuntimeAuthorityState(value, {
  environment = value?.environment,
  databaseName = value?.target?.databaseName,
} = {}) {
  if (!value || value.schemaVersion !== COMBINED_RUNTIME_AUTHORITY_SCHEMA_VERSION || value.authority !== RuntimeAuthority.COMPATIBILITY) {
    throw authorityError("RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED", "Provider compatibility requires the explicit non-authoritative compatibility state.");
  }
  requiredCompatibilityEnvironment(environment);
  requireState(value.environment === environment, "Compatibility authority environment does not match the configured environment.");
  requiredCompatibilityDatabase(databaseName);
  requireState(value.target?.databaseName === databaseName, "Compatibility authority database does not match the configured database.");
  requireState(value.publicRuntimeAuthority === "windows", "Compatibility state cannot own public routing.");
  requireState(value.migrationControlAuthority === "windows", "Compatibility state cannot own production migration control.");
  requireState(value.workerAuthority === "compatibility", "Compatibility state requires compatibility-scoped worker authority.");
  requireState(value.canonicalStoreEpoch === "legacy-json", "Compatibility state must preserve the production legacy canonical epoch.");
  requireState(value.compositionMode === "postgres", "Compatibility state uses only the isolated PostgreSQL composition.");
  requireState(value.writesEnabled === false && value.productionWritesAllowed === false, "Compatibility state cannot enable production writes.");
  requireState(value.readsEnabled === true && value.compatibilityWritesEnabled === true, "Compatibility state must explicitly enable isolated compatibility access.");
  requireState(value.combinedExecutionAllowed === false, "Compatibility state cannot execute a combined cutover.");
  requireState(value.migrationOperationId == null && value.authorizationFingerprint == null && value.fenceId == null, "Compatibility state cannot bind a production migration operation.");
  requireState(value.finalSnapshot == null && value.providerAcknowledgement == null && value.routingTarget == null, "Compatibility state cannot carry production handoff evidence.");
  requireState(value.firstProviderCanonicalWriteAt == null && value.firstProviderCommandId == null, "Compatibility state cannot record a provider production write boundary.");
  return value;
}

export function combinedRuntimeAuthorityCommandFingerprint(command) {
  return createHash("sha256").update(stableJson({
    action: command.action,
    expectedVersion: command.expectedVersion,
    migrationOperationId: command.migrationOperationId ?? null,
    authorizationFingerprint: command.authorizationFingerprint ?? null,
    fenceId: command.fenceId ?? null,
    finalSnapshot: command.finalSnapshot ?? null,
    providerAcknowledgement: command.providerAcknowledgement ?? null,
    providerSource: command.providerSource ?? null,
    target: command.target ?? null,
    routingTarget: command.routingTarget ?? null,
    commandId: command.commandId ?? null,
    reason: command.reason,
  })).digest("hex");
}

function validateCommand(current, command = {}) {
  required(command.action, "action");
  required(command.reason, "reason");
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== current.version) {
    throw authorityError("RUNTIME_AUTHORITY_VERSION_CONFLICT", "Runtime-authority expected version does not match current state.");
  }
}

function requiredSnapshot(value) {
  if (!value || typeof value !== "object") throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", "finalSnapshot is required.");
  for (const field of ["runtimeSha256", "runtimeRevision", "mediaInventorySha256", "migrationControlSha256", "packageDigest"]) {
    required(value[field], `finalSnapshot.${field}`);
  }
}

function requiredDigest(value, field) {
  if (!/^[a-f0-9]{64}$/i.test(String(value ?? ""))) {
    throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", `${field} must be a SHA-256 digest.`);
  }
}

function requiredAcknowledgement(value, current) {
  if (!value || typeof value !== "object") throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", "providerAcknowledgement is required.");
  for (const field of ["migrationOperationId", "authorizationFingerprint", "fenceId", "packageDigest", "providerDeploymentId"]) {
    required(value[field], `providerAcknowledgement.${field}`);
  }
  const expected = {
    migrationOperationId: current.migrationOperationId,
    authorizationFingerprint: current.authorizationFingerprint,
    fenceId: current.fenceId,
    packageDigest: current.finalSnapshot.packageDigest,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (String(value[field]) !== String(expectedValue)) {
      throw authorityError("RUNTIME_AUTHORITY_ACKNOWLEDGEMENT_MISMATCH", `Provider acknowledgement does not match ${field}.`);
    }
  }
}

function requiredTarget(value) {
  if (!value || typeof value !== "object") throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", "target is required.");
  for (const field of ["databaseClusterId", "databaseName", "spacesBucket"]) required(value[field], `target.${field}`);
}

function requiredCompatibilityEnvironment(value) {
  required(value, "environment");
  if (!isCompatibilityShapedEnvironment(value)) {
    throw authorityError("RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED", "Compatibility authority requires an explicit compatibility environment.");
  }
}

function requiredCompatibilityDatabase(value) {
  if (!/^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/.test(String(value ?? ""))) {
    throw authorityError("RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED", "Compatibility authority requires an isolated Phase 5 provider database.");
  }
}

function requiredSource(value, field) {
  if (!value || typeof value !== "object") throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", `${field} is required.`);
  required(value.commit, `${field}.commit`);
  required(value.buildId, `${field}.buildId`);
}

function sanitizeSource(value) {
  return freeze({ commit: String(value.commit), buildId: String(value.buildId) });
}

function assertSameOperation(current, command) {
  if (String(command.migrationOperationId ?? "") !== String(current.migrationOperationId ?? "")) {
    throw authorityError("RUNTIME_AUTHORITY_OPERATION_CONFLICT", "Runtime-authority operation does not match the active combined cutover.");
  }
}

function required(value, field) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", `${field} is required.`);
  }
  if (!String(value).trim()) throw authorityError("RUNTIME_AUTHORITY_INPUT_INVALID", `${field} is required.`);
}

function requireState(condition, message) {
  if (!condition) throw authorityError("RUNTIME_AUTHORITY_TRANSITION_REJECTED", message);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function freeze(value) { return Object.freeze(value); }

function authorityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
