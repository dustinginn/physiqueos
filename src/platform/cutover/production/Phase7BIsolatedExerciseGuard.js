export const PHASE7B_ISOLATED_EXERCISE_MODE = "isolated-synthetic";

/** Fail before any coordinator/store mutation if a rehearsal could address Founder production data. */
export function assertPhase7BIsolatedExerciseIdentity({ configuration, identity, input, exercise, trusted } = {}) {
  const expected = normalizeTrusted(trusted);
  exact(configuration?.environment, expected.environment, "configuration environment");
  exact(identity?.environment, expected.environment, "run environment");
  exact(identity?.runId, expected.runId, "run ID");
  exact(identity?.coordinatorOperationId, expected.coordinatorOperationId, "coordinator operation ID");
  exact(identity?.migrationOperationId, expected.migrationOperationId, "run migration operation ID");
  exact(input?.migrationOperationId, expected.migrationOperationId, "input migration operation ID");
  exact(input?.commandPrefix, expected.commandPrefix, "command prefix");
  exact(input?.firstProviderCommandId, expected.firstProviderCommandId, "first-provider command ID");
  exact(configuration?.canonicalOwnerUserId, expected.ownerUserId, "configured owner");
  exact(input?.canonicalOwnerUserId, expected.ownerUserId, "input owner");
  exact(exercise?.mode, PHASE7B_ISOLATED_EXERCISE_MODE, "exercise mode");
  exact(exercise?.datasetId, expected.datasetId, "exercise dataset");
  exact(exercise?.identityContractDigest, expected.identityContractDigest, "identity contract digest");
  exact(input?.target?.databaseClusterId, expected.databaseClusterId, "database cluster");
  exact(input?.target?.databaseName, expected.databaseName, "database name");
  exact(input?.target?.spacesBucket, expected.spacesBucket, "Spaces bucket");
  exact(input?.target?.spacesPrefix, expected.spacesPrefix, "Spaces prefix");
  exact(input?.providerSource?.commit, configuration?.provider?.sourceCommit, "provider source commit");
  exact(input?.providerSource?.buildId, configuration?.provider?.buildId, "provider build identity");
  exact(input?.providerDeploymentId, configuration?.provider?.deploymentId, "provider deployment");
  exact(input?.providerBuildId, configuration?.provider?.buildId, "coordinator provider build");
  exact(input?.providerWorkerId, expected.providerWorkerId, "provider worker");
  exact(input?.windowsHostId, expected.windowsHostId, "isolated Windows host");
  exact(input?.routingTarget, configuration?.routing?.providerTarget, "provider routing target");
  if (!/^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/.test(expected.databaseName)) {
    throw guardError("PHASE7B_EXERCISE_DATABASE_NOT_ISOLATED", "The Phase 7B exercise database is not an isolated Phase 5 provider database.");
  }
  if (!/^physiqueos-phase7b-isolated-[a-z0-9-]+$/.test(expected.spacesBucket) || expected.spacesPrefix !== `private/${expected.ownerUserId}/`) {
    throw guardError("PHASE7B_EXERCISE_SPACES_NOT_ISOLATED", "The Phase 7B exercise Spaces bucket/key prefix is not the dedicated synthetic-owner scope.");
  }
  if (/founder|user_founder_001/i.test(expected.ownerUserId) || /founder|production/i.test(expected.datasetId)) {
    throw guardError("PHASE7B_EXERCISE_FOUNDER_DATA_FORBIDDEN", "Founder/production identities are forbidden in the isolated Phase 7B exercise.");
  }
  if (!/^phase7b-isolated-windows-[A-Za-z0-9_-]+$/.test(expected.windowsHostId)) {
    throw guardError("PHASE7B_EXERCISE_WINDOWS_HOST_NOT_ISOLATED", "The Phase 7B exercise Windows host identity is not explicitly isolated.");
  }
  if (!/^[0-9a-f]{64}$/.test(expected.identityContractDigest)) {
    throw guardError("PHASE7B_EXERCISE_CONTRACT_DIGEST_INVALID", "The Phase 7B identity contract digest is invalid.");
  }
  return Object.freeze({ ready: true, mode: PHASE7B_ISOLATED_EXERCISE_MODE, environment: expected.environment, datasetId: expected.datasetId });
}

function normalizeTrusted(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw guardError("PHASE7B_EXERCISE_TRUSTED_IDENTITY_MISSING", "Trusted isolated-exercise identity is required.");
  const result = {};
  for (const field of ["environment", "runId", "coordinatorOperationId", "migrationOperationId", "commandPrefix", "firstProviderCommandId", "identityContractDigest", "ownerUserId", "datasetId", "databaseClusterId", "databaseName", "spacesBucket", "spacesPrefix", "providerWorkerId", "windowsHostId"]) {
    const text = String(value[field] ?? "");
    if (!text || text !== text.trim() || /[\u0000-\u001f\u007f]/.test(text)) throw guardError("PHASE7B_EXERCISE_TRUSTED_IDENTITY_INVALID", `Trusted ${field} is invalid.`);
    result[field] = text;
  }
  return Object.freeze(result);
}
function exact(actual, expected, field) { if (String(actual ?? "") !== String(expected ?? "")) throw guardError("PHASE7B_EXERCISE_IDENTITY_MISMATCH", `Phase 7B ${field} does not match the exact trusted isolated-exercise identity.`); }
function guardError(code, message) { return Object.assign(new Error(message), { code }); }
