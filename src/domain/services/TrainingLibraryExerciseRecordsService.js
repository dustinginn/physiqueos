import {
  TRAINING_PERFORMANCE_EVENT_CATEGORY,
  TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION,
  TRAINING_PERFORMANCE_EVENT_TYPES,
} from "../models/trainingPerformanceEvent";
import { normalizeTrainingExecutionVariant } from "../models/trainingExecutionVariant";

export const TRAINING_LIBRARY_RECORD_LIMIT = 5;
const TYPE_ORDER = {
  [TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR]: 0,
  [TRAINING_PERFORMANCE_EVENT_TYPES.REPS_AT_LOAD_PR]: 1,
};

export function createTrainingLibraryExerciseRecordsReadModel({
  canonicalExerciseId,
  events = [],
  visibleLimit = TRAINING_LIBRARY_RECORD_LIMIT,
} = {}) {
  const selectedId = cleanString(canonicalExerciseId);
  if (!selectedId || !Number.isSafeInteger(visibleLimit) || visibleLimit < 1) {
    return null;
  }

  const byId = new Map();
  for (const event of events) {
    if (byId.has(event?.id)) continue;
    const item = toItem(event, selectedId);
    if (item) byId.set(event.id, item);
  }
  const records = [...byId.values()].sort(compareRecords);
  if (records.length === 0) return null;

  const visibleRecords = records.slice(0, visibleLimit);
  return {
    id: `training_library_records_${selectedId}`,
    heading: "Performance Records",
    canonicalExerciseId: selectedId,
    canonicalExerciseName: visibleRecords[0].canonicalExerciseName,
    records: visibleRecords,
    visibleCount: visibleRecords.length,
    totalCount: records.length,
    hiddenCount: records.length - visibleRecords.length,
    countLabel: records.length > visibleRecords.length
      ? `Showing ${visibleRecords.length} of ${records.length} records`
      : null,
  };
}

function toItem(event, selectedId) {
  if (
    event?.schemaVersion !== TRAINING_PERFORMANCE_EVENT_SCHEMA_VERSION ||
    event?.category !== TRAINING_PERFORMANCE_EVENT_CATEGORY ||
    !Object.hasOwn(TYPE_ORDER, event?.eventType) ||
    !cleanString(event?.id) ||
    event?.canonicalExerciseId !== selectedId ||
    !cleanString(event?.canonicalExerciseName) ||
    !isDateKey(event?.workoutDate)
  ) {
    return null;
  }

  const executionVariant = normalizeTrainingExecutionVariant(event.executionVariant);
  const common = {
    id: `training_library_record_${event.id}`,
    sourceEventId: event.id,
    canonicalExerciseId: selectedId,
    canonicalExerciseName: event.canonicalExerciseName.trim(),
    achievementType: event.eventType,
    workoutDate: event.workoutDate,
    ...(executionVariant ? { executionVariant } : {}),
    ...(event.relationshipContext
      ? { relationshipContext: structuredClone(event.relationshipContext) }
      : {}),
  };

  if (event.eventType === TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR) {
    const volume = positiveNumber(event.sessionVolume);
    const unit = cleanString(event.unit);
    if (volume === null || !unit) return null;
    const previous = positiveNumber(event.previousBaselineValue);
    const improvement = positiveNumber(event.improvement);
    const validImprovement =
      previous !== null &&
      improvement !== null &&
      volume - previous === improvement;
    return {
      ...common,
      title: "Session volume record",
      value: `${formatNumber(volume)} ${unit}`,
      previousBaseline: previous === null
        ? null
        : `Previous: ${formatNumber(previous)} ${unit}`,
      improvement: validImprovement
        ? `Improved by ${formatNumber(improvement)} ${unit}`
        : null,
      detail: [
        previous === null ? null : `Previous: ${formatNumber(previous)} ${unit}`,
        validImprovement ? `Improved by ${formatNumber(improvement)} ${unit}` : null,
      ].filter(Boolean).join(" · ") || null,
      achievedValue: volume,
      orderingKey: `${event.workoutDate}|0|${padNumber(volume)}|${event.id}`,
    };
  }

  const reps = positiveNumber(event.reps);
  const load = nonNegativeNumber(event.load);
  const loadUnit = cleanString(event.loadUnit);
  if (reps === null || load === null || !loadUnit) return null;
  const previous = positiveNumber(event.previousBaselineValue);
  return {
    ...common,
    title: "Reps-at-load record",
    value: `${formatNumber(reps)} reps at ${formatNumber(load)} ${loadUnit}`,
    previousBaseline: previous === null
      ? null
      : `Previous: ${formatNumber(previous)} reps at this load`,
    improvement: null,
    detail: previous === null
      ? null
      : `Previous: ${formatNumber(previous)} reps at this load`,
    achievedValue: reps,
    orderingKey: `${event.workoutDate}|1|${padNumber(reps)}|${event.id}`,
  };
}

function compareRecords(left, right) {
  return (
    right.workoutDate.localeCompare(left.workoutDate) ||
    TYPE_ORDER[left.achievementType] - TYPE_ORDER[right.achievementType] ||
    right.achievedValue - left.achievedValue ||
    left.sourceEventId.localeCompare(right.sourceEventId)
  );
}

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function padNumber(value) {
  return String(Math.max(0, 999999999999 - value)).padStart(12, "0");
}
