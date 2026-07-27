import { createHash } from "node:crypto";

export const TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION =
  "training_performance_event_v1";
export const TRAINING_PERFORMANCE_EVENT_CATEGORY = "training_performance";
export const TRAINING_PERFORMANCE_EVENT_TYPES = Object.freeze({
  REPS_AT_LOAD_PR: "reps_at_load_pr",
  SESSION_VOLUME_PR: "session_volume_pr",
});

export function createTrainingPerformanceEvent({
  eventType,
  sourceReviewId,
  sourceEvidencePackageId,
  sourceCanonicalTrainingId,
  sourceSessionId,
  sourceAnalysisId,
  workoutDate,
  canonicalExerciseId,
  canonicalExerciseName,
  currentValue,
  previousBaselineValue,
  load = null,
  loadUnit = null,
  reps = null,
  sessionVolume = null,
  unit,
  createdAt,
} = {}) {
  const identity = getTrainingPerformanceEventIdentity({
    canonicalExerciseId,
    currentValue,
    eventType,
    load,
    loadUnit,
    reps,
    sourceCanonicalTrainingId,
    sourceSessionId,
  });
  const event = {
    id: `training_performance_event_${hash(identity).slice(0, 32)}`,
    schemaVersion: TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION,
    category: TRAINING_PERFORMANCE_EVENT_CATEGORY,
    eventType,
    sourceReviewId,
    sourceEvidencePackageId,
    sourceCanonicalTrainingId,
    sourceSessionId,
    sourceAnalysisId,
    workoutDate,
    canonicalExerciseId,
    canonicalExerciseName,
    currentValue,
    previousBaselineValue,
    improvement: currentValue - previousBaselineValue,
    unit,
    load,
    loadUnit,
    reps,
    sessionVolume,
    createdAt,
  };
  assertValidTrainingPerformanceEvent(event);
  return Object.freeze(event);
}

export function getTrainingPerformanceEventIdentity({
  canonicalExerciseId,
  currentValue,
  eventType,
  load,
  loadUnit,
  reps,
  sourceCanonicalTrainingId,
  sourceSessionId,
} = {}) {
  if (eventType === TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR) {
    return [
      TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION,
      sourceCanonicalTrainingId,
      sourceSessionId,
      canonicalExerciseId,
      eventType,
      currentValue,
    ].join("|");
  }
  if (eventType === TRAINING_PERFORMANCE_EVENT_TYPES.REPS_AT_LOAD_PR) {
    return [
      TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION,
      sourceCanonicalTrainingId,
      sourceSessionId,
      canonicalExerciseId,
      eventType,
      load,
      loadUnit,
      reps,
    ].join("|");
  }
  throw new Error(`Unsupported Training performance event type: ${eventType}`);
}

export function assertValidTrainingPerformanceEvent(event) {
  const requiredStrings = [
    "id",
    "sourceReviewId",
    "sourceEvidencePackageId",
    "sourceCanonicalTrainingId",
    "sourceSessionId",
    "sourceAnalysisId",
    "workoutDate",
    "canonicalExerciseId",
    "canonicalExerciseName",
    "unit",
    "createdAt",
  ];
  if (
    event?.schemaVersion !== TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION ||
    event?.category !== TRAINING_PERFORMANCE_EVENT_CATEGORY ||
    !Object.values(TRAINING_PERFORMANCE_EVENT_TYPES).includes(event?.eventType) ||
    requiredStrings.some((key) => !String(event?.[key] ?? "").trim()) ||
    !Number.isFinite(event?.currentValue) ||
    !Number.isFinite(event?.previousBaselineValue) ||
    event.currentValue <= event.previousBaselineValue ||
    event.improvement !== event.currentValue - event.previousBaselineValue
  ) {
    throw new Error("Training performance event is invalid.");
  }
  if (
    event.eventType === TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR &&
    (!Number.isFinite(event.sessionVolume) ||
      event.sessionVolume !== event.currentValue ||
      event.load !== null ||
      event.reps !== null)
  ) {
    throw new Error("Training session-volume event is invalid.");
  }
  if (
    event.eventType === TRAINING_PERFORMANCE_EVENT_TYPES.REPS_AT_LOAD_PR &&
    (!Number.isFinite(event.load) ||
      !Number.isFinite(event.reps) ||
      event.reps !== event.currentValue ||
      !event.loadUnit ||
      event.sessionVolume !== null)
  ) {
    throw new Error("Training reps-at-load event is invalid.");
  }
  const expectedId = `training_performance_event_${hash(
    getTrainingPerformanceEventIdentity(event)
  ).slice(0, 32)}`;
  if (event.id !== expectedId) {
    throw new Error("Training performance event identity is invalid.");
  }
  return true;
}

export function haveSameTrainingPerformanceEventSemantics(left, right) {
  return stableStringify(withoutCreatedAt(left)) === stableStringify(withoutCreatedAt(right));
}

function withoutCreatedAt({ createdAt: _createdAt, ...event } = {}) {
  return event;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
