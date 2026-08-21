import { describe, expect, it, vi } from "vitest";
import { createProductionProviderPreBoundaryInspector } from "./ProductionProviderPreBoundaryInspector.js";

describe("ProductionProviderPreBoundaryInspector", () => {
  it("proves the exact worker remains authority-paused and outbox-ready before M", async () => {
    const fixture = harness();
    await expect(fixture.inspector.inspect(context())).resolves.toMatchObject({ ready: true, workerStatus: "paused_authority", outboxReady: true, providerWorkerId: "worker-1" });
    expect(fixture.workerControl.inspectWorkerState).toHaveBeenCalledWith({ operationId: "operation-1", providerDeploymentId: "deployment-1" });
  });
  it.each([
    ["active worker", { heartbeatStatus: "healthy" }, {}],
    ["wrong worker", { workerId: "other" }, {}],
    ["unconverged outbox", {}, { outboxConverged: false }],
    ["wrong outbox operation", {}, { migrationOperationId: "other" }],
  ])("fails closed for %s", async (_label, provider, outbox) => {
    await expect(harness({ provider, outbox }).inspector.inspect(context())).resolves.toMatchObject({ ready: false });
  });
});

function harness({ provider = {}, outbox = {} } = {}) {
  const workerControl = { inspectWorkerState: vi.fn(async () => ({ provider: { heartbeatStatus: "paused_authority", deploymentId: "deployment-1", buildId: "build-1", workerId: "worker-1", ...provider } })) };
  const outboxInspector = { inspect: vi.fn(async () => ({ ready: true, outboxConverged: true, migrationOperationId: "operation-1", providerDeploymentId: "deployment-1", providerBuildId: "build-1", ...outbox })) };
  const configuration = { provider: { deploymentId: "deployment-1", buildId: "build-1" } };
  return { workerControl, inspector: createProductionProviderPreBoundaryInspector({ configuration, workerControl, outboxInspector }) };
}
function context() { return { run: { migrationOperationId: "operation-1" }, input: { migrationOperationId: "operation-1", providerWorkerId: "worker-1" } }; }
