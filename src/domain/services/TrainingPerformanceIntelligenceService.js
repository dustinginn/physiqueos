import {
  TRAINING_NAVIGATION_CATEGORIES,
  withPrimaryTrainingNavigationCategory,
} from "../../navigation/trainingNavigationMapping";
import {
  getCanonicalTrainingExerciseLabel,
  getCanonicalTrainingExerciseSlug,
} from "../models/trainingExerciseIdentity";
import { isActiveCanonicalEvidenceObject } from "./CanonicalReadModel";

const OBSERVATION_TYPE = "training_performance";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function createTrainingPerformanceIntelligenceReport({
  canonicalObjects = [],
  generatedAt = null,
  now = new Date(),
  trainingSessions = [],
} = {}) {
  const generatedAtValue = generatedAt ?? toIsoString(now);
  const nowDateKey = getDateKey(now) ?? getDateKey(generatedAtValue);
  const sessions = getActiveResistanceTrainingSessions([
    ...trainingSessions,
    ...canonicalObjects,
  ]);
  const exerciseEntries = getExercisePerformanceEntries(sessions);
  const exerciseGroups = groupBy(exerciseEntries, (entry) => entry.exerciseKey);
  const exerciseObservations = [...exerciseGroups.entries()]
    .map(([exerciseKey, entries]) =>
      createExercisePerformanceObservation({ entries, exerciseKey, nowDateKey })
    )
    .sort((left, right) => left.exercise.name.localeCompare(right.exercise.name));
  const categoryObservations = TRAINING_NAVIGATION_CATEGORIES.map((category) =>
    createCategoryPerformanceObservation({
      category,
      exerciseObservations: exerciseObservations.filter(
        (observation) => observation.exercise.primaryNavigationCategory === category
      ),
      nowDateKey,
    })
  ).filter(Boolean);
  const overallObservation = createOverallPerformanceObservation({
    categoryObservations,
    exerciseObservations,
    generatedAt: generatedAtValue,
    nowDateKey,
    sessions,
  });

  return {
    generated_at: generatedAtValue,
    observation_type: OBSERVATION_TYPE,
    summary: overallObservation.explanation_data.summary,
    observations: [
      overallObservation,
      ...categoryObservations,
      ...exerciseObservations,
    ],
    overallObservation,
    categoryObservations,
    exerciseObservations,
  };
}

function getActiveResistanceTrainingSessions(objects = []) {
  const byId = new Map();

  objects
    .map(unwrapCanonicalPayload)
    .filter(Boolean)
    .filter((session) => session.evidence_type === "training")
    .filter((session) => !isSuperseded(session))
    .filter(isResistanceTrainingSession)
    .forEach((session) => {
      if (!session.id) return;
      byId.set(session.id, session);
    });

  return [...byId.values()].sort(compareSessions);
}

function unwrapCanonicalPayload(object = {}) {
  if (object.payload) {
    if (!isActiveCanonicalEvidenceObject(object)) return null;

    return {
      ...object.payload,
      quality: {
        ...(object.payload.quality ?? {}),
        ...(object.quality?.status === "superseded"
          ? { status: "superseded", supersededBy: object.quality.supersededBy }
          : {}),
      },
    };
  }

  return object;
}

function isSuperseded(object = {}) {
  return (
    object.status === "superseded" ||
    object.supersededBy ||
    object.quality?.status === "superseded" ||
    object.quality?.supersededBy ||
    object.metadata?.status === "superseded" ||
    object.metadata?.supersededBy
  );
}

function isResistanceTrainingSession(session = {}) {
  const activityType = session.metadata?.activity_type ?? "";

  if ((session.exercises ?? []).length > 0) return true;

  return /strength|resistance|lifting|weights?|traditional strength/i.test(
    activityType
  );
}

function getExercisePerformanceEntries(sessions = []) {
  return sessions.flatMap((session) =>
    (session.exercises ?? [])
      .filter((exercise) => String(exercise?.name ?? "").trim())
      .map((exercise) =>
        createExercisePerformanceEntry({ exercise, session })
      )
      .filter(Boolean)
  );
}

function createExercisePerformanceEntry({ exercise = {}, session = {} }) {
  const navigationExercise = withPrimaryTrainingNavigationCategory({
    ...exercise,
    familyLabel: exercise.movement_pattern,
    label: exercise.name,
    primaryMuscleGroups: exercise.primary_muscle_groups,
    regionLabel: exercise.body_region,
  });
  const sets = normalizeSets(exercise.sets);
  const totalVolume = sumKnownVolume(sets);
  const bestSet = getBestSet(sets);

  return {
    date: getDateKey(session.observed_at),
    exerciseKey: getCanonicalTrainingExerciseSlug(exercise.name),
    exerciseName: getCanonicalTrainingExerciseLabel(exercise.name),
    primaryNavigationCategory: navigationExercise.primaryNavigationCategory,
    sessionId: session.id,
    setCount: sets.length,
    sets,
    bestSet,
    totalVolume,
  };
}

function normalizeSets(sets = []) {
  return sets
    .map((set, index) => {
      const reps = toFiniteNumber(set.reps);
      const weight = normalizeWeight(set.weight);
      const durationSeconds = toFiniteNumber(set.duration_seconds);
      const loadType =
        set.load_type ??
        (set.weight_unit === "bodyweight"
          ? "bodyweight"
          : Number.isFinite(weight)
            ? "external_load"
            : null);
      const volume = toFiniteNumber(set.volume) ?? (
        Number.isFinite(reps) && Number.isFinite(weight) ? reps * weight : null
      );

      return {
        duration_seconds: durationSeconds,
        load_type: loadType,
        measurement_type:
          set.measurement_type ??
          set.set_type ??
          (Number.isFinite(durationSeconds) ? "duration" : null),
        set_number: toFiniteNumber(set.set_number) ?? index + 1,
        set_type:
          set.set_type ??
          set.measurement_type ??
          (Number.isFinite(durationSeconds)
            ? "duration"
            : loadType === "bodyweight"
              ? "bodyweight_reps"
              : "weighted_reps"),
        reps,
        weight,
        weight_unit: set.weight_unit ?? (Number.isFinite(weight) ? "lb" : null),
        volume,
      };
    })
    .filter(
      (set) =>
        Number.isFinite(set.reps) ||
        Number.isFinite(set.weight) ||
        Number.isFinite(set.duration_seconds)
    );
}

function normalizeWeight(value) {
  if (typeof value === "string" && /body\s*weight|bodyweight|bw/i.test(value)) {
    return null;
  }

  return toFiniteNumber(value);
}

function createExercisePerformanceObservation({ entries = [], exerciseKey, nowDateKey }) {
  const sortedEntries = entries.sort(compareEntries);
  const lastSession = sortedEntries.at(-1);
  const previousComparableSession = sortedEntries.at(-2) ?? null;
  const priorEntries = sortedEntries.slice(0, -1);
  const prDetection = detectPrs({ lastSession, priorEntries });
  const volumeTrend = getVolumeTrend({
    lastSession,
    previousComparableSession,
    recentEntries: sortedEntries.slice(-4),
  });
  const progressiveOverloadStatus = getProgressiveOverloadStatus({
    prDetection,
    sortedEntries,
    volumeTrend,
  });
  const frequency = getExerciseFrequency({ entries: sortedEntries, nowDateKey });
  const confidence = getExerciseObservationConfidence(sortedEntries);

  return {
    id: `performance|exercise|${exerciseKey}`,
    observation_type: OBSERVATION_TYPE,
    scope: "exercise",
    exercise: {
      key: exerciseKey,
      name: lastSession.exerciseName,
      primaryNavigationCategory:
        lastSession.primaryNavigationCategory ?? "unmapped",
    },
    status: progressiveOverloadStatus,
    evidence_date_range: {
      start: sortedEntries[0]?.date ?? null,
      end: lastSession?.date ?? null,
    },
    supporting_session_ids: unique(sortedEntries.map((entry) => entry.sessionId)),
    confidence,
    explanation_data: {
      last_session: serializeSessionEntry(lastSession),
      previous_comparable_session: serializeSessionEntry(previousComparableSession),
      pr_detection: prDetection,
      progressive_overload: {
        status: progressiveOverloadStatus,
        reason: getProgressiveOverloadReason({
          prDetection,
          sortedEntries,
          volumeTrend,
        }),
      },
      volume_trend: volumeTrend,
      frequency,
    },
    provenance: {
      source: "TrainingPerformanceIntelligenceService",
      training_session_ids: unique(sortedEntries.map((entry) => entry.sessionId)),
    },
  };
}

function detectPrs({ lastSession, priorEntries = [] }) {
  if (!lastSession || priorEntries.length === 0) {
    return {
      detected: false,
      type: null,
      conservative: true,
      reason: "At least two comparable sessions are required.",
      prs: [],
    };
  }

  const priorSets = priorEntries.flatMap((entry) => entry.sets);
  const prs = [];
  const priorMaxWeight = maxFinite(priorSets.map((set) => set.weight));
  const lastMaxWeightSet = getHeaviestSet(lastSession.sets);

  if (
    lastMaxWeightSet &&
    Number.isFinite(priorMaxWeight) &&
    lastMaxWeightSet.weight > priorMaxWeight
  ) {
    prs.push({
      type: "heaviest_load",
      value: lastMaxWeightSet.weight,
      unit: lastMaxWeightSet.weight_unit ?? "lb",
      previous_best: priorMaxWeight,
    });
  }

  for (const set of lastSession.sets) {
    if (!Number.isFinite(set.reps) || !Number.isFinite(set.weight)) continue;
    const priorSameWeightReps = maxFinite(
      priorSets
        .filter((priorSet) => priorSet.weight === set.weight)
        .map((priorSet) => priorSet.reps)
    );

    if (Number.isFinite(priorSameWeightReps) && set.reps > priorSameWeightReps) {
      prs.push({
        type: "reps_at_load",
        value: set.reps,
        unit: "reps",
        load: set.weight,
        load_unit: set.weight_unit ?? "lb",
        previous_best: priorSameWeightReps,
      });
    }
  }

  const priorMaxVolume = maxFinite(priorEntries.map((entry) => entry.totalVolume));

  if (
    Number.isFinite(lastSession.totalVolume) &&
    Number.isFinite(priorMaxVolume) &&
    lastSession.totalVolume > priorMaxVolume
  ) {
    prs.push({
      type: "session_volume",
      value: lastSession.totalVolume,
      unit: "lb",
      previous_best: priorMaxVolume,
    });
  }

  return {
    detected: prs.length > 0,
    type: prs[0]?.type ?? null,
    conservative: true,
    reason: prs.length
      ? "Latest session exceeded prior same-exercise performance."
      : "Latest session did not exceed prior same-exercise performance.",
    prs,
  };
}

function getProgressiveOverloadStatus({ prDetection, sortedEntries, volumeTrend }) {
  if (sortedEntries.length < 2) return "insufficient_data";
  if (prDetection.detected || volumeTrend.direction === "up") return "improving";
  if (volumeTrend.direction === "down" && volumeTrend.percent_change <= -15) {
    return "regressing";
  }
  if (sortedEntries.length >= 3 && volumeTrend.direction !== "up") {
    return "plateauing";
  }

  return "stable";
}

function getProgressiveOverloadReason({ prDetection, sortedEntries, volumeTrend }) {
  if (sortedEntries.length < 2) return "Only one comparable session is available.";
  if (prDetection.detected) return "A conservative performance PR was detected.";
  if (volumeTrend.direction === "up") return "Latest same-exercise volume increased.";
  if (volumeTrend.direction === "down" && volumeTrend.percent_change <= -15) {
    return "Latest same-exercise volume dropped materially.";
  }
  if (sortedEntries.length >= 3) return "Multiple sessions are present without clear overload.";

  return "Latest session is comparable but not materially different.";
}

function getVolumeTrend({ lastSession, previousComparableSession, recentEntries = [] }) {
  const latest = lastSession?.totalVolume ?? null;
  const previous = previousComparableSession?.totalVolume ?? null;
  const recentVolumes = recentEntries
    .map((entry) => entry.totalVolume)
    .filter(Number.isFinite);
  const recentAverage = recentVolumes.length
    ? roundTo(recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length, 1)
    : null;

  if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) {
    return {
      direction: "unknown",
      latest,
      percent_change: null,
      previous,
      recent_average: recentAverage,
    };
  }

  const percentChange = ((latest - previous) / previous) * 100;
  const direction =
    percentChange > 5 ? "up" : percentChange < -5 ? "down" : "flat";

  return {
    direction,
    latest,
    percent_change: roundTo(percentChange, 1),
    previous,
    recent_average: recentAverage,
  };
}

function getExerciseFrequency({ entries = [], nowDateKey }) {
  const sessionIdsByDate = new Map();

  entries.forEach((entry) => {
    if (!entry.date || !entry.sessionId) return;
    const key = `${entry.date}|${entry.sessionId}`;
    sessionIdsByDate.set(key, entry);
  });

  const uniqueEntries = [...sessionIdsByDate.values()];
  const lastDate = entries.at(-1)?.date ?? null;

  return {
    total_sessions: uniqueEntries.length,
    sessions_last_7_days: countEntriesWithinDays(uniqueEntries, nowDateKey, 7),
    sessions_last_30_days: countEntriesWithinDays(uniqueEntries, nowDateKey, 30),
    days_since_last_trained:
      lastDate && nowDateKey ? daysBetween(nowDateKey, lastDate) : null,
  };
}

function createCategoryPerformanceObservation({
  category,
  exerciseObservations = [],
  nowDateKey,
}) {
  if (exerciseObservations.length === 0) return null;

  const supportingSessionIds = unique(
    exerciseObservations.flatMap((observation) => observation.supporting_session_ids)
  );
  const latestDate = maxDateKey(
    exerciseObservations.map((observation) => observation.evidence_date_range.end)
  );
  const statusCounts = countBy(exerciseObservations, (observation) => observation.status);
  const totalVolume = sumFinite(
    exerciseObservations.map(
      (observation) => observation.explanation_data.last_session?.total_volume
    )
  );
  const latestKnownSets = sumFinite(
    exerciseObservations.map(
      (observation) => observation.explanation_data.last_session?.set_count
    )
  );

  return {
    id: `performance|category|${category}`,
    observation_type: OBSERVATION_TYPE,
    scope: "category",
    category,
    status: getCategoryStatus(statusCounts),
    evidence_date_range: {
      start: minDateKey(
        exerciseObservations.map((observation) => observation.evidence_date_range.start)
      ),
      end: latestDate,
    },
    supporting_session_ids: supportingSessionIds,
    confidence: exerciseObservations.some(
      (observation) => observation.confidence === "high"
    )
      ? "moderate"
      : "low",
    explanation_data: {
      exercise_count: exerciseObservations.length,
      exercise_names: exerciseObservations.map(
        (observation) => observation.exercise.name
      ),
      latest_trained_at: latestDate,
      days_since_latest_training:
        latestDate && nowDateKey ? daysBetween(nowDateKey, latestDate) : null,
      status_counts: statusCounts,
      latest_known_sets: latestKnownSets || null,
      latest_known_volume: totalVolume || null,
    },
    provenance: {
      source: "TrainingPerformanceIntelligenceService",
      training_session_ids: supportingSessionIds,
    },
  };
}

function createOverallPerformanceObservation({
  categoryObservations = [],
  exerciseObservations = [],
  generatedAt,
  nowDateKey,
  sessions = [],
}) {
  const supportingSessionIds = unique(sessions.map((session) => session.id));
  const statusCounts = countBy(exerciseObservations, (observation) => observation.status);
  const recentPrs = exerciseObservations.filter((observation) => {
    if (!observation.explanation_data.pr_detection.detected) return false;
    const endDate = observation.evidence_date_range.end;

    return endDate && daysBetween(nowDateKey, endDate) <= 30;
  });
  const sessionsLast7Days = countSessionsWithinDays(sessions, nowDateKey, 7);
  const sessionsLast30Days = countSessionsWithinDays(sessions, nowDateKey, 30);
  const needsAttention = exerciseObservations
    .filter((observation) => ["plateauing", "regressing"].includes(observation.status))
    .map((observation) => observation.exercise.name);
  const mostImprovedExercise = getMostImprovedExercise(exerciseObservations);
  const summaryStatus =
    exerciseObservations.length === 0
      ? "insufficient_data"
      : statusCounts.improving > 0
        ? "improving"
        : statusCounts.regressing > 0
          ? "regressing"
          : statusCounts.plateauing > 0
            ? "plateauing"
            : "stable";

  return {
    id: "performance|overall|resistance",
    observation_type: OBSERVATION_TYPE,
    scope: "overall",
    status: summaryStatus,
    evidence_date_range: {
      start: minDateKey(sessions.map((session) => getDateKey(session.observed_at))),
      end: maxDateKey(sessions.map((session) => getDateKey(session.observed_at))),
    },
    supporting_session_ids: supportingSessionIds,
    confidence: exerciseObservations.length >= 2 ? "moderate" : "low",
    explanation_data: {
      generated_at: generatedAt,
      summary: {
        resistance_sessions_last_7_days: sessionsLast7Days,
        resistance_sessions_last_30_days: sessionsLast30Days,
        exercises_tracked: exerciseObservations.length,
        exercises_trained_last_30_days: exerciseObservations.filter(
          (observation) =>
            (observation.explanation_data.frequency.sessions_last_30_days ?? 0) > 0
        ).length,
        categories_trained: categoryObservations.length,
        exercises_improving: statusCounts.improving ?? 0,
        exercises_plateauing: statusCounts.plateauing ?? 0,
        exercises_regressing: statusCounts.regressing ?? 0,
        exercises_with_insufficient_data: statusCounts.insufficient_data ?? 0,
        recent_pr_count: recentPrs.length,
        most_improved_exercise: mostImprovedExercise,
        needs_attention: needsAttention,
      },
      category_statuses: categoryObservations.map((observation) => ({
        category: observation.category,
        status: observation.status,
        exercise_count: observation.explanation_data.exercise_count,
      })),
    },
    provenance: {
      source: "TrainingPerformanceIntelligenceService",
      training_session_ids: supportingSessionIds,
    },
  };
}

function getCategoryStatus(statusCounts = {}) {
  if ((statusCounts.improving ?? 0) > 0) return "improving";
  if ((statusCounts.regressing ?? 0) > 0) return "regressing";
  if ((statusCounts.plateauing ?? 0) > 0) return "plateauing";
  if ((statusCounts.stable ?? 0) > 0) return "stable";

  return "insufficient_data";
}

function getMostImprovedExercise(exerciseObservations = []) {
  const improving = exerciseObservations
    .filter((observation) => observation.status === "improving")
    .map((observation) => ({
      name: observation.exercise.name,
      percent_change:
        observation.explanation_data.volume_trend.percent_change ?? 0,
    }))
    .sort((left, right) => right.percent_change - left.percent_change);

  return improving[0]?.name ?? null;
}

function serializeSessionEntry(entry) {
  if (!entry) return null;

  return {
    date: entry.date,
    session_id: entry.sessionId,
    set_count: entry.setCount,
    best_set: entry.bestSet,
    total_volume: entry.totalVolume,
  };
}

function getExerciseObservationConfidence(entries = []) {
  if (entries.length >= 3) return "high";
  if (entries.length === 2) return "moderate";

  return "low";
}

function getBestSet(sets = []) {
  return [...sets]
    .filter(
      (set) =>
        Number.isFinite(set.reps) ||
        Number.isFinite(set.weight) ||
        Number.isFinite(set.duration_seconds)
    )
    .sort(compareSetsByPerformance)[0] ?? null;
}

function getHeaviestSet(sets = []) {
  return [...sets]
    .filter((set) => Number.isFinite(set.weight))
    .sort((left, right) => right.weight - left.weight || right.reps - left.reps)[0] ?? null;
}

function compareSetsByPerformance(left = {}, right = {}) {
  const leftWeight = Number.isFinite(left.weight) ? left.weight : 0;
  const rightWeight = Number.isFinite(right.weight) ? right.weight : 0;
  const leftVolume = Number.isFinite(left.volume) ? left.volume : 0;
  const rightVolume = Number.isFinite(right.volume) ? right.volume : 0;
  const leftDuration = Number.isFinite(left.duration_seconds) ? left.duration_seconds : 0;
  const rightDuration = Number.isFinite(right.duration_seconds) ? right.duration_seconds : 0;

  return (
    rightWeight - leftWeight ||
    (Number.isFinite(right.reps) ? right.reps : 0) -
      (Number.isFinite(left.reps) ? left.reps : 0) ||
    rightVolume - leftVolume ||
    rightDuration - leftDuration
  );
}

function sumKnownVolume(sets = []) {
  const knownVolumes = sets.map((set) => set.volume).filter(Number.isFinite);

  return knownVolumes.length
    ? knownVolumes.reduce((sum, volume) => sum + volume, 0)
    : null;
}

function countEntriesWithinDays(entries = [], nowDateKey, days) {
  return entries.filter((entry) => isWithinDays(entry.date, nowDateKey, days)).length;
}

function countSessionsWithinDays(sessions = [], nowDateKey, days) {
  return new Set(
    sessions
      .filter((session) => isWithinDays(getDateKey(session.observed_at), nowDateKey, days))
      .map((session) => session.id)
  ).size;
}

function isWithinDays(dateKey, nowDateKey, days) {
  if (!dateKey || !nowDateKey) return false;
  const diff = daysBetween(nowDateKey, dateKey);

  return diff >= 0 && diff <= days;
}

function compareEntries(left = {}, right = {}) {
  return (
    String(left.date ?? "").localeCompare(String(right.date ?? "")) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? ""))
  );
}

function compareSessions(left = {}, right = {}) {
  return (
    String(getDateKey(left.observed_at) ?? "").localeCompare(
      String(getDateKey(right.observed_at) ?? "")
    ) || String(left.id ?? "").localeCompare(String(right.id ?? ""))
  );
}

function groupBy(items = [], getKey) {
  const map = new Map();

  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), item]);
  });

  return map;
}

function countBy(items = [], getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;

    return counts;
  }, {});
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function sumFinite(values = []) {
  return values
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
}

function maxFinite(values = []) {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function minDateKey(values = []) {
  return values.filter(Boolean).sort()[0] ?? null;
}

function maxDateKey(values = []) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function daysBetween(laterDateKey, earlierDateKey) {
  const later = Date.parse(`${laterDateKey}T00:00:00.000Z`);
  const earlier = Date.parse(`${earlierDateKey}T00:00:00.000Z`);

  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;

  return Math.floor((later - earlier) / MS_PER_DAY);
}

function getDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function toIsoString(value) {
  if (value instanceof Date) return value.toISOString();

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
