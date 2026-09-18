import { AUTHORITY_ORDER, QUALITY_ORDER, deepFreeze } from "./V3Runtime.js";

export const EvidenceReconciliationV3 = Object.freeze({
  PEER_CONTRADICTION: "PEER_CONTRADICTION",
  ESTIMATE_VS_OUTCOME_TENSION: "ESTIMATE_VS_OUTCOME_TENSION",
  LEADING_VS_LAGGING_TENSION: "LEADING_VS_LAGGING_TENSION",
  TRANSIENT_NOISE: "TRANSIENT_NOISE",
  CONFIRMED_REVERSAL: "CONFIRMED_REVERSAL",
});

const CLASS_PRIORITY = Object.freeze({
  OUTCOME_EVIDENCE: 6,
  LEADING_INDICATOR: 5,
  EXECUTION_SUPPORT: 4,
  DERIVED_ESTIMATE: 3,
  GUARDRAIL: 2,
  CONTEXTUAL_EVIDENCE: 1,
});

/**
 * Produces a decision-oriented view of Goal-relative evidence. Authority answers
 * how much an observation may change the interpretation; salience answers how
 * prominently it should be discussed now. The two are intentionally separate.
 */
export function synthesizeCrossDomainEvidenceV3({
  authorityBindings,
  evaluatedGoal,
  strategyEffectiveness,
  priorInterpretation = null,
}) {
  const priorIds = new Set(priorInterpretation?.evidenceObservationIds ?? []);
  const signals = collapseBindings(authorityBindings, priorIds);
  const objective = evaluatedGoal.objectiveFindings.find((item) => item.priority === "primary") ??
    evaluatedGoal.objectiveFindings[0] ?? null;
  const anchorDirection = objectiveDirection(objective);
  const anchor = objective ? {
    findingId: objective.findingId,
    evidenceIds: [...(objective.evidenceIds ?? [])],
    direction: anchorDirection,
    authority: objective.authority,
    quality: objective.quality,
    significance: objective.significance,
    freshness: objective.freshness,
    state: objective.state,
    active: ["decisive", "material"].includes(objective.authority) &&
      ["robust", "adequate"].includes(objective.quality),
  } : null;
  const tensions = reconcileSignals(signals, anchor);
  const suppressedIds = new Set(tensions
    .filter((item) => item.type === EvidenceReconciliationV3.ESTIMATE_VS_OUTCOME_TENSION ||
      item.type === EvidenceReconciliationV3.TRANSIENT_NOISE)
    .flatMap((item) => item.lowerAuthorityObservationIds));
  const enriched = signals.map((signal) => ({
    ...signal,
    calibratedRole: suppressedIds.has(signal.observationId)
      ? "context_not_decision_driver" : "decision_relevant",
    recommendationEligible: !suppressedIds.has(signal.observationId),
    salience: signal.novel
      ? signal.direction === "indeterminate" ? "supporting_context" : "new_finding"
      : signal.highSalienceEvent ? "background_anchor" : "supporting_context",
  }));
  const rankedNarrativeSignals = enriched
    .filter((item) => item.novel && item.factualSummary && item.semanticClass !== "OUTCOME_EVIDENCE")
    .sort((left, right) => narrativeScore(right) - narrativeScore(left) ||
      right.observedAt.localeCompare(left.observedAt) ||
      left.observationId.localeCompare(right.observationId));
  const selectedNarrativeSignals = selectDistinctNarrativeSignals(rankedNarrativeSignals);
  const confirmedReversal = tensions.some((item) =>
    item.type === EvidenceReconciliationV3.CONFIRMED_REVERSAL);
  const operatingSupport = deriveOperatingSupport(enriched, confirmedReversal);
  return deepFreeze({
    activeOutcomeAnchor: anchor,
    signals: enriched,
    tensions,
    selectedNarrativeSignals,
    operatingSupport,
    recommendationStability: {
      stable: Boolean(anchor?.direction === "supports" && !confirmedReversal),
      reason: anchor?.direction === "supports" && !confirmedReversal
        ? tensions.some((item) => item.type === EvidenceReconciliationV3.ESTIMATE_VS_OUTCOME_TENSION)
          ? "strong_realized_outcome_outweighs_uncertain_estimate"
          : "realized_outcome_and_current_context_support_stability"
        : confirmedReversal ? "new_evidence_confirms_outlook_reversal" : "insufficient_outcome_support",
    },
    strategyState: strategyEffectiveness.feasibility,
  });
}

function selectDistinctNarrativeSignals(signals) {
  const selected = [];
  const groups = new Set();
  for (const signal of signals) {
    const group = signal.reconciliationGroup ?? signal.vocabularyKey ??
      signal.capabilityId;
    if (groups.has(group)) continue;
    groups.add(group);
    selected.push(signal);
    if (selected.length === 2) break;
  }
  return selected;
}

function collapseBindings(bindings, priorIds) {
  const byObservation = new Map();
  for (const binding of bindings) {
    if (!binding.usableFor.some((value) => ["narrative", "execution", "attribution", "persistence", "feasibility"].includes(value)) &&
      !["strategy", "execution"].includes(binding.subjectType)) continue;
    const existing = byObservation.get(binding.observationId);
    if (existing && bindingRank(existing) >= bindingRank(binding)) continue;
    byObservation.set(binding.observationId, {
      signalId: `cross_domain_signal|${binding.observationId}`,
      bindingId: binding.bindingId,
      observationId: binding.observationId,
      observedAt: binding.observedAt,
      sourceType: binding.sourceType,
      displayLabel: binding.displayLabel,
      capabilityId: binding.capabilityId,
      vocabularyKey: binding.vocabularyKey,
      reconciliationGroup: binding.reconciliationGroup,
      semanticClass: binding.semanticClass,
      role: binding.role,
      participation: binding.participation,
      quality: binding.quality.status,
      directness: binding.directness,
      direction: binding.signalDirection,
      significance: binding.signalSignificance,
      highSalienceEvent: binding.highSalienceEvent,
      factualSummary: binding.measurement.factualSummary,
      limitations: binding.limitations,
      novel: !priorIds.has(binding.observationId),
    });
  }
  return [...byObservation.values()];
}

function reconcileSignals(signals, anchor) {
  const tensions = [];
  const derivedAgainstOutcome = signals.filter((item) => item.semanticClass === "DERIVED_ESTIMATE" &&
    item.direction === opposite(anchor?.direction) && item.quality !== "robust");
  if (anchor?.active && derivedAgainstOutcome.length) {
    tensions.push(tension(EvidenceReconciliationV3.ESTIMATE_VS_OUTCOME_TENSION,
      anchor.evidenceIds, derivedAgainstOutcome.map((item) => item.observationId),
      "A derived estimate points away from a stronger realized outcome."));
  }

  const adverseLeading = signals.filter((item) => item.novel &&
    ["LEADING_INDICATOR", "EXECUTION_SUPPORT"].includes(item.semanticClass) &&
    item.direction === opposite(anchor?.direction) && ["adequate", "robust"].includes(item.quality));
  if (anchor?.active && adverseLeading.length) {
    const independentGroups = new Set(adverseLeading.map((item) =>
      item.reconciliationGroup ?? item.vocabularyKey ?? item.capabilityId));
    const robustMaterial = adverseLeading.some((item) => item.quality === "robust" &&
      ["decisive", "material"].includes(item.role));
    const confirmed = independentGroups.size >= 2 || robustMaterial;
    tensions.push(tension(confirmed
      ? EvidenceReconciliationV3.CONFIRMED_REVERSAL
      : EvidenceReconciliationV3.LEADING_VS_LAGGING_TENSION,
    anchor.evidenceIds, adverseLeading.map((item) => item.observationId),
    confirmed
      ? "Multiple decision-relevant leading signals now challenge the prior outcome anchor."
      : "A leading signal has weakened while the last authoritative outcome remains favorable."));
  }

  const weakAdverse = signals.filter((item) => item.novel && item.direction === opposite(anchor?.direction) &&
    ["limited", "insufficient"].includes(item.quality) &&
    !derivedAgainstOutcome.some((candidate) => candidate.observationId === item.observationId));
  if (anchor?.active && weakAdverse.length) {
    tensions.push(tension(EvidenceReconciliationV3.TRANSIENT_NOISE,
      anchor.evidenceIds, weakAdverse.map((item) => item.observationId),
      "A weak isolated observation does not overturn the broader interpretation."));
  }

  const peerSupport = signals.filter((item) => item.novel && item.direction === "supports" &&
    ["decisive", "material"].includes(item.role) && ["adequate", "robust"].includes(item.quality));
  const peerAgainst = signals.filter((item) => item.novel && item.direction === "contradicts" &&
    ["decisive", "material"].includes(item.role) && ["adequate", "robust"].includes(item.quality));
  if (peerSupport.length && peerAgainst.length) {
    tensions.push(tension(EvidenceReconciliationV3.PEER_CONTRADICTION,
      peerSupport.map((item) => item.observationId), peerAgainst.map((item) => item.observationId),
      "Similarly authoritative observations disagree and require resolution."));
  }
  return tensions;
}

function tension(type, strongerEvidenceIds, lowerAuthorityObservationIds, explanation) {
  return { type, strongerEvidenceIds: [...new Set(strongerEvidenceIds)],
    lowerAuthorityObservationIds: [...new Set(lowerAuthorityObservationIds)], explanation };
}

function deriveOperatingSupport(signals, confirmedReversal) {
  if (confirmedReversal) return "deteriorating";
  const decisionSignals = signals.filter((item) => item.recommendationEligible && item.novel &&
    ["LEADING_INDICATOR", "EXECUTION_SUPPORT"].includes(item.semanticClass));
  if (decisionSignals.some((item) => item.direction === "contradicts")) return "mixed";
  if (decisionSignals.some((item) => item.direction === "supports")) return "supportive";
  return "not_assessed";
}

function objectiveDirection(objective) {
  if (!objective) return "indeterminate";
  if (["progressed", "satisfied", "stable_success"].includes(objective.state)) return "supports";
  if (["regressed", "outside_target"].includes(objective.state)) return "contradicts";
  return "indeterminate";
}

function opposite(direction) {
  return direction === "supports" ? "contradicts" : direction === "contradicts" ? "supports" : "__none__";
}

function bindingRank(binding) {
  return (CLASS_PRIORITY[binding.semanticClass] ?? 0) * 100 +
    (AUTHORITY_ORDER[binding.role] ?? 0) * 10 + (QUALITY_ORDER[binding.quality?.status ?? binding.quality] ?? 0);
}

function narrativeScore(signal) {
  const novelty = signal.novel ? 50 : 0;
  const decision = signal.direction === "contradicts" ? 30 : signal.direction === "supports" ? 20 : 5;
  const actionability = ["LEADING_INDICATOR", "EXECUTION_SUPPORT"].includes(signal.semanticClass) ? 18 :
    signal.semanticClass === "DERIVED_ESTIMATE" ? 10 : 4;
  const authority = (AUTHORITY_ORDER[signal.role] ?? 0) * 8;
  const quality = (QUALITY_ORDER[signal.quality] ?? 0) * 4;
  const calibrated = signal.calibratedRole === "context_not_decision_driver" ? -8 : 0;
  const goalRole = (CLASS_PRIORITY[signal.semanticClass] ?? 0) * 3;
  return novelty + decision + actionability + authority + quality + calibrated + goalRole;
}
