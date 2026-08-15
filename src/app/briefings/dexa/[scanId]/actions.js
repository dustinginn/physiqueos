"use server";

import { executeAuthorizedPhaseReview } from "../../../../server/phase-review/actions";

export async function submitProductionPhaseReviewDecision(request) {
  try {
    const result = await executeAuthorizedPhaseReview(request);
    if (result?.ok === true && result?.committed === true) {
      return { ok: true, message: "Your Phase Review decision was saved." };
    }
    return { ok: false, message: safeMessage(result?.code) };
  } catch {
    return { ok: false, message: "This decision could not be saved safely. Nothing was changed." };
  }
}

function safeMessage(code) {
  if (code === "PHASE_REVIEW_ACTION_EXPECTED_REVISION_MISMATCH") {
    return "This Phase Review is out of date. Refresh before deciding; nothing was changed.";
  }
  if (code === "PHASE_REVIEW_RECOMMENDATION_STALE") {
    return "This recommendation changed. Refresh before deciding; nothing was changed.";
  }
  if (code === "PHASE_REVIEW_ESTABLISHMENT_REQUIRED") {
    return "Confirm both next-phase targets before authorizing. Nothing was changed.";
  }
  if (code === "PHASE_REVIEW_EXPLICIT_APPROVAL_REQUIRED" ||
      code === "PHASE_REVIEW_ARTIFACT_INELIGIBLE") {
    return "This Phase Review is not authorized for a decision. Nothing was changed.";
  }
  if (code === "PHASE_REVIEW_ACTION_ACCEPTED_STRATEGY_REQUIRED" ||
      code === "PHASE_REVIEW_ACTION_ACCEPTED_TRAJECTORY_REQUIRED" ||
      code === "PHASE_REVIEW_STARTING_FORECAST_INCOMPLETE") {
    return "The next phase is not ready to begin. Nothing was changed.";
  }
  return "This decision could not be saved safely. Nothing was changed.";
}
