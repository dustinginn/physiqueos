import { performance } from "node:perf_hooks";
import {
  CanonicalCompositionMode,
  CanonicalStoreEpoch,
  MigrationControlAction,
  MigrationFenceState,
} from "./migrationControlState.js";

const PREFLIGHT_STEPS = Object.freeze([
  "inspectBuildIdentity",
  "inspectCanonicalSource",
  "verifyBackup",
  "verifyTargetHealth",
  "verifyMigrationScripts",
  "verifyCollectionInventory",
]);

export function createProductionMigrationOrchestrator({
  controlStore,
  adapters,
  now = () => new Date(),
  monotonicNow = () => performance.now(),
  maximumFenceDurationMs = 10 * 60_000,
} = {}) {
  if (!controlStore?.read || !controlStore?.transition) throw new Error("Production migration wrapper requires a durable control store.");
  assertAdapterContract(adapters);

  return Object.freeze({
    async dryRun(input) {
      const startedAt = monotonicNow();
      const preflight = await runPreflight({ input, mode: "dry-run" });
      const endingState = controlStore.read().state;
      if (endingState.version !== preflight.controlState.version || endingState.fenceState !== preflight.controlState.fenceState) {
        throw wrapperError("DRY_RUN_MUTATED_CONTROL", "Dry-run changed migration-control state.");
      }
      return freeze({
        mode: "dry-run",
        classification: "READY",
        preflight,
        totalDurationMs: elapsed(startedAt),
        controlState: endingState,
      });
    },

    async execute(input) {
      if (input?.mode !== "isolated" && input?.productionAuthorization !== true) {
        throw wrapperError("PRODUCTION_MIGRATION_NOT_AUTHORIZED", "Production execution requires an explicit production authorization input.");
      }
      const overallStartedAt = monotonicNow();
      const timings = {};
      const preflightStartedAt = monotonicNow();
      const preflight = await runPreflight({ input, mode: input.mode ?? "production" });
      timings.preflightMs = elapsed(preflightStartedAt);
      const transitionInput = transitionIdentity(input);
      let fenceActivatedAt = null;
      let packageResult = null;
      try {
        const activationStartedAt = monotonicNow();
        let state = transition(MigrationControlAction.ACTIVATE_FENCE, preflight.controlState, transitionInput, {
          migrationOperationId: input.migrationOperationId,
          expectedMigrationId: input.expectedMigrationId,
          fenceId: input.fenceId,
          reason: input.reason,
          sourceIdentity: preflight.buildIdentity,
          auditMetadata: input.auditMetadata,
          backupPreflightState: preflight.backup.ready === true ? "verified" : "failed",
          migrationTargetReadiness: preflight.target.ready === true ? "ready" : "not-ready",
        });
        timings.fenceActivationMs = elapsed(activationStartedAt);
        fenceActivatedAt = monotonicNow();

        state = transition(MigrationControlAction.BEGIN_CUTOVER, state, transitionInput, {
          migrationOperationId: input.migrationOperationId,
          reason: "Final source capture and import started.",
          step: "final-source-capture",
        });
        const snapshotStartedAt = monotonicNow();
        const snapshot = await adapters.captureFinalSnapshot(context(input, state, preflight));
        timings.finalSourceSnapshotMs = elapsed(snapshotStartedAt);
        assertFenceBudget(fenceActivatedAt, state);

        const exportStartedAt = monotonicNow();
        const exported = await adapters.exportCanonicalPackage(context(input, state, preflight, { snapshot }));
        timings.exportMs = elapsed(exportStartedAt);
        const packageValidationStartedAt = monotonicNow();
        packageResult = await adapters.verifyPackage(context(input, state, preflight, { snapshot, exported }));
        timings.packageValidationMs = elapsed(packageValidationStartedAt);
        assertFenceBudget(fenceActivatedAt, state);

        const importStartedAt = monotonicNow();
        const imported = await adapters.importCanonicalPackage(context(input, state, preflight, { snapshot, exported, packageResult }));
        timings.importMs = elapsed(importStartedAt);
        const mediaStartedAt = monotonicNow();
        const media = adapters.migrateMedia
          ? await adapters.migrateMedia(context(input, state, preflight, { snapshot, exported, packageResult, imported }))
          : freeze({ status: "not-included" });
        timings.mediaMs = elapsed(mediaStartedAt);
        assertFenceBudget(fenceActivatedAt, state);

        const validationStartedAt = monotonicNow();
        const importValidation = await adapters.verifyImport(context(input, state, preflight, { snapshot, exported, packageResult, imported, media }));
        const readParity = await adapters.verifyReadParity(context(input, state, preflight, { packageResult, importValidation }));
        const commandReadiness = await adapters.verifyCommandReadiness(context(input, state, preflight, { packageResult, importValidation }));
        timings.validationMs = elapsed(validationStartedAt);
        assertFenceBudget(fenceActivatedAt, state);

        const switchStartedAt = monotonicNow();
        state = transition(MigrationControlAction.SWITCH_TO_POSTGRES, state, transitionInput, {
          migrationOperationId: input.migrationOperationId,
          reason: "Validated PostgreSQL composition selected.",
        });
        const switched = await adapters.switchComposition(context(input, state, preflight, { importValidation }));
        timings.compositionSwitchMs = elapsed(switchStartedAt);
        assertFenceBudget(fenceActivatedAt, state);

        const smokeStartedAt = monotonicNow();
        const productionReads = await adapters.verifyProductionReads(context(input, state, preflight, { switched }));
        const representativeWrite = await adapters.acceptRepresentativePostgresWrite(context(input, state, preflight, { switched }));
        if (representativeWrite?.accepted !== true) {
          throw wrapperError("POSTGRES_WRITE_READINESS_FAILED", "The representative PostgreSQL write boundary was not accepted.");
        }
        state = transition(MigrationControlAction.RECORD_FIRST_POSTGRES_WRITE, state, transitionInput, {
          migrationOperationId: input.migrationOperationId,
          reason: "First accepted PostgreSQL canonical write recorded.",
        });
        const releaseStartedAt = monotonicNow();
        state = transition(MigrationControlAction.RELEASE_FENCE, state, transitionInput, {
          migrationOperationId: input.migrationOperationId,
          expectedCanonicalStoreOutcome: CanonicalCompositionMode.POSTGRES,
          reason: "PostgreSQL canonical validation passed; write fence released.",
        });
        timings.fenceReleaseMs = elapsed(releaseStartedAt);
        const postSwitchSmoke = await adapters.runPostCutoverSmoke(context(input, state, preflight, { representativeWrite }));
        timings.postSwitchSmokeMs = elapsed(smokeStartedAt);
        const stabilization = await adapters.enterStabilization(context(input, state, preflight, { postSwitchSmoke }));
        timings.totalFencedMs = monotonicNow() - fenceActivatedAt;
        timings.totalMs = elapsed(overallStartedAt);
        return freeze({
          mode: input.mode ?? "production",
          classification: "COMPLETED",
          preflight,
          packageResult,
          importValidation,
          readParity,
          commandReadiness,
          productionReads,
          representativeWrite,
          postSwitchSmoke,
          stabilization,
          timings: freeze(timings),
          controlState: state,
        });
      } catch (error) {
        const recovery = await recoverFromFailure({ input, transitionInput, error, packageResult });
        error.migrationRecovery = recovery;
        throw error;
      }
    },
  });

  async function runPreflight({ input, mode }) {
    const controlState = controlStore.read().state;
    if (!new Set([MigrationFenceState.INACTIVE, MigrationFenceState.ABORTED, MigrationFenceState.COMPLETED]).has(controlState.fenceState)) {
      throw wrapperError("MIGRATION_PREFLIGHT_CONTROL_BLOCKED", "Migration control is not in a restartable legacy state.");
    }
    if (controlState.canonicalStoreEpoch !== CanonicalStoreEpoch.LEGACY_JSON || controlState.compositionMode !== CanonicalCompositionMode.LEGACY_JSON || !controlState.writesEnabled) {
      throw wrapperError("MIGRATION_PREFLIGHT_CANONICAL_STATE", "Migration preflight requires enabled legacy JSON canonical state.");
    }
    const results = {};
    for (const name of PREFLIGHT_STEPS) {
      const result = await adapters[name]({ ...context(input, controlState), mode });
      if (result?.ready !== true) throw wrapperError("MIGRATION_PREFLIGHT_FAILED", `Migration preflight failed: ${name}.`);
      if (mode === "dry-run" && result.mutated === true) throw wrapperError("DRY_RUN_MUTATION_REPORTED", `Dry-run adapter reported a mutation: ${name}.`);
      results[name] = result;
    }
    return freeze({
      controlState,
      buildIdentity: freeze(results.inspectBuildIdentity.identity ?? {}),
      source: results.inspectCanonicalSource,
      backup: results.verifyBackup,
      target: results.verifyTargetHealth,
      scripts: results.verifyMigrationScripts,
      collections: results.verifyCollectionInventory,
    });
  }

  async function recoverFromFailure({ input, transitionInput, error, packageResult }) {
    let state = controlStore.read().state;
    if (state.firstPostgresWriteAt != null) {
      if (state.fenceState !== MigrationFenceState.RECOVERY_REQUIRED) {
        state = transition(MigrationControlAction.REQUIRE_RECOVERY, state, transitionInput, {
          migrationOperationId: input.migrationOperationId,
          reason: `Forward repair required after PostgreSQL canonical write: ${error.code ?? "MIGRATION_FAILED"}.`,
        });
      }
      return freeze({ classification: "FORWARD_REPAIR_REQUIRED", automaticLegacyRollback: false, state });
    }
    let targetRollback = null;
    if (adapters.rollbackTargetBeforeWrite) {
      targetRollback = await adapters.rollbackTargetBeforeWrite({ ...context(input, state), errorCode: error.code ?? "MIGRATION_FAILED", packageResult });
    }
    if ([MigrationFenceState.ACTIVE, MigrationFenceState.CUTOVER_IN_PROGRESS].includes(state.fenceState)) {
      state = transition(MigrationControlAction.ABORT_TO_LEGACY, state, transitionInput, {
        migrationOperationId: input.migrationOperationId,
        reason: `Pre-write migration abort: ${error.code ?? "MIGRATION_FAILED"}.`,
      });
    }
    return freeze({ classification: "ABORTED_TO_LEGACY", automaticLegacyRollback: true, targetRollback, state });
  }

  function transition(action, state, identity, overrides) {
    return controlStore.transition({
      action,
      commandId: `${identity.commandPrefix}:${action}`,
      correlationId: identity.correlationId,
      operator: identity.operator,
      expectedVersion: state.version,
      expectedFenceState: state.fenceState,
      expectedCanonicalStoreEpoch: state.canonicalStoreEpoch,
      expectedCompositionMode: state.compositionMode,
      ...overrides,
    }).state;
  }

  function assertFenceBudget(startedAt, state) {
    if (state.firstPostgresWriteAt == null && monotonicNow() - startedAt >= maximumFenceDurationMs) {
      throw wrapperError("CUTOVER_WINDOW_EXCEEDED_BEFORE_FIRST_POSTGRES_WRITE", "The pre-write fence exceeded its hard abort threshold.");
    }
  }

  function elapsed(startedAt) {
    return monotonicNow() - startedAt;
  }
}

function assertAdapterContract(adapters) {
  const required = [
    ...PREFLIGHT_STEPS,
    "captureFinalSnapshot", "exportCanonicalPackage", "verifyPackage", "importCanonicalPackage",
    "verifyImport", "verifyReadParity", "verifyCommandReadiness", "switchComposition",
    "verifyProductionReads", "acceptRepresentativePostgresWrite", "runPostCutoverSmoke", "enterStabilization",
  ];
  const missing = required.filter((name) => typeof adapters?.[name] !== "function");
  if (missing.length) throw new Error(`Production migration wrapper adapters are missing: ${missing.join(", ")}.`);
}

function transitionIdentity(input) {
  required(input?.operator, "operator");
  required(input?.migrationOperationId, "migrationOperationId");
  required(input?.expectedMigrationId, "expectedMigrationId");
  required(input?.correlationId, "correlationId");
  required(input?.commandPrefix, "commandPrefix");
  required(input?.reason, "reason");
  return freeze({
    operator: input.operator,
    migrationOperationId: input.migrationOperationId,
    correlationId: input.correlationId,
    commandPrefix: input.commandPrefix,
  });
}

function context(input, state, preflight = null, extra = {}) {
  return freeze({ input, state, preflight, ...extra });
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw wrapperError("MIGRATION_INPUT_INVALID", `${field} is required.`);
}

function wrapperError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(value);
}
