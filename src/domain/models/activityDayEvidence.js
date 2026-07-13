export const ACTIVITY_DAY_SCHEMA_VERSION = "activity-day-v1";

const DEFAULT_DAILY_ACTIVITY = {
  move_calories: null,
  move_goal: null,
  exercise_minutes: null,
  exercise_goal: null,
  stand_hours: null,
  stand_goal: null,
  total_calories_burned: null,
  ring_completion: {
    move: null,
    exercise: null,
    stand: null,
  },
};

const DEFAULT_DERIVED_METRICS = {
  workout_active_calories: 0,
  non_workout_active_calories: null,
  training_sessions_referenced: 0,
};

export function createActivityDayEvidenceObject({
  capturedAt = null,
  confidence = { extraction: "moderate", interpretation: "moderate" },
  dailyActivity = {},
  date = null,
  derivedMetrics = {},
  id,
  metadata = {},
  provenance = {},
  quality = { status: "partial", limitations: [] },
  references = {},
  source = {},
}) {
  const sourceArtifactRefs =
    provenance.source_artifact_refs ?? source.source_artifact_refs ?? [];

  return {
    id,
    evidence_type: "activity_day",
    observed_at: date,
    captured_at: capturedAt,
    source: {
      modality: source.modality ?? "manual",
      application: source.application ?? null,
      integration: source.integration ?? null,
      source_artifact_refs: sourceArtifactRefs,
    },
    metadata: {
      date,
      source: source.application ?? source.modality ?? "manual",
      confidence: metadata.confidence ?? confidence.interpretation ?? "moderate",
      provenance: sourceArtifactRefs,
    },
    daily_activity: normalizeDailyActivity(dailyActivity),
    derived_metrics: {
      ...DEFAULT_DERIVED_METRICS,
      ...withoutEmptyValues(derivedMetrics),
    },
    references: {
      training_session_ids: references.training_session_ids ?? [],
    },
    confidence,
    quality,
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
  };
}

function normalizeDailyActivity(dailyActivity = {}) {
  return {
    ...DEFAULT_DAILY_ACTIVITY,
    ...withoutEmptyValues(dailyActivity),
    ring_completion: {
      ...DEFAULT_DAILY_ACTIVITY.ring_completion,
      ...withoutEmptyValues(dailyActivity.ring_completion ?? {}),
    },
  };
}

function withoutEmptyValues(object) {
  return Object.fromEntries(
    Object.entries(object ?? {}).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}
