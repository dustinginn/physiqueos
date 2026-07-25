import {
  scorePIClaimForPriority,
} from "./PIClaimRankingService";
import {
  isPICrossDomainClaim,
  validatePICrossDomainClaim,
} from "./PICrossDomainClaimService";
import { validatePIObservation } from "./PIObservationService";
import {
  createCadenceEnergyComparison,
  validateCadenceEnergyAssessment,
} from "./CadenceEnergyAssessmentService";

export const PI_NARRATIVE_CANDIDATE_SCHEMA_VERSION =
  "pi_narrative_candidate_v1";
const TYPES = new Set([
  "cross_domain_claim",
  "direct_training",
  "direct_recovery",
  "energy_trend",
  "body_fat_guardrail",
]);
const LIFECYCLE_ATTENTION = new Set([
  "new", "strengthened", "weakened", "contradicted", "resolved",
]);
const CONFIDENCE_SCORE = {
  unevaluated: 0, low: 8, moderate: 14, high: 18, very_high: 20,
};

export function createPIClaimNarrativeCandidate({ claim } = {}) {
  validatePICrossDomainClaim(claim);
  const domains = [...claim.participatingDomains];
  return normalizePINarrativeCandidate({
    id: `pi_narrative|claim|${claim.id}`,
    candidateType: "cross_domain_claim",
    sourceType: "pi_claim",
    sourceId: claim.id,
    semanticFamily: claimFamily(claim),
    semanticScope: claim.id.split("|").at(-1),
    participatingDomains: domains,
    thesisDomain: domains.includes("training")
      ? "training"
      : domains.includes("recovery") ? "recovery" : "weight",
    relationshipKind: claim.kind,
    status: claim.lifecycle?.state ?? "unevaluated",
    direction: claim.explanationData?.weightDirection ?? "unknown",
    confidence: claim.confidence,
    materiality: claim.materiality,
    goalContext: claim.explanationData?.goalContext ?? {},
    lifecycle: claim.lifecycle ?? { state: "unevaluated" },
    evidenceWindow: claim.evidenceWindow,
    supportingEvidenceIds:
      claim.provenance?.sourceEvidenceIds ??
      claim.participatingObservationIds,
    coverage: claim.explanationData?.coverage ?? { state: "complete" },
    limitations: claim.limitations,
    explanationData: claim.explanationData,
    provenance: {
      producer: "pi_narrative_candidate_service",
      sourceProducer: claim.provenance,
    },
  });
}

export function createPIObservationNarrativeCandidate({ observation } = {}) {
  validatePIObservation(observation);
  if (observation.domain !== "training") {
    throw new Error("Direct narrative observations must use Training.");
  }
  const eligible = trainingEligible(observation);
  return normalizePINarrativeCandidate({
    id: `pi_narrative|direct_training|${observation.id}`,
    candidateType: "direct_training",
    sourceType: "pi_observation",
    sourceId: observation.id,
    semanticFamily: `training|${scopeOf(observation)}|performance`,
    semanticScope: `training.${scopeOf(observation)}`,
    participatingDomains: ["training"],
    thesisDomain: "training",
    relationshipKind: observation.kind,
    status: eligible ? observation.status : "ineligible",
    direction: observation.direction,
    confidence: observation.confidence,
    materiality: observation.materiality,
    goalContext: observation.goalContext,
    lifecycle: observation.lifecycle,
    evidenceWindow: observation.evidenceWindow,
    supportingEvidenceIds: observation.supportingEvidenceIds,
    coverage: {
      state: observation.status === "insufficient_data" ? "missing" : "complete",
    },
    limitations: [
      ...observation.confidence.limitations,
      ...(!eligible ? ["direct_training_not_representative"] : []),
    ],
    explanationData: {
      subject: observation.subject,
      trainingStatus: observation.status,
      trainingDirection: observation.direction,
      representative: eligible,
    },
    provenance: {
      producer: "pi_narrative_candidate_service",
      sourceProducer: observation.provenance,
    },
  });
}

export function createPIRecoveryNarrativeCandidate({ observation } = {}) {
  validatePIObservation(observation);
  if (
    observation.domain !== "recovery" ||
    !["recovery_state", "recovery_insufficient_evidence"].includes(observation.kind)
  ) throw new Error("Direct Recovery candidates require a supported Recovery observation.");
  const material = ["improving", "regressing"].includes(observation.status);
  return normalizePINarrativeCandidate({
    id: `pi_narrative|direct_recovery|${observation.id}`,
    candidateType: "direct_recovery",
    sourceType: "pi_observation",
    sourceId: observation.id,
    semanticFamily: `recovery|${observation.semanticScope ?? "composite"}`,
    semanticScope: observation.id.split("|").at(-1),
    participatingDomains: ["recovery"],
    thesisDomain: "recovery",
    relationshipKind: observation.kind,
    status: observation.status,
    direction: observation.direction,
    confidence: observation.confidence,
    materiality: {
      level: material ? "moderate" : "low",
      score: material ? 55 : 20,
      basis: material ? ["material_recovery_change"] : ["recovery_context"],
      method: "recovery_observation_materiality",
    },
    goalContext: observation.goalContext,
    lifecycle: observation.lifecycle,
    evidenceWindow: observation.evidenceWindow,
    supportingEvidenceIds: observation.supportingEvidenceIds,
    coverage: {
      state: observation.status === "insufficient_data" ? "missing" : "partial",
    },
    limitations: observation.confidence.limitations,
    explanationData: {
      ...observation.explanationData,
      renderingConcept: observation.status === "improving"
        ? "Recovery evidence materially improved."
        : observation.status === "regressing"
          ? "Recovery evidence materially weakened."
          : "Recovery evidence was too limited to interpret confidently.",
    },
    provenance: {
      producer: "pi_narrative_candidate_service",
      sourceProducer: observation.provenance,
    },
  });
}

export function createPIEnergyTrendNarrativeCandidate({
  currentAssessment,
  comparisonAssessment,
  goalContext = {},
} = {}) {
  validateCadenceEnergyAssessment(currentAssessment);
  validateCadenceEnergyAssessment(comparisonAssessment);
  const comparison = createCadenceEnergyComparison(
    currentAssessment,
    comparisonAssessment
  );
  const cadence = currentAssessment.cadence;
  const material = ["intake", "estimatedExpenditure", "netBalance"].some(
    (key) => ["rising", "falling"].includes(comparison[key].direction)
  );
  return normalizePINarrativeCandidate({
    id: `pi_narrative|energy_trend|${cadence}.energy_calibration`,
    candidateType: "energy_trend",
    sourceType: "cadence_energy_assessment",
    sourceId: `${cadence}.energy_calibration`,
    semanticFamily: `energy|${cadence}|calibration`,
    semanticScope: `${cadence}.energy_calibration`,
    participatingDomains: ["energy"],
    thesisDomain: "energy",
    relationshipKind: "cadence_energy_trend",
    status: currentAssessment.coverage.state === "insufficient"
      ? "insufficient_data"
      : material ? "changed" : "stable",
    direction: comparison.netBalance.direction,
    confidence: energyConfidence(currentAssessment),
    materiality: {
      level: material ? "moderate" : "low",
      score: material ? 55 : 25,
      basis: material ? ["directional_change"] : ["routine_context"],
      method: "cadence_energy_direction_change",
    },
    goalContext,
    lifecycle: { state: "unevaluated" },
    evidenceWindow: {
      startDate: currentAssessment.window.startDate,
      endDate: currentAssessment.window.endDate,
      comparisonStartDate: comparisonAssessment.window.startDate,
      comparisonEndDate: comparisonAssessment.window.endDate,
    },
    supportingEvidenceIds: currentAssessment.supportingEvidenceIds,
    coverage: currentAssessment.coverage,
    limitations: [
      ...currentAssessment.limitations,
      ...comparison.limitations,
    ],
    explanationData: {
      cadence,
      comparison,
      current: energySummary(currentAssessment),
      previous: energySummary(comparisonAssessment),
      rmr: currentAssessment.rmr,
      calculationMethod:
        currentAssessment.provenance.calculationMethod,
    },
    provenance: {
      producer: "pi_narrative_candidate_service",
      sourceProducer: currentAssessment.provenance,
    },
  });
}

export function createPIBodyFatGuardrailNarrativeCandidate({ assessment } = {}) {
  if (!assessment || assessment.schemaVersion !== "pi_body_fat_guardrail_v1") {
    throw new Error("Valid body-fat guardrail assessment is required.");
  }
  return normalizePINarrativeCandidate({
    id: `pi_narrative|body_fat_guardrail|${assessment.guardrailId}|${assessment.semanticScope}`,
    candidateType: "body_fat_guardrail",
    sourceType: "body_fat_guardrail_assessment",
    sourceId: assessment.id,
    semanticFamily: `body_composition|guardrail|${assessment.guardrailId}`,
    semanticScope: assessment.semanticScope,
    participatingDomains: assessment.participatingDomains,
    thesisDomain: "photos",
    relationshipKind: "early_phase_body_fat_guardrail",
    status: assessment.state,
    direction: assessment.direction,
    confidence: assessment.confidence,
    materiality: assessment.materiality,
    goalContext: assessment.goalContext,
    lifecycle: { state: "unevaluated" },
    evidenceWindow: assessment.evidenceWindow,
    supportingEvidenceIds: assessment.evidenceIds,
    coverage: { state: assessment.state === "insufficient" ? "missing" : "complete" },
    limitations: assessment.limitations,
    explanationData: {
      guardrailState: assessment.state,
      phaseAgeBand: assessment.phaseAgeBand,
      bodyFatTargetRange: assessment.bodyFatTargetRange,
      photoComparability: assessment.photoComparability,
      quantifiedBodyFatEstimate: null,
      causalInference: false,
    },
    provenance: {
      producer: "pi_narrative_candidate_service",
      sourceProducer: assessment.provenance,
    },
  });
}

export function normalizePINarrativeCandidate(value = {}) {
  if (!TYPES.has(value.candidateType)) {
    throw new Error("Unsupported PI narrative candidate type.");
  }
  const candidate = {
    id: required(value.id, "id"),
    schemaVersion: PI_NARRATIVE_CANDIDATE_SCHEMA_VERSION,
    candidateType: value.candidateType,
    sourceType: required(value.sourceType, "sourceType"),
    sourceId: required(value.sourceId, "sourceId"),
    semanticFamily: required(value.semanticFamily, "semanticFamily"),
    semanticScope: required(value.semanticScope, "semanticScope"),
    participatingDomains: unique(value.participatingDomains),
    thesisDomain: required(value.thesisDomain, "thesisDomain"),
    relationshipKind: required(value.relationshipKind, "relationshipKind"),
    status: required(value.status, "status"),
    direction: required(value.direction, "direction"),
    confidence: clone(value.confidence ?? {}),
    materiality: clone(value.materiality ?? {}),
    goalContext: clone(value.goalContext ?? {}),
    lifecycle: clone(value.lifecycle ?? { state: "unevaluated" }),
    evidenceWindow: clone(value.evidenceWindow ?? {}),
    supportingEvidenceIds: unique(value.supportingEvidenceIds),
    coverage: clone(value.coverage ?? { state: "missing" }),
    limitations: unique(value.limitations),
    explanationData: clone(value.explanationData ?? {}),
    provenance: clone(value.provenance ?? {}),
  };
  validatePINarrativeCandidate(candidate);
  return deepFreeze(candidate);
}

export function validatePINarrativeCandidate(value) {
  if (!value || value.schemaVersion !== PI_NARRATIVE_CANDIDATE_SCHEMA_VERSION) {
    throw new Error("Invalid PI narrative candidate schema.");
  }
  if (!TYPES.has(value.candidateType)) {
    throw new Error("Invalid PI narrative candidate type.");
  }
  ["id", "sourceId", "semanticFamily", "semanticScope", "thesisDomain"].forEach(
    (field) => required(value[field], field)
  );
  if (!Array.isArray(value.participatingDomains)) {
    throw new Error("participatingDomains must be an array.");
  }
  return true;
}

export function rankPINarrativeCandidates(candidates = [], context = {}, options = {}) {
  const normalized = candidates.map(normalizePINarrativeCandidate);
  const communicated = new Set(context.communicatedCandidateIds ?? []);
  return normalized.map((candidate) => {
    const score = candidate.candidateType === "cross_domain_claim" &&
      isPICrossDomainClaim(options.claimsById?.[candidate.sourceId])
      ? scorePIClaimForPriority(
          options.claimsById[candidate.sourceId],
          context,
          options.claimRankingOptions
        ).priorityScore
      : candidateScore(candidate, context);
    const reasons = [];
    let eligible = candidate.status !== "ineligible" &&
      candidate.status !== "insufficient_data" &&
      !["background", "retired"].includes(candidate.lifecycle.state);
    if (communicated.has(candidate.id) &&
      !LIFECYCLE_ATTENTION.has(candidate.lifecycle.state)) {
      eligible = false;
      reasons.push("unchanged_recently_communicated");
    }
    if (!eligible && !reasons.length) reasons.push("candidate_ineligible");
    return {
      candidate,
      score,
      eligible,
      selectionState: eligible ? "supporting" : "suppressed",
      suppressionReasons: reasons,
    };
  }).sort((left, right) =>
    right.score - left.score || left.candidate.id.localeCompare(right.candidate.id)
  ).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function selectPINarrativeCandidates(candidates = [], context = {}, options = {}) {
  const ranked = rankPINarrativeCandidates(candidates, context, options);
  const primaryMinimumScore = options.primaryMinimumScore ?? 50;
  const maxSupporting = options.maxSupporting ?? 2;
  const primary = ranked.find((entry) =>
    entry.eligible && entry.score >= primaryMinimumScore
  ) ?? null;
  if (primary) primary.selectionState = "primary";
  const selectedFamilies = new Set(primary ? [primary.candidate.semanticFamily] : []);
  const supporting = [];
  for (const entry of ranked) {
    if (!entry.eligible || entry === primary) continue;
    if (duplicatesSelected(entry.candidate, primary?.candidate, supporting)) {
      entry.selectionState = "suppressed";
      entry.suppressionReasons.push("semantic_duplicate");
      continue;
    }
    if (supporting.length < maxSupporting &&
      !selectedFamilies.has(entry.candidate.semanticFamily)) {
      supporting.push(entry);
      selectedFamilies.add(entry.candidate.semanticFamily);
    }
  }
  if (options.requireEnergyContext === true &&
    ![primary, ...supporting].some((entry) =>
      entry?.candidate.candidateType === "energy_trend"
    )) {
    const energy = ranked.find((entry) =>
      entry.eligible && entry.candidate.candidateType === "energy_trend"
    );
    if (energy && supporting.length < maxSupporting) supporting.push(energy);
  }
  const selected = new Set([primary, ...supporting].filter(Boolean));
  return {
    primary: primary ? [primary] : [],
    supporting,
    background: ranked.filter((entry) =>
      entry.candidate.lifecycle.state === "background"
    ),
    suppressed: ranked.filter((entry) =>
      !selected.has(entry) && entry.selectionState === "suppressed"
    ),
    rankedCandidates: ranked,
  };
}

export function evaluatePINarrativeCandidateLifecycle(
  current,
  prior = null,
  { evaluationDate } = {}
) {
  validatePINarrativeCandidate(current);
  if (prior) validatePINarrativeCandidate(prior);
  const changed = prior ? candidateMeaning(current) !== candidateMeaning(prior) : true;
  const state = !prior ? "new" : changed ? lifecycleChange(current, prior) : "unchanged";
  return normalizePINarrativeCandidate({
    ...current,
    lifecycle: {
      state,
      firstObservedDate: prior?.lifecycle.firstObservedDate ?? evaluationDate,
      lastObservedDate: evaluationDate,
      lastMaterialChangeDate: changed
        ? evaluationDate
        : prior.lifecycle.lastMaterialChangeDate,
      totalObservationCount: (prior?.lifecycle.totalObservationCount ?? 0) + 1,
    },
  });
}

function candidateScore(candidate, context) {
  const lifecycle = {
    new: 12, strengthened: 20, weakened: 18, contradicted: 24,
    resolved: 10, unchanged: 4, unevaluated: 0,
  }[candidate.lifecycle.state] ?? 0;
  const materiality = Math.round((candidate.materiality.score ?? 0) * .2);
  const confidence = CONFIDENCE_SCORE[candidate.confidence.level] ?? 0;
  const coverage = { complete: 10, partial: 5, missing: 0 }[
    candidate.coverage.state
  ] ?? (candidate.coverage.coverageRatio >= .7 ? 8 : 4);
  const breadth = candidate.candidateType === "direct_training"
    ? candidate.semanticScope.includes("overall") ? 10
      : candidate.semanticScope.includes("category") ? 6 : 1
    : 8;
  const goal = goalScore(candidate, context);
  const cadence = context.cadence === "midweek" &&
    candidate.candidateType === "energy_trend" &&
    candidate.status === "changed" ? 5 : 0;
  return clamp(
    lifecycle + materiality + confidence + coverage + breadth + goal + cadence -
    Math.min(12, candidate.limitations.length * 3)
  );
}
function goalScore(candidate, context) {
  const title = String(context.activeGoal?.title ?? "").toLowerCase();
  if (/lean mass|build/.test(title) && candidate.thesisDomain === "training") return 14;
  if (/fat loss|cut|visible abs/.test(title) &&
    candidate.participatingDomains.includes("weight")) return 12;
  return Object.keys(candidate.goalContext ?? {}).length ? 6 : 2;
}
function trainingEligible(observation) {
  if (!["improving", "regressing", "stable"].includes(observation.status)) {
    return false;
  }
  if (observation.status === "stable" &&
    observation.subject.type === "exercise") return false;
  return observation.subject.type !== "exercise" ||
    observation.explanationData?.pr_detection?.detected === true ||
    observation.explanationData?.representative === true;
}
function scopeOf(observation) {
  return {
    training_scope: "overall",
    training_category: "category",
    exercise: "exercise",
  }[observation.subject.type] ?? "unknown";
}
function energyConfidence(assessment) {
  const ratio = assessment.coverage.coverageRatio;
  return {
    level: ratio === 1 ? "high" : ratio >= .5 ? "moderate" : "low",
    score: Math.round(ratio * 100),
    reasons: ["paired_energy_coverage"],
    factors: [],
    limitations: [...assessment.limitations],
    method: "cadence_energy_coverage",
  };
}
function energySummary(assessment) {
  return {
    intake: assessment.intake,
    activity: assessment.activity,
    estimatedExpenditure: assessment.estimatedExpenditure,
    netBalance: assessment.netBalance,
    coverage: assessment.coverage,
  };
}
function claimFamily(claim) {
  return `${[...claim.participatingDomains].sort().join("+")}|${claim.kind}`;
}
function candidateMeaning(candidate) {
  return JSON.stringify({
    status: candidate.status,
    direction: candidate.direction,
    confidence: candidate.confidence.level,
    coverage: candidate.coverage.state ?? candidate.coverage.coverageRatio,
    limitations: candidate.limitations,
    goalContext: candidate.goalContext,
    comparison: candidate.explanationData.comparison
      ? {
          intake: candidate.explanationData.comparison.intake.direction,
          expenditure:
            candidate.explanationData.comparison.estimatedExpenditure.direction,
          balance: candidate.explanationData.comparison.netBalance.direction,
        }
      : null,
  });
}
function lifecycleChange(current, prior) {
  if (current.direction !== prior.direction) return "contradicted";
  const currentCoverage = current.coverage.coverageRatio ?? 0;
  const priorCoverage = prior.coverage.coverageRatio ?? 0;
  if (currentCoverage > priorCoverage) return "strengthened";
  if (currentCoverage < priorCoverage) return "weakened";
  return "strengthened";
}
function duplicatesSelected(candidate, primary, supporting) {
  const selected = [primary, ...supporting.map((entry) => entry.candidate)]
    .filter(Boolean);
  return selected.some((item) => {
    if (item.semanticFamily === candidate.semanticFamily) return true;
    if (candidate.candidateType === "direct_training" &&
      item.candidateType === "cross_domain_claim" &&
      item.participatingDomains.includes("training")) return true;
    if (candidate.candidateType === "energy_trend" &&
      item.candidateType === "cross_domain_claim" &&
      item.participatingDomains.includes("energy")) return true;
    return false;
  });
}
function required(value, field) {
  if (typeof value !== "string" || !value) throw new Error(`${field} is required.`);
  return value;
}
function unique(values) {
  return [...new Set(Array.isArray(values) ? values.filter(Boolean) : [])].sort();
}
function clone(value) {
  return structuredClone(value);
}
function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
