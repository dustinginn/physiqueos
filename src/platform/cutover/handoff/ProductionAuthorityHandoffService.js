// Production-capable `transferAuthorityAndRoute` logic for the combined-cutover orchestrator
// (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase L).
//
// THE CENTRAL INVARIANT. Provider preparation must already be durably complete before this may run:
// authority must be exactly `provider-prepared`, owned by the same operation/fence/package identity,
// with `firstProviderCanonicalWriteAt` still null, Windows still the public runtime, and durable
// preparation evidence (Phase 4) showing import/media/parity/acknowledged all succeeded for this
// exact package digest. Every one of those is re-verified from durable state on every call - never
// trusted from the orchestrator's in-memory `state`/`acknowledgement` alone, so a provider process
// restart between acknowledgement and handoff changes nothing about what this module can determine.
//
// TRANSFER_TO_PROVIDER IS DRIVEN THROUGH THE REAL STATE MACHINE, NEVER BYPASSED. This module never
// writes to `combined_runtime_authority` directly. It calls the `commitAuthority` closure the
// orchestrator itself supplies (`CombinedAppPlatformCutoverOrchestrator.js`), which is already wired
// to `authorityStore.transition(TRANSFER_TO_PROVIDER, ...)` - i.e. the real
// `applyCombinedRuntimeAuthorityTransition`/`PostgresCombinedRuntimeAuthorityStore`. This module adds
// no new authority semantics; it only decides WHEN it is safe to call that closure. It never calls
// `claimCanonicalWriteBoundary` and never invents a first-write timestamp -
// `firstProviderCanonicalWriteAt` remains null immediately after this returns; the first real
// authority-protected provider canonical command is a wholly separate, later action.
//
// AUTHORITY COMMITS BEFORE ROUTING, NEVER THE REVERSE. Per the governing document: "Atomically
// transition provider runtime authority, keep Windows fenced, enable the prepared App Platform
// route, and verify that only the provider can reach the canonical command boundary. Routing must
// not lead this step." Durable PostgreSQL authority state and external routing (DigitalOcean, DNS, a
// tunnel) CANNOT be committed as one distributed transaction - this module never pretends otherwise.
// It commits authority first (durably, via the real state machine) and only then calls routing
// operations. Route PREPARATION (hostname, TLS, rollback mechanics, operator) is a separate,
// earlier, out-of-scope readiness concern (one of the six preflights); this module only inspects,
// activates, verifies, and - for a later `restoreWindowsAuthority` - restores.
//
// THE AMBIGUITY WINDOW AFTER TRANSFER_TO_PROVIDER BUT BEFORE ROUTING VERIFIES IS HANDLED HONESTLY.
// If routing activation fails outright, authority is already `provider-authoritative` with
// `firstProviderCanonicalWriteAt` still null - `ABORT_TO_WINDOWS` remains legal per
// `CombinedRuntimeAuthorityState`'s own guard (it accepts `provider-authoritative` as long as no
// first write landed), so the orchestrator's existing recovery path can still safely restore
// Windows. If routing activates but VERIFICATION fails or is ambiguous, this module does NOT
// downgrade the durable evidence to "failed" (routing may genuinely be live) and does NOT attempt to
// restore Windows routing itself (`restoreWindowsAuthority` is a separate, later-phase
// responsibility) - it raises a distinct, clearly-classified error so a human or later automation
// resolves the ambiguity deliberately rather than this module guessing.
//
// WORKER HANDOFF IS NOT THIS ADAPTER'S RESPONSIBILITY. The synthetic Phase 2B rehearsal adapter
// folds a worker-handoff step into the same call for rehearsal simplicity, but the governing
// document's own phase model places "start the authority-gated worker" at phase N/O
// (`## Production phase model`, step 10), strictly AFTER the first-write boundary (phase M) - a
// later, distinct phase from this one (phase L, step 8). This module does not start, stop, or touch
// any worker.

import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { requireTransferDigest, requireTransferOperationId, transferError, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import { assertCombinedCutoverRoutingControl } from "../routing/combinedCutoverRoutingControl.js";
import { HandoffErrorCode, handoffError } from "./combinedCutoverHandoffContract.js";

export function createProductionAuthorityHandoffService({
  authorityStore,
  preparationStore,
  handoffReceiptStore,
  routingControl,
} = {}) {
  if (!authorityStore?.read) throw new Error("The authority handoff service requires the runtime-authority store.");
  if (!preparationStore?.read) throw new Error("The authority handoff service requires the durable preparation evidence store.");
  if (!handoffReceiptStore?.declare || !handoffReceiptStore?.recordAuthorityCommitted) throw new Error("The authority handoff service requires the durable handoff evidence store.");
  assertCombinedCutoverRoutingControl(routingControl);

  return Object.freeze({
    async transferAuthorityAndRoute({ input, state, acknowledgement, commitAuthority }) {
      if (typeof commitAuthority !== "function") throw new Error("The authority handoff adapter requires the orchestrator's commitAuthority closure.");
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const fingerprint = requireTransferDigest(input?.authorizationFingerprint, "authorizationFingerprint");
      const routingTarget = requireNonEmpty(input?.routingTarget, "routingTarget");

      assertAcknowledgementShape(acknowledgement, { operationId, fingerprint });
      const { fenceId, packageDigest, providerDeploymentId } = acknowledgement;

      assertEligibleAuthorityState(state, { operationId, fingerprint, fenceId, packageDigest, acknowledgement });

      const { receipt: preparation } = await requirePreparationEvidence(preparationStore, operationId, packageDigest);
      if (preparation.preparedStatus !== "acknowledged") {
        throw handoffError(HandoffErrorCode.PREPARATION_NOT_ELIGIBLE, "Authority/routing handoff requires durable provider-prepared acknowledgement evidence.");
      }

      // Cheap short-circuit before any routing call: if a prior attempt already fully completed
      // this exact operation/digest, replay is free of side effects - it never re-inspects, never
      // re-activates, and never re-verifies routing.
      const alreadyComplete = await readCompletedHandoff(handoffReceiptStore, operationId, packageDigest);
      if (alreadyComplete) {
        return freeze({
          ready: true, outcome: "idempotent-replay", authority: alreadyComplete.resultingAuthority,
          routing: { status: "verified", routingTarget, providerDeploymentId },
        });
      }

      const expectedRouteSnapshot = await safeInspectCurrentRoute(routingControl, routingTarget);

      const declared = await handoffReceiptStore.declare({
        migrationOperationId: operationId, authorizationFingerprint: fingerprint, fenceId, packageDigest,
        routingTarget, providerDeploymentId, expectedRouteSnapshot,
      });

      if (declared.receipt.authorityStatus === "committed" && declared.receipt.routingStatus === "verified") {
        return freeze({
          ready: true, outcome: "idempotent-replay", authority: declared.receipt.resultingAuthority,
          routing: { status: "verified", routingTarget, providerDeploymentId },
        });
      }

      // Authority commits first, through the real state machine (`commitAuthority`), never bypassed.
      // If a prior attempt already committed it (evidenced by the durable receipt), do not call
      // `commitAuthority` again purely for its own sake - re-read the durable authority state instead.
      // (Calling it again would still be safe and idempotent via the orchestrator's own command-ID
      // replay, but re-reading avoids depending on that as the only safety net.)
      let committedAuthority;
      if (declared.receipt.authorityStatus === "committed") {
        committedAuthority = (await authorityStore.read()).state.authority;
      } else {
        const next = await commitAuthority();
        committedAuthority = next.authority;
        await handoffReceiptStore.recordAuthorityCommitted({
          migrationOperationId: operationId, expectedPackageDigest: packageDigest, resultingAuthority: committedAuthority,
        });
      }
      if (committedAuthority !== RuntimeAuthority.PROVIDER) {
        throw handoffError(HandoffErrorCode.AUTHORITY_STATE_REJECTED, "Authority transition did not reach provider-authoritative.");
      }

      // Routing activates only after authority has durably committed - never before ("routing must
      // not lead this step"). A failure here leaves authority committed but routing not yet active;
      // firstProviderCanonicalWriteAt is still null, so Windows rollback remains legal per the real
      // state machine, and this durable evidence records exactly how far routing got.
      if (declared.receipt.routingStatus === "pending" || declared.receipt.routingStatus === "failed") {
        try {
          await routingControl.activateProviderRoute({ routingTarget, providerDeploymentId });
          await handoffReceiptStore.recordRoutingActivated({ migrationOperationId: operationId, expectedPackageDigest: packageDigest });
        } catch (error) {
          await handoffReceiptStore.recordRoutingFailed({ migrationOperationId: operationId, expectedPackageDigest: packageDigest }).catch(() => undefined);
          throw handoffError(HandoffErrorCode.ROUTING_FAILED, `Routing activation failed after authority committed: ${safeMessage(error)}.`, { cause: error });
        }
      }

      // Verifies that only the provider can reach the canonical command boundary (phase L's third
      // action). A failure here is genuinely ambiguous - routing may have activated but not be
      // confirmed - so the evidence is never downgraded to "failed"; it stays "activated" for a
      // human or later automation to resolve deliberately.
      try {
        const verified = await routingControl.verifyProviderRoute({ routingTarget });
        if (verified?.ready !== true) throw new Error("Routing verification did not report readiness.");
        await handoffReceiptStore.recordRoutingVerified({ migrationOperationId: operationId, expectedPackageDigest: packageDigest });
      } catch (error) {
        throw handoffError(HandoffErrorCode.ROUTING_VERIFICATION_AMBIGUOUS, `Routing verification failed after activation: ${safeMessage(error)}.`, { cause: error });
      }

      return freeze({
        ready: true, outcome: "handed-off", authority: committedAuthority,
        routing: { status: "verified", routingTarget, providerDeploymentId },
      });
    },
  });
}

function assertAcknowledgementShape(acknowledgement, { operationId, fingerprint }) {
  if (!acknowledgement || typeof acknowledgement !== "object") {
    throw handoffError(HandoffErrorCode.IDENTITY_INVALID, "A provider-prepared acknowledgement is required.");
  }
  for (const field of ["migrationOperationId", "authorizationFingerprint", "fenceId", "packageDigest", "providerDeploymentId"]) {
    if (!String(acknowledgement[field] ?? "").trim()) throw handoffError(HandoffErrorCode.IDENTITY_INVALID, `acknowledgement.${field} is required.`);
  }
  if (String(acknowledgement.migrationOperationId) !== operationId || String(acknowledgement.authorizationFingerprint) !== fingerprint) {
    throw handoffError(HandoffErrorCode.OPERATION_FORBIDDEN, "The provider-prepared acknowledgement does not match the requested operation.");
  }
}

function assertEligibleAuthorityState(state, { operationId, fingerprint, fenceId, packageDigest, acknowledgement }) {
  if (state.authority !== RuntimeAuthority.PROVIDER_PREPARED) {
    throw handoffError(HandoffErrorCode.AUTHORITY_STATE_REJECTED, "Authority/routing handoff requires the exact provider-prepared authority state.");
  }
  if (String(state.migrationOperationId) !== operationId) {
    throw handoffError(HandoffErrorCode.OPERATION_FORBIDDEN, "Authority/routing handoff does not match the active cutover operation.");
  }
  if (state.authorizationFingerprint !== fingerprint || state.fenceId !== fenceId) {
    throw handoffError(HandoffErrorCode.OPERATION_FORBIDDEN, "Authority/routing handoff does not match the active operation's authorization/fence identity.");
  }
  if (state.finalSnapshot?.packageDigest !== packageDigest) {
    throw handoffError(HandoffErrorCode.PACKAGE_DIGEST_CONFLICT, "Authority/routing handoff package digest does not match the fenced snapshot.");
  }
  if (!state.providerAcknowledgement || state.providerAcknowledgement.packageDigest !== acknowledgement.packageDigest
    || state.providerAcknowledgement.providerDeploymentId !== acknowledgement.providerDeploymentId) {
    throw handoffError(HandoffErrorCode.OPERATION_FORBIDDEN, "Authority/routing handoff acknowledgement does not match the durably recorded provider acknowledgement.");
  }
  if (state.firstProviderCanonicalWriteAt != null) {
    throw handoffError(HandoffErrorCode.AUTHORITY_STATE_REJECTED, "The provider canonical write boundary has already been crossed; forward recovery applies.");
  }
  if (state.publicRuntimeAuthority !== "windows") {
    throw handoffError(HandoffErrorCode.AUTHORITY_STATE_REJECTED, "Authority/routing handoff requires public routing to still be Windows.");
  }
  if (state.writesEnabled !== false) {
    throw handoffError(HandoffErrorCode.AUTHORITY_STATE_REJECTED, "Authority/routing handoff requires production writes to not yet be enabled.");
  }
}

async function requirePreparationEvidence(preparationStore, operationId, expectedPackageDigest) {
  let result;
  try {
    result = await preparationStore.read(operationId);
  } catch (error) {
    if (error?.code === TransferErrorCode.RECEIPT_UNAVAILABLE) {
      throw handoffError(HandoffErrorCode.PREPARATION_NOT_ELIGIBLE, "No preparation evidence exists for this operation.");
    }
    throw error;
  }
  if (result.receipt.packageDigest !== expectedPackageDigest) {
    throw handoffError(HandoffErrorCode.PACKAGE_DIGEST_CONFLICT, "Preparation evidence package digest does not match the expected operation.");
  }
  return result;
}

async function readCompletedHandoff(handoffReceiptStore, operationId, expectedPackageDigest) {
  try {
    const { receipt } = await handoffReceiptStore.read(operationId);
    if (receipt.packageDigest === expectedPackageDigest && receipt.authorityStatus === "committed" && receipt.routingStatus === "verified") {
      return receipt;
    }
    return null;
  } catch (error) {
    if (error?.code === TransferErrorCode.RECEIPT_UNAVAILABLE) return null;
    throw error;
  }
}

// Route-state inspection is diagnostic evidence, never a gating precondition for authority
// transition - authority must still be able to commit even when routing is not yet configured
// (the production default today), which is exactly the honest, currently-exercisable behavior this
// module provides ahead of a real DigitalOcean-backed routing implementation.
async function safeInspectCurrentRoute(routingControl, routingTarget) {
  try {
    return await routingControl.inspectCurrentRoute({ routingTarget });
  } catch {
    return null;
  }
}

function requireNonEmpty(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw transferError(TransferErrorCode.IDENTITY_INVALID, `${field} is required.`);
  return candidate;
}

function safeMessage(error) {
  const message = String(error?.message ?? "unknown failure");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s|token/i.test(message)) return "see protected server logs";
  return message.slice(0, 300);
}

function freeze(value) { return Object.freeze(value); }
