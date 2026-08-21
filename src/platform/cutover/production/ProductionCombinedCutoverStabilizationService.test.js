import { describe, expect, it, vi } from "vitest";
import { createProductionCombinedCutoverStabilizationService } from "./ProductionCombinedCutoverStabilizationService.js";

const NOW = "2026-08-21T06:00:00.000Z";
const identity = Object.freeze({
  runId: "phase7b-stabilization-run",
  migrationOperationId: "phase7b-stabilization-operation",
  providerDeploymentId: "phase7b-stabilization-deployment",
  providerBuildId: "phase7b-stabilization-build",
  firstProviderCommandId: "phase7b-stabilization-command",
});

describe("ProductionCombinedCutoverStabilizationService", () => {
  it("accepts only fresh exact eight-category P evidence and performs no mutation", async () => {
    const fixtures = evidenceFixtures();
    const service = createService(fixtures);
    const result = await service.inspect(context());
    expect(result).toMatchObject({
      phase: "P",
      classification: "COMPLETED",
      categories: {
        health: true, readiness: true, worker: true, authority: true,
        routing: true, backups: true, domainMediaOutbox: true, crossClient: true,
      },
      evidence: {
        runId: identity.runId,
        operationId: identity.migrationOperationId,
        providerDeploymentId: identity.providerDeploymentId,
        buildId: identity.providerBuildId,
        status: "explicit-stabilization-evidence-complete",
      },
    });
    expect(await service.execute(context())).toEqual(result);
    expect(Object.values(fixtures).every((inspector) => inspector.inspect.mock.calls.length === 2)).toBe(true);
  });

  it.each([
    ["health", { httpStatus: 503 }],
    ["readiness", { deadlineBounded: false }],
    ["worker", { workerStatus: "stale" }],
    ["authority", { firstProviderCommandId: "wrong-command" }],
    ["routing", { publicHttpsReady: false }],
    ["backups", { spacesRestoreVerified: false }],
    ["domainMediaOutbox", { outboxConverged: false }],
    ["crossClient", { previousNativeAccepted: false }],
  ])("blocks when %s evidence fails its explicit contract", async (category, override) => {
    const fixtures = evidenceFixtures({ [category]: override });
    const result = await createService(fixtures).inspect(context());
    expect(result.classification).toBe("BLOCKED");
    expect(result.categories[category]).toBe(false);
    expect(result.blockingPreconditions).toContain(`${category}:acceptance-contract-failed`);
  });

  it.each([
    ["stale", { checkedAt: "2026-08-21T05:54:59.999Z" }, "evidence-stale"],
    ["future", { checkedAt: "2026-08-21T06:00:05.001Z" }, "evidence-from-future"],
    ["wrong run", { runId: "another-run" }, "runId-mismatch"],
    ["wrong operation", { migrationOperationId: "another-operation" }, "migrationOperationId-mismatch"],
    ["wrong deployment", { providerDeploymentId: "another-deployment" }, "providerDeploymentId-mismatch"],
    ["wrong build", { providerBuildId: "another-build" }, "providerBuildId-mismatch"],
  ])("fails closed on %s evidence", async (_label, override, reason) => {
    const fixtures = evidenceFixtures({ health: override });
    const result = await createService(fixtures).inspect(context());
    expect(result.classification).toBe("BLOCKED");
    expect(result.blockingPreconditions).toContain(`health:${reason}`);
  });

  it("classifies unavailable inspection as ambiguous and never manufactures timer success", async () => {
    const fixtures = evidenceFixtures();
    fixtures.routing.inspect.mockRejectedValueOnce(new Error("network unavailable"));
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      const result = await createService(fixtures).inspect(context());
      expect(result.classification).toBe("AMBIGUOUS");
      expect(result.categories.routing).toBe(false);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});

function createService(fixtures) {
  return createProductionCombinedCutoverStabilizationService({
    healthInspector: fixtures.health,
    readinessInspector: fixtures.readiness,
    workerInspector: fixtures.worker,
    authorityInspector: fixtures.authority,
    routingInspector: fixtures.routing,
    backupInspector: fixtures.backups,
    domainMediaOutboxInspector: fixtures.domainMediaOutbox,
    crossClientInspector: fixtures.crossClient,
    now: () => new Date(NOW),
  });
}

function context() {
  return {
    run: { runId: identity.runId, migrationOperationId: identity.migrationOperationId },
    input: {
      migrationOperationId: identity.migrationOperationId,
      providerDeploymentId: identity.providerDeploymentId,
      providerBuildId: identity.providerBuildId,
      firstProviderCommandId: identity.firstProviderCommandId,
    },
  };
}

function evidenceFixtures(overrides = {}) {
  const common = {
    ready: true,
    checkedAt: "2026-08-21T05:59:30.000Z",
    runId: identity.runId,
    migrationOperationId: identity.migrationOperationId,
    providerDeploymentId: identity.providerDeploymentId,
    providerBuildId: identity.providerBuildId,
  };
  const values = {
    health: { ...common, httpStatus: 200, buildId: identity.providerBuildId },
    readiness: { ...common, httpStatus: 200, deadlineBounded: true },
    worker: { ...common, workerStatus: "healthy", workerRole: "provider" },
    authority: { ...common, authority: "provider-authoritative", publicRuntimeAuthority: "provider", writesEnabled: true,
      firstProviderCanonicalWriteAt: "2026-08-21T05:58:00.000Z", firstProviderCommandId: identity.firstProviderCommandId },
    routing: { ...common, routingRole: "provider", publicHttpsReady: true },
    backups: { ...common, windowsRestoreVerified: true, postgresRestoreVerified: true, spacesRestoreVerified: true, retentionPolicyAccepted: true },
    domainMediaOutbox: { ...common, domainReady: true, mediaParity: true, outboxConverged: true },
    crossClient: { ...common, webAccepted: true, currentNativeAccepted: true, previousNativeAccepted: true },
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { inspect: vi.fn(async () => ({ ...value, ...(overrides[key] ?? {}) })) }]));
}
