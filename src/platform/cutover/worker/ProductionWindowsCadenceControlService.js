import { MigrationFenceState } from "../migrationControlState.js";
import { assertCombinedCutoverWorkerControl, WorkerErrorCode, workerControlError } from "./combinedCutoverWorkerControl.js";
import { requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";

/** Phase B only: prove the durable write fence, then quiesce only Runtime Monitor/cadence. */
export function createProductionWindowsCadenceControlService({ controlStore, workerControl } = {}) {
  if (!controlStore?.read) throw new Error("Windows cadence control requires the durable write-fence store.");
  assertCombinedCutoverWorkerControl(workerControl);

  return Object.freeze({
    async inspect({ input } = {}) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const current = (await controlStore.read()).state;
      if (current.migrationOperationId !== operationId || current.fenceState !== MigrationFenceState.ACTIVE || current.writesEnabled !== false) {
        return Object.freeze({ classification: "NOT_APPLIED", evidence: { operationId, status: "windows-fence-not-active" } });
      }
      try {
        const observed = await workerControl.inspectWindowsCadence({ operationId });
        return Object.freeze({
          classification: observed.ready === true ? "COMPLETED" : "NOT_APPLIED",
          evidence: { operationId, status: observed.ready === true ? "windows-cadence-quiesced" : "windows-cadence-active" },
        });
      } catch {
        return Object.freeze({ classification: "AMBIGUOUS", evidence: { operationId, status: "windows-cadence-inspection-unavailable" } });
      }
    },
    async captureAfterWriteFence({ input, fenceEvidence } = {}) {
      const operationId = await requireFence({ input, fenceEvidence });
      return workerControl.captureWindowsCadenceSnapshot({ operationId });
    },
    async quiesceAfterWriteFence({ input, fenceEvidence, snapshot = null } = {}) {
      const operationId = await requireFence({ input, fenceEvidence });
      return workerControl.quiesceWindowsCadence({
        operationId,
        snapshot,
        operationIdentity: {
          operationId,
          commandId: `${required(input?.commandPrefix, "commandPrefix")}:quiesce-runtime-monitor`,
        },
      });
    },
  });

  async function requireFence({ input, fenceEvidence }) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const current = (await controlStore.read()).state;
      if (current.fenceState !== MigrationFenceState.ACTIVE || current.migrationOperationId !== operationId ||
          current.writesEnabled !== false || current.firstPostgresWriteAt != null ||
          !fenceEvidence || fenceEvidence.ready !== true || fenceEvidence.fenceId !== current.fenceId) {
        throw workerControlError(WorkerErrorCode.FENCE_REQUIRED, "Runtime Monitor cannot be changed until the exact durable Windows write fence is active.");
      }
      return operationId;
  }
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}
