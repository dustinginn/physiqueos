// Source-owned worker-control contract for the combined-cutover worker handoff
// (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase N/O: "Release writes only through the
// provider platform, start the authority-gated worker, and perform immediate web/read/write/media/
// user-facing acceptance. Windows remains stopped or read-only and cannot accept writes.").
//
// WHY FOUR OPERATIONS, MIRRORING `combinedCutoverRoutingControl.js`. Worker PREPARATION (deploying and
// configuring the provider worker container/component) is a deployment concern - out of scope here,
// exactly like route preparation was excluded from the routing-control contract - so there is no
// "prepare" operation. What remains is inspecting current posture, activating the provider worker,
// verifying it, and restoring Windows worker posture during pre-boundary recovery.
//
// A GENUINELY SEPARATE OPERATION FOR WINDOWS RETIREMENT. Unlike routing (one physical resource - a
// DNS/ingress switch - where "activate provider" and "retire Windows" are the SAME mutation), Windows
// and provider workers are two independent PROCESSES. Activating the provider worker does not
// inherently stop the Windows-side one, so `retireWindowsWorkers` is a distinct, explicit operation
// rather than folded into `activateProviderWorkers`.
//
// FAIL CLOSED BY DEFAULT. `createUnavailableWorkerControl` is the production default until a real
// implementation exists: every operation throws `WORKER_CONTROL_UNAVAILABLE`. Physically starting or
// stopping a worker process (App Platform component scale/deploy on the provider side, a scheduled
// task/service on the Windows side) requires real infrastructure access this task may not exercise -
// silently no-op'ing or synthetically succeeding here would let a real handoff believe a worker was
// activated or retired when it was not. See `testSupport/deterministicWorkerControl.js` for the
// in-memory double used by tests, and the synthetic Phase 2B rehearsal adapter
// (`syntheticCombinedCutoverRehearsal.js`) for the fully synthetic in-memory rehearsal path, which
// this module does not replace.
export const WorkerState = Object.freeze({
  WINDOWS_ACTIVE: "windows-active",
  PROVIDER_INERT: "provider-inert",
  PROVIDER_ACTIVE: "provider-active",
});

export const WorkerErrorCode = Object.freeze({
  UNAVAILABLE: "WORKER_CONTROL_UNAVAILABLE",
  NOT_PREPARED: "WORKER_NOT_PREPARED",
  ACTIVATION_FAILED: "WORKER_ACTIVATION_FAILED",
  VERIFICATION_FAILED: "WORKER_VERIFICATION_FAILED",
  RETIRE_FAILED: "WORKER_RETIRE_FAILED",
  RESTORE_FAILED: "WORKER_RESTORE_FAILED",
});

export function workerControlError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

/**
 * Fail-closed default. Every combined-cutover worker operation throws until a real implementation is
 * wired in behind this exact same interface - production worker-handoff composition never silently
 * substitutes a synthetic implementation when this is what's configured.
 */
export function createUnavailableWorkerControl({ reason = "No production worker-control implementation is configured yet." } = {}) {
  async function unavailable() {
    throw workerControlError(WorkerErrorCode.UNAVAILABLE, reason);
  }
  return Object.freeze({
    kind: "unavailable-worker-control",
    inspectWorkerState: unavailable,
    activateProviderWorkers: unavailable,
    verifyProviderWorkers: unavailable,
    retireWindowsWorkers: unavailable,
    restoreWindowsWorkers: unavailable,
  });
}

/**
 * Asserts a candidate implementation satisfies the contract shape, regardless of which concrete
 * implementation is supplied (unavailable, deterministic test double, or a future real one).
 */
export function assertCombinedCutoverWorkerControl(workerControl) {
  const required = ["inspectWorkerState", "activateProviderWorkers", "verifyProviderWorkers", "retireWindowsWorkers", "restoreWindowsWorkers"];
  const missing = required.filter((name) => typeof workerControl?.[name] !== "function");
  if (missing.length) throw new Error(`Combined cutover worker control is missing: ${missing.join(", ")}.`);
  return workerControl;
}
