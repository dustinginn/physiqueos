const EVENT_TYPE_ORDER = {
  session_volume_pr: 0,
  reps_at_load_pr: 1,
};

export function createTrainingPerformanceSuccessPresentation(review) {
  const trainingObjects = (
    review?.interpretedEvidence?.evidence_objects ?? []
  ).filter(
    (item) =>
      item.removed !== true &&
      item.evidence_type === "training" &&
      (item.exercises ?? []).length > 0
  );
  if (trainingObjects.length === 0) return null;

  const receipt =
    review?.commitProgress?.training_performance_events;
  if (receipt?.status !== "completed") return null;
  if (!["created", "mixed"].includes(receipt.result?.outcome)) return null;
  const suppliedEvents = receipt.result?.newlyCreatedEvents;
  if (!Array.isArray(suppliedEvents) || suppliedEvents.length === 0) return null;

  const exerciseOrder = new Map();
  trainingObjects
    .flatMap((object) => object.exercises ?? [])
    .forEach((exercise, index) => {
      const key = normalizeName(exercise.name);
      if (key && !exerciseOrder.has(key)) exerciseOrder.set(key, index);
    });

  const seen = new Set();
  const items = suppliedEvents
    .map(toPresentationItem)
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.deduplicationKey)) return false;
      seen.add(item.deduplicationKey);
      return true;
    })
    .sort((left, right) => {
      const leftOrder = exerciseOrder.get(normalizeName(left.exerciseName));
      const rightOrder = exerciseOrder.get(normalizeName(right.exerciseName));
      const leftKnown = Number.isInteger(leftOrder);
      const rightKnown = Number.isInteger(rightOrder);
      if (leftKnown && rightKnown && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
      return (
        left.exerciseName.localeCompare(right.exerciseName) ||
        EVENT_TYPE_ORDER[left.eventType] - EVENT_TYPE_ORDER[right.eventType] ||
        left.deduplicationKey.localeCompare(right.deduplicationKey)
      );
    });

  if (items.length === 0) return null;
  return {
    heading: "Workout achievements",
    recordCount: items.length,
    summary: `${items.length} new ${items.length === 1 ? "record" : "records"}`,
    items: items.map(({ deduplicationKey: _deduplicationKey, ...item }) => item),
  };
}

function toPresentationItem(event) {
  const exerciseName = cleanString(event?.canonicalExerciseName);
  if (!exerciseName || !Object.hasOwn(EVENT_TYPE_ORDER, event?.eventType)) {
    return null;
  }
  if (event.eventType === "session_volume_pr") {
    const volume = finitePositive(event.sessionVolume);
    const unit = cleanString(event.unit);
    if (volume === null || !unit) return null;
    const previousBaseline = finitePositive(event.previousBaselineValue);
    const improvement =
      previousBaseline !== null &&
      finitePositive(event.improvement) !== null &&
      volume - previousBaseline === Number(event.improvement)
        ? Number(event.improvement)
        : null;
    return {
      eventType: event.eventType,
      exerciseName,
      detail: [
        `New session-volume record: ${formatNumber(volume)} ${unit}`,
        improvement === null ? null : `up ${formatNumber(improvement)} ${unit}`,
      ].filter(Boolean).join(", ") + ".",
      deduplicationKey: [
        event.eventType,
        normalizeName(exerciseName),
        volume,
        unit.toLowerCase(),
      ].join("|"),
    };
  }

  const reps = finitePositive(event.reps);
  const load = finiteNonNegative(event.load);
  const loadUnit = cleanString(event.loadUnit);
  if (reps === null || load === null || !loadUnit) return null;
  const previousReps = finitePositive(event.previousBaselineValue);
  return {
    eventType: event.eventType,
    exerciseName,
    detail:
      `New reps-at-load record: ${formatNumber(reps)} ${reps === 1 ? "rep" : "reps"} at ${formatNumber(load)} ${loadUnit}.` +
      (previousReps === null
        ? ""
        : ` Previous best at this load: ${formatNumber(previousReps)} ${previousReps === 1 ? "rep" : "reps"}.`),
    deduplicationKey: [
      event.eventType,
      normalizeName(exerciseName),
      load,
      loadUnit.toLowerCase(),
      reps,
    ].join("|"),
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
