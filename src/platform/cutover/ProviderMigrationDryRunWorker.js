import { WorkerMessageError } from "../jobs/DurableOutboxWorker.js";
import {
  PROVIDER_MIGRATION_DRY_RUN_PAYLOAD_VERSION,
  safeMigrationFailure,
  validateProviderMigrationDryRunRequest,
} from "./ProviderMigrationDryRunContract.js";

export function createProviderMigrationDryRunWorkerHandler({
  store,
  createEnvironment,
  validationContext,
  clock = () => new Date(),
  logger,
} = {}) {
  if (!store?.find || !store?.markRunning || !store?.succeed || !store?.fail) throw new Error("Remote dry-run worker requires durable operation storage.");
  if (typeof createEnvironment !== "function") throw new Error("Remote dry-run worker requires a provider environment factory.");

  return async function handleProviderMigrationDryRun({ payloadVersion, payload }) {
    if (payloadVersion !== PROVIDER_MIGRATION_DRY_RUN_PAYLOAD_VERSION) {
      throw new WorkerMessageError("REMOTE_DRY_RUN_PAYLOAD_VERSION_UNSUPPORTED", "Remote dry-run payload version is unsupported.");
    }
    const request = validateProviderMigrationDryRunRequest(payload?.request, validationContext);
    if (payload?.payloadFingerprint !== (await fingerprint(request))) {
      throw new WorkerMessageError("REMOTE_DRY_RUN_PAYLOAD_FINGERPRINT_MISMATCH", "Remote dry-run payload fingerprint did not validate.");
    }
    const existing = await store.find(request.operationId);
    if (!existing) throw new WorkerMessageError("REMOTE_DRY_RUN_NOT_FOUND", "Remote dry-run audit record is missing.");
    if (existing.result?.payloadFingerprint !== payload.payloadFingerprint) {
      throw new WorkerMessageError("REMOTE_DRY_RUN_PAYLOAD_FINGERPRINT_MISMATCH", "Remote dry-run audit fingerprint differs from the queued request.");
    }
    if (existing.state === "succeeded") return existing.result;
    const running = await store.markRunning(request.operationId);

    let environment;
    let before;
    try {
      environment = await createEnvironment({ request });
      before = await environment.captureMutationSnapshot();
      const runnerResult = await environment.runner.dryRun(toRunnerInput(request));
      assertClusterConnectionIdentity(runnerResult.preflight);
      const after = await environment.captureMutationSnapshot();
      environment.assertNoMutation(before, after);
      const completedAt = clock().toISOString();
      const result = Object.freeze({
        ...running.result,
        startedAt: running.result?.startedAt ?? null,
        completedAt,
        finalClassification: "READY",
        providerExecutionBoundary: "digitalocean-app-platform",
        providerExecutionConfirmed: true,
        providerIdentity: environment.providerIdentity,
        productionIdentity: {
          sourceCommit: request.expectedProductionSourceCommit,
          buildId: request.expectedProductionBuildId,
          attestation: "windows-control-plane-verified",
        },
        migrationControl: runnerResult.controlState,
        providerChecks: summarizePreflight(runnerResult.preflight, environment.summaries()),
        noMutation: { passed: true, beforeDigest: before.digest, afterDigest: after.digest },
        finalMigrationAuthorizationSupplied: false,
        finalMigrationAuthorizationRequired: true,
      });
      await store.succeed(request.operationId, result);
      logger?.info?.("provider_migration_dry_run.succeeded", { operationId: request.operationId, correlationId: request.correlationId });
      return result;
    } catch (error) {
      const problem = safeMigrationFailure(error);
      await store.fail(request.operationId, problem, running.result);
      logger?.error?.("provider_migration_dry_run.failed", { operationId: request.operationId, correlationId: request.correlationId, code: problem.code });
      throw new WorkerMessageError(problem.code, problem.message);
    } finally {
      await environment?.close?.();
    }
  };
}

function toRunnerInput(request) {
  return Object.freeze({
    operator: request.operator,
    migrationOperationId: request.operationId,
    expectedMigrationId: request.expectedMigrationId,
    correlationId: request.correlationId,
    commandPrefix: `remote-dry-run:${request.operationId}`,
    reason: "Authenticated provider-side production migration dry-run.",
    expectedSourceCommit: request.expectedProviderSourceCommit,
    expectedBuildId: request.expectedProviderBuildId,
    expectedRuntimeRevision: request.expectedFounderRevision,
    expectedRuntimeSha256: request.expectedFounderSha256,
    expectedControlVersion: request.expectedControlVersion,
    auditMetadata: Object.freeze({
      providerExecutionBoundary: "digitalocean-app-platform",
      productionSourceCommit: request.expectedProductionSourceCommit,
      productionBuildId: request.expectedProductionBuildId,
      controlSha256: request.expectedControlSha256,
      recoverySha256: request.expectedRecoverySha256,
      finalBackupInventorySha256: request.expectedBackupInventorySha256,
      migrationMode: request.migrationMode,
    }),
  });
}

function summarizePreflight(preflight, summaries) {
  return Object.freeze({
    buildIdentity: preflight.buildIdentity,
    source: preflight.source,
    backup: preflight.backup,
    target: preflight.target,
    scripts: preflight.scripts,
    collections: preflight.collections,
    database: summaries.targetIdentity,
    spaces: summaries.spacesStatus,
  });
}

function assertClusterConnectionIdentity(preflight) {
  const expected = String(preflight?.backup?.managedPostgres?.connectionHost ?? preflight?.backup?.rollbackSafety?.connectionHost ?? "").toLowerCase();
  const actual = String(preflight?.target?.database?.host ?? "").toLowerCase();
  if (!expected || !actual || expected !== actual) {
    const error = new Error("The connected PostgreSQL host does not match the expected managed cluster.");
    error.code = "REMOTE_DRY_RUN_CLUSTER_CONNECTION_MISMATCH";
    throw error;
  }
}

async function fingerprint(request) {
  const { fingerprintProviderMigrationDryRunRequest } = await import("./ProviderMigrationDryRunContract.js");
  return fingerprintProviderMigrationDryRunRequest(request);
}
