import { createProductionMigrationOrchestrator } from "./ProductionMigrationOrchestrator.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch, MigrationFenceState } from "./migrationControlState.js";
import { assertManagedPostgresBackupFreshness } from "../backup/DigitalOceanManagedPostgresBackupFreshness.js";

// A fresh production migration may begin from exactly two control states: the pristine
// INACTIVE state, and the state left behind by a completed pre-write ABORT_TO_LEGACY.
// The control state machine already treats ABORTED as restartable, but the production
// runner previously demanded INACTIVE, so its own safe abort path produced a state it
// could never re-enter. This set is deliberately narrower than the state machine's
// RESTARTABLE_STATES: COMPLETED (a finished cutover) and RECOVERY_REQUIRED (forward
// repair owed) must never be restartable from the production runner.
const RESTARTABLE_PRE_FENCE_STATES = new Set([
  MigrationFenceState.INACTIVE,
  MigrationFenceState.ABORTED,
]);

export function createProductionMigrationRunner({
  controlStore,
  adapters,
  backupFreshnessVerifier,
  now = () => new Date(),
  monotonicNow,
  maximumFenceDurationMs,
} = {}) {
  if (!controlStore?.read || !controlStore?.transition) throw new Error("Production migration runner requires durable control.");
  if (typeof backupFreshnessVerifier?.verify !== "function") throw new Error("Production migration runner requires independent backup verification.");
  const wrappedAdapters = {
    ...adapters,
    inspectBuildIdentity: async (context) => {
      const result = await adapters.inspectBuildIdentity(context);
      const identity = result?.identity ?? {};
      exact(identity.commit, context.input.expectedSourceCommit, "source commit");
      exact(identity.buildId, context.input.expectedBuildId, "application build ID");
      exact(result?.repositoryCommit ?? identity.commit, context.input.expectedSourceCommit, "repository commit");
      exact(result?.migrationScriptCommit ?? identity.commit, context.input.expectedSourceCommit, "migration script commit");
      return ready(result, { identity });
    },
    inspectCanonicalSource: async (context) => {
      const result = await adapters.inspectCanonicalSource(context);
      exact(String(result.runtimeRevision), String(context.input.expectedRuntimeRevision), "Founder runtime revision");
      exact(String(result.runtimeSha256).toLowerCase(), String(context.input.expectedRuntimeSha256).toLowerCase(), "Founder runtime hash");
      return ready(result);
    },
    verifyBackup: async (context) => {
      const [recovery, freshness] = await Promise.all([
        adapters.verifyBackup(context),
        backupFreshnessVerifier.verify(),
      ]);
      assertManagedPostgresBackupFreshness(freshness);
      return ready(recovery, { managedPostgres: freshness });
    },
    verifyMigrationScripts: async (context) => {
      const result = await adapters.verifyMigrationScripts(context);
      if (result.productionRunnerWired !== true || result.providerCompositionWired !== true) {
        throw runnerError("PRODUCTION_MIGRATION_WIRING_INCOMPLETE", "Production runner/provider composition wiring is incomplete.");
      }
      return ready(result);
    },
  };
  const orchestrator = createProductionMigrationOrchestrator({
    controlStore,
    adapters: wrappedAdapters,
    now,
    ...(monotonicNow ? { monotonicNow } : {}),
    ...(maximumFenceDurationMs ? { maximumFenceDurationMs } : {}),
  });

  return Object.freeze({
    async dryRun(input) {
      const validated = validateInput(input, { execution: false });
      const controlBefore = controlStore.read().state;
      assertExpectedControl(controlBefore, validated);
      const result = await orchestrator.dryRun(validated);
      const controlAfter = controlStore.read().state;
      if (JSON.stringify(controlAfter) !== JSON.stringify(controlBefore)) {
        throw runnerError("DRY_RUN_MUTATED_CONTROL", "Production runner dry-run changed migration control.");
      }
      return Object.freeze({
        ...result,
        finalMigrationAuthorizationSupplied: false,
        finalMigrationAuthorizationRequired: true,
      });
    },
    async execute(input) {
      const validated = validateInput(input, { execution: true });
      assertExpectedControl(controlStore.read().state, validated);
      return orchestrator.execute({ ...validated, mode: "production", productionAuthorization: true });
    },
    expectedAuthorization(input) {
      return authorizationPhrase(validateInput(input, { execution: false, allowAuthorization: true }));
    },
  });
}

function validateInput(input = {}, { execution, allowAuthorization = false } = {}) {
  const value = {
    operator: required(input.operator, "operator"),
    migrationOperationId: required(input.migrationOperationId, "migrationOperationId"),
    expectedMigrationId: required(input.expectedMigrationId, "expectedMigrationId"),
    correlationId: required(input.correlationId, "correlationId"),
    commandPrefix: required(input.commandPrefix, "commandPrefix"),
    reason: required(input.reason, "reason"),
    expectedSourceCommit: commit(input.expectedSourceCommit, "expectedSourceCommit"),
    expectedBuildId: required(input.expectedBuildId, "expectedBuildId"),
    expectedRuntimeRevision: required(input.expectedRuntimeRevision, "expectedRuntimeRevision"),
    expectedRuntimeSha256: sha256(input.expectedRuntimeSha256),
    expectedControlVersion: integer(input.expectedControlVersion, "expectedControlVersion"),
    auditMetadata: input.auditMetadata ?? {},
  };
  if (execution) {
    const expected = authorizationPhrase(value);
    if (input.finalMigrationAuthorization !== expected) {
      throw runnerError("FINAL_MIGRATION_AUTHORIZATION_REQUIRED", "Execution requires the exact separately supplied final migration authorization.");
    }
  } else if (!allowAuthorization && input.finalMigrationAuthorization != null) {
    throw runnerError("DRY_RUN_AUTHORIZATION_REJECTED", "Dry-run must not carry final migration authorization.");
  }
  return Object.freeze(value);
}

function assertExpectedControl(state, input) {
  // Invariants that must hold for every restartable pre-fence state. canonicalStoreTarget
  // is asserted alongside the epoch/composition so a target left pointing at PostgreSQL can
  // never be mistaken for a legacy-safe restart point.
  const expected = {
    version: input.expectedControlVersion,
    canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
    compositionMode: CanonicalCompositionMode.LEGACY_JSON,
    canonicalStoreTarget: CanonicalCompositionMode.LEGACY_JSON,
    writesEnabled: true,
    readsEnabled: true,
    firstPostgresWriteAt: null,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (state?.[field] !== value) {
      throw runnerError("PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH", `Migration control ${field} does not match the exact expected pre-fence state.`);
    }
  }
  if (!RESTARTABLE_PRE_FENCE_STATES.has(state.fenceState)) {
    throw runnerError("PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH", "Migration control fenceState does not match the exact expected pre-fence state.");
  }
  if (state.fenceState === MigrationFenceState.INACTIVE) {
    // The pristine state has never carried an operation identity.
    if (state.migrationOperationId !== null) {
      throw runnerError("PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH", "Migration control migrationOperationId does not match the exact expected pre-fence state.");
    }
    return;
  }
  // ABORT_TO_LEGACY deliberately retains the aborted operation/fence identity as audit
  // evidence, so it is not cleared here. A retry must still carry a genuinely new
  // operation so the audit trail can never conflate it with the aborted attempt.
  if (state.migrationOperationId === input.migrationOperationId) {
    throw runnerError("PRODUCTION_MIGRATION_OPERATION_REUSE_REJECTED", "A migration retry after an abort requires a new migration operation ID.");
  }
}

function authorizationPhrase(input) {
  return `GO: authorize production migration ${input.migrationOperationId} from ${input.expectedSourceCommit} build ${input.expectedBuildId} using package ${input.expectedMigrationId}`;
}

function ready(result, extra = {}) {
  if (result?.ready !== true || result?.mutated === true) {
    throw runnerError("PRODUCTION_MIGRATION_PREFLIGHT_FAILED", "A production migration preflight adapter did not return a non-mutating ready result.");
  }
  return Object.freeze({ ...result, ...extra, ready: true, mutated: false });
}

function exact(actual, expected, field) {
  if (String(actual ?? "") !== String(expected ?? "")) {
    throw runnerError("PRODUCTION_MIGRATION_IDENTITY_MISMATCH", `Current ${field} does not match the exact expected value.`);
  }
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw runnerError("MIGRATION_INPUT_INVALID", `${field} is required.`);
  return candidate;
}

function commit(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(candidate)) throw runnerError("MIGRATION_INPUT_INVALID", `${field} is invalid.`);
  return candidate;
}

function sha256(value) {
  const candidate = required(value, "expectedRuntimeSha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw runnerError("MIGRATION_INPUT_INVALID", "expectedRuntimeSha256 is invalid.");
  return candidate;
}

function integer(value, field) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1) throw runnerError("MIGRATION_INPUT_INVALID", `${field} is invalid.`);
  return candidate;
}

function runnerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
