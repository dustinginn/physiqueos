export const PI_DECISION_ASSESSMENT_SCHEMA_VERSION =
  "pi_decision_assessment_v1";
export const PI_DECISION_KINDS = Object.freeze([
  "maintain_current_plan",
  "continue_observing",
  "insufficient_evidence_for_change",
  "review_energy_support",
  "review_training_status",
  "review_recovery_status",
  "review_body_fat_guardrail",
  "conflicting_evidence_continue_observing",
]);
export const PI_DECISION_STATUSES = Object.freeze([
  "supported", "provisional", "insufficient", "conflicted",
  "suppressed", "not_applicable",
]);
export const PI_RECOMMENDATION_COMPATIBILITY = Object.freeze([
  "compatible", "complementary", "conflicts", "independent", "unknown",
]);
export const PI_DECISION_EVENT_AUTHORITY = Object.freeze([
  "no_event", "event_owns_decision", "event_permits_supporting_assessment",
  "event_suppresses_routine_decision", "goal_completion_owns_surface",
  "goal_transition_owns_surface",
]);
const CADENCES = ["daily", "midweek", "weekly"];
const DOMAINS = [
  "plan", "energy", "training", "recovery", "body_fat_guardrail",
  "evidence", "cross_domain",
];
const MAX_REFERENCES = 24;
const FORBIDDEN_KEYS = /action|prescription|calorieChange|trainingChange|finalProse|rendered|rawEvidence|causal/i;

export function createPIDecisionAssessmentId({
  decisionKind, domain, goalSemanticType, phaseBand, semanticHorizon,
} = {}) {
  return [
    "pi_decision",
    requiredEnum(decisionKind, PI_DECISION_KINDS, "decisionKind"),
    token(requiredEnum(domain, DOMAINS, "domain")),
    token(goalSemanticType ?? "unknown"),
    token(phaseBand ?? "unknown"),
    token(semanticHorizon),
  ].join("|");
}

export function createPIDecisionAssessment(input = {}) {
  const before = structuredClone(input);
  rejectForbiddenShape(input);
  const decisionKind = requiredEnum(input.decisionKind, PI_DECISION_KINDS, "decisionKind");
  const status = requiredEnum(input.status, PI_DECISION_STATUSES, "status");
  const cadence = requiredEnum(input.cadence, CADENCES, "cadence");
  const domain = requiredEnum(input.domain, DOMAINS, "domain");
  const goalContext = boundedObject(input.goalContext ?? {});
  const phaseContext = boundedObject(input.phaseContext ?? {});
  const evidenceCompleteness = requiredEnum(
    input.evidenceCompleteness,
    ["complete", "partial", "missing", "unknown"],
    "evidenceCompleteness"
  );
  if (
    decisionKind === "maintain_current_plan" &&
    status === "supported" &&
    evidenceCompleteness !== "complete"
  ) throw new Error("Supported maintain requires complete evidence.");
  if (
    decisionKind.startsWith("review_") &&
    ["plan", "evidence", "cross_domain"].includes(domain)
  ) throw new Error("Review decisions require a target domain.");
  if (
    ["maintain_current_plan", "review_energy_support", "review_training_status",
      "review_recovery_status", "review_body_fat_guardrail"].includes(decisionKind) &&
    !goalContext.activeGoalId
  ) throw new Error("This decision requires known Goal context.");
  const id = input.id ?? createPIDecisionAssessmentId({
    decisionKind, domain,
    goalSemanticType: goalContext.semanticGoalType ?? "unknown",
    phaseBand: phaseContext.phaseAgeBand ?? goalContext.phaseAgeBand ?? "unknown",
    semanticHorizon: input.semanticHorizon ?? cadence,
  });
  const support = {
    supportingCandidateIds: refs(input.supportingCandidateIds, id),
    supportingClaimIds: refs(input.supportingClaimIds, id),
    supportingObservationIds: refs(input.supportingObservationIds, id),
    supportingEvidenceIds: refs(input.supportingEvidenceIds, id),
    contradictingCandidateIds: refs(input.contradictingCandidateIds, id),
    contradictingClaimIds: refs(input.contradictingClaimIds, id),
  };
  const assessment = {
    schemaVersion: PI_DECISION_ASSESSMENT_SCHEMA_VERSION,
    id,
    decisionKind,
    status,
    cadence,
    semanticHorizon: input.semanticHorizon ?? cadence,
    goalContext,
    phaseContext,
    decisionScope: requiredText(input.decisionScope, "decisionScope"),
    domain,
    confidence: normalizeConfidence(input.confidence),
    materiality: boundedObject(input.materiality ?? {}),
    lifecycle: normalizeLifecycle(input.lifecycle),
    evidenceWindow: normalizeWindow(input.evidenceWindow),
    ...support,
    evidenceCompleteness,
    limitations: unique(input.limitations),
    rationaleData: boundedObject(input.rationaleData ?? {}),
    recommendationCompatibility: requiredEnum(
      input.recommendationCompatibility ?? "unknown",
      PI_RECOMMENDATION_COMPATIBILITY,
      "recommendationCompatibility"
    ),
    eventAuthority: requiredEnum(
      input.eventAuthority ?? "no_event",
      PI_DECISION_EVENT_AUTHORITY,
      "eventAuthority"
    ),
    createdFrom: requiredText(input.createdFrom, "createdFrom"),
    provenance: boundedObject(input.provenance ?? {}),
  };
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Decision assessment input mutation detected.");
  }
  return Object.freeze(assessment);
}

export function validatePIDecisionAssessment(value) {
  const rebuilt = createPIDecisionAssessment(value);
  if (rebuilt.id !== value.id) throw new Error("Decision identity mismatch.");
  return true;
}
function normalizeConfidence(value = {}) {
  return {
    level: requiredEnum(
      value.level ?? "unevaluated",
      ["unevaluated", "low", "moderate", "high", "very_high"],
      "confidence.level"
    ),
    reasons: unique(value.reasons),
    limitations: unique(value.limitations),
    method: requiredText(value.method ?? "decision_evidence_threshold", "confidence.method"),
  };
}
function normalizeLifecycle(value = {}) {
  return {
    state: requiredEnum(
      value.state ?? "unevaluated",
      ["unevaluated", "new", "unchanged", "strengthened", "weakened",
        "contradicted", "resolved", "background", "retired"],
      "lifecycle.state"
    ),
    ...(value.firstObservedDate ? { firstObservedDate: value.firstObservedDate } : {}),
    ...(value.lastObservedDate ? { lastObservedDate: value.lastObservedDate } : {}),
    observationCount: Number.isInteger(value.observationCount)
      ? value.observationCount : 0,
  };
}
function normalizeWindow(value) {
  if (!value?.startDate || !value?.endDate || value.startDate > value.endDate) {
    throw new Error("Decision evidenceWindow must be bounded.");
  }
  return {
    startDate: value.startDate, endDate: value.endDate,
    ...(value.comparisonStartDate ? { comparisonStartDate: value.comparisonStartDate } : {}),
    ...(value.comparisonEndDate ? { comparisonEndDate: value.comparisonEndDate } : {}),
  };
}
function refs(values = [], ownId) {
  if (!Array.isArray(values) || values.length > MAX_REFERENCES) {
    throw new Error("Decision support references must be bounded.");
  }
  const result = unique(values);
  if (result.includes(ownId)) throw new Error("Decision cannot reference itself.");
  return result;
}
function rejectForbiddenShape(value) {
  const walk = (item) => {
    if (!item || typeof item !== "object") return;
    Object.entries(item).forEach(([key, child]) => {
      if (FORBIDDEN_KEYS.test(key)) {
        throw new Error("Decision assessments cannot contain actions, prose, raw evidence, or causal rationale.");
      }
      walk(child);
    });
  };
  walk(value);
}
function boundedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Decision structured fields must be objects.");
  }
  const clone = structuredClone(value);
  if (JSON.stringify(clone).length > 6000) throw new Error("Decision structured field is unbounded.");
  rejectForbiddenShape(clone);
  return clone;
}
function requiredEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`Unsupported ${field}.`);
  return value;
}
function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}
function token(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}
