import "server-only";
import { createProductionPhaseReviewCoordinatorFactory } from
  "../../domain/services/ProductionPhaseReviewCoordinatorFactory";

// The production DEXA server action is the sole UI caller of this boundary.
export async function executeAuthorizedPhaseReview(request) {
  return createProductionPhaseReviewCoordinatorFactory().execute(request);
}

export async function dryRunAuthorizedPhaseReview(request) {
  return createProductionPhaseReviewCoordinatorFactory().dryRun(request);
}
