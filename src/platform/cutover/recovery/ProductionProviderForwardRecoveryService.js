// Production-capable `enterProviderRecovery` logic: the real POST-BOUNDARY forward-recovery adapter
// for the combined-cutover orchestrator.
//
// ACTIVATES ONLY WHEN PROVIDER-SIDE DURABLE EVIDENCE PROVES WINDOWS ROLLBACK IS NO LONGER LEGAL. This
// module re-reads durable `combined_runtime_authority` and runs it through the same shared
// `inspectCombinedCutoverRecovery` decision helper the Phase 2B synthetic rehearsal already proved
// (`combinedCutoverRecoveryDecision.js`). It refuses (throws) unless `forwardRecoveryRequired` is
// true, which requires `firstProviderCanonicalWriteAt` to be non-null OR authority already
// `recovery-required` - LOCAL migration-control state (e.g. `firstPostgresWriteAt`) is never
// consulted, so a hard crash after the provider first-write COMMIT but before any local mirror update
// still correctly classifies as forward-repair-required.
//
// USES THE REAL STATE MACHINE, NEVER A DIRECT ROW WRITE - AND OFTEN NEEDS NO WRITE AT ALL.
// `CombinedAppPlatformCutoverOrchestrator.recover()` already performs the real `REQUIRE_RECOVERY`
// transition itself, BEFORE calling `adapters.enterProviderRecovery(...)` - so in the ordinary
// orchestrator-driven flow, durable authority is already `recovery-required` by the time this module
// runs, and the orchestrator's own audit row (action=`require-provider-recovery`, reason citing the
// triggering failure) is already sufficient durable evidence identifying the owning operation and why
// forward recovery was required; no new schema was added for this adapter. When this module IS asked
// to perform the transition itself - e.g. invoked standalone, outside the orchestrator - it drives
// `REQUIRE_RECOVERY` through `authorityStore.transition(...)` (the real
// `applyCombinedRuntimeAuthorityTransition` / `PostgresCombinedRuntimeAuthorityStore`), guarded so a
// second call for an already-recovery-required operation is a safe no-op rather than a rejected
// transition.
//
// WHAT THIS MODULE NEVER DOES, BY CONSTRUCTION. It accepts no routing-control and no canonical-record
// dependency at all, so it cannot revert public routing to Windows, cannot start or stop a worker, and
// cannot delete or mutate provider canonical state or Founder legacy data even by mistake. It never
// attempts `ABORT_TO_WINDOWS`, and `firstProviderCanonicalWriteAt` cannot be cleared through any
// `CombinedRuntimeAuthorityState` transition - there is no such action.
import { RuntimeAuthority, RuntimeAuthorityAction } from "../CombinedRuntimeAuthorityState.js";
import { requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";
import { inspectCombinedCutoverRecovery } from "../combinedCutoverRecoveryDecision.js";
import { RecoveryErrorCode, recoveryError } from "./combinedCutoverRecoveryContract.js";

export function createProductionProviderForwardRecoveryService({ authorityStore } = {}) {
  if (!authorityStore?.read || !authorityStore?.transition) throw new Error("Provider forward recovery requires the runtime-authority store.");

  return Object.freeze({
    async enterProviderRecovery({ input, error } = {}) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const durable = (await authorityStore.read()).state;

      const decision = inspectCombinedCutoverRecovery(durable);
      if (decision.forwardRecoveryRequired !== true) {
        throw recoveryError(RecoveryErrorCode.FORWARD_RECOVERY_NOT_YET_REQUIRED, `Provider forward recovery is not yet required: ${decision.reason}`, { classification: decision.classification });
      }
      if (String(durable.migrationOperationId ?? "") !== operationId) {
        throw recoveryError(RecoveryErrorCode.CONFLICTING_OPERATION, "Provider forward recovery does not match the durable owning operation.");
      }

      let finalState = durable;
      if (durable.authority === RuntimeAuthority.PROVIDER) {
        const result = await authorityStore.transition({
          action: RuntimeAuthorityAction.REQUIRE_RECOVERY,
          expectedVersion: durable.version,
          migrationOperationId: operationId,
          commandId: `combined-cutover-enter-recovery:${operationId}`,
          reason: `Provider forward repair required after first canonical write${error?.code ? ` (triggering failure: ${error.code})` : ""}.`,
        });
        finalState = result.state;
      } // else already recovery-required for this operation: idempotent no-op.

      return freeze({
        ready: true,
        classification: "FORWARD_REPAIR_REQUIRED",
        authority: finalState.authority,
        operationId,
        firstProviderCanonicalWriteAt: finalState.firstProviderCanonicalWriteAt,
        firstProviderCommandId: finalState.firstProviderCommandId,
        reason: decision.reason,
      });
    },
  });
}

function freeze(value) { return Object.freeze(value); }
