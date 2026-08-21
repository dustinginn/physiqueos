import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { inspectCombinedCutoverRecovery } from "../combinedCutoverRecoveryDecision.js";
import { MigrationFenceState } from "../migrationControlState.js";
import { assertWindowsFenceRollbackLegal } from "../recovery/combinedCutoverWindowsFenceRelease.js";
import { RecoveryErrorCode, recoveryError } from "../recovery/combinedCutoverRecoveryContract.js";
import { requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";
import { assertCombinedCutoverWorkerControl } from "./combinedCutoverWorkerControl.js";

/**
 * Pre-M recovery composition: routing/authority/fence restoration must fully succeed before the
 * exact Runtime Monitor snapshot may be restored. This never restores Production Server or Ngrok;
 * those remained available throughout the pre-M window.
 */
export function createProductionWindowsWorkerRestorationService({
  authorityStore,
  controlStore,
  authorityRestorationService,
  workerControl,
} = {}) {
  if (!authorityStore?.read) throw new Error("Windows worker restoration requires the authority store.");
  if (!controlStore?.read) throw new Error("Windows worker restoration requires the Windows fence store.");
  if (typeof authorityRestorationService?.restoreWindowsAuthority !== "function") throw new Error("Windows worker restoration requires authority/routing/fence restoration.");
  assertCombinedCutoverWorkerControl(workerControl);

  return Object.freeze({
    async restorePreBoundaryWindows({ input, snapshot, error } = {}) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const beforeAuthority = (await authorityStore.read()).state;
      const decision = inspectCombinedCutoverRecovery(beforeAuthority);
      if (decision.rollbackLegal !== true) {
        throw recoveryError(RecoveryErrorCode.ROLLBACK_ILLEGAL, `Windows worker restoration is illegal: ${decision.reason}`);
      }
      assertWindowsFenceRollbackLegal((await controlStore.read()).state);

      const base = await authorityRestorationService.restoreWindowsAuthority({ input, error });
      if (base?.ready !== true || base.classification !== "RESTORED") {
        return Object.freeze({ ready: false, classification: "BASE_RESTORATION_INCOMPLETE", base, cadence: { action: "not-attempted" } });
      }

      const afterAuthority = (await authorityStore.read()).state;
      const afterControl = (await controlStore.read()).state;
      if (afterAuthority.authority !== RuntimeAuthority.WINDOWS_LEGACY || afterAuthority.firstProviderCanonicalWriteAt != null ||
          afterAuthority.firstProviderCommandId != null || afterControl.firstPostgresWriteAt != null ||
          [MigrationFenceState.ACTIVE, MigrationFenceState.CUTOVER_IN_PROGRESS].includes(afterControl.fenceState) || afterControl.writesEnabled !== true) {
        throw recoveryError(RecoveryErrorCode.ROLLBACK_ILLEGAL, "Runtime Monitor restoration requires fully restored Windows authority and a released write fence.");
      }

      const cadence = await workerControl.restoreWindowsWorkers({
        operationId,
        snapshot,
        operationIdentity: {
          operationId,
          commandId: `combined-cutover-recovery:${operationId}:restore-runtime-monitor`,
        },
      });
      return Object.freeze({ ready: true, classification: "RESTORED", base, cadence });
    },
  });
}
