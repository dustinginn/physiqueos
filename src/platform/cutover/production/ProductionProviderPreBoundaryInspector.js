/** H/I/J worker/outbox/source/build readback. It cannot mutate either provider or Windows. */
export function createProductionProviderPreBoundaryInspector({ configuration, workerControl, outboxInspector } = {}) {
  if (!configuration?.provider?.deploymentId || !configuration?.provider?.buildId) throw new Error("Provider pre-boundary inspection requires Phase7BProductionConfiguration.");
  if (typeof workerControl?.inspectWorkerState !== "function") throw new Error("Provider pre-boundary inspection requires workerControl.inspectWorkerState.");
  if (typeof outboxInspector?.inspect !== "function") throw new Error("Provider pre-boundary inspection requires outboxInspector.inspect.");
  return Object.freeze({ inspect });

  async function inspect({ run, input } = {}) {
    const operationId = String(run?.migrationOperationId ?? "");
    if (!operationId || operationId !== input?.migrationOperationId) throw new Error("Provider pre-boundary operation identity mismatch.");
    const worker = await workerControl.inspectWorkerState({ operationId, providerDeploymentId: configuration.provider.deploymentId });
    const outbox = await outboxInspector.inspect({ run, input });
    const provider = worker.provider;
    const ready = provider?.heartbeatStatus === "paused_authority" && provider.deploymentId === configuration.provider.deploymentId &&
      provider.buildId === configuration.provider.buildId && provider.workerId === input?.providerWorkerId &&
      outbox?.ready === true && outbox.outboxConverged === true && outbox.migrationOperationId === operationId &&
      outbox.providerDeploymentId === configuration.provider.deploymentId && outbox.providerBuildId === configuration.provider.buildId;
    return Object.freeze({
      ready,
      migrationOperationId: operationId,
      workerStatus: provider?.heartbeatStatus ?? "unknown",
      outboxReady: outbox?.ready === true && outbox.outboxConverged === true,
      providerDeploymentId: provider?.deploymentId ?? null,
      providerBuildId: provider?.buildId ?? null,
      providerWorkerId: provider?.workerId ?? null,
    });
  }
}
