import { describe, expect, it } from "vitest";
import { assertPhase7BIsolatedExerciseIdentity } from "./Phase7BIsolatedExerciseGuard.js";

describe("Phase7BIsolatedExerciseGuard", () => {
  it("accepts only the exact isolated synthetic owner/database/prefix and provider identities", () => {
    expect(assertPhase7BIsolatedExerciseIdentity(fixture())).toMatchObject({ ready: true, mode: "isolated-synthetic" });
  });

  it.each([
    ["environment", (value) => { value.identity.environment = "production"; }],
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
    ownerUserId: "phase5-synthetic-user",
    datasetId: "phase7b-synthetic-358",
    databaseClusterId: "isolated-cluster",
    databaseName: "physiqueos_phase5_restore_provider_phase7b",
    spacesBucket: "physiqueos-staging",
    spacesPrefix: "phase7b-isolated/exercise-1/",
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
    identity: { environment: trusted.environment },
    exercise: { mode: "isolated-synthetic", datasetId: trusted.datasetId },
    input: {
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
