// Windows-LOCAL migration-control fence release for pre-boundary combined-cutover recovery.
//
// THE COMBINED CUTOVER HAS TWO SEPARATE, NON-ATOMIC DURABLE SYSTEMS: `combined_runtime_authority`
// (provider-side, cross-runtime) and Windows-local `migrationControlState.js`/
// `DurableMigrationControlStore.js` (the same write-fence Phase 6B's `activateWindowsWriteFence`
// already reuses from the older single-machine production migration path). Recovering ONLY the
// authority row while leaving the Windows-local fence stuck ACTIVE is a real gap: Windows reads
// keep following the maintenance contract and Windows canonical writes stay rejected even though
// `combined_runtime_authority` honestly claims Windows is authoritative again. This module closes
// that gap by driving the SAME `ABORT_TO_LEGACY` transition `ProductionWindowsWriteFenceAdapter.js`'s
// own tests already proved releases the fence - no second Windows fence model is invented.
//
// TWO SEPARATE GUARDS, BOTH FAIL-CLOSED. `assertWindowsFenceRollbackLegal` checks the LOCAL
// migration-control's OWN `firstPostgresWriteAt` (a DIFFERENT boundary than the provider's
// `firstProviderCanonicalWriteAt`, but an equally hard "this must never be treated as still
// Windows-legacy" signal for the SHARED fence): if the older single-machine path - or, in principle,
// any future combined-cutover activity - already recorded a first PostgreSQL canonical write for the
// operation currently holding the fence, claiming "Windows JSON legacy is restored" would be false,
// so this throws rather than releasing. The caller MUST check this BEFORE doing any other recovery
// work (authority, routing), not only immediately before the release attempt, so a genuinely illegal
// recovery attempt is refused before anything else mutates.
//
// OPERATION-BOUND, NEVER SOMEONE ELSE'S FENCE. If the fence is active for a DIFFERENT operation than
// the one being recovered, this never touches it - it is simply "not required" for the operation at
// hand, exactly like `reconcileRouting`'s handling of a missing handoff receipt.
//
// THE ACTUAL RELEASE ATTEMPT IS SOFT-CAUGHT, MATCHING ROUTING RESTORATION'S OWN PHILOSOPHY. Once the
// hard guards pass, the state-machine transition itself can still fail for reasons unrelated to
// legality (a lock timeout, a version race) - these are caught and returned as `release-failed`
// evidence rather than thrown, so a genuinely-illegal-vs-merely-unlucky failure can be told apart by
// the caller and the overall restoration result can honestly report partial success.
import { MigrationControlAction, MigrationFenceState } from "../migrationControlState.js";
import { RecoveryErrorCode, recoveryError } from "./combinedCutoverRecoveryContract.js";

const ACTIVE_FENCE_STATES = Object.freeze([MigrationFenceState.ACTIVE, MigrationFenceState.CUTOVER_IN_PROGRESS]);

export function assertWindowsFenceRollbackLegal(controlState) {
  if (controlState?.firstPostgresWriteAt != null) {
    throw recoveryError(RecoveryErrorCode.ROLLBACK_ILLEGAL, "Windows-local migration-control already recorded a first PostgreSQL canonical write; the write fence cannot be released as a Windows rollback.");
  }
  return controlState;
}

export async function releaseCombinedCutoverWindowsFence({ controlStore, operationId, error } = {}) {
  if (!controlStore?.read || !controlStore?.transition) throw new Error("Windows fence release requires the durable migration-control store.");
  const current = (await controlStore.read()).state;
  assertWindowsFenceRollbackLegal(current);

  if (!ACTIVE_FENCE_STATES.includes(current.fenceState)) {
    return freeze({ action: "not-required", fenceState: current.fenceState });
  }
  if (current.migrationOperationId !== operationId) {
    // A different, unrelated operation currently holds the fence - never release it on this
    // operation's behalf.
    return freeze({ action: "not-required", fenceState: current.fenceState });
  }

  try {
    const result = await controlStore.transition({
      action: MigrationControlAction.ABORT_TO_LEGACY,
      commandId: `combined-cutover-release-fence:${operationId}`,
      correlationId: operationId,
      operator: "combined-cutover-recovery",
      reason: `Pre-write combined cutover recovery released the Windows write fence for operation ${operationId}${error?.code ? ` (triggering failure: ${error.code})` : ""}.`,
      expectedVersion: current.version,
      expectedFenceState: current.fenceState,
      expectedCanonicalStoreEpoch: current.canonicalStoreEpoch,
      expectedCompositionMode: current.compositionMode,
      migrationOperationId: operationId,
    });
    return freeze({ action: "released", fenceState: result.state.fenceState, writesEnabled: result.state.writesEnabled });
  } catch (releaseError) {
    return freeze({ action: "release-failed", error: safeMessage(releaseError) });
  }
}

function safeMessage(error) {
  const message = String(error?.message ?? "unknown failure");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s|token/i.test(message)) return "see protected server logs";
  return message.slice(0, 300);
}

function freeze(value) { return Object.freeze(value); }
