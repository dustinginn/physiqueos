const CANONICAL_TRAINING_MUSCLE_GROUP_DEFINITIONS = [
  ["chest", "Chest"],
  ["back", "Back"],
  ["shoulders", "Shoulders"],
  ["biceps", "Biceps"],
  ["triceps", "Triceps"],
  ["core", "Core"],
  ["quads", "Quads"],
  ["hamstrings", "Hamstrings"],
  ["glutes", "Glutes"],
  ["calves", "Calves"],
  ["adductors", "Adductors"],
];

export const CANONICAL_TRAINING_MUSCLE_GROUPS = Object.freeze(
  CANONICAL_TRAINING_MUSCLE_GROUP_DEFINITIONS.map(([id, label]) =>
    Object.freeze({ id, label })
  )
);

export function listCanonicalTrainingMuscleGroups() {
  return CANONICAL_TRAINING_MUSCLE_GROUPS;
}

export function resolveCanonicalTrainingMuscleGroup(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return CANONICAL_TRAINING_MUSCLE_GROUPS.find(
    (candidate) =>
      candidate.id.toLowerCase() === normalized ||
      candidate.label.toLowerCase() === normalized
  ) ?? null;
}

export function searchCanonicalTrainingMuscleGroups(query = "") {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return [...CANONICAL_TRAINING_MUSCLE_GROUPS];
  return CANONICAL_TRAINING_MUSCLE_GROUPS.filter(
    (candidate) =>
      candidate.label.toLowerCase().includes(normalized) ||
      candidate.id.toLowerCase().includes(normalized)
  );
}

export function suggestCanonicalTrainingMuscleGroup(exerciseName) {
  const name = String(exerciseName ?? "").trim().toLowerCase();
  const suggestedId =
    /\bhip[\s-]*thrusts?\b/.test(name)
      ? "glutes"
      : /\bbiceps?\b|\bbicep\b/.test(name) && /\bcurls?\b/.test(name)
        ? "biceps"
        : null;
  const muscleGroup = resolveCanonicalTrainingMuscleGroup(suggestedId);
  return Object.freeze({
    confidence: muscleGroup ? "high" : "low",
    muscleGroup,
  });
}
