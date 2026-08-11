import {
  getPrimaryTrainingNavigationGroup,
} from "../../navigation/trainingNavigationMapping";

const MIN_CONFIRMED_SESSIONS = 6;
const MIN_REPEATED_PATTERN = 3;

export function createTrainingLoggerSuggestion({ date, sessions = [] } = {}) {
  const confirmed = sessions
    .map((candidate) => candidate?.payload ?? candidate)
    .filter((session) => session?.evidence_type === "training")
    .filter((session) => (session.exercises ?? []).length > 0)
    .map((session) => ({
      date: String(session.observed_at ?? session.date ?? "").slice(0, 10),
      areas: listSessionAreas(session),
      sessionId: session.id ?? null,
    }))
    .filter((session) => session.date && session.areas.length > 0)
    .sort((left, right) => right.date.localeCompare(left.date));

  if (confirmed.length < MIN_CONFIRMED_SESSIONS) return null;
  const targetWeekday = weekday(date);
  const matchingDays = confirmed.filter((session) => weekday(session.date) === targetWeekday);
  const patterns = new Map();
  matchingDays.forEach((session) => {
    const key = session.areas.join("|");
    if (!patterns.has(key)) patterns.set(key, []);
    patterns.get(key).push(session);
  });
  const best = [...patterns.entries()]
    .filter(([, occurrences]) => occurrences.length >= MIN_REPEATED_PATTERN)
    .sort((left, right) => right[1].length - left[1].length)[0];
  if (!best) return null;
  const categories = best[0].split("|").map(formatAreaLabel);
  return {
    id: `confirmed_history_${targetWeekday}_${best[0].replaceAll("|", "_")}`,
    label: categories.join(" + "),
    categories,
    reason: `Repeated on ${weekdayLabel(targetWeekday)} across ${best[1].length} confirmed workouts`,
    source: "confirmed_training_evidence_history",
    historyReferences: best[1].map((session) => session.sessionId).filter(Boolean),
  };
}

function listSessionAreas(session) {
  return [...new Set((session.exercises ?? []).map((exercise) =>
    getPrimaryTrainingNavigationGroup({
      canonicalExerciseId: exercise.canonicalExerciseId,
      label: exercise.name,
      primaryMuscleGroups: exercise.primary_muscle_groups,
      regionLabel: exercise.body_region,
    })
  ).filter(Boolean))].sort();
}

function weekday(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function weekdayLabel(value) {
  return ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][value] ?? "this day";
}

function formatAreaLabel(value) {
  return String(value ?? "").replace(/\b\w/g, (character) => character.toUpperCase());
}
