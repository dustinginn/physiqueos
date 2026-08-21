import { describe, expect, it, vi } from "vitest";
import { createPhase7BProductionEntrypoint } from "./Phase7BProductionEntrypoint.js";
import { PHASE7B_PRODUCTION_APP_ID, PHASE7B_ROUTING_LEAF, PHASE7B_ROUTING_ZONE } from "./Phase7BProductionConfiguration.js";

describe("Phase7BProductionEntrypoint", () => {
  it("inspects first and dispatches exactly one authorized B invocation", async () => {
    const harness = setup({ durablePhase: "B", stepStatus: "NOT_STARTED", version: 7 });
    const report = await harness.entrypoint.invoke({ ...request(), action: "advance", requestedStep: "B", authorizationRef: "founder-approval-b-v7" });
    expect(harness.events).toEqual(["inspect", "load:B:7", "advance:B"]);
    expect(report).toMatchObject({ action: "advance", classification: "COMPLETED", result: { currentStep: "C_D", version: 8 } });
  });

  it("reconciles unresolved state without loading or inventing another approval", async () => {
    const harness = setup({ durablePhase: "L", stepStatus: "FAILED_AMBIGUOUS", version: 12 });
    await harness.entrypoint.invoke({ ...request(), action: "advance", requestedStep: "L" });
    expect(harness.events).toEqual(["inspect", "advance:L"]);
  });

  it("rejects stale steps and authorization on ungated steps before coordinator mutation", async () => {
    const stale = setup({ durablePhase: "A", stepStatus: "NOT_STARTED", version: 0 });
    await expect(stale.entrypoint.invoke({ ...request(), action: "advance", requestedStep: "B" })).rejects.toMatchObject({ code: "PHASE7B_ENTRYPOINT_STEP_MISMATCH" });
    expect(stale.events).toEqual(["inspect"]);

    const unauthorized = setup({ durablePhase: "A", stepStatus: "NOT_STARTED", version: 0 });
    await expect(unauthorized.entrypoint.invoke({ ...request(), action: "advance", requestedStep: "A", authorizationRef: "not-consumable" })).rejects.toMatchObject({ code: "PHASE7B_ENTRYPOINT_AUTHORIZATION_STALE" });
    expect(unauthorized.events).toEqual(["inspect"]);
  });

  it("reads authority before creating one exact run and emits no input or credential material", async () => {
    const harness = setup({ durablePhase: "A", stepStatus: "NOT_STARTED", version: 0 });
    const report = await harness.entrypoint.invoke({ ...request(), action: "create-run" });
    expect(harness.events).toEqual(["authority-read", "read-run", "create-run"]);
    expect(report).toMatchObject({ action: "create-run", classification: "created", result: { runId: "phase7b-isolated-run-1", currentStep: "A" } });
    expect(JSON.stringify(report)).not.toMatch(/authorizationFingerprint|target|credential|secret/i);
  });

  it("fails on wrong isolated owner before constructing the production graph", async () => {
    const harness = setup({ durablePhase: "A", stepStatus: "NOT_STARTED", version: 0 });
    const value = request();
    value.input.canonicalOwnerUserId = "user_founder_001";
    await expect(harness.entrypoint.invoke({ ...value, action: "inspect" })).rejects.toMatchObject({ code: "PHASE7B_EXERCISE_IDENTITY_MISMATCH" });
    expect(harness.compositionFactory).not.toHaveBeenCalled();
  });
});

function setup({ durablePhase, stepStatus, version }) {
  const events = [];
  const run = { runId: "phase7b-isolated-run-1", currentStep: durablePhase, stepStatus, completedSteps: [], mBoundaryCrossed: false, failureCode: null, version };
  const inspection = {
    runId: run.runId, durablePhase, nextLegalStep: durablePhase, stepStatus, version,
    providerForwardRecoveryRequired: false,
  };
  const coordinator = {
    inspect: vi.fn(async () => { events.push("inspect"); return inspection; }),
    advance: vi.fn(async ({ authorization }) => { events.push(`advance:${durablePhase}`); return { classification: "COMPLETED", run: { ...run, currentStep: "C_D", version: version + 1 }, authorization }; }),
    recover: vi.fn(),
    createRun: vi.fn(async () => { events.push("create-run"); return { outcome: "created", run }; }),
  };
  const stores = {
    authorityStore: { read: vi.fn(async () => { events.push("authority-read"); return { state: { authority: "windows-legacy-authoritative" } }; }) },
    coordinatorStore: { readRun: vi.fn(async () => { events.push("read-run"); throw Object.assign(new Error("missing"), { code: "COORDINATOR_RUN_NOT_FOUND" }); }) },
  };
  const compositionFactory = vi.fn(async () => ({ kind: "phase7b-production-composition", coordinator, stores }));
  const authorizationProvider = { loadAuthorization: vi.fn(async ({ step, expectedCoordinatorVersion }) => {
    events.push(`load:${step}:${expectedCoordinatorVersion}`);
    return { authorized: true, runId: run.runId, step, expectedCoordinatorVersion, authorizationId: "founder-boundary-approval", authorizedAt: "2026-08-21T06:00:00.000Z", expiresAt: "2026-08-21T06:10:00.000Z", priorStateDigest: "a".repeat(64) };
  }) };
  const entrypoint = createPhase7BProductionEntrypoint({
    env: validEnv(), expectedEnvironment: "phase7b-isolated-exercise-1", trustedExercise: trusted(),
    compositionFactory, authorizationProvider,
  });
  return { entrypoint, events, compositionFactory };
}

function request() {
  return {
    identity: { runId: "phase7b-isolated-run-1", coordinatorOperationId: "phase7b-coordinator-operation-1", migrationOperationId: "phase7b-migration-operation-1", environment: "phase7b-isolated-exercise-1" },
    exercise: { mode: "isolated-synthetic", datasetId: "phase7b-synthetic-358", identityContractDigest: "f".repeat(64) },
    input: {
      migrationOperationId: "phase7b-migration-operation-1", commandPrefix: "phase7b-isolated", authorizationFingerprint: "a".repeat(64), expectedRuntimeSha256: "b".repeat(64), expectedRuntimeRevision: 358,
      expectedSourceCommit: "c".repeat(40), expectedBuildId: "windows-build-1", expectedMonthlyCostUsd: 25,
      canonicalOwnerUserId: "phase5-synthetic-user", providerDeploymentId: "bed088ae-064e-4420-845c-0d972ed81153", providerBuildId: "phase7b-build-1", providerWorkerId: "phase7b-worker-1",
      windowsHostId: "phase7b-isolated-windows-restore-1",
      providerSource: { commit: "d".repeat(40), buildId: "phase7b-build-1" }, routingTarget: "provider.ondigitalocean.app", firstProviderCommandId: "phase7b:first-provider-command",
      target: { databaseClusterId: "isolated-cluster", databaseName: "physiqueos_phase5_restore_provider_phase7b", spacesBucket: "physiqueos-phase7b-isolated-exercise-1", spacesPrefix: "private/phase5-synthetic-user/" },
    },
  };
}
function trusted() { return { environment: "phase7b-isolated-exercise-1", runId: "phase7b-isolated-run-1", coordinatorOperationId: "phase7b-coordinator-operation-1", migrationOperationId: "phase7b-migration-operation-1", commandPrefix: "phase7b-isolated", firstProviderCommandId: "phase7b:first-provider-command", identityContractDigest: "f".repeat(64), ownerUserId: "phase5-synthetic-user", datasetId: "phase7b-synthetic-358", databaseClusterId: "isolated-cluster", databaseName: "physiqueos_phase5_restore_provider_phase7b", spacesBucket: "physiqueos-phase7b-isolated-exercise-1", spacesPrefix: "private/phase5-synthetic-user/", providerWorkerId: "phase7b-worker-1", windowsHostId: "phase7b-isolated-windows-restore-1" }; }
function validEnv() { return {
  PHYSIQUEOS_PHASE7B_ENVIRONMENT: "phase7b-isolated-exercise-1", PHYSIQUEOS_PHASE7B_APP_ID: PHASE7B_PRODUCTION_APP_ID,
  PHYSIQUEOS_PHASE7B_WEB_COMPONENT: "web", PHYSIQUEOS_PHASE7B_WORKER_COMPONENT: "worker",
  PHYSIQUEOS_PHASE7B_ROUTING_ZONE: PHASE7B_ROUTING_ZONE, PHYSIQUEOS_PHASE7B_ROUTING_LEAF: PHASE7B_ROUTING_LEAF,
  PHYSIQUEOS_PHASE7B_ROUTING_RECORD_TYPE: "CNAME", PHYSIQUEOS_PHASE7B_ROUTING_TTL: "60",
  PHYSIQUEOS_PHASE7B_PROVIDER_DEPLOYMENT_ID: "bed088ae-064e-4420-845c-0d972ed81153", PHYSIQUEOS_PHASE7B_PROVIDER_BUILD_ID: "phase7b-build-1", PHYSIQUEOS_PHASE7B_PROVIDER_SOURCE_COMMIT: "d".repeat(40),
  PHYSIQUEOS_PHASE7B_CANONICAL_OWNER_USER_ID: "phase5-synthetic-user", PHYSIQUEOS_PHASE7B_WINDOWS_ROUTING_TARGET: "windows-edge.example.net", PHYSIQUEOS_PHASE7B_PROVIDER_ROUTING_TARGET: "provider.ondigitalocean.app",
  PHYSIQUEOS_PHASE7B_WINDOWS_EDGE_CUSTOM_DOMAIN_READY: "1", PHYSIQUEOS_PHASE7B_PROVIDER_CUSTOM_DOMAIN_READY: "1",
}; }
