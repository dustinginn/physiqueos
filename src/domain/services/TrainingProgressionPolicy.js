export const FOUNDER_MINIMUM_TRAINING_EXPOSURE_DAYS = 14;

export const TRAINING_PROGRESSION_POLICY_VERSION = "training_progression_policy_v2";

export const SUPPORTED_TRAINING_PROGRESSION_RULE = Object.freeze({
  type: "double_progression_confirmed_sessions",
  condition: "reach_top_of_rep_range",
  action: "increase_load",
});

export function createDefaultTrainingProgressionRule() {
  return {
    ...SUPPORTED_TRAINING_PROGRESSION_RULE,
    successfulSessionsRequired: 2,
    minimumExposureDays: FOUNDER_MINIMUM_TRAINING_EXPOSURE_DAYS,
  };
}

export function resolveExecutableTrainingProgressionPolicy({
  canonicalExerciseId,
  trainingStrategy,
} = {}) {
  const progression = trainingStrategy?.progression;
  if (!progression || typeof progression !== "object") {
    return unsupported("training_strategy_progression_unavailable");
  }

  const matchingOverrides = (progression.exerciseOverrides ?? []).filter((candidate) =>
    [candidate?.canonicalExerciseId, candidate?.exerciseId].includes(canonicalExerciseId)
  );
  if (matchingOverrides.length > 1) {
    return unsupported("ambiguous_exercise_progression_override");
  }

  const override = matchingOverrides[0] ?? null;
  const overrideRule = override?.rule ?? override?.defaultRule ??
    (override?.type || override?.condition || override?.action ? override : null);
  const defaultRule = progression.defaultRule;
  if (!defaultRule || typeof defaultRule !== "object") {
    return unsupported("training_progression_default_rule_unavailable");
  }
  const rule = overrideRule ? { ...defaultRule, ...overrideRule } : defaultRule;

  for (const field of ["type", "condition", "action"]) {
    if (rule[field] !== SUPPORTED_TRAINING_PROGRESSION_RULE[field]) {
      return unsupported(`unsupported_progression_${field}`, {
        configuredRule: configuredRuleSummary(rule),
      });
    }
  }

  const successfulSessionsRequired = positiveInteger(rule.successfulSessionsRequired);
  if (successfulSessionsRequired === null) {
    return unsupported("invalid_successful_sessions_required", {
      configuredRule: configuredRuleSummary(rule),
    });
  }

  const configuredMinimumExposureDays = rule.minimumExposureDays ??
    progression.minimumExposureDays;
  const minimumExposureDays = configuredMinimumExposureDays == null
    ? FOUNDER_MINIMUM_TRAINING_EXPOSURE_DAYS
    : nonNegativeInteger(configuredMinimumExposureDays);
  if (minimumExposureDays === null) {
    return unsupported("invalid_minimum_exposure_days", {
      configuredRule: configuredRuleSummary(rule),
    });
  }

  const repRange = resolveRepRange(rule.repRange ?? override?.repRange ?? progression.repRange);
  if (repRange?.invalid) {
    return unsupported("invalid_progression_rep_range", {
      configuredRule: configuredRuleSummary(rule),
    });
  }
  const workingSetsRequired = optionalPositiveInteger(
    rule.workingSetsRequired ?? override?.workingSetsRequired
  );
  if (workingSetsRequired?.invalid) {
    return unsupported("invalid_working_sets_required", {
      configuredRule: configuredRuleSummary(rule),
    });
  }

  return Object.freeze({
    executable: true,
    version: TRAINING_PROGRESSION_POLICY_VERSION,
    source: override ? "active_training_strategy_exercise_override" : "active_training_strategy_default_rule",
    ruleType: rule.type,
    condition: rule.condition,
    action: rule.action,
    successfulSessionsRequired,
    minimumExposureDays,
    minimumExposureSource: configuredMinimumExposureDays == null
      ? "founder_locked_legacy_compatibility_default"
      : "active_training_strategy",
    qualificationMode: repRange
      ? "prescribed_top_of_rep_range"
      : "stable_completed_set_profile_transitional",
    repRange: repRange ? Object.freeze(repRange) : null,
    workingSetsRequired: workingSetsRequired?.value ?? null,
    limitation: repRange
      ? null
      : "Canonical history has no prescribed rep-range maximum; qualification conservatively requires a repeated complete persisted set profile.",
  });
}

function configuredRuleSummary(rule = {}) {
  return Object.freeze({
    type: rule.type ?? null,
    condition: rule.condition ?? null,
    action: rule.action ?? null,
    successfulSessionsRequired: rule.successfulSessionsRequired ?? null,
    minimumExposureDays: rule.minimumExposureDays ?? null,
  });
}

function resolveRepRange(candidate) {
  if (candidate == null) return null;
  if (typeof candidate !== "object") return { invalid: true };
  const minimum = positiveInteger(candidate.minimum ?? candidate.min ?? candidate.minimumReps);
  const maximum = positiveInteger(candidate.maximum ?? candidate.max ?? candidate.maximumReps ?? candidate.topReps);
  if (maximum === null || (minimum !== null && minimum > maximum)) return { invalid: true };
  return { minimum, maximum };
}

function unsupported(reasonCode, extra = {}) {
  return Object.freeze({
    executable: false,
    version: TRAINING_PROGRESSION_POLICY_VERSION,
    reasonCode,
    ...extra,
  });
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function optionalPositiveInteger(value) {
  if (value == null) return null;
  const parsed = positiveInteger(value);
  return parsed === null ? { invalid: true } : { value: parsed };
}
