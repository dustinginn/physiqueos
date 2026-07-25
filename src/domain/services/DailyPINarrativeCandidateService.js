const SUPPORTED_PAIRS = new Set([
  "energy+training",
  "energy+weight",
  "training+weight",
  "recovery+training",
  "energy+recovery",
]);
const RESURFACE_STATES = new Set([
  "strengthened",
  "weakened",
  "contradicted",
  "resolved",
]);

export function selectAuthoritativeDailyPICandidates({
  piResult,
  communicatedClaimIds = [],
  higherAuthorityActive = false,
  directTrainingNarrationActive = false,
} = {}) {
  if (higherAuthorityActive) {
    return selection("unsupported_domain_legacy_fallback");
  }
  if (!piResult || typeof piResult !== "object") {
    return selection("pi_validation_failed");
  }
  const exact = piResult.provenance?.internalWindows ?? {};
  const rankedPrimary = piResult.rankingResult?.primary;
  const rankedSupporting = piResult.rankingResult?.supporting;
  if (!Array.isArray(rankedPrimary) || !Array.isArray(rankedSupporting)) {
    return selection("pi_validation_failed");
  }

  const communicated = new Set(communicatedClaimIds);
  const eligible = (item, expectedState) => {
    const claim = item?.claim;
    if (!claim || !SUPPORTED_PAIRS.has(pairKey(claim))) return false;
    if (
      directTrainingNarrationActive &&
      claim.kind === "training_energy_relationship"
    ) return false;
    if (item.selectionState !== expectedState) return false;
    if (["background", "retired"].includes(claim.lifecycle?.state)) {
      return false;
    }
    if (
      !["moderate", "high", "very_high"].includes(claim.confidence?.level) &&
      claim.lifecycle?.state !== "contradicted"
    ) return false;
    if (!claimUsesExactInputs(claim, exact)) return false;
    if (
      communicated.has(claim.id) &&
      !RESURFACE_STATES.has(claim.lifecycle?.state)
    ) return false;
    return true;
  };
  const primaryRanking =
    rankedPrimary.find((item) => eligible(item, "primary")) ?? null;
  if (!primaryRanking) {
    const exactInputsAvailable =
      exact.weight?.mode === "exact_daily_precomputed";
    return selection(
      exactInputsAvailable
        ? "no_eligible_pi_primary"
        : "exact_daily_inputs_unavailable"
    );
  }

  const primary = createDailyPINarrativeCandidate(primaryRanking);
  if (!primary) return selection("pi_rendering_unsupported");
  const supporting = rankedSupporting
    .filter((item) => eligible(item, "supporting"))
    .map(createDailyPINarrativeCandidate)
    .filter(Boolean)
    .slice(0, 2);
  return {
    status: "selected",
    reason: supporting.length
      ? "pi_supporting_selected"
      : "pi_primary_selected",
    primary,
    supporting,
    communicatedClaimIds: [primary, ...supporting].map(
      (candidate) => candidate.sourceClaimId
    ),
    diagnostics: [],
  };
}

export function createDailyPINarrativeCandidate(ranking) {
  const claim = ranking?.claim;
  const templateKey = templateForClaim(claim);
  if (!claim || !templateKey) return null;
  const renderingContext = trainingEnergyRenderingContext(claim);
  return {
    id: `daily_pi_candidate|${claim.id}`,
    sourceClaimId: claim.id,
    candidateType: claim.kind,
    thesisDomain: claim.participatingDomains.includes("training")
      ? "training"
      : claim.participatingDomains.includes("recovery") ? "recovery" : "weight",
    semanticRelationship: claim.explanationData?.relationship ?? claim.kind,
    ...(renderingContext ? { renderingContext } : {}),
    measuredDirections: {
      weight: claim.explanationData?.weightDirection ?? null,
      energy: claim.explanationData?.energyDirection ?? null,
      training: claim.explanationData?.trainingDirection ?? null,
      recovery: claim.explanationData?.recoveryState ?? null,
    },
    goalRole: claim.goalContext?.observationRole ?? "context",
    confidence: claim.confidence,
    limitations: [...(claim.limitations ?? [])],
    evidenceReferences: [...(claim.supportingEvidenceIds ?? [])],
    editorialTemplateKey: templateKey,
    fallbackEligible: true,
    recommendationEligible: false,
    provenance: {
      producer: "daily_pi_narrative_candidate_service",
      sourceClaimId: claim.id,
      ranking: {
        rank: ranking.rank,
        priorityBand: ranking.priorityBand,
        priorityScore: ranking.priorityScore,
      },
    },
  };
}

export function renderDailyPICandidate(candidate) {
  if (!candidate?.editorialTemplateKey) return null;
  const weight = direction(candidate.measuredDirections.weight, "weight");
  const energy = bareDirection(candidate.measuredDirections.energy);
  const training = trainingDirection(candidate.measuredDirections.training);
  const limited = hasMaterialLimitation(candidate)
    ? " The available evidence is incomplete, so this relationship should remain provisional."
    : "";
  const templates = {
    training_progress_weight_stability:
      `Training performance improved while the rolling weight average remained stable. This connects the performance and scale evidence without establishing a body-composition outcome.${limited}`,
    training_progress_weight_change:
      `Training performance improved while ${weight}. The two signals moved together, although neither establishes a body-composition outcome.${limited}`,
    training_regression_weight_stability:
      `Training performance declined while the rolling weight average remained stable. That pattern deserves attention, but it does not by itself establish why performance changed.${limited}`,
    training_regression_weight_change:
      `Training performance declined while ${weight}. This is a measured relationship rather than evidence that either change caused the other.${limited}`,
    training_volume_weight_stability:
      `Training volume ${training} while the rolling weight average remained stable. The relationship is useful context, not a body-composition conclusion.${limited}`,
    training_volume_weight_change:
      `Training volume ${training} while ${weight}. These measurements belong together, but they do not establish causality.${limited}`,
    weight_change_training_stability:
      `Training remained stable while ${weight}. Stable performance adds context to the scale change without explaining its cause.${limited}`,
    intake_weight_stability:
      `Calorie intake ${energy} while the rolling weight average remained stable. This is a short-window relationship, not a maintenance-calorie conclusion.${limited}`,
    intake_weight_change:
      `Calorie intake ${energy} while ${weight}. The measurements moved in the same evidence window, but that does not establish causality.${limited}`,
    expenditure_weight_stability:
      `Estimated expenditure ${energy} while the rolling weight average remained stable. Expenditure remains estimated, so the relationship should be read conservatively.${limited}`,
    expenditure_weight_change:
      `Estimated expenditure ${energy} while ${weight}. The relationship is measured, but estimated expenditure limits the strength of the conclusion.${limited}`,
    energy_balance_weight_stability:
      `Estimated energy balance ${energy} while the rolling weight average remained stable. This does not establish maintenance calories or a body-composition outcome.${limited}`,
    energy_balance_weight_change:
      `Estimated energy balance ${energy} while ${weight}. The evidence supports the relationship, not a causal or body-composition conclusion.${limited}`,
    insufficient_energy_to_explain_weight:
      `The rolling weight average changed, but paired Nutrition and Activity evidence is not complete enough to interpret that change through Energy.${limited}`,
    insufficient_weight_to_support_energy_claim:
      `Energy evidence is available, but comparable Weight evidence is not sufficient for a cross-domain conclusion.${limited}`,
    insufficient_training_to_explain_weight:
      `The rolling weight average changed, but comparable Training evidence is not sufficient to connect performance with that change.${limited}`,
    training_energy_relationship:
      `${trainingEnergyText(candidate.renderingContext?.relationshipState)}${limited}`,
    recovery_training_relationship:
      `${recoveryTrainingText(candidate.renderingContext?.relationshipState)}${limited}`,
    recovery_energy_relationship:
      `${recoveryEnergyText(candidate.renderingContext?.relationshipState)}${limited}`,
  };
  const text = templates[candidate.editorialTemplateKey];
  return text
    ? {
        interpretation: text,
        supportingObservation: supportingLine(candidate),
      }
    : null;
}

function selection(reason) {
  return {
    status: "fallback",
    reason,
    primary: null,
    supporting: [],
    communicatedClaimIds: [],
    diagnostics: [],
  };
}

function claimUsesExactInputs(claim, exact) {
  if (claim.participatingDomains.includes("weight")) {
    if (exact.weight?.mode !== "exact_daily_precomputed") return false;
  }
  if (claim.participatingDomains.includes("energy")) {
    if (exact.energy?.mode !== "exact_daily_precomputed") return false;
  }
  return true;
}

function pairKey(claim) {
  return [...(claim.participatingDomains ?? [])].sort().join("+");
}

function templateForClaim(claim) {
  if (!claim || !SUPPORTED_PAIRS.has(pairKey(claim))) return null;
  return new Set([
    "training_progress_weight_stability",
    "training_progress_weight_change",
    "training_regression_weight_stability",
    "training_regression_weight_change",
    "training_volume_weight_stability",
    "training_volume_weight_change",
    "weight_change_training_stability",
    "intake_weight_stability",
    "intake_weight_change",
    "expenditure_weight_stability",
    "expenditure_weight_change",
    "energy_balance_weight_stability",
    "energy_balance_weight_change",
    "insufficient_energy_to_explain_weight",
    "insufficient_weight_to_support_energy_claim",
    "insufficient_training_to_explain_weight",
    "training_energy_relationship",
    "recovery_training_relationship",
    "recovery_energy_relationship",
  ]).has(claim.kind)
    ? claim.kind
    : null;
}

function direction(value, subject) {
  if (value === "rising") return `${subject} increased`;
  if (value === "falling") return `${subject} decreased`;
  if (value === "stable") return `${subject} remained stable`;
  return `${subject} did not have a comparable direction`;
}

function trainingDirection(value) {
  if (value === "rising" || value === "improving") return "increased";
  if (value === "falling" || value === "regressing") return "decreased";
  return "remained stable";
}

function bareDirection(value) {
  if (value === "rising") return "increased";
  if (value === "falling") return "decreased";
  if (value === "stable") return "remained stable";
  return "did not have a comparable direction";
}

function hasMaterialLimitation(candidate) {
  return candidate.limitations.some((item) =>
    /insufficient|incomplete|partial|missing|unavailable/i.test(item)
  );
}

function supportingLine(candidate) {
  const pair = candidate.candidateType === "training_energy_relationship"
    ? "Training and Energy"
    : candidate.thesisDomain === "training"
      ? "Training and Weight"
    : "Weight and Energy";
  return `${pair} supplied the strongest supported relationship in the completed evidence window.`;
}

function trainingEnergyRenderingContext(claim) {
  if (claim?.kind === "recovery_training_relationship" ||
      claim?.kind === "recovery_energy_relationship") {
    return {
      relationshipState: claim.explanationData?.relationshipState,
      source: "structured_claim_explanation",
    };
  }
  if (claim?.kind !== "training_energy_relationship") return null;
  const state = {
    training_progress_with_positive_energy_support: "progress_with_positive_support",
    training_progress_with_neutral_energy_support: "progress_with_neutral_support",
    training_progress_despite_negative_energy_balance: "progress_despite_negative_support",
    training_stability_with_positive_energy_balance: "stable_with_positive_support",
    training_stability_with_declining_energy_support: "stable_with_declining_support",
    training_decline_with_negative_energy_balance: "decline_with_negative_support",
    training_decline_despite_positive_energy_balance: "decline_despite_positive_support",
  }[claim.explanationData?.relationshipState];
  return state ? { relationshipState: state } : null;
}

function recoveryTrainingText(state) {
  return ({
    training_progress_with_stable_recovery:
      "Training improved while Recovery indicators remained stable.",
    training_progress_with_improving_recovery:
      "Training improved while Recovery indicators also improved.",
    training_progress_despite_strained_recovery:
      "Training improved despite weaker Recovery indicators.",
    training_stability_with_strained_recovery:
      "Training remained stable while Recovery indicators weakened.",
    training_decline_with_strained_recovery:
      "Training declined while Recovery indicators also weakened.",
    training_decline_despite_stable_recovery:
      "Training declined even though Recovery indicators remained stable.",
    training_volume_growth_with_stable_recovery:
      "Training volume increased while Recovery indicators remained stable.",
    training_volume_growth_with_declining_recovery:
      "Training volume increased while Recovery indicators weakened.",
  })[state] ?? "Recovery and Training evidence were too limited to interpret confidently.";
}
function recoveryEnergyText(state) {
  return ({
    recovery_stability_with_positive_energy_support:
      "Recovery indicators remained stable while estimated Energy support was positive.",
    recovery_stability_with_neutral_energy_support:
      "Recovery indicators remained stable while estimated Energy support was near neutral.",
    recovery_strain_with_negative_energy_balance:
      "Recovery indicators weakened while estimated Energy balance was negative.",
    recovery_strain_despite_positive_energy_support:
      "Recovery indicators weakened despite positive estimated Energy support.",
    recovery_improvement_despite_negative_energy_balance:
      "Recovery indicators improved despite a negative estimated Energy balance.",
  })[state] ?? "Recovery and Energy evidence were too limited to interpret confidently.";
}

function trainingEnergyText(state) {
  return ({
    progress_with_positive_support:
      "Training improved while estimated Energy support remained positive.",
    progress_with_neutral_support:
      "Training improved while estimated Energy balance remained near neutral.",
    progress_despite_negative_support:
      "Training improved despite a negative estimated Energy balance.",
    stable_with_positive_support:
      "Training remained stable while estimated Energy balance was positive.",
    stable_with_declining_support:
      "Training remained stable while estimated Energy support weakened.",
    decline_with_negative_support:
      "Training declined while estimated Energy balance was negative.",
    decline_despite_positive_support:
      "Training declined despite positive estimated Energy support.",
  })[state] ??
    "Training and Energy evidence were not complete enough to interpret together.";
}
