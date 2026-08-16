export const GOAL_PROGRESS_CONTEXT_VERSION = "goal_progress_context_v1";

const DEXA_METRICS = Object.freeze({
  lean_mass: { scanField: "leanMass", openingField: "leanMass" },
  dexa_lean_mass: { scanField: "leanMass", openingField: "leanMass" },
  fat_mass: { scanField: "fatMass", openingField: "fatMass" },
  dexa_fat_mass: { scanField: "fatMass", openingField: "fatMass" },
  body_fat: { scanField: "bodyFatPercentage", openingField: "bodyFatPercentage" },
  body_fat_percentage: {
    scanField: "bodyFatPercentage", openingField: "bodyFatPercentage",
  },
  total_mass: { scanField: "totalMass", openingField: "dexaWeight" },
  dexa_weight: { scanField: "totalMass", openingField: "dexaWeight" },
});

export function deriveCanonicalGoalProgress({
  goal,
  canonicalStore = null,
  activePhase = null,
  asOf = null,
} = {}) {
  const target = goal?.target ?? {};
  const metric = machine(target.metric);
  const numeric = ["numeric_change", "numeric_absolute"].includes(target.type);
  if (!numeric || !metric) return unavailable(metric, "goal_is_not_quantitative");
  const direction = ["increase", "decrease"].includes(target.direction)
    ? target.direction : null;
  const unit = target.unit ?? null;
  const targetAmount = number(target.amount);
  const targetValue = number(target.targetValue);
  if (!direction || (target.type === "numeric_change" && targetAmount == null) ||
      (target.type === "numeric_absolute" && targetValue == null)) {
    return unavailable(metric, "numeric_goal_target_incomplete", { direction, unit });
  }

  const cutoff = dateOnly(asOf) ?? dateOnly(goal.timeline?.targetDate) ?? null;
  const baseline = explicitBaseline(goal, metric, unit) ??
    transitionBaseline({ goal, canonicalStore, metric, unit }) ??
    canonicalStartBoundaryBaseline({ goal, canonicalStore, metric, unit });
  const current = explicitCurrent(goal, metric, unit) ??
    latestCanonicalMeasurement({ canonicalStore, metric, unit, cutoff });
  const phaseStart = dateOnly(activePhase?.startedAt ?? activePhase?.startDate);
  const phaseBaseline = phaseStart
    ? latestCanonicalMeasurement({ canonicalStore, metric, unit, cutoff: phaseStart })
    : null;
  if (!baseline || !current) {
    return unavailable(metric, !baseline ? "goal_baseline_unavailable" :
      "current_goal_measurement_unavailable", {
      direction, unit, targetAmount, targetValue, baseline, current,
      phase: phaseContext(activePhase, phaseBaseline, current, direction),
    });
  }

  const cumulativeProgress = directionalChange(
    baseline.value, current.value, direction);
  const requiredProgress = target.type === "numeric_change"
    ? targetAmount : directionalChange(baseline.value, targetValue, direction);
  if (requiredProgress == null || requiredProgress <= 0) {
    return unavailable(metric, "goal_required_progress_invalid", {
      direction, unit, targetAmount, targetValue, baseline, current,
    });
  }
  const remainingGap = Math.max(0, round(requiredProgress - cumulativeProgress));
  return freeze({
    schemaVersion: GOAL_PROGRESS_CONTEXT_VERSION,
    status: "available",
    kind: "quantitative",
    metric,
    direction,
    unit,
    targetType: target.type,
    targetAmount,
    targetValue,
    baseline,
    current,
    cumulativeProgress: round(cumulativeProgress),
    requiredProgress: round(requiredProgress),
    remainingGap,
    progressFraction: round(cumulativeProgress / requiredProgress, 6),
    phase: phaseContext(activePhase, phaseBaseline, current, direction),
    asOf: current.observedOn,
    uncertainty: [],
  });
}

function transitionBaseline({ goal, canonicalStore, metric, unit }) {
  const transitionId = goal?.createdFromTransitionId;
  const transition = (canonicalStore?.goalTransitionDrafts ?? []).find((item) =>
    item.id === transitionId && item.consumed === true && item.superseded !== true);
  const spec = DEXA_METRICS[metric];
  const value = number(transition?.openingBaseline?.[spec?.openingField]);
  const observedOn = dateOnly(transition?.openingBaseline?.date);
  if (!transition || !spec || value == null || !observedOn) return null;
  const matchingScan = (canonicalStore?.dexaScans ?? []).find((item) =>
    dateOnly(item.measuredAt ?? item.date) === observedOn &&
    approximately(number(item[spec.scanField]?.value ?? item[spec.scanField]), value));
  return observation({
    value,
    unit,
    observedOn,
    sourceRef: matchingScan?.id ?? transition.id,
    sourceType: matchingScan ? "canonical_dexa_scan" : "accepted_goal_transition",
    derivation: "accepted_goal_transition_opening_baseline",
  });
}

function canonicalStartBoundaryBaseline({ goal, canonicalStore, metric, unit }) {
  const start = dateOnly(goal?.timeline?.startDate ?? goal?.activatedAt ?? goal?.startDate);
  const spec = DEXA_METRICS[metric];
  if (!start || !canonicalStore || !spec) return null;
  const candidate = [...(canonicalStore.dexaScans ?? [])].filter((item) => {
    const observed = dateOnly(item.measuredAt ?? item.date);
    return observed && observed <= start && daysBetween(observed, start) <= 1 &&
      number(item[spec.scanField]?.value ?? item[spec.scanField]) != null;
  }).sort((left, right) => String(right.measuredAt ?? right.date)
    .localeCompare(String(left.measuredAt ?? left.date)))[0];
  if (!candidate) return null;
  return observation({
    value: number(candidate[spec.scanField]?.value ?? candidate[spec.scanField]),
    unit: candidate[spec.scanField]?.unit ?? unit,
    observedOn: dateOnly(candidate.measuredAt ?? candidate.date),
    sourceRef: candidate.id,
    sourceType: "canonical_dexa_scan",
    derivation: "canonical_measurement_at_goal_start_boundary",
  });
}

function explicitBaseline(goal, metric, unit) {
  const source = goal?.baseline ?? goal?.target?.baseline ?? null;
  const value = number(source?.value ?? goal?.target?.baselineValue);
  const observedOn = dateOnly(source?.observedOn ?? source?.date ??
    goal?.target?.baselineDate);
  if (value == null || !observedOn) return null;
  return observation({ value, unit: source?.unit ?? unit, observedOn,
    sourceRef: source?.evidenceId ?? source?.sourceRef ?? null,
    sourceType: "explicit_goal_baseline", derivation: "explicit_goal_contract" });
}

function explicitCurrent(goal, metric, unit) {
  const source = goal?.currentMeasurement ?? goal?.target?.currentMeasurement ?? null;
  const value = number(source?.value ?? goal?.target?.currentValue);
  const observedOn = dateOnly(source?.observedOn ?? source?.date ??
    goal?.target?.currentDate);
  if (value == null || !observedOn) return null;
  return observation({ value, unit: source?.unit ?? unit, observedOn,
    sourceRef: source?.evidenceId ?? source?.sourceRef ?? null,
    sourceType: "explicit_goal_measurement", derivation: "explicit_goal_contract" });
}

function latestCanonicalMeasurement({ canonicalStore, metric, unit, cutoff }) {
  const spec = DEXA_METRICS[metric];
  if (!canonicalStore || !spec || !cutoff) return null;
  const scan = [...(canonicalStore.dexaScans ?? [])].filter((item) => {
    const observed = dateOnly(item.measuredAt ?? item.date);
    return observed && observed <= cutoff &&
      number(item[spec.scanField]?.value ?? item[spec.scanField]) != null;
  }).sort((left, right) => String(right.measuredAt ?? right.date)
    .localeCompare(String(left.measuredAt ?? left.date)))[0];
  if (!scan) return null;
  return observation({
    value: number(scan[spec.scanField]?.value ?? scan[spec.scanField]),
    unit: scan[spec.scanField]?.unit ?? unit,
    observedOn: dateOnly(scan.measuredAt ?? scan.date),
    sourceRef: scan.id,
    sourceType: "canonical_dexa_scan",
    derivation: "latest_canonical_measurement_at_or_before_cutoff",
  });
}

function phaseContext(activePhase, baseline, current, direction) {
  if (!activePhase?.id) return null;
  const progress = baseline && current
    ? directionalChange(baseline.value, current.value, direction) : null;
  return {
    phaseId: activePhase.id,
    semanticPurpose: machine(activePhase.purpose ?? activePhase.name),
    startedOn: dateOnly(activePhase.startedAt ?? activePhase.startDate),
    baseline,
    cumulativeProgress: progress == null ? null : round(progress),
  };
}

function unavailable(metric, reason, extra = {}) {
  return freeze({
    schemaVersion: GOAL_PROGRESS_CONTEXT_VERSION,
    status: "unavailable",
    kind: "quantitative",
    metric: metric || null,
    direction: extra.direction ?? null,
    unit: extra.unit ?? null,
    targetType: extra.targetType ?? null,
    targetAmount: extra.targetAmount ?? null,
    targetValue: extra.targetValue ?? null,
    baseline: extra.baseline ?? null,
    current: extra.current ?? null,
    cumulativeProgress: null,
    requiredProgress: null,
    remainingGap: null,
    progressFraction: null,
    phase: extra.phase ?? null,
    asOf: extra.current?.observedOn ?? null,
    uncertainty: [reason],
  });
}

function observation(input) {
  return {
    value: round(input.value),
    unit: input.unit ?? null,
    observedOn: input.observedOn,
    sourceRef: input.sourceRef ?? null,
    sourceType: input.sourceType,
    derivation: input.derivation,
  };
}

function directionalChange(baseline, current, direction) {
  if (![baseline, current].every((value) => number(value) != null)) return null;
  return direction === "decrease" ? Number(baseline) - Number(current) :
    Number(current) - Number(baseline);
}

function approximately(left, right) {
  return left != null && right != null && Math.abs(left - right) <= 0.01;
}
function daysBetween(start, end) { const value = Math.round((Date.parse(`${end}T00:00:00Z`) -
  Date.parse(`${start}T00:00:00Z`)) / 86400000); return Number.isFinite(value) ? value : Infinity; }
function dateOnly(value) {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}
function number(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function round(value, digits = 3) { return Number(Number(value).toFixed(digits)); }
function machine(value) { const result = String(value ?? "").normalize("NFKD").toLowerCase()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); return result || null; }
function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze); return Object.freeze(value); }
