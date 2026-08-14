import { describe, expect, it, vi } from "vitest";
import { createProductionMigrationRunner } from "./ProductionMigrationRunner.js";
import {
  assertProviderExecutionBoundary,
  fingerprintProviderMigrationDryRunRequest,
  safeMigrationFailure,
  validateProviderMigrationDryRunRequest,
} from "./ProviderMigrationDryRunContract.js";
import { createProviderMigrationDryRunController } from "./ProviderMigrationDryRunController.js";
import { createProviderMigrationDryRunWorkerHandler } from "./ProviderMigrationDryRunWorker.js";

const providerIdentity = Object.freeze({ gitSha: "a".repeat(40), buildId: "provider-build" });
const productionIdentity = Object.freeze({ sourceCommit: "b".repeat(40), buildId: "production-build" });
const founderIdentity = Object.freeze({ revision: 122, sha256: "c".repeat(64) });
const mediaIdentity = Object.freeze({ count: 372, bytes: 276646284, sha256: "1".repeat(64) });
const rollbackIdentity = Object.freeze({ sourceCommit: "f".repeat(40), buildId: "rollback-build" });
const validationContext = Object.freeze({ environment: "production", operator: "Founder", providerIdentity, productionIdentity, founderIdentity, mediaIdentity, rollbackIdentity });

describe("provider migration dry-run contract", () => {
  it("accepts only the exact typed dry-run and rejects execution, secrets, wrong identity, and wrong boundary", () => {
    const request = validRequest();
    expect(validateProviderMigrationDryRunRequest(request, validationContext)).toMatchObject({ dryRun: true, operator: "Founder" });
    expect(() => validateProviderMigrationDryRunRequest({ ...request, execute: true }, validationContext)).toThrow(expect.objectContaining({ code: "REMOTE_DRY_RUN_EXECUTION_FLAG_REJECTED" }));
    expect(() => validateProviderMigrationDryRunRequest({ ...request, databasePassword: "never" }, validationContext)).toThrow(expect.objectContaining({ code: "REMOTE_DRY_RUN_PAYLOAD_FIELD_REJECTED" }));
    expect(() => validateProviderMigrationDryRunRequest({ ...request, expectedProviderBuildId: "wrong" }, validationContext)).toThrow(expect.objectContaining({ code: "REMOTE_DRY_RUN_PROVIDER_IDENTITY_MISMATCH" }));
    expect(() => validateProviderMigrationDryRunRequest({ ...request, expectedMediaBytes: request.expectedMediaBytes + 1 }, validationContext)).toThrow(expect.objectContaining({ code: "REMOTE_DRY_RUN_MEDIA_IDENTITY_MISMATCH" }));
    expect(() => validateProviderMigrationDryRunRequest({ ...request, operator: "ordinary-session" }, validationContext)).toThrow(expect.objectContaining({ code: "REMOTE_DRY_RUN_OPERATOR_FORBIDDEN" }));
    expect(() => assertProviderExecutionBoundary({})).toThrow(expect.objectContaining({ code: "MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED" }));
    expect(() => assertProviderExecutionBoundary({ PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY: "digitalocean-app-platform", PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED: "1" })).not.toThrow();
  });

  it("redacts credential-shaped failures", () => {
    expect(safeMigrationFailure(new Error("postgresql://user:secret@example.invalid/db"))).toEqual({
      code: "REMOTE_DRY_RUN_FAILED",
      message: "Remote provider validation failed; inspect protected correlated logs.",
    });
  });
});

describe("provider migration dry-run controller", () => {
  it("is idempotent for an exact replay and rejects payload drift", async () => {
    const store = memoryStore();
    const controller = createProviderMigrationDryRunController({ store, validationContext });
    const first = await controller.submit(validRequest());
    const replay = await controller.submit(validRequest());
    expect(first).toMatchObject({ status: 202, body: { state: "queued", replayed: false } });
    expect(replay).toMatchObject({ status: 202, body: { state: "queued", replayed: true } });
    await expect(controller.submit({ ...validRequest(), expectedMigrationId: "changed-migration-id" })).rejects.toMatchObject({ code: "REMOTE_DRY_RUN_IDEMPOTENCY_PAYLOAD_MISMATCH" });
    expect(store.enqueueCount()).toBe(1);
  });
});

describe("provider migration dry-run worker", () => {
  it("delegates to the accepted runner/orchestrator, survives replay, and proves no provider mutation", async () => {
    const request = validateProviderMigrationDryRunRequest(validRequest(), validationContext);
    const payloadFingerprint = fingerprintProviderMigrationDryRunRequest(request);
    const store = memoryStore({ request, payloadFingerprint });
    const fixture = runnerFixture(request);
    const createEnvironment = vi.fn(async () => ({
      runner: fixture.runner,
      providerIdentity,
      captureMutationSnapshot: vi.fn(async () => ({ digest: "unchanged" })),
      assertNoMutation: vi.fn((before, after) => expect(after.digest).toBe(before.digest)),
      summaries: () => ({ targetIdentity: { clusterId: "cluster" }, spacesStatus: { private: true, versioning: "Enabled" } }),
      close: vi.fn(async () => {}),
    }));
    const handler = createProviderMigrationDryRunWorkerHandler({ store, createEnvironment, validationContext });
    const message = { payloadVersion: "1", payload: { request, payloadFingerprint } };
    const result = await handler(message);
    expect(result).toMatchObject({ finalClassification: "READY", providerExecutionConfirmed: true, noMutation: { passed: true } });
    expect(fixture.calls).toEqual([
      "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "backupFreshness",
      "verifyTargetHealth", "verifyMigrationScripts", "verifyCollectionInventory",
    ]);
    expect(fixture.transition).not.toHaveBeenCalled();
    expect((await store.find(request.operationId)).state).toBe("succeeded");
    await handler(message);
    expect(createEnvironment).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the no-mutation assertion fails", async () => {
    const request = validateProviderMigrationDryRunRequest(validRequest(), validationContext);
    const payloadFingerprint = fingerprintProviderMigrationDryRunRequest(request);
    const store = memoryStore({ request, payloadFingerprint });
    const fixture = runnerFixture(request);
    const handler = createProviderMigrationDryRunWorkerHandler({
      store,
      validationContext,
      createEnvironment: async () => ({
        runner: fixture.runner,
        providerIdentity,
        captureMutationSnapshot: async () => ({ digest: Math.random().toString() }),
        assertNoMutation: () => { const error = new Error("changed"); error.code = "REMOTE_DRY_RUN_MUTATION_DETECTED"; throw error; },
        summaries: () => ({}),
        close: async () => {},
      }),
    });
    await expect(handler({ payloadVersion: "1", payload: { request, payloadFingerprint } })).rejects.toMatchObject({ code: "REMOTE_DRY_RUN_MUTATION_DETECTED" });
    expect((await store.find(request.operationId)).state).toBe("failed");
  });
});

function validRequest() {
  return {
    operationId: "remote-dry-run-0001",
    correlationId: "correlation-0001",
    operator: "Founder",
    environment: "production",
    dryRun: true,
    expectedProductionSourceCommit: productionIdentity.sourceCommit,
    expectedProductionBuildId: productionIdentity.buildId,
    expectedProviderSourceCommit: providerIdentity.gitSha,
    expectedProviderBuildId: providerIdentity.buildId,
    expectedFounderRevision: 122,
    expectedFounderSha256: "c".repeat(64),
    expectedMediaCount: 372,
    expectedMediaBytes: 276646284,
    expectedMediaInventorySha256: "1".repeat(64),
    expectedControlVersion: 1,
    expectedControlSha256: "d".repeat(64),
    expectedRecoverySha256: "e".repeat(64),
    expectedMigrationId: "migration-id-0001",
    expectedRollbackSourceCommit: "f".repeat(40),
    expectedRollbackBuildId: "rollback-build",
  };
}

function runnerFixture(request) {
  const state = Object.freeze({
    version: request.expectedControlVersion,
    fenceState: "inactive",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "legacy-json",
    writesEnabled: true,
    readsEnabled: true,
    migrationOperationId: null,
    firstPostgresWriteAt: null,
  });
  const transition = vi.fn(() => { throw new Error("transition forbidden"); });
  const controlStore = { read: () => ({ state, audit: [] }), transition };
  const calls = [];
  const requiredAdapters = [
    "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth",
    "verifyMigrationScripts", "verifyCollectionInventory", "captureFinalSnapshot", "exportCanonicalPackage",
    "verifyPackage", "importCanonicalPackage", "verifyImport", "verifyReadParity", "verifyCommandReadiness",
    "switchComposition", "verifyProductionReads", "acceptRepresentativePostgresWrite", "runPostCutoverSmoke", "enterStabilization",
  ];
  const adapters = Object.fromEntries(requiredAdapters.map((name) => [name, vi.fn(async () => {
    calls.push(name);
    if (name === "inspectBuildIdentity") return pass({ identity: { commit: providerIdentity.gitSha, buildId: providerIdentity.buildId }, repositoryCommit: providerIdentity.gitSha, migrationScriptCommit: providerIdentity.gitSha });
    if (name === "inspectCanonicalSource") return pass({ runtimeRevision: request.expectedFounderRevision, runtimeSha256: request.expectedFounderSha256 });
    if (name === "verifyTargetHealth") return pass({ database: { host: "cluster.db.ondigitalocean.com" } });
    if (name === "verifyMigrationScripts") return pass({ productionRunnerWired: true, providerCompositionWired: true });
    return pass();
  })]));
  const backupFreshnessVerifier = { verify: vi.fn(async () => { calls.push("backupFreshness"); return { ready: true, status: "PASS", connectionHost: "cluster.db.ondigitalocean.com", mutated: false }; }) };
  return { runner: createProductionMigrationRunner({ controlStore, adapters, backupFreshnessVerifier }), transition, calls };
}

function memoryStore(seed = null) {
  const records = new Map();
  let enqueued = 0;
  if (seed) records.set(seed.request.operationId, operation(seed.request, seed.payloadFingerprint));
  return {
    async enqueue({ request, payloadFingerprint }) {
      const existing = records.get(request.operationId);
      if (existing) {
        if (existing.result.payloadFingerprint !== payloadFingerprint) throw coded("REMOTE_DRY_RUN_IDEMPOTENCY_PAYLOAD_MISMATCH");
        return { operation: existing, replayed: true };
      }
      enqueued += 1;
      const value = operation(request, payloadFingerprint);
      records.set(request.operationId, value);
      return { operation: value, replayed: false };
    },
    async find(id) { return records.get(id) ?? null; },
    async markRunning(id) { const value = records.get(id); value.state = "running"; value.result.startedAt = new Date().toISOString(); return value; },
    async succeed(id, result) { const value = records.get(id); value.state = "succeeded"; value.result = result; return value; },
    async fail(id, problem, result) { const value = records.get(id); value.state = "failed"; value.problem = problem; value.result = result; return value; },
    async latestWorkerHeartbeat() { return { status: "healthy", buildId: providerIdentity.buildId }; },
    enqueueCount: () => enqueued,
  };
}

function operation(request, payloadFingerprint) {
  return {
    operationId: request.operationId,
    state: "queued",
    version: "1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: {
      operationId: request.operationId,
      correlationId: request.correlationId,
      environment: request.environment,
      payloadFingerprint,
      expectedProductionIdentity: { sourceCommit: request.expectedProductionSourceCommit, buildId: request.expectedProductionBuildId },
      expectedProviderIdentity: { sourceCommit: request.expectedProviderSourceCommit, buildId: request.expectedProviderBuildId },
      finalClassification: "PENDING",
    },
    problem: null,
  };
}

function pass(value = {}) { return { ready: true, mutated: false, ...value }; }
function coded(code) { const error = new Error(code); error.code = code; return error; }
