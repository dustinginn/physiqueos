// Production-capable `restoreWindowsAuthority` logic: the real PRE-BOUNDARY recovery adapter for the
// combined-cutover orchestrator.
//
// USES THE REAL STATE MACHINE, NEVER A DIRECT ROW WRITE. This module never touches
// `combined_runtime_authority` directly. It re-reads durable authority, and - when a legal
// pre-boundary cutover is still active - drives `ABORT_TO_WINDOWS` through
// `authorityStore.transition(...)`, i.e. the real `applyCombinedRuntimeAuthorityTransition` /
// `PostgresCombinedRuntimeAuthorityStore`.
//
// WORKS BOTH AS THE ORCHESTRATOR'S OWN ADAPTER AND STANDALONE. `CombinedAppPlatformCutoverOrchestrator
// .recover()` calls `adapters.restoreWindowsAuthority(...)` and THEN, if authority is still in an
// active-cutover state, performs its own `ABORT_TO_WINDOWS` as a fallback. This module performs the
// transition itself (guarded and idempotent via a deterministic commandId), so when plugged in as the
// orchestrator's adapter, the orchestrator's own fallback re-read sees `windows-legacy-authoritative`
// and its redundant attempt becomes a no-op. The same method is therefore also safe to call standalone
// - e.g. by an operator or later automation recovering from a crash where the orchestrator process
// died mid-`recover()` before its own fallback ran.
//
// PROVIDER-SIDE DURABLE EVIDENCE WINS. Before doing anything, this module independently proves
// rollback is still legal via the shared `inspectCombinedCutoverRecovery` decision helper (the same
// logic already proven by the Phase 2B synthetic rehearsal) against a FRESH durable read - never the
// caller-supplied `state`. If `firstProviderCanonicalWriteAt` is non-null, or authority is already
// `recovery-required`, this refuses outright; it never attempts a stale rollback. A SEPARATE guard
// (`assertWindowsFenceRollbackLegal`, Phase 6C) independently checks the Windows-LOCAL migration
// control's own `firstPostgresWriteAt` - a different boundary belonging to a different durable system
// - before touching anything, for the identical reason.
//
// THREE SEPARATE, NON-ATOMIC SURFACES ARE RECONCILED HERE, AND THIS MODULE NEVER PRETENDS OTHERWISE.
// If provider routing was ever activated or verified for this operation (durable evidence, from the
// Phase 5 handoff receipt), this module calls `routingControl.restoreWindowsRoute` and honestly
// records the outcome via the Phase 6A recovery-evidence columns on that same receipt (migration
// 000009) - distinguishing a definite failure from a genuinely AMBIGUOUS one (the routing control
// itself reporting `ROUTING_CONTROL_UNAVAILABLE`, meaning the actual route state cannot be determined
// at all, as opposed to an attempt that was made and explicitly failed). The Windows-LOCAL migration
// control fence (Phase 6C, `combinedCutoverWindowsFenceRelease.js`) is released through the exact same
// `ABORT_TO_LEGACY` transition `ProductionWindowsWriteFenceAdapter.js` already proved releases it -
// no second Windows fence model exists. Windows AUTHORITY still reverts even if routing or fence
// release fails or is ambiguous: `PostgresCombinedRuntimeAuthorityStore` independently refuses
// provider canonical writes once authority is no longer `provider-authoritative`
// (`assertProviderWriteAllowed`), so no dual canonical-write risk exists either way - only the public
// route's destination or Windows' local write-acceptance may remain honestly unresolved, which the
// returned/persisted evidence and `classification` field surface rather than hide.
import { RuntimeAuthority, RuntimeAuthorityAction } from "../CombinedRuntimeAuthorityState.js";
import { requireTransferOperationId, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import { assertCombinedCutoverRoutingControl, RoutingErrorCode } from "../routing/combinedCutoverRoutingControl.js";
import { inspectCombinedCutoverRecovery } from "../combinedCutoverRecoveryDecision.js";
import { assertWindowsFenceRollbackLegal, releaseCombinedCutoverWindowsFence } from "./combinedCutoverWindowsFenceRelease.js";
import { RecoveryErrorCode, recoveryError } from "./combinedCutoverRecoveryContract.js";

const ACTIVE_CUTOVER_AUTHORITIES = Object.freeze([
  RuntimeAuthority.CUTOVER_IN_PROGRESS, RuntimeAuthority.PROVIDER_PREPARED, RuntimeAuthority.PROVIDER,
]);

export function createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore } = {}) {
  if (!authorityStore?.read || !authorityStore?.transition) throw new Error("Windows authority restoration requires the runtime-authority store.");
  if (!handoffReceiptStore?.read) throw new Error("Windows authority restoration requires the durable handoff evidence store.");
  if (!controlStore?.read || !controlStore?.transition) throw new Error("Windows authority restoration requires the durable Windows migration-control store.");
  assertCombinedCutoverRoutingControl(routingControl);

  return Object.freeze({
    async restoreWindowsAuthority({ input, error } = {}) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const durable = (await authorityStore.read()).state;

      const decision = inspectCombinedCutoverRecovery(durable);
      if (decision.rollbackLegal !== true) {
        throw recoveryError(RecoveryErrorCode.ROLLBACK_ILLEGAL, `Windows rollback is not legal: ${decision.reason}`, { classification: decision.classification });
      }

      const activeCutover = ACTIVE_CUTOVER_AUTHORITIES.includes(durable.authority);
      if (activeCutover && String(durable.migrationOperationId ?? "") !== operationId) {
        throw recoveryError(RecoveryErrorCode.CONFLICTING_OPERATION, "Windows authority restoration does not match the currently active combined-cutover operation.");
      }
      if (!activeCutover && durable.migrationOperationId != null && String(durable.migrationOperationId) !== operationId) {
        // Windows is already legacy-authoritative and bound to a DIFFERENT prior operation's leftover
        // identity fields - nothing to restore for the requested operation; treat as a stale/no-op
        // recovery attempt rather than mutating unrelated state.
        return freeze({
          ready: true, classification: "RESTORED", authority: RuntimeAuthority.WINDOWS_LEGACY, operationId,
          firstProviderCanonicalWriteAt: null, routing: { action: "not-required" }, fence: { action: "not-required" },
        });
      }

      // Fail closed BEFORE any other recovery work if the Windows-local system independently shows an
      // irreversible write already happened - checked here, upfront, not only at release time.
      assertWindowsFenceRollbackLegal((await controlStore.read()).state);

      const routingOutcome = await reconcileRouting({ handoffReceiptStore, routingControl, operationId });

      let finalAuthority = durable.authority;
      if (activeCutover) {
        const current = (await authorityStore.read()).state;
        if (ACTIVE_CUTOVER_AUTHORITIES.includes(current.authority)) {
          const result = await authorityStore.transition({
            action: RuntimeAuthorityAction.ABORT_TO_WINDOWS,
            expectedVersion: current.version,
            migrationOperationId: operationId,
            commandId: `combined-cutover-restore-windows:${operationId}`,
            reason: `Pre-write combined cutover recovery restored Windows authority for operation ${operationId}${error?.code ? ` (triggering failure: ${error.code})` : ""}.`,
          });
          finalAuthority = result.state.authority;
        } else {
          finalAuthority = current.authority;
        }
      }

      const fenceOutcome = await releaseCombinedCutoverWindowsFence({ controlStore, operationId, error });

      const authorityRestored = finalAuthority === RuntimeAuthority.WINDOWS_LEGACY;
      const routingOk = ["not-required", "restored"].includes(routingOutcome.action);
      const routingAmbiguous = routingOutcome.action === "restore-ambiguous";
      const fenceOk = ["not-required", "released"].includes(fenceOutcome.action);
      const classification = classifyRestoration({ authorityRestored, routingOk, routingAmbiguous, fenceOk });

      return freeze({
        ready: classification === "RESTORED",
        classification,
        authority: finalAuthority,
        operationId,
        firstProviderCanonicalWriteAt: null,
        routing: routingOutcome,
        fence: fenceOutcome,
      });
    },
  });
}

// "ready" (RESTORED) is honest about ALL THREE halves of recovery: authority reverting to Windows is
// the safe direction regardless of routing/fence outcome (no dual canonical-write risk either way),
// but this must never report full success while routing or fence evidence disagrees. AMBIGUOUS is
// reserved for the one case where authority and the fence both genuinely recovered but routing's true
// state is simply unknown (the routing control itself is unconfigured/unreachable) rather than known
// to have failed; any other partial outcome - including a real routing/fence failure - is PARTIAL.
function classifyRestoration({ authorityRestored, routingOk, routingAmbiguous, fenceOk }) {
  if (!authorityRestored) return "FAILED";
  if (routingOk && fenceOk) return "RESTORED";
  if (routingAmbiguous && fenceOk) return "AMBIGUOUS";
  return "PARTIAL";
}

async function reconcileRouting({ handoffReceiptStore, routingControl, operationId }) {
  let receipt = null;
  try {
    ({ receipt } = await handoffReceiptStore.read(operationId));
  } catch (readError) {
    if (readError?.code !== TransferErrorCode.RECEIPT_UNAVAILABLE) throw readError;
  }

  if (!receipt || !["activated", "verified"].includes(receipt.routingStatus)) {
    return { action: "not-required" };
  }

  try {
    await routingControl.restoreWindowsRoute({
      routingTarget: receipt.routingTarget,
      operationIdentity: {
        operationId,
        commandId: `combined-cutover-restore-route:${operationId}`,
      },
    });
    await handoffReceiptStore.recordWindowsRoutingRestored({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest });
    return { action: "restored" };
  } catch (routingError) {
    // The routing control itself being unconfigured/unreachable means the actual route state is
    // genuinely unknown - distinct from an attempt that was made and explicitly failed - so this is
    // recorded and reported as "ambiguous," never silently folded into "failed".
    if ([RoutingErrorCode.UNAVAILABLE, RoutingErrorCode.AMBIGUOUS].includes(routingError?.code)) {
      await handoffReceiptStore.recordWindowsRoutingRestoreAmbiguous({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest }).catch(() => undefined);
      return { action: "restore-ambiguous", error: safeMessage(routingError) };
    }
    await handoffReceiptStore.recordWindowsRoutingRestoreFailed({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest }).catch(() => undefined);
    return { action: "restore-failed", error: safeMessage(routingError) };
  }
}

function safeMessage(error) {
  const message = String(error?.message ?? "unknown failure");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s|token/i.test(message)) return "see protected server logs";
  return message.slice(0, 300);
}

function freeze(value) { return Object.freeze(value); }
