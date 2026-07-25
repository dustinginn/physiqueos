import { createPIDecisionAssessment } from "./PIDecisionAssessmentModel";
import { PI_DECISION_POLICY } from "./PIDecisionSemanticContract";

export const PI_DECISION_INTELLIGENCE_VERSION = "pi_decision_intelligence_v1";
const MATERIAL_LIFECYCLE = new Set([
  "new", "strengthened", "weakened", "contradicted", "resolved",
]);
const CONFIDENCE_ORDER = [
  "unevaluated", "low", "moderate", "high", "very_high",
];

export function createDecisionAssessments(input = {}) {
  const before = structuredClone(input);
  const cadence = requiredCadence(input.cadence);
  const evidenceWindow = requiredWindow(input.evidenceWindow);
  const goalContext = structuredClone(input.goalContext ?? {});
  const phaseContext = structuredClone(input.phaseContext ?? {});
  const candidates = normalizeCandidates(input.rankedCandidates ?? []);
  const claims = [...(input.claims ?? [])];
  const completeness = normalizeCompleteness(input.evidenceCompleteness);
  const eventAuthority = normalizeEventAuthority(input.eventAuthority);
  const recommendationCompatibility = resolveRecommendationCompatibility(
    input.existingRecommendationMetadata
  );
  const context = {
    cadence, evidenceWindow, goalContext, phaseContext, candidates, claims,
    completeness, eventAuthority, recommendationCompatibility,
    conflicts: normalizeConflicts(input.conflicts, candidates, claims),
    cadenceEligible: input.cadenceEligible !== false,
  };
  const selected = synthesize(context);
  const primary = selected.primary
    ? buildAssessment(selected.primary, context)
    : null;
  const supporting = selected.supporting
    ? buildAssessment(selected.supporting, context)
    : null;
  const result = Object.freeze({
    schemaVersion: "pi_decision_result_v1",
    cadence,
    primary,
    supporting,
    assessments: [primary, supporting].filter(Boolean),
    recommendationCompatibility,
    eventAuthority,
    limitations: unique([
      ...(selected.limitations ?? []),
      ...(completeness.overall !== "complete"
        ? ["decision_evidence_not_complete"]
        : []),
    ]),
    provenance: {
      producer: "pi_decision_intelligence_service",
      producerVersion: PI_DECISION_INTELLIGENCE_VERSION,
      calculationMethod: "bounded_structured_decision_synthesis",
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
  });
  if (result.assessments.length > 2) {
    throw new Error("Decision Intelligence output exceeds its bounded result.");
  }
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Decision Intelligence input mutation detected.");
  }
  return result;
}

function synthesize(context) {
  if (
    context.cadence === "daily" &&
    !context.cadenceEligible &&
    context.eventAuthority === "no_event"
  ) {
    return {
      primary: decision("insufficient_evidence_for_change", "evidence", "not_applicable", [
        "daily_cadence_not_enabled_for_goal",
      ]),
    };
  }
  if (ownsSurface(context.eventAuthority)) {
    return {
      primary: decision("continue_observing", "cross_domain", "suppressed", [
        "authoritative_event_owns_decision_surface",
      ]),
    };
  }
  if (!knownGoal(context.goalContext)) {
    return {
      primary: decision(
        hasAnyEvidence(context) ? "continue_observing" : "insufficient_evidence_for_change",
        hasAnyEvidence(context) ? "cross_domain" : "evidence",
        hasAnyEvidence(context) ? "provisional" : "insufficient",
        ["decision_goal_context_unavailable"]
      ),
    };
  }
  if (context.conflicts.length || context.recommendationCompatibility === "conflicts") {
    return {
      primary: decision(
        "conflicting_evidence_continue_observing",
        "cross_domain",
        "conflicted",
        unique([...context.conflicts, ...(context.recommendationCompatibility === "conflicts"
          ? ["existing_recommendation_conflict"]
          : [])])
      ),
    };
  }
  const guardrail = guardrailConcern(context);
  if (guardrail.supported) {
    return { primary: decision(
      "review_body_fat_guardrail", "body_fat_guardrail", "supported",
      guardrail.limitations, guardrail.support
    ) };
  }
  if (guardrail.provisional) {
    return { primary: decision(
      "continue_observing", "body_fat_guardrail", "provisional",
      guardrail.limitations, guardrail.support
    ) };
  }
  const recovery = recoveryReview(context);
  if (recovery.supported) {
    return { primary: decision(
      "review_recovery_status", "recovery", "supported",
      recovery.limitations, recovery.support
    ) };
  }
  const energy = energyReview(context);
  if (energy.supported) {
    return { primary: decision(
      "review_energy_support", "energy", "supported",
      energy.limitations, energy.support
    ) };
  }
  const training = trainingReview(context);
  if (training.supported) {
    return { primary: decision(
      "review_training_status", "training", "supported",
      training.limitations, training.support
    ) };
  }
  if (hasProvisionalSignal(context)) {
    return {
      primary: decision("continue_observing", "cross_domain", "provisional", unique([
        ...provisionalLimitations(context),
        ...recovery.limitations,
        ...energy.limitations,
        ...training.limitations,
      ])),
    };
  }
  if (!criticalEvidenceAvailable(context)) {
    return {
      primary: decision("insufficient_evidence_for_change", "evidence", "insufficient", [
        "critical_decision_evidence_unavailable",
      ]),
    };
  }
  if (maintainSupported(context)) {
    return {
      primary: decision("maintain_current_plan", "plan", "supported", []),
    };
  }
  return {
    primary: decision("continue_observing", "cross_domain", "provisional", [
      "evidence_does_not_meet_maintain_or_review_threshold",
    ]),
  };
}

function guardrailConcern(context) {
  const candidate = context.candidates.find((item) =>
    item.candidateType === "body_fat_guardrail" ||
    item.relationshipKind === "early_phase_body_fat_guardrail"
  );
  if (!candidate) return unsupported("body_fat_guardrail_evidence_unavailable");
  const measured = candidate.participatingDomains?.includes("dexa") ||
    candidate.explanationData?.source === "dexa";
  const repeatedPhoto = candidate.participatingDomains?.includes("photos") &&
    (candidate.lifecycle?.totalObservationCount ?? candidate.lifecycle?.observationCount ?? 0) >= 2;
  const confidence = atLeast(candidate.confidence?.level, "moderate");
  const material = isMaterial(candidate);
  const concern = ["regressing", "negative", "concern", "outside_range"].includes(
    candidate.status
  ) || ["negative", "rising"].includes(candidate.direction);
  const support = supportFrom(candidate, null);
  if (concern && confidence && material && (measured || repeatedPhoto)) {
    return { supported: true, provisional: false, limitations: [], support };
  }
  return {
    supported: false,
    provisional: concern,
    limitations: [measured ? "guardrail_materiality_below_review_threshold"
      : "single_or_low_comparability_photo_signal"],
    support,
  };
}

function recoveryReview(context) {
  const claim = relationshipClaim(context, "recovery_training_relationship") ??
    relationshipClaim(context, "recovery_energy_relationship");
  const state = claim?.explanationData?.relationshipState ?? "";
  const strained = /strained|strain|declining_recovery/.test(state);
  const repeated = (claim?.lifecycle?.totalObservationCount ??
    claim?.lifecycle?.observationCount ?? 0) >= 2 ||
    ["strengthened", "contradicted"].includes(claim?.lifecycle?.state);
  const complete = context.completeness.recovery === "complete";
  const supported = Boolean(
    claim && strained && repeated && complete &&
    atLeast(claim.confidence?.level, "moderate") &&
    exactWindow(claim.evidenceWindow, context.evidenceWindow)
  );
  return {
    supported,
    limitations: unique([
      ...(!claim ? ["recovery_relationship_unavailable"] : []),
      ...(claim && !repeated ? ["recovery_relationship_not_repeated"] : []),
      ...(!complete ? ["recovery_evidence_incomplete"] : []),
    ]),
    support: supportFrom(null, claim),
  };
}

function energyReview(context) {
  const claims = context.claims.filter((claim) =>
    claim.participatingDomains?.includes("energy")
  );
  const claim = claims.find((item) => {
    const state = item.explanationData?.relationshipState ?? "";
    return [
      "training_decline_with_negative_energy_balance",
      "training_stability_with_declining_energy_support",
      "recovery_strain_with_negative_energy_balance",
    ].includes(state);
  });
  const complete = context.completeness.energy === "complete";
  const supported = Boolean(
    claim && complete &&
    atLeast(claim.confidence?.level, "moderate") &&
    MATERIAL_LIFECYCLE.has(claim.lifecycle?.state) &&
    exactWindow(claim.evidenceWindow, context.evidenceWindow)
  );
  return {
    supported,
    limitations: unique([
      ...(!claim ? ["material_energy_constraint_unavailable"] : []),
      ...(!complete ? ["energy_evidence_incomplete"] : []),
    ]),
    support: supportFrom(null, claim),
  };
}

function trainingReview(context) {
  const candidate = context.candidates.find((item) =>
    item.participatingDomains?.includes("training") &&
    ["regressing", "plateauing"].includes(
      item.explanationData?.trainingStatus ?? item.status
    )
  );
  const explainedByEnergy = energyReview(context).supported;
  const explainedByRecovery = recoveryReview(context).supported;
  const complete = context.completeness.training === "complete";
  const persistent = (candidate?.lifecycle?.totalObservationCount ??
    candidate?.lifecycle?.observationCount ?? 0) >= 2 ||
    ["strengthened", "contradicted"].includes(candidate?.lifecycle?.state);
  const supported = Boolean(
    candidate && complete && persistent &&
    atLeast(candidate.confidence?.level, "moderate") &&
    !explainedByEnergy && !explainedByRecovery
  );
  return {
    supported,
    limitations: unique([
      ...(!candidate ? ["material_training_constraint_unavailable"] : []),
      ...(!complete ? ["training_evidence_incomplete"] : []),
      ...(candidate && !persistent ? ["training_constraint_not_repeated"] : []),
    ]),
    support: supportFrom(candidate, null),
  };
}

function maintainSupported(context) {
  if (!knownGoal(context.goalContext) || !knownPhase(context.phaseContext, context.goalContext)) {
    return false;
  }
  if (context.completeness.overall !== "complete") return false;
  if (context.recommendationCompatibility === "conflicts") return false;
  const positiveDomains = new Set();
  context.candidates.forEach((candidate) => {
    if (
      ["improving", "stable", "observed"].includes(candidate.status) ||
      ["positive", "stable"].includes(candidate.direction)
    ) candidate.participatingDomains?.forEach((domain) => positiveDomains.add(domain));
  });
  context.claims.forEach((claim) => {
    const state = claim.explanationData?.relationshipState ?? "";
    if (/progress|stability|stable|improving|positive_support/.test(state)) {
      claim.participatingDomains?.forEach((domain) => positiveDomains.add(domain));
    }
  });
  return positiveDomains.size >= 2 &&
    ["training", "weight", "energy"].some((domain) => positiveDomains.has(domain));
}

function buildAssessment(spec, context) {
  const policy = PI_DECISION_POLICY[spec.kind];
  const support = spec.support ?? collectSupport(context);
  const relevant = [
    ...context.candidates.filter((item) => support.candidateIds.includes(item.id)),
    ...context.claims.filter((item) => support.claimIds.includes(item.id)),
  ];
  const confidence = decisionConfidence(relevant, context, spec.status);
  return createPIDecisionAssessment({
    decisionKind: spec.kind,
    status: spec.status,
    cadence: context.cadence,
    semanticHorizon: context.cadence,
    goalContext: boundedGoalContext(context.goalContext),
    phaseContext: boundedPhaseContext(context.phaseContext, context.goalContext),
    decisionScope: spec.domain === "plan" ? "goal_phase" : "domain_review",
    domain: spec.domain,
    confidence,
    materiality: {
      level: spec.status === "supported" ? "moderate" : "low",
      basis: [policy.renderingConcept],
      method: "decision_threshold_materiality",
    },
    lifecycle: { state: "unevaluated", observationCount: 0 },
    evidenceWindow: context.evidenceWindow,
    supportingCandidateIds: support.candidateIds,
    supportingClaimIds: support.claimIds,
    supportingObservationIds: support.observationIds,
    supportingEvidenceIds: support.evidenceIds,
    contradictingCandidateIds: context.conflicts.flatMap((item) =>
      item.startsWith("candidate:") ? [item.slice(10)] : []
    ),
    contradictingClaimIds: context.conflicts.flatMap((item) =>
      item.startsWith("claim:") ? [item.slice(6)] : []
    ),
    evidenceCompleteness: context.completeness.overall,
    limitations: unique(spec.limitations),
    rationaleData: {
      primaryRelationshipKind: relevant.find((item) =>
        item.explanationData?.relationshipState
      )?.explanationData?.relationshipState ?? null,
      supportingDomains: unique(relevant.flatMap((item) =>
        item.participatingDomains ?? []
      )),
      confidenceTier: confidence.level,
      lifecycleStates: unique(relevant.map((item) =>
        item.lifecycle?.state
      )),
      completenessState: context.completeness.overall,
      contradictionState: context.conflicts.length ? "present" : "none",
      goalRole: context.goalContext.semanticGoalType ?? "unknown",
      guardrailRole: spec.domain === "body_fat_guardrail",
      phaseRelevance: context.phaseContext.phaseAgeBand ??
        context.goalContext.phaseAgeBand ?? "unknown",
      evidenceCountSummary: {
        candidates: support.candidateIds.length,
        claims: support.claimIds.length,
        observations: support.observationIds.length,
        evidence: support.evidenceIds.length,
      },
      eventSuppressionReason: ownsSurface(context.eventAuthority)
        ? context.eventAuthority : null,
    },
    recommendationCompatibility: context.recommendationCompatibility,
    eventAuthority: context.eventAuthority,
    createdFrom: "pi_decision_intelligence_service",
    provenance: {
      producer: "pi_decision_intelligence_service",
      producerVersion: PI_DECISION_INTELLIGENCE_VERSION,
      calculationMethod: "bounded_structured_decision_synthesis",
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
  });
}

function decision(kind, domain, status, limitations = [], support = null) {
  return { kind, domain, status, limitations, support };
}
function collectSupport(context) {
  const candidates = context.candidates.slice(0, 8);
  const claims = context.claims.slice(0, 8);
  return {
    candidateIds: candidates.map((item) => item.id).filter(Boolean),
    claimIds: claims.map((item) => item.id).filter(Boolean),
    observationIds: unique(claims.flatMap((item) =>
      item.participatingObservationIds ?? []
    )).slice(0, 24),
    evidenceIds: unique([
      ...candidates.flatMap((item) => item.supportingEvidenceIds ?? []),
      ...claims.flatMap((item) => item.provenance?.sourceEvidenceIds ?? []),
    ]).slice(0, 24),
  };
}
function supportFrom(candidate, claim) {
  return {
    candidateIds: candidate?.id ? [candidate.id] : [],
    claimIds: claim?.id ? [claim.id] : [],
    observationIds: unique(claim?.participatingObservationIds ?? []),
    evidenceIds: unique([
      ...(candidate?.supportingEvidenceIds ?? []),
      ...(claim?.provenance?.sourceEvidenceIds ?? []),
    ]),
  };
}
function decisionConfidence(items, context, status) {
  const levels = items.map((item) => item.confidence?.level).filter(Boolean);
  let level = levels.length
    ? levels.sort((a, b) =>
        CONFIDENCE_ORDER.indexOf(a) - CONFIDENCE_ORDER.indexOf(b)
      )[0]
    : status === "insufficient" || status === "not_applicable"
      ? "unevaluated" : "low";
  if (
    context.completeness.overall !== "complete" ||
    context.conflicts.length ||
    status === "provisional" ||
    status === "conflicted"
  ) level = CONFIDENCE_ORDER.indexOf(level) > 1 ? "low" : level;
  return {
    level,
    reasons: items.length ? ["weakest_required_support_ceiling"] : [],
    limitations: unique([
      ...(context.completeness.overall !== "complete"
        ? ["decision_evidence_not_complete"]
        : []),
      ...(context.conflicts.length ? ["decision_evidence_conflicted"] : []),
    ]),
    method: "decision_weakest_support_threshold",
  };
}
function normalizeCandidates(values) {
  return values.map((item) => item.candidate ?? item).filter(Boolean)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
function normalizeCompleteness(value = {}) {
  const allowed = ["complete", "partial", "missing", "unknown"];
  const state = (key, fallback = "unknown") =>
    allowed.includes(value[key]) ? value[key] : fallback;
  return {
    overall: state("overall"),
    training: state("training"),
    energy: state("energy"),
    recovery: state("recovery"),
    bodyComposition: state("bodyComposition"),
  };
}
function normalizeEventAuthority(value = {}) {
  const state = typeof value === "string" ? value : value.state ?? "no_event";
  const map = {
    none: "no_event",
    dexa_event: "event_owns_decision",
    photo_event: "event_owns_decision",
    milestone: "event_owns_decision",
    goal_completion: "goal_completion_owns_surface",
    goal_transition: "goal_transition_owns_surface",
  };
  return map[state] ?? state;
}
function resolveRecommendationCompatibility(value) {
  if (!value) return "unknown";
  if (["compatible", "complementary", "conflicts", "independent", "unknown"].includes(
    value.compatibility
  )) return value.compatibility;
  return "unknown";
}
function normalizeConflicts(explicit = [], candidates, claims) {
  return unique([
    ...explicit,
    ...candidates.filter((item) =>
      item.status === "conflicted" || item.explanationData?.conflictState === "conflict"
    ).map((item) => `candidate:${item.id}`),
    ...claims.filter((item) =>
      item.lifecycle?.state === "contradicted"
    ).map((item) => `claim:${item.id}`),
  ]);
}
function relationshipClaim(context, kind) {
  return context.claims.find((item) => item.kind === kind);
}
function hasAnyEvidence(context) {
  return context.candidates.length > 0 || context.claims.length > 0;
}
function criticalEvidenceAvailable(context) {
  return context.completeness.training !== "missing" &&
    context.completeness.energy !== "missing" &&
    context.completeness.overall !== "missing";
}
function hasProvisionalSignal(context) {
  return context.completeness.overall === "partial" ||
    context.candidates.some((item) =>
      item.confidence?.level === "low" ||
      item.lifecycle?.state === "new" ||
      item.status === "insufficient_data"
    ) ||
    context.claims.some((item) =>
      item.confidence?.level === "low" ||
      item.explanationData?.relationshipState?.endsWith("_insufficient")
    );
}
function provisionalLimitations(context) {
  return unique([
    ...(context.completeness.overall === "partial"
      ? ["decision_evidence_partial"]
      : []),
    ...(context.completeness.recovery === "partial"
      ? ["recovery_evidence_sparse"]
      : []),
    ...(context.completeness.energy === "partial"
      ? ["energy_evidence_partial"]
      : []),
  ]);
}
function exactWindow(left, right) {
  return left?.startDate === right.startDate && left?.endDate === right.endDate;
}
function isMaterial(item) {
  return MATERIAL_LIFECYCLE.has(item.lifecycle?.state) &&
    ["moderate", "high", "very_high"].includes(item.materiality?.level) ||
    Number(item.materiality?.score ?? 0) >= 50;
}
function unsupported(limitation) {
  return {
    supported: false, provisional: false,
    limitations: [limitation],
    support: { candidateIds: [], claimIds: [], observationIds: [], evidenceIds: [] },
  };
}
function ownsSurface(state) {
  return [
    "event_owns_decision", "event_suppresses_routine_decision",
    "goal_completion_owns_surface", "goal_transition_owns_surface",
  ].includes(state);
}
function knownGoal(value) {
  return Boolean(value.activeGoalId) &&
    value.semanticGoalType && value.semanticGoalType !== "unknown";
}
function knownPhase(phase, goal) {
  return Boolean(phase.phaseId ?? goal.phaseId ?? phase.phaseAgeBand ?? goal.phaseAgeBand);
}
function atLeast(value, minimum) {
  return CONFIDENCE_ORDER.indexOf(value ?? "unevaluated") >=
    CONFIDENCE_ORDER.indexOf(minimum);
}
function boundedGoalContext(value) {
  return {
    activeGoalId: value.activeGoalId ?? null,
    semanticGoalType: value.semanticGoalType ?? "unknown",
    observationRole: value.observationRole ?? "context",
  };
}
function boundedPhaseContext(phase, goal) {
  return {
    phaseId: phase.phaseId ?? goal.phaseId ?? null,
    phaseAgeBand: phase.phaseAgeBand ?? goal.phaseAgeBand ?? "unknown",
  };
}
function requiredCadence(value) {
  if (!["daily", "midweek", "weekly"].includes(value)) {
    throw new Error("Unsupported Decision Intelligence cadence.");
  }
  return value;
}
function requiredWindow(value) {
  if (!value?.startDate || !value?.endDate || value.startDate > value.endDate) {
    throw new Error("Decision Intelligence requires an exact evidence window.");
  }
  return structuredClone(value);
}
function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}
