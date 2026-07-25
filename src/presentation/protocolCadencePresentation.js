export const PHOTO_FREQUENCY_OPTIONS = [
  { id: "weekly", label: "Weekly", interval: 1 },
  { id: "every_two_weeks", label: "Every two weeks", interval: 2 },
  { id: "monthly", label: "Monthly", interval: 1, unit: "month" },
];

export const DEXA_INTERVAL_OPTIONS = [
  { id: "every_four_weeks", label: "Every four weeks", interval: 4 },
  { id: "every_six_weeks", label: "Every six weeks", interval: 6 },
  { id: "every_eight_weeks", label: "Every eight weeks", interval: 8 },
  { id: "every_twelve_weeks", label: "Every twelve weeks", interval: 12 },
];

export const WEEKDAY_OPTIONS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
].map((id) => ({ id, label: titleCase(id) }));

export const DAYPART_OPTIONS = ["morning", "afternoon", "evening"]
  .map((id) => ({ id, label: titleCase(id) }));

export function recommendedCadence(category, context = {}) {
  if (category === "photos") {
    return {
      frequency: "every_two_weeks",
      dayOfWeek: context.preferredPhotoDay ?? null,
      daypart: context.preferredPhotoDaypart ?? "afternoon",
    };
  }
  if (category === "dexa") {
    const calibration = context.calibrationState?.value === "calibration";
    const leanMassGoal = context.acceptedPrimaryGoal?.type === "build_lean_mass";
    return { frequency: calibration && leanMassGoal ? "every_six_weeks" : "every_eight_weeks" };
  }
  return {};
}

export function buildPhotoCadencePayload(selection, context = {}) {
  const option = PHOTO_FREQUENCY_OPTIONS.find((item) => item.id === selection.frequency);
  return {
    recurrence: option ? {
      frequency: option.id,
      interval: option.interval,
      unit: option.unit ?? "week",
      dayOfWeek: selection.dayOfWeek ?? null,
      daypart: selection.daypart ?? null,
    } : null,
    purpose: "visual_body_composition_monitoring",
    comparisonApproach: "comparable_progress_session",
    guardrailRelationship: "monitor_body_fat_while_building_lean_mass",
    evidenceType: "progress_photos",
    goalDraftId: context.pendingGoalDraftId ?? null,
  };
}

export function buildDexaCadencePayload(selection, context = {}) {
  const option = DEXA_INTERVAL_OPTIONS.find((item) => item.id === selection.frequency);
  return {
    recurrence: option ? {
      frequency: option.id,
      interval: option.interval,
      unit: "week",
    } : null,
    measurementRole: "defining_body_composition_outcome",
    measures: ["lean_mass", "fat_mass", "body_fat_percentage"],
    goalRelationship: "measure_lean_mass_progress_and_body_fat_guardrail",
    guardrailRelationship: "monitor_body_fat_while_building_lean_mass",
    evidenceType: "dexa",
    goalDraftId: context.pendingGoalDraftId ?? null,
  };
}

export function validatePhotoCadencePayload(payload = {}) {
  const recurrence = payload.recurrence;
  const supported = PHOTO_FREQUENCY_OPTIONS.some((item) => item.id === recurrence?.frequency);
  const daySupported = WEEKDAY_OPTIONS.some((item) => item.id === recurrence?.dayOfWeek);
  const daypartSupported = DAYPART_OPTIONS.some((item) => item.id === recurrence?.daypart);
  const contextValid = payload.purpose === "visual_body_composition_monitoring"
    && payload.comparisonApproach === "comparable_progress_session"
    && payload.guardrailRelationship === "monitor_body_fat_while_building_lean_mass"
    && Boolean(payload.goalDraftId);
  return {
    valid: supported && daySupported && daypartSupported && contextValid,
    message: "Choose how often, which day, and when you want to take progress photos.",
  };
}

export function validateDexaCadencePayload(payload = {}) {
  const recurrence = payload.recurrence;
  const supported = DEXA_INTERVAL_OPTIONS.some((item) => item.id === recurrence?.frequency);
  const measures = new Set(payload.measures ?? []);
  const contextValid = ["lean_mass", "fat_mass", "body_fat_percentage"].every((item) => measures.has(item))
    && payload.measurementRole === "defining_body_composition_outcome"
    && payload.guardrailRelationship === "monitor_body_fat_while_building_lean_mass"
    && Boolean(payload.goalDraftId);
  return {
    valid: supported && contextValid,
    message: "Choose how often you want to use DEXA to check body composition.",
  };
}

export function cadenceSummary(payload = {}) {
  const recurrence = payload.recurrence;
  if (!recurrence) return "";
  const option = [...PHOTO_FREQUENCY_OPTIONS, ...DEXA_INTERVAL_OPTIONS]
    .find((item) => item.id === recurrence.frequency);
  if (!option) return "";
  const parts = [option.label];
  if (recurrence.dayOfWeek) parts.push(`on ${titleCase(recurrence.dayOfWeek)}`);
  if (recurrence.daypart) parts.push(recurrence.daypart);
  return parts.join(" ");
}

function titleCase(value) {
  return `${value}`.charAt(0).toUpperCase() + `${value}`.slice(1);
}
