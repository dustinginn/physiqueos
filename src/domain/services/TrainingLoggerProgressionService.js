import {
  getCanonicalTrainingExerciseSlug,
} from "../models/trainingExerciseIdentity";
import {
  getTrainingExecutionVariantKey,
} from "../models/trainingExecutionVariant";
import {
  deriveTrainingExerciseRelationshipContext,
  getTrainingExerciseRelationshipComparisonKey,
} from "../models/trainingExerciseRelationship";

export const TRAINING_LOGGER_PROGRESSION_STATUS = Object.freeze({
  INSUFFICIENT: "insufficient_evidence",
  MAINTAIN: "maintain_current_performance",
  ON_PACE: "on_pace",
  OPPORTUNITY: "progression_opportunity",
  RECOVER: "recover_prior_performance",
});

const PHASE_EXPECTATIONS = Object.freeze({
  gain: { opportunityDays: 12, label: "gain phase" },
  maintenance: { opportunityDays: 28, label: "maintenance phase" },
  cut: { opportunityDays: 35, label: "cut phase" },
  unknown: { opportunityDays: 21, label: "current phase" },
});

export function createTrainingLoggerProgressionRecommendation({
  canonicalExerciseId,
  goalContext = null,
  nowDate,
  relationshipContext = null,
  sessions = [],
  variant = null,
} = {}) {
  const comparable = listComparablePerformances({
    canonicalExerciseId,
    relationshipContext,
    sessions,
    variant,
  }).filter((entry) => !nowDate || entry.date < String(nowDate).slice(0, 10));
  const phase = resolveTrainingProgressionPhase(goalContext);
  const phaseExpectation = PHASE_EXPECTATIONS[phase];

  if (comparable.length < 2) {
    return {
      status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
      confidence: "low",
      reason: "More comparable confirmed sessions are needed before recommending progression.",
      recommendedAction: "manual_or_previous",
      recommendedLoad: null,
      recommendedReps: null,
      comparisonContext: createComparisonContext({ canonicalExerciseId, relationshipContext, variant }),
      historyReferences: comparable.map(toHistoryReference),
      calibration: { phase, movementCadenceDays: null, userCadenceDays: null },
    };
  }

  const allPerformances = listAllPerformances(sessions);
  const movementCadenceDays = inferProgressionCadenceDays(comparable, 3);
  const userCadenceDays = inferUserProgressionCadenceDays(allPerformances, 4);
  const calibratedDays = movementCadenceDays ?? userCadenceDays ?? phaseExpectation.opportunityDays;
  const latest = comparable[0];
  const previous = comparable[1];
  const daysSinceLatest = daysBetween(nowDate, latest.date);
  const stableAcrossRecent = comparable.slice(0, 3).every((entry) =>
    samePerformance(entry, latest)
  );
  const regression = comparePerformance(latest, previous) < 0;
  const progress = comparePerformance(latest, previous) > 0;
  const confidence = comparable.length >= 5 ? "high" : comparable.length >= 3 ? "moderate" : "low";
  const common = {
    confidence,
    comparisonContext: createComparisonContext({ canonicalExerciseId, relationshipContext, variant }),
    historyReferences: comparable.slice(0, 6).map(toHistoryReference),
    calibration: {
      phase,
      phaseExpectationDays: phaseExpectation.opportunityDays,
      movementCadenceDays,
      userCadenceDays,
      effectiveCadenceDays: calibratedDays,
    },
  };

  if (regression) {
    return {
      ...common,
      status: TRAINING_LOGGER_PROGRESSION_STATUS.RECOVER,
      reason: "The latest comparable session was below the prior performance.",
      recommendedAction: "keep_previous",
      recommendedLoad: previous.load,
      recommendedReps: previous.reps,
    };
  }

  if (progress && daysSinceLatest < calibratedDays) {
    return {
      ...common,
      status: TRAINING_LOGGER_PROGRESSION_STATUS.ON_PACE,
      reason: `Recent comparable performance progressed and remains on pace for the ${phaseExpectation.label}.`,
      recommendedAction: "maintain",
      recommendedLoad: latest.load,
      recommendedReps: latest.reps,
    };
  }

  if (stableAcrossRecent && comparable.length >= 3 && daysSinceLatest >= calibratedDays) {
    const target = deriveEvidenceSupportedTarget(comparable);
    return {
      ...common,
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      reason: `Comparable performance has held long enough to consider progression for the ${phaseExpectation.label}.`,
      recommendedAction: target ? "use_suggestion" : "consider_progression",
      recommendedLoad: target?.load ?? null,
      recommendedReps: target?.reps ?? null,
    };
  }

  return {
    ...common,
    status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
    reason: phase === "cut"
      ? "Preserving comparable performance is productive during a cut."
      : "The available history supports repeating the latest comparable performance.",
    recommendedAction: "maintain",
    recommendedLoad: latest.load,
    recommendedReps: latest.reps,
  };
}

export function resolveTrainingProgressionPhase(goalContext = null) {
  const text = [
    goalContext?.phase?.type,
    goalContext?.phase?.label,
    goalContext?.phase?.name,
    goalContext?.type,
    goalContext?.title,
    goalContext?.strategy,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/gain|surplus|build|hypertrophy|mass/.test(text)) return "gain";
  if (/cut|deficit|fat loss|lean out/.test(text)) return "cut";
  if (/maintain|maintenance|stabil/.test(text)) return "maintenance";
  return "unknown";
}

export function listComparablePerformances({
  canonicalExerciseId,
  relationshipContext = null,
  sessions = [],
  variant = null,
} = {}) {
  const requestedVariantKey = getTrainingExecutionVariantKey(variant);
  const requestedRelationshipKey = getTrainingExerciseRelationshipComparisonKey(
    relationshipContext
  );
  return listAllPerformances(sessions)
    .filter((entry) => entry.canonicalExerciseId === canonicalExerciseId)
    .filter((entry) => entry.variantKey === requestedVariantKey)
    .filter((entry) => entry.relationshipKey === requestedRelationshipKey)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function listAllPerformances(sessions = []) {
  return sessions
    .map((candidate) => candidate?.payload ?? candidate)
    .filter((session) => session?.evidence_type === "training")
    .flatMap((session) => (session.exercises ?? []).map((exercise) => {
      const best = getBestComparableSet(exercise.sets);
      if (!best) return null;
      return {
        canonicalExerciseId: exercise.canonicalExerciseId ??
          getCanonicalTrainingExerciseSlug(exercise.name),
        date: String(session.observed_at ?? session.date ?? "").slice(0, 10),
        load: best.load,
        reps: best.reps,
        relationshipKey: getTrainingExerciseRelationshipComparisonKey(
          deriveTrainingExerciseRelationshipContext({ exercise, session })
        ),
        sessionId: session.id ?? session.canonicalId ?? null,
        unit: best.unit,
        variantKey: getTrainingExecutionVariantKey(exercise),
      };
    }))
    .filter((entry) => entry?.date);
}

function getBestComparableSet(sets = []) {
  return (sets ?? [])
    .map((set) => ({
      load: finite(set.weight ?? set.load),
      reps: finite(set.reps),
      unit: set.weight_unit ?? set.unit ?? "lb",
    }))
    .filter((set) => set.load !== null && set.reps !== null)
    .sort((left, right) => comparePerformance(right, left))[0] ?? null;
}

function inferProgressionCadenceDays(entries = [], minimumEvents) {
  const intervals = listProgressionIntervals(entries);
  if (intervals.length < minimumEvents) return null;
  intervals.sort((left, right) => left - right);
  return intervals[Math.floor(intervals.length / 2)];
}

function inferUserProgressionCadenceDays(entries = [], minimumEvents) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const key = [entry.canonicalExerciseId, entry.variantKey, entry.relationshipKey].join("|");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  });
  const intervals = [...grouped.values()].flatMap(listProgressionIntervals);
  if (intervals.length < minimumEvents) return null;
  intervals.sort((left, right) => left - right);
  return intervals[Math.floor(intervals.length / 2)];
}

function listProgressionIntervals(entries = []) {
  const ordered = [...entries].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const intervals = [];
  for (let index = 1; index < ordered.length; index += 1) {
    if (comparePerformance(ordered[index], ordered[index - 1]) > 0) {
      const interval = daysBetween(ordered[index].date, ordered[index - 1].date);
      if (interval > 0 && interval <= 90) intervals.push(interval);
    }
  }
  return intervals;
}

function deriveEvidenceSupportedTarget(entries = []) {
  const ordered = [...entries].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const increments = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const increment = ordered[index].load - ordered[index - 1].load;
    if (increment > 0 && increment <= 50) increments.push(increment);
  }
  const latest = entries[0];
  if (increments.length >= 2 && latest.load > 0) {
    return { load: latest.load + Math.min(...increments), reps: Math.max(1, latest.reps - 2) };
  }
  if (latest.reps > 0 && latest.reps < 20) {
    return { load: latest.load, reps: latest.reps + 1 };
  }
  return null;
}

function comparePerformance(left, right) {
  if (left.load !== right.load) return left.load - right.load;
  return left.reps - right.reps;
}

function samePerformance(left, right) {
  return left.load === right.load && left.reps === right.reps;
}

function daysBetween(later, earlier) {
  const laterTime = Date.parse(String(later ?? ""));
  const earlierTime = Date.parse(String(earlier ?? ""));
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return 0;
  return Math.max(0, Math.floor((laterTime - earlierTime) / 86400000));
}

function createComparisonContext({ canonicalExerciseId, relationshipContext, variant }) {
  return {
    canonicalExerciseId,
    relationshipKey: getTrainingExerciseRelationshipComparisonKey(relationshipContext),
    variantKey: getTrainingExecutionVariantKey(variant),
  };
}

function toHistoryReference(entry) {
  return {
    date: entry.date,
    sessionId: entry.sessionId,
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
