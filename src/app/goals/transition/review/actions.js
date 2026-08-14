"use server";

import { ProductionGoalTransitionRepositories } from "../../../../data/repositories/productionGoalTransitionRepositories";
import { createProductionGoalTransitionActivationService } from "../../../../domain/services/ProductionGoalTransitionActivationService";
import {
  projectProductionGoalTransitionActivationResult,
} from "../../../../domain/services/ProductionGoalTransitionActivationResult";
import { loadApplicationRuntimeBindings } from "../../../../application/runtime/ApplicationCanonicalRuntime";

export async function activateProductionGoalTransition({
  transitionId,
  finalReviewToken,
  founderConfirmed,
}) {
  const user = await ProductionGoalTransitionRepositories.users.getCurrentUser();
  if (user?.id !== "user_founder_001") {
    return { ok: false, error: "Trusted founder context is required." };
  }
  try {
    const bindings = await loadApplicationRuntimeBindings();
    const result = await createProductionGoalTransitionActivationService({
      ...bindings,
      readLiveStore: bindings.readPersistedStore,
    }).activate({
      founderUserId: user.id,
      transitionId,
      finalReviewToken,
      founderConfirmed,
    });
    return projectProductionGoalTransitionActivationResult(result);
  } catch (error) {
    const stale = [
      "PRODUCTION_ACTIVATION_REVIEW_TOKEN_INVALID",
      "PRODUCTION_ACTIVATION_REVIEW_TOKEN_STALE",
    ].includes(error?.code);
    return {
      ok: false,
      committed: false,
      committedRevision: null,
      commitId: null,
      code: error?.code ?? "PRODUCTION_ACTIVATION_FAILED",
      error: stale
        ? "Final review is no longer current. Refresh this page to generate a new review."
        : "We couldn't activate the new goal. Your current goal is unchanged.",
      guidance: stale ? "refresh_final_review" : "return_to_protocol_review",
    };
  }
}
