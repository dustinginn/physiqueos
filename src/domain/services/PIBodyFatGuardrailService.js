import { validatePIObservation } from "./PIObservationService";

export const PI_BODY_FAT_GUARDRAIL_VERSION = "pi_body_fat_guardrail_v1";
const PHOTO_KINDS = new Set([
  "photo_leanness_change",
  "photo_abdominal_definition_change",
  "photo_whole_body_softness_change",
  "photo_visual_stability",
]);

export function createEarlyPhaseBodyFatGuardrailAssessment({
  observations = [],
  goalContext = null,
} = {}) {
  observations.forEach(validatePIObservation);
  const context = goalContext ?? observations.find((item) => item.goalContext?.activeGoalId)?.goalContext ?? {};
  const photos = observations.filter((item) =>
    item.domain === "photos" &&
    PHOTO_KINDS.has(item.kind) &&
    item.goalContext?.observationRole === "guardrail" &&
    item.goalContext?.evidencePurpose === "early_phase_body_fat_monitoring"
  );
  const dexa = observations.find((item) => item.kind === "dexa_body_fat_percentage_change" && item.status !== "insufficient_data") ?? null;
  const active = context.semanticGoalType === "lean_mass_gain" &&
    context.phaseAgeBand === "week_1_to_4" &&
    hasGuardrail(context);
  const limitations = [];
  if (!active) limitations.push("early_phase_body_fat_monitoring_not_applicable");
  if (!photos.length) limitations.push("eligible_comparable_photo_observation_unavailable");
  const eligible = photos.filter((item) => ["moderate", "high"].includes(item.confidence.level));
  if (photos.length && !eligible.length) limitations.push("photo_comparability_below_guardrail_threshold");

  let state = !active || !eligible.length ? "insufficient" : photoState(eligible);
  const drift = ["possible_drift", "repeated_possible_drift"].includes(state);
  const stable = state === "stable";
  if (dexa && (drift && ["stable", "falling"].includes(dexa.direction) || stable && dexa.direction === "rising")) {
    state = "contradicted";
    limitations.push("photo_guardrail_direction_contradicted_by_dexa");
  }
  const evidence = [...eligible, ...(dexa ? [dexa] : [])];
  const dates = evidence.flatMap((item) => [item.evidenceWindow.startDate, item.evidenceWindow.endDate]).filter(Boolean).sort();
  const range = bodyFatRange(context);
  return Object.freeze({
    id: `pi_guardrail|${context.activeGoalId ?? "unknown_goal"}|body_fat|early_phase`,
    schemaVersion: PI_BODY_FAT_GUARDRAIL_VERSION,
    guardrailId: range.id,
    semanticScope: "early_phase.body_fat_direction",
    state,
    direction: state === "stable" ? "stable" : state === "insufficient" ? "unknown" : state === "contradicted" ? "unknown" : "rising",
    phaseAgeBand: context.phaseAgeBand ?? "unknown",
    bodyFatTargetRange: { min: range.min, max: range.max, unit: "%" },
    photoComparability: eligible.map((item) => ({
      observationId: item.id,
      level: item.confidence.level,
      comparisonQuality: item.explanationData.comparisonQuality ?? "unknown",
    })),
    participatingDomains: [...new Set(evidence.map((item) => item.domain))].sort(),
    evidenceIds: [...new Set(evidence.flatMap((item) => item.supportingEvidenceIds))].sort(),
    evidenceWindow: { startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null },
    confidence: guardrailConfidence(state, eligible, dexa, limitations),
    materiality: {
      level: state === "repeated_possible_drift" || state === "contradicted" ? "high" : state === "possible_drift" ? "moderate" : "low",
      score: state === "repeated_possible_drift" || state === "contradicted" ? 80 : state === "possible_drift" ? 55 : 25,
      basis: ["explicit_goal_guardrail", "photo_directional_evidence"],
      method: "early_phase_guardrail_materiality",
    },
    goalContext: structuredClone(context),
    limitations: [...new Set(limitations)].sort(),
    provenance: {
      producer: "pi_body_fat_guardrail_service",
      producerVersion: PI_BODY_FAT_GUARDRAIL_VERSION,
      calculationMethod: "early_phase_photo_direction_with_dexa_precedence",
      sourceObservationIds: evidence.map((item) => item.id).sort(),
    },
  });
}

function photoState(photos) {
  const drift = photos.filter(isDrift);
  if (!drift.length) return "stable";
  const repeated = drift.some((item) => Number(item.explanationData.repeatedDirectionCount) >= 2) || drift.length >= 2;
  return repeated ? "repeated_possible_drift" : "possible_drift";
}
function isDrift(item) {
  return item.kind === "photo_whole_body_softness_change" && item.direction === "rising" ||
    ["photo_leanness_change", "photo_abdominal_definition_change"].includes(item.kind) && item.direction === "falling";
}
function hasGuardrail(context) {
  return context.guardrailRelevant === true ||
    (context.targetRanges ?? []).some((range) => range.role === "guardrail" && /body_fat/.test(range.measure));
}
function bodyFatRange(context) {
  const range = (context.targetRanges ?? []).find((item) => item.role === "guardrail" && /body_fat/.test(item.measure));
  return { id: range?.id ?? "body_fat_guardrail", min: range?.min ?? null, max: range?.max ?? null };
}
function guardrailConfidence(state, photos, dexa, limitations) {
  const level = state === "contradicted" && dexa ? "high" :
    state === "repeated_possible_drift" ? "moderate" :
      state === "possible_drift" || state === "stable" ? "moderate" : "low";
  return {
    level,
    reasons: [`${photos.length}_eligible_photo_observations`, dexa ? "dexa_precedence_applied" : "no_dexa_contradiction"],
    limitations: [...new Set(limitations)].sort(),
    method: "early_phase_photo_guardrail_with_dexa_precedence",
  };
}
