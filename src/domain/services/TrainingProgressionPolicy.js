export const FOUNDER_MINIMUM_TRAINING_EXPOSURE_DAYS = 14;

export const TRAINING_PROGRESSION_POLICY_VERSION = "training_progression_policy_v3";
export const TRAINING_PROGRESSION_PRESCRIPTION_SCHEMA_VERSION =
  "training_double_progression_prescription_v1";

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
  if (successfulSessionsRequired < 2) {
    return unsupported("successful_sessions_below_founder_floor", {
      configuredRule: configuredRuleSummary(rule),
    });
  }

  const configuredMinimumExposureDays = rule.minimumExposureDays ?? progression.minimumExposureDays;
  const minimumExposureDays = configuredMinimumExposureDays == null
    ? FOUNDER_MINIMUM_TRAINING_EXPOSURE_DAYS
    : nonNegativeInteger(configuredMinimumExposureDays);
  if (minimumExposureDays === null) {
    return unsupported("invalid_minimum_exposure_days", {
      configuredRule: configuredRuleSummary(rule),
    });
  }
  if (minimumExposureDays < FOUNDER_MINIMUM_TRAINING_EXPOSURE_DAYS) {
    return unsupported("minimum_exposure_below_founder_floor", {
      configuredRule: configuredRuleSummary(rule),
    });
  }

  const prescription = resolvePrescriptionAuthority({
    defaultRule,
    override,
    overrideRule,
    progression,
    trainingStrategy,
  });
  if (prescription.invalidReason) {
    return unsupported(prescription.invalidReason, {
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
    qualificationMode: prescription.stepSelectionExecutable
      ? "prescribed_double_progression_step"
      : "stable_completed_set_profile_transitional",
    repRange: prescription.repRange ? Object.freeze(prescription.repRange) : null,
    workingSetsRequired: prescription.workingSetsRequired,
    repIncrement: prescription.repIncrement,
    loadResetRepTarget: prescription.loadResetRepTarget,
    stepSelectionExecutable: prescription.stepSelectionExecutable,
    stepSelectionReasonCode: prescription.stepSelectionReasonCode,
    prescriptionAuthority: Object.freeze(prescription.authority),
    prescriptionContext: Object.freeze(prescription.context),
    limitation: prescription.stepSelectionExecutable
      ? null
      : "The active Training Strategy does not provide a complete executable rep-range prescription; eligibility may mature, but deterministic rep/load selection is unavailable.",
  });
}

function resolvePrescriptionAuthority({ defaultRule, override, overrideRule, progression, trainingStrategy }) {
  const candidates = prescriptionCandidates({ defaultRule, override, overrideRule, progression });
  const repRangeField = firstConfigured(candidates, "repRange");
  const workingSetsField = firstConfigured(candidates, "workingSetsRequired");
  const repIncrementField = firstConfigured(candidates, "repIncrement");
  const resetField = firstConfigured(candidates, "loadResetRepTarget");
  const prescriptionIdField = firstConfigured(candidates, "prescriptionId");

  const repRange = resolveRepRange(repRangeField.value);
  if (repRange?.invalid) return { invalidReason: "invalid_progression_rep_range" };
  const workingSetsRequired = optionalPositiveInteger(workingSetsField.value);
  if (workingSetsRequired?.invalid) return { invalidReason: "invalid_working_sets_required" };
  const repIncrement = optionalPositiveInteger(repIncrementField.value);
  if (repIncrement?.invalid) return { invalidReason: "invalid_progression_rep_increment" };
  const configuredReset = optionalPositiveInteger(resetField.value);
  if (configuredReset?.invalid) return { invalidReason: "invalid_load_reset_rep_target" };
  if (configuredReset?.value != null && repRange &&
    (configuredReset.value < repRange.minimum || configuredReset.value > repRange.maximum)) {
    return { invalidReason: "load_reset_rep_target_outside_rep_range" };
  }

  const stepSelectionExecutable = Boolean(
    repRange?.minimum && repRange?.maximum && workingSetsRequired?.value && repIncrement?.value
  );
  const stepSelectionReasonCode = stepSelectionExecutable
    ? null
    : !repRange?.minimum || !repRange?.maximum
      ? "rep_range_authority_unavailable"
      : !workingSetsRequired?.value
        ? "working_set_authority_unavailable"
        : "rep_increment_authority_unavailable";
  const loadResetRepTarget = stepSelectionExecutable
    ? configuredReset?.value ?? repRange.minimum
    : null;
  const versionAuthority = trainingStrategy?.progressionAuthority ?? {};

  return {
    repRange,
    workingSetsRequired: workingSetsRequired?.value ?? null,
    repIncrement: repIncrement?.value ?? null,
    loadResetRepTarget,
    stepSelectionExecutable,
    stepSelectionReasonCode,
    authority: {
      repRange: repRangeField.path,
      workingSetsRequired: workingSetsField.path,
      repIncrement: repIncrementField.path,
      loadResetRepTarget: configuredReset?.value != null
        ? resetField.path
        : stepSelectionExecutable
          ? `${repRangeField.path}.minimum`
          : null,
    },
    context: {
      prescriptionId: stringOrNull(prescriptionIdField.value),
      protocolVersionId: stringOrNull(versionAuthority.protocolVersionId),
      effectiveDate: dateKeyOrNull(versionAuthority.effectiveAt),
    },
  };
}

function prescriptionCandidates({ defaultRule, override, overrideRule, progression }) {
  const result = [];
  const add = (value, path) => {
    if (!value || typeof value !== "object") return;
    result.push({ value, path });
    if (value.prescription && typeof value.prescription === "object") {
      result.push({ value: value.prescription, path: `${path}.prescription` });
    }
  };
  add(progression, "trainingStrategy.progression");
  add(defaultRule, "trainingStrategy.progression.defaultRule");
  add(override, "trainingStrategy.progression.exerciseOverrides[]");
  if (overrideRule && overrideRule !== override) {
    add(overrideRule, "trainingStrategy.progression.exerciseOverrides[].rule");
  }
  return result.reverse();
}

function firstConfigured(candidates, field) {
  for (const candidate of candidates) {
    if (candidate.value[field] !== undefined && candidate.value[field] !== null) {
      return { value: candidate.value[field], path: `${candidate.path}.${field}` };
    }
  }
  return { value: null, path: null };
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
  if (minimum === null || maximum === null || minimum > maximum) return { invalid: true };
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

function stringOrNull(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function dateKeyOrNull(value) {
  const result = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}
