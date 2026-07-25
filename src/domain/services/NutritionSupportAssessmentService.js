export const NUTRITION_SUPPORT_ASSESSMENT_VERSION = "nutrition_support_assessment_v1";

export function createNutritionSupportAssessment({
  nutritionDays = [],
  target = null,
  window,
  cadence = "weekly",
} = {}) {
  const before = structuredClone({ nutritionDays, target, window, cadence });
  const normalizedWindow = normalizeWindow(window);
  const dates = dateRange(normalizedWindow);
  const days = nutritionDays.map(unwrap).filter((day) => {
    const date = dateKey(day);
    return date >= normalizedWindow.startDate && date <= normalizedWindow.endDate;
  }).sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  const normalizedTarget = normalizeTarget(target);
  const eligible = days.filter((day) => Number.isFinite(protein(day)));
  const complete = eligible.filter(isComplete);
  const partial = eligible.filter((day) => !isComplete(day));
  const met = normalizedTarget
    ? eligible.filter((day) => protein(day) >= normalizedTarget.value)
    : [];
  const missed = normalizedTarget
    ? eligible.filter((day) => protein(day) < normalizedTarget.value)
    : [];
  const completeness = completenessState({
    expected: dates.length,
    observed: days.length,
    eligible: eligible.length,
    complete: complete.length,
    partial: partial.length,
  });
  const consistency = proteinConsistency({
    cadence,
    eligibleCount: eligible.length,
    metCount: met.length,
    targetAvailable: Boolean(normalizedTarget),
  });
  const limitations = [
    !normalizedTarget ? "protein_target_unavailable" : null,
    normalizedTarget && !normalizedTarget.effectiveDate
      ? "historical_protein_target_provenance_unavailable"
      : null,
    partial.length ? "partial_nutrition_days_present" : null,
    days.length < dates.length ? "nutrition_days_missing_from_window" : null,
    eligible.length < days.length ? "some_nutrition_days_lack_protein_total" : null,
  ].filter(Boolean).sort();
  const result = Object.freeze({
    id: `nutrition_support|protein|${cadence}`,
    schemaVersion: NUTRITION_SUPPORT_ASSESSMENT_VERSION,
    cadence,
    window: normalizedWindow,
    target: normalizedTarget,
    completeness,
    proteinConsistency: consistency,
    expectedDayCount: dates.length,
    observedDayCount: days.length,
    eligibleDayCount: eligible.length,
    completeDayCount: complete.length,
    partialDayCount: partial.length,
    missingDayCount: Math.max(0, dates.length - days.length),
    proteinTargetMetDayCount: met.length,
    proteinTargetMissedDayCount: missed.length,
    supportingEvidenceIds: unique(days.map((day) => day.id ?? day.canonicalId)),
    confidence: nutritionConfidence(completeness, consistency, limitations),
    limitations,
    provenance: {
      producer: "nutrition_support_assessment_service",
      producerVersion: NUTRITION_SUPPORT_ASSESSMENT_VERSION,
      calculationMethod: "canonical_daily_protein_target_consistency",
      sourceEvidenceIds: unique(days.map((day) => day.id ?? day.canonicalId)),
      targetSourceId: normalizedTarget?.sourceId ?? null,
      targetVersion: normalizedTarget?.version ?? null,
      targetEffectiveDate: normalizedTarget?.effectiveDate ?? null,
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
  });
  if (JSON.stringify({ nutritionDays, target, window, cadence }) !== JSON.stringify(before)) {
    throw new Error("Nutrition support assessment input mutation detected.");
  }
  return result;
}

function proteinConsistency({ cadence, eligibleCount, metCount, targetAvailable }) {
  if (!targetAvailable) return "unknown";
  const minimum = cadence === "daily" ? 1 : 2;
  if (eligibleCount < minimum) return "insufficient";
  const ratio = metCount / eligibleCount;
  if (ratio === 1) return "consistently_met";
  if (ratio >= 0.75) return "mostly_met";
  if (ratio === 0) return "consistently_missed";
  return "inconsistently_met";
}
function completenessState({ expected, observed, eligible, complete, partial }) {
  if (observed === 0) return "missing";
  if (eligible === 0) return "unknown";
  if (complete === expected && partial === 0) return "complete";
  if (complete > 0 || partial > 0) return "partial";
  return "insufficient";
}
function nutritionConfidence(completeness, consistency, limitations) {
  const level = completeness === "complete" && !["unknown", "insufficient"].includes(consistency)
    ? "moderate"
    : completeness === "missing" ? "unevaluated" : "low";
  return { level, reasons: ["canonical_nutrition_totals", "explicit_protein_target"], limitations, method: "nutrition_completeness_and_target_provenance" };
}
function normalizeTarget(value) {
  const amount = Number(value?.value ?? value?.target ?? value?.grams);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(value?.unit ?? "g").toLowerCase();
  if (!["g", "gram", "grams"].includes(unit)) throw new Error("Protein target must use grams.");
  return {
    value: amount,
    unit: "g",
    sourceId: value.sourceId ?? null,
    version: value.version ?? null,
    effectiveDate: value.effectiveDate ?? null,
    basis: value.basis ?? null,
  };
}
function unwrap(value) { return value?.payload ? { ...value.payload, id: value.canonicalId ?? value.payload.id } : value; }
function dateKey(day) { return String(day.date ?? day.observed_at ?? day.observedAt ?? "").slice(0, 10); }
function protein(day) { return Number(day.daily_totals?.protein_g ?? day.totals?.protein_g ?? day.macros?.protein); }
function isComplete(day) { return day.quality?.status !== "incomplete" && day.metadata?.completeness !== "partial" && day.metadata?.completeness !== "incomplete"; }
function normalizeWindow(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value?.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(value?.endDate)) throw new Error("Nutrition window requires YYYY-MM-DD startDate and endDate.");
  return { startDate: value.startDate, endDate: value.endDate };
}
function dateRange(window) {
  const values = [];
  for (let date = window.startDate; date <= window.endDate;) {
    values.push(date);
    const current = new Date(`${date}T12:00:00Z`);
    current.setUTCDate(current.getUTCDate() + 1);
    date = current.toISOString().slice(0, 10);
  }
  return values;
}
function unique(values) { return [...new Set(values.filter(Boolean).map(String))].sort(); }
