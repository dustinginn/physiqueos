import "server-only";
import { createProductionPhaseReviewCoordinatorFactory } from
  "../../domain/services/ProductionPhaseReviewCoordinatorFactory";

// The production DEXA server action is the sole UI caller of this boundary.
export async function executeAuthorizedPhaseReview(request) {
  return (await createProductionPhaseReviewCoordinatorFactory()).execute(request);
}

export async function dryRunAuthorizedPhaseReview(request) {
  return (await createProductionPhaseReviewCoordinatorFactory()).dryRun(request);
}
