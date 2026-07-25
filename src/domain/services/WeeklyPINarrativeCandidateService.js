const TEMPLATE_KEYS = Object.freeze({
  cross_domain_claim: "weekly_cross_domain_relationship",
  direct_training: "weekly_direct_training",
  energy_trend: "weekly_energy_calibration",
  body_fat_guardrail: "weekly_body_fat_guardrail",
  direct_recovery: "weekly_direct_recovery",
});

export function createWeeklyPINarrativeCandidate(rankingEntry) {
  const candidate = rankingEntry?.candidate;
  const editorialTemplateKey = TEMPLATE_KEYS[candidate?.candidateType];
  if (!candidate || !editorialTemplateKey) return null;
  const renderingContext = trainingEnergyRenderingContext(candidate);
  return Object.freeze({
    candidateId: candidate.id,
    sourceId: candidate.sourceId,
    candidateType: candidate.candidateType,
    relationshipKind: candidate.relationshipKind,
    thesisDomain: candidate.thesisDomain,
    measuredDirections: {
      training: candidate.explanationData.trainingDirection ??
        candidate.explanationData.trainingStatus ??
        (candidate.thesisDomain === "training" ? candidate.direction : null),
      weight: candidate.explanationData.weightDirection ?? null,
      intake: candidate.explanationData.comparison?.intake?.direction ?? null,
      expenditure: candidate.explanationData.comparison?.estimatedExpenditure?.direction ?? null,
      balance: candidate.explanationData.comparison?.netBalance?.direction ??
        (candidate.thesisDomain === "energy" ? candidate.direction : null),
    },
    goalRole: candidate.goalContext.observationRole ??
      candidate.goalContext.role ?? "context",
    confidence: structuredClone(candidate.confidence),
    coverage: structuredClone(candidate.coverage),
    limitations: [...candidate.limitations],
    evidenceReferences: [...candidate.supportingEvidenceIds],
    editorialTemplateKey,
    recommendationEligible: false,
    ...(renderingContext ? { renderingContext } : {}),
    provenance: {
      producer: "weekly_pi_narrative_candidate_service",
      sourceCandidateId: candidate.id,
      sharedRank: rankingEntry.rank,
      sharedScore: rankingEntry.score,
    },
  });
}

function trainingEnergyRenderingContext(candidate) {
  if (["recovery_training_relationship", "recovery_energy_relationship"].includes(
    candidate.relationshipKind
  )) {
    return Object.freeze({
      relationshipState: candidate.explanationData?.relationshipState,
      source: "structured_claim_explanation",
    });
  }
  if (candidate.relationshipKind !== "training_energy_relationship") return null;
  const relationshipState = {
    training_progress_with_positive_energy_support: "progress_with_positive_support",
    training_progress_with_neutral_energy_support: "progress_with_neutral_support",
    training_progress_despite_negative_energy_balance: "progress_despite_negative_support",
    training_stability_with_positive_energy_balance: "stable_with_positive_support",
    training_stability_with_declining_energy_support: "stable_with_declining_support",
    training_decline_with_negative_energy_balance: "decline_with_negative_support",
    training_decline_despite_positive_energy_balance: "decline_despite_positive_support",
    training_energy_relationship_insufficient: "insufficient",
  }[candidate.explanationData?.relationshipState];
  if (!relationshipState) {
    throw new Error("Unsupported Training Energy relationship state.");
  }
  return Object.freeze({ relationshipState, source: "structured_claim_explanation" });
}

export function adaptWeeklyPISelection(selection = {}) {
  return Object.freeze({
    primary: selection.primary?.[0]
      ? createWeeklyPINarrativeCandidate(selection.primary[0])
      : null,
    supporting: (selection.supporting ?? [])
      .map(createWeeklyPINarrativeCandidate)
      .filter(Boolean)
      .slice(0, 2),
  });
}
