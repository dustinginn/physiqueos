// Production `verifyAuthorization` preflight adapter for `CombinedAppPlatformCutoverOrchestrator`.
//
// The orchestrator's own `preflight()` wrapper already re-reads durable `combined_runtime_authority`
// and rejects unless it is exactly `windows-legacy-authoritative` with writes enabled and
// `firstProviderCanonicalWriteAt` null, BEFORE any adapter in the six-preflight set even runs. This
// adapter still independently re-derives the same facts (defense in depth, and so a future
// standalone readiness check that calls these adapters directly - not only through
// `orchestrator.execute()`/`.rehearse()` - gets the same proof), and REUSES the exact decision helper
// already proven in Phase 6A (`inspectCombinedCutoverRecovery`) rather than re-deriving similar logic:
// "Combined cutover authority state is the exact pre-cutover Windows-authoritative state",
// "firstProviderCanonicalWriteAt is null", "Provider production writes are not already authoritative",
// and "no existing incomplete provider-forward-recovery state makes a fresh cutover unsafe" are all a
// single fact in that state machine - once `firstProviderCanonicalWriteAt` is ever set, there is no
// transition back to `windows-legacy-authoritative`, so requiring exactly that classification already
// proves all four.
//
// It additionally guards against migration-operation-ID reuse: if durable Phase 4 preparation or
// Phase 5 handoff evidence already exists for the proposed operation ID, a fresh cutover under that
// same ID would later collide with those stores' own conflict-detection - this preflight catches that
// early, with a clear reason, rather than letting it surface as a confusing mid-flight failure.
import { requireTransferOperationId, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import { inspectCombinedCutoverRecovery } from "../combinedCutoverRecoveryDecision.js";

export function createVerifyAuthorizationPreflight({ authorityStore, environment, preparationStore = null, handoffReceiptStore = null } = {}) {
  if (!authorityStore?.read) throw new Error("verifyAuthorization requires the runtime-authority store.");
  if (!String(environment ?? "").trim()) throw new Error("verifyAuthorization requires the target environment.");

  return async ({ input } = {}) => {
    const operationId = requireTransferOperationId(input?.migrationOperationId);
    const durable = (await authorityStore.read()).state;

    if (durable.environment !== environment) {
      return blocked("COMBINED_CUTOVER_AUTHORITY_ENVIRONMENT_MISMATCH", "Durable runtime authority environment does not match the configured combined-cutover environment.");
    }

    const decision = inspectCombinedCutoverRecovery(durable);
    if (decision.classification !== "WINDOWS_AUTHORITATIVE") {
      return blocked("COMBINED_CUTOVER_AUTHORITY_NOT_ELIGIBLE", decision.reason, { classification: decision.classification });
    }

    if (preparationStore && (await evidenceAlreadyExists(preparationStore, operationId))) {
      return blocked("COMBINED_CUTOVER_OPERATION_ID_REUSED", "Durable Phase 4 preparation evidence already exists for this migration operation ID.");
    }
    if (handoffReceiptStore && (await evidenceAlreadyExists(handoffReceiptStore, operationId))) {
      return blocked("COMBINED_CUTOVER_OPERATION_ID_REUSED", "Durable Phase 5 handoff evidence already exists for this migration operation ID.");
    }

    return freeze({ ready: true, mutated: false, authority: durable.authority, environment: durable.environment, classification: decision.classification, operationId });
  };
}

async function evidenceAlreadyExists(store, operationId) {
  try {
    await store.read(operationId);
    return true;
  } catch (error) {
    if (error?.code === TransferErrorCode.RECEIPT_UNAVAILABLE) return false;
    throw error;
  }
}

function blocked(code, reason, extra = {}) {
  return freeze({ ready: false, mutated: false, code, reason, ...extra });
}

function freeze(value) { return Object.freeze(value); }
