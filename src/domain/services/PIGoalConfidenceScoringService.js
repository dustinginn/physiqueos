import {
  PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION,
  resolvePIGoalConfidenceScoreBand,
} from "./PIGoalConfidenceAssessmentModel";
import {
  PIGoalConfidenceAssessmentService,
} from "./PIGoalConfidenceAssessmentService";

export const PI_GOAL_CONFIDENCE_SCORING_VERSION =
  "pi_goal_confidence_scoring_v1";
export const PI_GOAL_CONFIDENCE_CALIBRATION_ANCHOR = 50;
export const PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS = Object.freeze({
  current_active_goal: 5,
  energy_interpretation: 2,
  training_interpretation: 2,
  midweek_partial_window: 3,
  weekly_closed_window: 6,
  photo_event: 3,
  dexa_event: 15,
  phase_transition: 8,
  controlled_reconciliation: 20,
});
export const PI_GOAL_CONFIDENCE_DOMAIN_POINTS = Object.freeze({
  energy: Object.freeze({ near_maintenance: 10, persistent_deficit: -12, large_surplus: -12, incomplete: 0, unknown: 0 }),
  training: Object.freeze({ broad_constructive: 10, constructive: 6, stable: 4, isolated_pr: 1, stagnating: -2, regressing: -10, poor_session: 0, unknown: 0 }),
  weight: Object.freeze({ stable: 5, falling: -6, rising: 0, rising_with_softening: -6, volatile: -3, sparse: -3, one_day: 0, unknown: 0 }),
  photos: Object.freeze({ stable: 5, improving: 4, softening: -8, inconclusive: -2, low_quality: -2, missing: 0 }),
  dexa: Object.freeze({ confirming: 11, contradicting: -13, recent_baseline: 0, historical_baseline: 0, stale: -2, missing: 0 }),
  recovery: Object.freeze({ supportive: 2, limiting: -3, unsafe: -5, unknown: 0 }),
  protocol: Object.freeze({ supportive: 2, limiting: -3, unsafe: -5, present: 0, unknown: 0 }),
  evidence_completeness: Object.freeze({ complete: 3, partial: -3, missing: -8, unknown: 0 }),
});

export function createPIGoalConfidenceScoringService({
  assessmentService = PIGoalConfidenceAssessmentService,
} = {}) {
  return Object.freeze({
    score(input = {}) {
      validateContext(input);
      const contributors = [...(input.contributors ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id));
      const domainAdjustments = contributors.map((item) => ({
        contributorId: item.id,
        domain: item.domain,
        status: item.status,
        direction: item.direction,
        points: item.influencesScore === false ? 0 :
          (PI_GOAL_CONFIDENCE_DOMAIN_POINTS[item.domain]?.[item.status] ?? 0),
      }));
      const interpreted = domainAdjustments.filter((item) =>
        !["evidence_completeness"].includes(item.domain) && item.points !== 0);
      const supportingDomains = new Set(interpreted.filter((x) => x.points > 0).map((x) => x.domain));
      const conflictingDomains = new Set(interpreted.filter((x) => x.points < 0).map((x) => x.domain));
      const corroborationAdjustment = supportingDomains.size >= 3 ? 6 :
        supportingDomains.size === 2 ? 3 : 0;
      const contradictionAdjustment =
        supportingDomains.size > 0 && conflictingDomains.size > 0 ? -4 : 0;
      const authorityAdjustment = contributors.some((x) =>
        x.domain === "dexa" && x.status === "confirming") ? 4 :
        contributors.some((x) => x.domain === "dexa" && x.status === "contradicting") ? -5 : 0;
      const raw = clamp(PI_GOAL_CONFIDENCE_CALIBRATION_ANCHOR +
        domainAdjustments.reduce((sum, item) => sum + item.points, 0) +
        corroborationAdjustment + contradictionAdjustment + authorityAdjustment);
      const overallCompleteness = input.evidenceCompleteness?.overall ??
        (typeof input.evidenceCompleteness === "string" ? input.evidenceCompleteness : "unknown");
      const hasAuthority = contributors.some((x) => x.authoritative &&
        ["confirming", "contradicting"].includes(x.status));
      const ceiling = overallCompleteness === "missing" ? 49 :
        overallCompleteness === "partial" ? 64 : hasAuthority ? 100 : 79;
      const evidenceScore = Math.min(raw, ceiling);
      const prior = input.priorScore ?? null;
      const movementLimit = PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS[input.assessmentContext.type];
      const current = prior == null ? evidenceScore :
        clamp(prior + Math.max(-movementLimit, Math.min(movementLimit, evidenceScore - prior)));
      const delta = prior == null ? null : current - prior;
      const direction = prior == null ? "initial" :
        delta > 0 ? "increased" : delta < 0 ? "decreased" : "held";
      const magnitude = delta == null || delta === 0 ? "none" :
        Math.abs(delta) <= 2 ? "small" : Math.abs(delta) <= 5 ? "moderate" : "material";
      const primaryReason = reasonFor({
        direction, contributors, supportingDomains, conflictingDomains,
      });
      const uncertainty = contributors.filter((x) => x.direction === "limiting")
        .map((x) => x.reason).filter(Boolean);
      const canonicalContributors = contributors.map(stripMapperMetadata);
      const reasoning = {
        observationSemantics: input.reasoning?.observationSemantics ?? [],
        claimSemantics: input.reasoning?.claimSemantics ?? [],
        limitations: input.reasoning?.limitations ?? uncertainty,
        contradictions: input.reasoning?.contradictions ??
          contributors.filter((x) => x.direction === "conflicting").map((x) => x.reason),
        domainInterpretations: input.reasoning?.domainInterpretations ?? contributors.map((x) => ({
          id: x.id, domain: x.domain, status: x.status, direction: x.direction,
        })),
        authoritativeMeasurement: input.reasoning?.authoritativeMeasurement ?? null,
      };
      const assessment = assessmentService.assess({
        modelVersion: PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION,
        piVersion: input.piVersion,
        goalId: input.goalContext.goalId,
        phaseId: input.phaseContext.phaseId,
        operatingState: input.operatingState,
        context: input.assessmentContext,
        evidenceCutoff: input.evidenceCutoff,
        score: { current, prior, delta, band: resolvePIGoalConfidenceScoreBand(current) },
        movement: { direction, magnitude },
        priorScoreProvenance: input.priorScoreProvenance,
        contributors: canonicalContributors,
        evidenceCompleteness: input.evidenceCompleteness,
        primaryReason,
        unresolvedUncertainty: uncertainty,
        phaseAwareInterpretation:
          "Confidence reflects whether maintenance calibration is becoming reliable while preserving conditions for future lean-mass gain.",
        coachingImplication: coachingImplication(direction, uncertainty),
        reasoning,
        provenance: {
          sourceObservationIds: union(contributors.flatMap((x) => x.sourceObservationIds)),
          sourceClaimIds: union(contributors.flatMap((x) => x.sourceClaimIds)),
          canonicalEvidenceReferences: uniqueReferences(
            contributors.flatMap((x) => x.canonicalEvidenceReferences)),
          piDecisionResultId: input.piDecisionResultId ?? null,
          generatedAt: input.generatedAt,
        },
      });
      return deepFreeze({
        status: "scored",
        assessment,
        score: assessment.score,
        primaryReason,
        supportingContributors: canonicalContributors.filter((x) => x.direction === "supporting"),
        neutralContributors: canonicalContributors.filter((x) => x.direction === "neutral"),
        conflictingContributors: canonicalContributors.filter((x) => x.direction === "conflicting"),
        limitingContributors: canonicalContributors.filter((x) => x.direction === "limiting"),
        unresolvedUncertainty: uncertainty,
        trace: {
          startingScore: prior,
          calibrationAnchor: PI_GOAL_CONFIDENCE_CALIBRATION_ANCHOR,
          domainAdjustments,
          completenessAdjustment: domainAdjustments
            .find((x) => x.domain === "evidence_completeness")?.points ?? 0,
          corroborationAdjustment,
          contradictionAdjustment,
          authorityAdjustment,
          phaseRelevance: "build_lean_mass:establish_maintenance:calibration",
          evidenceScore,
          scoreCeiling: ceiling,
          contextMovementLimit: movementLimit,
          finalScore: current,
          finalMovement: { direction, magnitude, delta },
          holdReason: direction === "held" ? primaryReason : null,
          mapperTrace: input.mapperTrace ?? { merged: [], suppressed: [] },
        },
      });
    },
  });
}

export const PIGoalConfidenceScoringService =
  createPIGoalConfidenceScoringService();

function validateContext(input) {
  const goal = machine(input.goalContext?.semanticGoalType);
  const phase = machine(input.phaseContext?.semanticPhaseType);
  if (goal !== "build_lean_mass" || phase !== "establish_maintenance" ||
      machine(input.operatingState) !== "calibration") {
    throw new Error("unsupported_goal_phase_operating_state");
  }
  if (!(input.assessmentContext?.type in PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS)) {
    throw new Error("unsupported_assessment_context");
  }
}
function stripMapperMetadata(item) {
  return {
    id: item.id, domain: item.domain, label: item.label, direction: item.direction,
    strength: item.strength, confidence: item.confidence,
    evidenceCompleteness: item.evidenceCompleteness, reason: item.reason,
    sourceObservationIds: item.sourceObservationIds,
    sourceClaimIds: item.sourceClaimIds,
    canonicalEvidenceReferences: item.canonicalEvidenceReferences,
    affectedScoreMovement: item.influencesScore !== false &&
      (PI_GOAL_CONFIDENCE_DOMAIN_POINTS[item.domain]?.[item.status] ?? 0) !== 0,
    userFacing: item.userFacing,
    ...(item.consumedTransitionIds?.length
      ? { consumedTransitionIds: item.consumedTransitionIds }
      : {}),
    ...(item.contributorSemanticFingerprint
      ? { contributorSemanticFingerprint: item.contributorSemanticFingerprint }
      : {}),
    ...(item.firstConsumedAssessmentId
      ? { firstConsumedAssessmentId: item.firstConsumedAssessmentId }
      : {}),
    ...(item.sourceInterpretationId
      ? { sourceInterpretationId: item.sourceInterpretationId }
      : {}),
    ...(item.consumptionRole
      ? { consumptionRole: item.consumptionRole }
      : {}),
  };
}
function reasonFor({ direction, contributors, supportingDomains, conflictingDomains }) {
  const has = (domain, status) => contributors.some((x) =>
    x.domain === domain && (!status || x.status === status));
  if (direction === "held" && has("training") && has("energy", "persistent_deficit")) {
    return "Confidence held because Training improved, but the Energy picture still suggests a meaningful deficit.";
  }
  if (direction === "decreased" && has("weight") && has("energy") && has("photos", "softening")) {
    return "Confidence decreased because Weight, Energy, and Photos now point toward unwanted gain.";
  }
  if (direction === "decreased" && has("energy", "persistent_deficit")) {
    return "Confidence decreased because Energy still suggests a meaningful deficit and the supporting signals are not strong enough to offset it.";
  }
  if (direction === "decreased") {
    return "Confidence decreased because multiple current signals challenge maintenance calibration.";
  }
  if (direction === "increased" && supportingDomains.has("energy") && supportingDomains.has("training")) {
    return "Energy evidence became more reliable and Training remained constructive.";
  }
  if (direction === "increased") {
    return "Multiple current signals provide stronger support for maintenance calibration.";
  }
  if (direction === "initial") {
    return conflictingDomains.size > 0
      ? "The initial assessment remains cautious because current signals do not fully agree."
      : "The initial assessment reflects the evidence currently available for maintenance calibration.";
  }
  return "Confidence held because the available evidence does not yet justify a directional change.";
}
function coachingImplication(direction, uncertainty) {
  if (direction === "decreased") return "Reassess the current calibration inputs before changing the plan.";
  if (uncertainty.length) return "Hold the current approach while closing the remaining evidence gaps.";
  return "Continue the current calibration approach and reassess with the next meaningful evidence window.";
}
function machine(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
}
function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function union(values) {
  return [...new Set(values.filter(Boolean))].sort();
}
function uniqueReferences(values) {
  return [...new Map(values.map((x) => [`${x.type ?? ""}:${x.id}`, x])).values()]
    .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
