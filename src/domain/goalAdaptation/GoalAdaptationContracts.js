// Goal Adaptation contracts v1 (Phase 0).
//
// Additive, pure builders and validators for the records a future, separately
// authorized phase will persist. Nothing here is persisted or wired into a
// runtime path, and no production schema changes. Every builder returns a
// deep-frozen value and throws on invalid input.

import { createHash } from "node:crypto";

export const GOAL_ADAPTATION_CONTRACT_VERSION = "goal_adaptation_contracts_v1";

export const AdaptationRecommendationLifecycle = Object.freeze({
  OPEN: "open",
  SNOOZED_UNTIL_WEEKLY: "snoozed_until_weekly",
  KEPT_CURRENT_PLAN: "kept_current_plan",
  REMOVED_FROM_HOME: "removed_from_home",
  DECIDED: "decided",
  SUPERSEDED: "superseded",
});

export const AdaptationOptionKind = Object.freeze({
  LEAN_OUT_FIRST: "lean_out_first",
  KEEP_BUILDING_REVISED_LIMITS: "keep_building_revised_limits",
  KEEP_CURRENT_PLAN: "keep_current_plan",
  CUSTOM: "custom",
  ADHERENCE_REVIEW: "adherence_review",
});

export const GuardrailEffectivePeriod = Object.freeze({
  PHASE: "phase",
  UNTIL_DATE: "until_date",
  PERMANENT: "permanent",
  CONDITION: "condition",
});

export const GuardrailBoundMeaning = Object.freeze({
  UNSAFE: "unsafe",
  COACHING: "coaching",
  NONE: "none",
});

export const JourneyEventType = Object.freeze({
  GOAL_CREATED: "goal_created",
  GOAL_CONTRACT_REVISED: "goal_contract_revised",
  PHASE_STARTED: "phase_started",
  PHASE_PAUSED: "phase_paused",
  PHASE_COMPLETED: "phase_completed",
  MILESTONE_REACHED: "milestone_reached",
  DECISION_RECORDED: "decision_recorded",
  CALIBRATION_CHECKPOINT: "calibration_checkpoint",
});

export const TemporaryPhaseEndRule = Object.freeze({
  OUTCOME: "outcome",
  TIME: "time",
  FIRST_OF: "first_of",
});

export function createStructuredGuardrail(input = {}) {
  const metric = requiredText(input.metric, "guardrail.metric");
  const lower = optionalNumber(input.lower, "guardrail.lower");
  const upper = optionalNumber(input.upper, "guardrail.upper");
  if (lower == null && upper == null) throw new TypeError("A structured guardrail needs a lower or upper bound.");
  if (lower != null && upper != null && lower > upper) throw new RangeError("Guardrail lower bound exceeds upper bound.");
  const lowerMeaning = oneOf(input.lowerMeaning ?? (lower == null ? GuardrailBoundMeaning.NONE : GuardrailBoundMeaning.UNSAFE), GuardrailBoundMeaning, "guardrail.lowerMeaning");
  const upperMeaning = oneOf(input.upperMeaning ?? (upper == null ? GuardrailBoundMeaning.NONE : GuardrailBoundMeaning.UNSAFE), GuardrailBoundMeaning, "guardrail.upperMeaning");
  const period = oneOf(input.effectivePeriod?.kind ?? GuardrailEffectivePeriod.PERMANENT, GuardrailEffectivePeriod, "guardrail.effectivePeriod.kind");
  const effectivePeriod = { kind: period };
  if (period === GuardrailEffectivePeriod.UNTIL_DATE) effectivePeriod.until = requiredDate(input.effectivePeriod?.until, "guardrail.effectivePeriod.until");
  if (period === GuardrailEffectivePeriod.PHASE) effectivePeriod.phaseId = requiredText(input.effectivePeriod?.phaseId, "guardrail.effectivePeriod.phaseId");
  if (period === GuardrailEffectivePeriod.CONDITION) effectivePeriod.condition = requiredText(input.effectivePeriod?.condition, "guardrail.effectivePeriod.condition");
  return deepFreeze({
    contractVersion: GOAL_ADAPTATION_CONTRACT_VERSION,
    guardrailId: requiredText(input.guardrailId, "guardrail.guardrailId"),
    metric,
    unit: input.unit ?? null,
    lower,
    upper,
    lowerMeaning,
    upperMeaning,
    approximate: input.approximate === true,
    effectivePeriod,
    source: input.source ?? "structured",
  });
}

export function createAdaptationRecommendationDraft(input = {}) {
  const options = Array.isArray(input.options) ? input.options : [];
  if (!options.length) throw new TypeError("An adaptation recommendation needs at least one option.");
  const ranked = options.map((option, index) => ({
    kind: oneOf(option.kind, AdaptationOptionKind, `options[${index}].kind`),
    rank: positiveInteger(option.rank ?? index + 1, `options[${index}].rank`),
    recommended: option.recommended === true,
    valid: option.valid !== false,
    validation: Array.isArray(option.validation) ? option.validation : [],
    timing: option.timing ?? null,
  }));
  if (ranked.filter((item) => item.recommended).length > 1) throw new RangeError("At most one option may be recommended.");
  if (ranked.some((item) => item.recommended && !item.valid)) throw new RangeError("An invalid option cannot be recommended.");
  const body = {
    contractVersion: GOAL_ADAPTATION_CONTRACT_VERSION,
    goalId: requiredText(input.goalId, "goalId"),
    phaseId: requiredText(input.phaseId, "phaseId"),
    policyVersion: requiredText(input.policyVersion, "policyVersion"),
    rung: requiredText(input.rung, "rung"),
    triggeringArtifactId: requiredText(input.triggeringArtifactId, "triggeringArtifactId"),
    triggeringFamily: requiredText(input.triggeringFamily, "triggeringFamily"),
    evidenceFingerprint: requiredText(input.evidenceFingerprint, "evidenceFingerprint"),
    options: ranked,
    lifecycle: oneOf(input.lifecycle ?? AdaptationRecommendationLifecycle.OPEN, AdaptationRecommendationLifecycle, "lifecycle"),
    supersededBy: input.supersededBy ?? null,
    automaticApplicationAllowed: false,
  };
  return deepFreeze({ ...body, recommendationId: `goal_adaptation_recommendation|${fingerprint(body).slice(0, 24)}` });
}

export function createGoalContractRevisionDraft(input = {}) {
  const fromVersion = positiveInteger(input.fromVersion, "fromVersion");
  const body = {
    contractVersion: GOAL_ADAPTATION_CONTRACT_VERSION,
    goalId: requiredText(input.goalId, "goalId"),
    fromVersion,
    toVersion: fromVersion + 1,
    changes: requiredChanges(input.changes),
    decisionId: requiredText(input.decisionId, "decisionId"),
    reason: requiredText(input.reason, "reason"),
    effectiveDate: requiredDate(input.effectiveDate, "effectiveDate"),
    priorVersionRetained: true,
  };
  return deepFreeze({ ...body, revisionId: `goal_contract_revision|${body.goalId}|v${body.toVersion}` });
}

export function createTemporaryPhaseDefinition(input = {}) {
  const endRule = oneOf(input.endRule, TemporaryPhaseEndRule, "endRule");
  const timeLimitDays = endRule === TemporaryPhaseEndRule.OUTCOME ? null : positiveInteger(input.timeLimitDays, "timeLimitDays");
  if (endRule !== TemporaryPhaseEndRule.TIME && !input.outcome) throw new TypeError("An outcome-based end rule needs an outcome.");
  return deepFreeze({
    contractVersion: GOAL_ADAPTATION_CONTRACT_VERSION,
    phaseType: "temporary_leaning",
    name: requiredText(input.name, "name"),
    endRule,
    timeLimitDays,
    outcome: input.outcome ?? null,
    checkInCadence: oneOf(input.checkInCadence ?? "weekly", { weekly: "weekly", biweekly: "biweekly" }, "checkInCadence"),
    onEnd: "user_review_required",
    automaticCompletionAllowed: false,
    automaticResumptionAllowed: false,
  });
}

export function createJourneyEvent(input = {}) {
  return deepFreeze({
    contractVersion: GOAL_ADAPTATION_CONTRACT_VERSION,
    surface: "your_journey",
    type: oneOf(input.type, JourneyEventType, "type"),
    goalId: requiredText(input.goalId, "goalId"),
    phaseId: input.phaseId ?? null,
    occurredOn: requiredDate(input.occurredOn, "occurredOn"),
    referenceId: input.referenceId ?? null,
    summary: requiredText(input.summary, "summary"),
  });
}

function requiredChanges(changes) {
  if (!changes || typeof changes !== "object" || !Object.keys(changes).length) throw new TypeError("A goal-contract revision needs at least one change.");
  return changes;
}
function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
  return value.trim();
}
function requiredDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new TypeError(`${field} must be a YYYY-MM-DD date.`);
  return value;
}
function optionalNumber(value, field) {
  if (value == null) return null;
  if (!Number.isFinite(Number(value))) throw new TypeError(`${field} must be a number.`);
  return Number(value);
}
function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${field} must be a positive integer.`);
  return number;
}
function oneOf(value, values, field) {
  if (!Object.values(values).includes(value)) throw new TypeError(`${field} must be one of ${Object.values(values).join(", ")}.`);
  return value;
}
function fingerprint(value) { return createHash("sha256").update(stable(value)).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
