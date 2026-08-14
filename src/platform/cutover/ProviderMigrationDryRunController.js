import {
  fingerprintProviderMigrationDryRunRequest,
  validateProviderMigrationDryRunRequest,
} from "./ProviderMigrationDryRunContract.js";

export function createProviderMigrationDryRunController({ store, validationContext } = {}) {
  if (!store?.enqueue || !store?.find || !store?.latestWorkerHeartbeat) throw new Error("Remote dry-run controller requires durable operation storage.");
  return Object.freeze({
    async submit(payload) {
      const request = validateProviderMigrationDryRunRequest(payload, validationContext);
      const payloadFingerprint = fingerprintProviderMigrationDryRunRequest(request);
      const queued = await store.enqueue({ request, payloadFingerprint });
      return Object.freeze({ status: queued.operation.state === "succeeded" ? 200 : 202, body: await response(queued.operation, queued.replayed) });
    },
    async status(operationId) {
      const id = identifier(operationId);
      const operation = await store.find(id);
      if (!operation) return Object.freeze({ status: 404, body: { code: "REMOTE_DRY_RUN_NOT_FOUND" } });
      return Object.freeze({ status: operation.state === "failed" ? 409 : 200, body: await response(operation, true) });
    },
  });

  async function response(operation, replayed) {
    return Object.freeze({
      operationId: operation.operationId,
      state: operation.state,
      version: operation.version,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
      correlationId: operation.result?.correlationId ?? null,
      environment: operation.result?.environment ?? null,
      sourceBuild: operation.result?.expectedProductionIdentity ?? operation.result?.productionIdentity ?? null,
      providerSourceBuild: operation.result?.expectedProviderIdentity ?? operation.result?.providerIdentity ?? null,
      migrationControl: operation.result?.migrationControl ?? null,
      providerChecks: operation.result?.providerChecks ?? null,
      noMutation: operation.result?.noMutation ?? null,
      finalClassification: operation.result?.finalClassification ?? "PENDING",
      failureCode: operation.problem?.code ?? null,
      replayed,
      worker: await store.latestWorkerHeartbeat(),
    });
  }
}

function identifier(value) {
  const candidate = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(candidate)) {
    const error = new Error("Remote dry-run operation ID is invalid.");
    error.code = "REMOTE_DRY_RUN_PAYLOAD_INVALID";
    throw error;
  }
  return candidate;
}
