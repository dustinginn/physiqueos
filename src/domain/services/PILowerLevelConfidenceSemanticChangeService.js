export const PILowerLevelSemanticChangeOutcome = Object.freeze({
  MATERIAL: "material_change",
  NON_MATERIAL: "non_material_change",
  ALREADY_REPRESENTED: "already_represented",
  INSUFFICIENT: "insufficient_interpretation",
  EVENT_OWNED: "higher_level_event_owned",
  AWAITING_PAIR: "awaiting_pair_completion",
  AWAITING_TRAINING: "awaiting_training_finalization",
});

export function detectPILowerLevelConfidenceSemanticChange(input = {}) {
  const next = input.nextState;
  if (!next) return result(PILowerLevelSemanticChangeOutcome.INSUFFICIENT);
  if (input.ownership === "cadence") {
    return result(PILowerLevelSemanticChangeOutcome.ALREADY_REPRESENTED, {
      ownership: "cadence",
    });
  }
  if (input.ownership === "event") {
    return result(PILowerLevelSemanticChangeOutcome.EVENT_OWNED, {
      ownership: "event",
    });
  }
  if (input.domain === "energy" && next.pairedDayCount === 0) {
    return result(PILowerLevelSemanticChangeOutcome.AWAITING_PAIR);
  }
  if (input.domain === "training" && next.finalized !== true) {
    return result(PILowerLevelSemanticChangeOutcome.AWAITING_TRAINING);
  }
  if (next.publicationEligible !== true) {
    return result(PILowerLevelSemanticChangeOutcome.INSUFFICIENT);
  }
  const prior = input.priorState;
  if (
    input.priorConsumedTransitionIds?.includes(input.consumptionId) ||
    (prior && prior.interpretationFingerprint === next.interpretationFingerprint)
  ) {
    return result(PILowerLevelSemanticChangeOutcome.ALREADY_REPRESENTED);
  }
  if (!prior) return result(PILowerLevelSemanticChangeOutcome.MATERIAL, {
    semanticChangeType: `initial_to_${next.state}`,
  });
  const contributorChanged =
    prior.state !== next.state ||
    prior.direction !== next.direction ||
    prior.strength !== next.strength ||
    authority(prior) !== authority(next);
  if (!contributorChanged) {
    return result(PILowerLevelSemanticChangeOutcome.NON_MATERIAL);
  }
  return result(PILowerLevelSemanticChangeOutcome.MATERIAL, {
    semanticChangeType: `${prior.state}_to_${next.state}`,
  });
}

export function explainPILowerLevelSemanticChange({
  domain,
  outcome,
  nextState,
} = {}) {
  if (domain === "energy") {
    if (outcome !== "material_change") {
      return "Confidence held because another paired day was added, but the Energy interpretation did not change.";
    }
    if (nextState?.state === "near_maintenance") {
      return "Confidence increased because the paired Energy trend became reliable enough to support near-maintenance calibration.";
    }
    if (nextState?.state === "persistent_deficit") {
      return "Confidence decreased because the Energy trend now shows a persistent deficit that conflicts with establishing maintenance.";
    }
    return "Confidence decreased because the Energy trend now shows a sustained surplus that challenges calibration.";
  }
  if (outcome !== "material_change") {
    return "Confidence held because the new performance records did not change the broader Training trend.";
  }
  if (nextState?.state === "broad_constructive") {
    return "Confidence increased because Training improved across meaningful breadth rather than in one isolated exercise.";
  }
  if (nextState?.state === "broad_regression") {
    return "Confidence decreased because repeated Training results now show regression across several areas.";
  }
  return "Confidence changed because the broader Training trend moved into a different supported state.";
}

function authority(value) {
  return value.reliabilityStatus ?? (value.finalized ? "finalized" : "incomplete");
}
function result(outcome, values = {}) {
  return Object.freeze({
    outcome,
    material: outcome === PILowerLevelSemanticChangeOutcome.MATERIAL,
    ...values,
  });
}
