import { describe, expect, it } from "vitest";
import { assertPhase7BIsolatedExerciseIdentity } from "./Phase7BIsolatedExerciseGuard.js";

describe("Phase7BIsolatedExerciseGuard", () => {
  it("accepts only the exact isolated synthetic owner/database/prefix and provider identities", () => {
    expect(assertPhase7BIsolatedExerciseIdentity(fixture())).toMatchObject({ ready: true, mode: "isolated-synthetic" });
  });

  it.each([
    ["environment", (value) => { value.identity.environment = "production"; }],
    ["run ID", (value) => { value.identity.runId = "phase7b-stale-run"; }],
    ["coordinator operation", (value) => { value.identity.coordinatorOperationId = "phase7b-stale-coordinator"; }],
    ["migration operation", (value) => { value.input.migrationOperationId = "phase7a-stale-operation"; }],
    ["command prefix", (value) => { value.input.commandPrefix = "phase7a-stale"; }],
    ["M command", (value) => { value.input.firstProviderCommandId = "phase7a-stale:first-provider-command"; }],
    ["contract digest", (value) => { value.exercise.identityContractDigest = "0".repeat(64); }],
    ["owner", (value) => { value.input.canonicalOwnerUserId = "user_founder_001"; }],
    ["database", (value) => { value.input.target.databaseName = "physiqueos_staging"; }],
    ["Spaces prefix", (value) => { value.input.target.spacesPrefix = "founder/"; }],
    ["deployment", (value) => { value.input.providerDeploymentId = "other-deployment"; }],
    ["build", (value) => { value.input.providerBuildId = "other-build"; }],
    ["worker", (value) => { value.input.providerWorkerId = "other-worker"; }],
    ["Windows host", (value) => { value.input.windowsHostId = "founder-production-workstation"; }],
    ["routing", (value) => { value.input.routingTarget = "windows-edge.example.net"; }],
    ["dataset", (value) => { value.exercise.datasetId = "founder-production"; }],
  ])("rejects wrong %s before mutation", (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => assertPhase7BIsolatedExerciseIdentity(value)).toThrow(expect.objectContaining({ code: "PHASE7B_EXERCISE_IDENTITY_MISMATCH" }));
  });

  it("rejects a trusted target that is not structurally isolated", () => {
    const value = fixture();
    value.trusted.databaseName = "physiqueos_staging";
    value.input.target.databaseName = "physiqueos_staging";
    expect(() => assertPhase7BIsolatedExerciseIdentity(value)).toThrow(expect.objectContaining({ code: "PHASE7B_EXERCISE_DATABASE_NOT_ISOLATED" }));
  });
});

function fixture() {
  const trusted = {
    environment: "phase7b-isolated-exercise-1",
    runId: "phase7b-isolated-run-1",
    coordinatorOperationId: "phase7b-coordinator-operation-1",
    migrationOperationId: "phase7b-migration-operation-1",
    commandPrefix: "phase7b-isolated",
    firstProviderCommandId: "phase7b:first-provider-command",
    identityContractDigest: "f".repeat(64),
    ownerUserId: "phase5-synthetic-user",
    datasetId: "phase7b-synthetic-358",
    databaseClusterId: "isolated-cluster",
    databaseName: "physiqueos_phase5_restore_provider_phase7b",
    spacesBucket: "physiqueos-phase7b-isolated-exercise-1",
    spacesPrefix: "private/phase5-synthetic-user/",
    providerWorkerId: "phase7b-worker-1",
    windowsHostId: "phase7b-isolated-windows-restore-1",
  };
  const configuration = {
    environment: trusted.environment,
    canonicalOwnerUserId: trusted.ownerUserId,
    provider: { deploymentId: "bed088ae-064e-4420-845c-0d972ed81153", buildId: "phase7b-build-1", sourceCommit: "a".repeat(40) },
    routing: { providerTarget: "provider.ondigitalocean.app" },
  };
  return {
    trusted,
    configuration,
    identity: { environment: trusted.environment, runId: trusted.runId, coordinatorOperationId: trusted.coordinatorOperationId, migrationOperationId: trusted.migrationOperationId },
    exercise: { mode: "isolated-synthetic", datasetId: trusted.datasetId, identityContractDigest: trusted.identityContractDigest },
    input: {
      migrationOperationId: trusted.migrationOperationId,
      commandPrefix: trusted.commandPrefix,
      firstProviderCommandId: trusted.firstProviderCommandId,
      canonicalOwnerUserId: trusted.ownerUserId,
      providerDeploymentId: configuration.provider.deploymentId,
      providerBuildId: configuration.provider.buildId,
      providerWorkerId: trusted.providerWorkerId,
      windowsHostId: trusted.windowsHostId,
      providerSource: { commit: configuration.provider.sourceCommit, buildId: configuration.provider.buildId },
      routingTarget: configuration.routing.providerTarget,
      target: { databaseClusterId: trusted.databaseClusterId, databaseName: trusted.databaseName, spacesBucket: trusted.spacesBucket, spacesPrefix: trusted.spacesPrefix },
    },
  };
}
