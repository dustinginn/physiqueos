import { StrategyValidationStatus } from "./InterpretationRuntimeContract";
import { relationRef, uniqueStrings } from "./interpretationRuntimeUtils";

export function evaluateInterpretationStrategy({
  strategyHypothesis,
  executionState = {},
  evidenceReconciliation,
} = {}) {
  const hypothesisId = strategyHypothesis?.hypothesisId ?? null;
  const executionAdequacy = executionState.adequacy ?? "unknown";
  const elapsed = executionState.elapsedTimeAdequacy ?? "unknown";
  if (!hypothesisId || !strategyHypothesis?.statement) {
    return result(StrategyValidationStatus.STILL_CALIBRATING, {
      hypothesisId, executionAdequacy,
      rationale: "strategy_hypothesis_incomplete",
    });
  }
  if (executionAdequacy !== "adequate" || elapsed !== "adequate") {
    return result(StrategyValidationStatus.STILL_CALIBRATING, {
      hypothesisId, executionAdequacy,
      rationale: executionAdequacy !== "adequate"
        ? "strategy_execution_inadequate" : "strategy_elapsed_time_insufficient",
    });
  }
  const responseIds = (strategyHypothesis.expectedResponses ?? [])
    .map((item) => item.responseId);
  const refs = uniqueStrings([hypothesisId, ...responseIds])
    .map((id) => relationRef("hypothesis", id));
  const items = evidenceReconciliation.items.filter((item) =>
    refs.includes(item.conclusionRef) && item.temporalApplicability === "applicable" &&
    ["decisive", "material"].includes(item.relevance));
  const sufficientlyStrong = items.filter((item) =>
    ["authoritative", "high", "moderate"].includes(item.strength));
  const supporting = uniqueStrings(sufficientlyStrong.filter((item) =>
    item.agreement === "supports")
    .map((item) => item.conclusionRef));
  const contradicting = uniqueStrings(sufficientlyStrong.filter((item) =>
    item.agreement === "contradicts").map((item) => item.conclusionRef));
  if (supporting.length && contradicting.length) {
    return result(StrategyValidationStatus.MIXED, {
      hypothesisId, executionAdequacy, supporting, contradicting,
      rationale: "strategy_support_and_contradiction_coexist",
    });
  }
  if (contradicting.length) {
    return result(StrategyValidationStatus.CONTRADICTED, {
      hypothesisId, executionAdequacy, supporting, contradicting,
      rationale: "strategy_material_contradiction",
    });
  }
  const allExpectedSupported = responseIds.length > 0 && responseIds.every((id) =>
    supporting.includes(relationRef("hypothesis", id)));
  if (allExpectedSupported && ["strong_convergence", "moderate_convergence"]
    .includes(evidenceReconciliation.agreementStatus) &&
    ["robust", "adequate"].includes(evidenceReconciliation.quality.status)) {
    return result(StrategyValidationStatus.CONFIRMED, {
      hypothesisId, executionAdequacy, supporting, contradicting,
      rationale: "strategy_validation_conditions_supported",
    });
  }
  if (supporting.length || items.some((item) => item.agreement === "supports")) {
    return result(StrategyValidationStatus.DIRECTIONALLY_SUPPORTED, {
      hypothesisId, executionAdequacy, supporting, contradicting,
      rationale: "strategy_direction_supported_but_not_confirmed",
    });
  }
  return result(StrategyValidationStatus.STILL_CALIBRATING, {
    hypothesisId, executionAdequacy,
    rationale: "strategy_decisive_evidence_pending",
  });
}

function result(status, {
  hypothesisId,
  executionAdequacy,
  supporting = [],
  contradicting = [],
  rationale,
}) {
  return {
    status,
    hypothesisRef: hypothesisId,
    executionAdequacy,
    supportingConclusionRefs: supporting,
    contradictingConclusionRefs: contradicting,
    rationale,
  };
}
