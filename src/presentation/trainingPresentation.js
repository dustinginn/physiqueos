import { withPrimaryTrainingNavigationCategory } from "../navigation/trainingNavigationMapping";

export function formatTrainingLoad(set = {}) {
  if (hasDurationSeconds(set)) return "Timed";
  if (isBodyweightSet(set)) return "BW";
  if (set.weight === null || set.weight === undefined || set.weight === "") return "BW";
  return `${set.weight} ${set.weight_unit ?? "lb"}`;
}

export function formatTrainingSetGlance(set = {}) {
  if (hasDurationSeconds(set)) return formatDurationSet(Number(set.duration_seconds));
  return `${set.reps ?? "?"} x ${formatTrainingLoad(set)}`;
}

export function getTrainingDaySummary(sessions = [], fallback = null) {
  const labels = [];
  const activityLabels = [];
  const add = (label) => {
    if (label && !labels.includes(label)) labels.push(label);
  };

  sessions.forEach((session) => {
    (session.exercises ?? []).forEach((exercise) => {
      const classified = withPrimaryTrainingNavigationCategory({
        ...exercise,
        label: exercise.label ?? exercise.name,
      });
      if (classified.primaryNavigationCategory) {
        add(toTitle(classified.primaryNavigationCategory));
      }
    });

    const activity = getActivityClassification(session.label);
    if (activity && !activityLabels.includes(activity)) activityLabels.push(activity);
  });

  activityLabels
    .filter((label) => label !== "Walking" || !activityLabels.includes("Cardio"))
    .forEach(add);

  if (!labels.length) return fallback;
  return labels.join(" · ");
}

export function isBodyweightSet(set = {}) {
  return (
    set.weight_unit === "bodyweight" ||
    set.load_type === "bodyweight" ||
    set.measurement_type === "bodyweight_reps" ||
    set.set_type === "bodyweight_reps"
  );
}

export function normalizeTrainingSetsForPresentation(sets = []) {
  const validSets = sets.filter(Boolean);
  const allLoadsAreZero =
    validSets.length > 0 &&
    validSets.every((set) => Number(set.weight) === 0) &&
    validSets.some((set) => Number.isFinite(Number(set.reps)));

  if (!allLoadsAreZero) return sets;
  return sets.map((set) => ({
    ...set,
    load_type: "bodyweight",
    measurement_type: set.measurement_type ?? "bodyweight_reps",
  }));
}

function getActivityClassification(label) {
  const normalized = String(label ?? "").toLowerCase();
  if (!normalized || /\bresistance|strength|weight\s*training\b/.test(normalized)) return null;
  if (/\bwalk|walking\b/.test(normalized)) return "Walking";
  if (/\bcardio|stair|stepper|elliptical|treadmill|cycling|bike|run|running\b/.test(normalized)) {
    return "Cardio";
  }
  return null;
}

function hasDurationSeconds(set = {}) {
  return (
    set.duration_seconds !== null &&
    set.duration_seconds !== undefined &&
    set.duration_seconds !== "" &&
    Number.isFinite(Number(set.duration_seconds))
  );
}

function formatDurationSet(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes <= 0 ? `${seconds}s` : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function toTitle(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
