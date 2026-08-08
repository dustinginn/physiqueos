import { createPhaseReviewCommitCoordinator } from "./PhaseReviewCommitCoordinator";

// Compatibility name for callers prepared against the first Phase Review contract.
// All commits now delegate to the canonical coordinator; this module owns no mutation.
export function createPhaseReviewMutationService(options = {}) {
  if (options.participants && !Array.isArray(options.participants)) {
    throw new TypeError(
      "Legacy opaque Phase Review participants are unsupported; register the canonical participant lifecycle."
    );
  }
  return createPhaseReviewCommitCoordinator(options);
}
