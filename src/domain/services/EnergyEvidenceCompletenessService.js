export const ENERGY_SOURCE_COMPLETENESS_STATES = Object.freeze([
  "complete",
  "partial",
  "unknown",
  "missing",
]);
export const PAIRED_ENERGY_COMPLETENESS_STATES = Object.freeze([
  "complete",
  "partial",
  "unpaired_nutrition",
  "unpaired_activity",
  "unknown",
  "missing",
]);

export function resolveNutritionEvidenceCompleteness(record) {
  return resolveSource(record, "nutrition");
}

export function resolveActivityEvidenceCompleteness(record) {
  return resolveSource(record, "activity");
}

export function resolvePairedEnergyDayCompleteness(
  nutritionState,
  activityState
) {
  validateSourceState(nutritionState);
  validateSourceState(activityState);
  if (nutritionState === "missing" && activityState === "missing") return "missing";
  if (nutritionState !== "missing" && activityState === "missing") {
    return "unpaired_nutrition";
  }
  if (nutritionState === "missing" && activityState !== "missing") {
    return "unpaired_activity";
  }
  if (nutritionState === "unknown" || activityState === "unknown") return "unknown";
  if (nutritionState === "partial" || activityState === "partial") return "partial";
  return "complete";
}

function resolveSource(record, domain) {
  if (!record) return "missing";
  const payload = record.payload ?? record;
  const candidates = [
    payload.metadata?.completeness,
    payload.completeness,
    domain === "activity"
      ? payload.daily_activity?.completeness
      : payload.daily_totals?.completeness,
    record.quality?.status,
    payload.quality?.status,
    payload.metadata?.coverage,
  ];
  for (const value of candidates) {
    const state = normalize(value);
    if (state) return state;
  }
  return "unknown";
}

function normalize(value) {
  const state = String(value ?? "").trim().toLowerCase().replaceAll(" ", "_");
  if (!state) return null;
  if (["complete", "completed", "full", "daily_totals_available"].includes(state)) {
    return "complete";
  }
  if (["partial", "incomplete", "limited", "some"].includes(state)) {
    return "partial";
  }
  if (["unknown", "unevaluated", "unavailable"].includes(state)) {
    return "unknown";
  }
  if (["missing", "none", "not_recorded"].includes(state)) return "missing";
  return null;
}

function validateSourceState(value) {
  if (!ENERGY_SOURCE_COMPLETENESS_STATES.includes(value)) {
    throw new Error(`Invalid Energy source completeness state: ${value}`);
  }
}
