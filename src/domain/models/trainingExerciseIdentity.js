export const FOUNDER_ALPHA_TRAINING_EXERCISES = [
  exercise("bench_press", "Bench Press", ["bench press", "barbell bench press", "flat bench press", "chest press", "bench"], "barbell", "Chest", ["Chest", "Triceps", "Front Delts"], "Horizontal Press"),
  exercise("incline_dumbbell_press", "Incline Dumbbell Press", ["incline dumbbell press", "dumbbell incline press", "incline dumbbell presses", "incline db press", "incline db presses"], "dumbbell", "Chest", ["Upper Chest", "Triceps", "Front Delts"], "Incline Press"),
  exercise("chest_fly_machine", "Chest Fly Machine", ["chest fly machine", "machine chest fly", "machine fly", "chest fly", "chest flies", "pec fly machine", "pec deck", "pec deck fly"], "machine", "Chest", ["Chest"], "Chest Fly"),
  exercise("pull_up", "Pull-Up", ["pull-up", "pull-ups", "pull up", "pull ups", "pullup", "pullups"], "bodyweight", "Back", ["Lats", "Upper Back", "Biceps"], "Vertical Pull", { defaultLoadType: "bodyweight" }),
  exercise("iso_lateral_high_row", "Iso-Lateral High Row", ["iso lateral high row", "iso-lateral high row", "isolateral high row", "iso lateral high rows", "iso-lateral high rows", "isolateral high rows", "high row machine", "machine high row", "plate loaded high row", "iso lateral row", "iso lateral rows"], "machine", "Back", ["Lats", "Upper Back", "Rear Delts"], "High Row"),
  exercise("seated_cable_row", "Seated Cable Row", ["seated cable row", "seated cable rows", "cable row", "cable rows", "seated row", "seated rows", "cable machine seated row", "seated mid cable row", "cable machine seated mid cable row"], "cable", "Back", ["Mid Back", "Lats", "Biceps"], "Horizontal Pull"),
  exercise("shoulder_press_machine", "Shoulder Press Machine", ["shoulder press machine", "machine shoulder press", "shoulder machine press", "machine press", "shoulder press"], "machine", "Shoulders", ["Front Delts", "Side Delts", "Triceps"], "Vertical Press"),
  exercise("lateral_raise", "Lateral Raise", ["lateral raise", "lateral raises", "side lateral raise", "side lateral raises", "dumbbell lateral raise", "dumbbell lateral raises", "cable lateral raise", "cable lateral raises"], null, "Shoulders", ["Side Delts"], "Lateral Raise"),
  exercise("spider_curl", "Spider Curl", ["spider curl", "spider curls", "dumbbell spider curl", "dumbbell spider curls"], "dumbbell", "Arms", ["Biceps"], "Elbow Flexion"),
  exercise("ez_bar_curl", "EZ Bar Curl", ["ez bar curl", "ez bar curls", "easy bar curl", "easy bar curls", "curl bar curl", "curl bar curls"], "EZ bar", "Arms", ["Biceps"], "Elbow Flexion"),
  exercise("cable_pushdown", "Cable Pushdown", ["cable pushdown", "cable pushdowns", "triceps pushdown", "tricep pushdown", "rope pushdown", "rope pushdowns"], "cable", "Arms", ["Triceps"], "Elbow Extension"),
  exercise("straight_bar_cable_pushdown", "Straight Bar Cable Pushdown", ["straight bar cable pushdown", "straight bar cable pushdowns", "straight bar pushdown", "straight bar pushdowns", "cable straight bar pushdown", "cable straight bar pushdowns"], "cable", "Arms", ["Triceps"], "Elbow Extension"),
  exercise("hanging_leg_raise", "Hanging Leg Raise", ["hanging leg raise", "hanging leg raises", "hanging knee raise", "hanging knee raises", "leg raises hanging", "hanging raises"], "bodyweight", "Core", ["Abs", "Hip Flexors"], "Trunk / Hip Flexion", { defaultLoadType: "bodyweight" }),
  exercise("cable_crunch", "Cable Crunch", ["cable crunch", "cable crunches", "kneeling cable crunch", "kneeling cable crunches"], "cable", "Core", ["Abs"], "Spinal Flexion"),
  exercise("plank", "Plank", ["plank", "planks", "front plank", "front planks"], "bodyweight", "Core", ["Abs", "Obliques", "Deep Core"], "Isometric Core", { defaultMeasurement: "duration", defaultLoadType: "bodyweight" }),
  exercise("leg_press_feet_middle", "Leg Press (Feet Middle)", ["leg press (feet middle)", "leg press feet middle", "leg press middle feet", "middle foot leg press"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat / Press", { modifiers: ["foot_position"] }),
  exercise("leg_press_feet_high", "Leg Press (Feet High)", ["leg press (feet high)", "leg press feet high", "high feet leg press", "high foot leg press"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat / Press", { modifiers: ["foot_position"] }),
  exercise("leg_press_feet_low", "Leg Press (Feet Low)", ["leg press (feet low)", "leg press feet low", "low feet leg press", "low foot leg press"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat / Press", { modifiers: ["foot_position"] }),
  exercise("leg_press", "Leg Press", ["leg press", "leg presses", "machine leg press"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat / Press", { modifiers: ["foot_position", "stance_width", "stance_height"] }),
  exercise("pendulum_squat_machine", "Pendulum Squat Machine", ["pendulum squat machine", "pendulum squat machines", "pendulum machine squat", "pendulum machine squats"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat"),
  exercise("pendulum_squat", "Pendulum Squat", ["pendulum squat", "pendulum squats"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat"),
  exercise("bulgarian_split_squat_smith_machine", "Bulgarian Split Squat (Smith Machine)", ["bulgarian split squat (smith machine)", "bulgarian split squat smith machine", "smith machine bulgarian split squat", "smith machine bulgarian split squats", "smith bulgarian split squat"], "smith_machine", "Lower Body", ["Quads", "Glutes"], "Split Squat"),
  exercise("bulgarian_split_squat", "Bulgarian Split Squat", ["bulgarian split squat", "bulgarian split squats", "bulgarian squat", "bulgarian squats", "split squat", "split squats"], null, "Lower Body", ["Quads", "Glutes"], "Split Squat"),
  exercise("walking_lunge", "Walking Lunge", ["walking lunge", "walking lunges", "walking dumbbell lunge", "walking dumbbell lunges"], null, "Lower Body", ["Quads", "Glutes", "Hamstrings"], "Lunge"),
  exercise("leg_extension", "Leg Extension", ["leg extension", "leg extensions", "leg extension machine", "leg extension machines", "machine leg extension", "machine leg extensions", "quad extension", "quad extensions"], "machine", "Lower Body", ["Quads"], "Knee Extension"),
  exercise("hack_squat", "Hack Squat", ["hack squat", "hack squats", "hack squat machine", "machine hack squat", "machine hack squats"], "machine", "Lower Body", ["Quads", "Glutes"], "Squat"),
  exercise("sissy_squat", "Sissy Squat", ["sissy squat", "sissy squats"], null, "Lower Body", ["Quads"], "Knee-Dominant Squat"),
  exercise("squat", "Squat", ["squat", "squats", "barbell squat", "barbell squats"], "barbell", "Lower Body", ["Quads", "Glutes"], "Squat"),
  exercise("smith_machine_reverse_lunge", "Smith Machine Reverse Lunge", ["smith machine reverse lunge", "smith machine reverse lunges", "smith reverse lunge", "smith reverse lunges", "reverse lunge on the smith machine", "reverse lunges on the smith machine", "deficit smith machine reverse lunge", "deficit smith machine reverse lunges"], "smith_machine", "Lower Body", ["Quads", "Glutes", "Hamstrings"], "Reverse Lunge", { modifiers: ["deficit"] }),
  exercise("dumbbell_reverse_lunge", "Dumbbell Reverse Lunge", ["dumbbell reverse lunge", "dumbbell reverse lunges", "reverse dumbbell lunge", "reverse dumbbell lunges", "reverse lunge with dumbbells", "reverse lunges with dumbbells", "deficit dumbbell reverse lunge", "deficit dumbbell reverse lunges"], "dumbbell", "Lower Body", ["Quads", "Glutes", "Hamstrings"], "Reverse Lunge", { modifiers: ["deficit"] }),
  exercise("romanian_deadlift", "Romanian Deadlift", ["romanian deadlift", "romanian deadlifts", "rdl", "rdls", "dumbbell rdl", "dumbbell rdls", "barbell rdl", "barbell rdls"], null, "Lower Body", ["Hamstrings", "Glutes", "Lower Back"], "Hip Hinge"),
  exercise("lying_leg_curl", "Lying Leg Curl", ["lying leg curl", "lying leg curls", "lying hamstring curl", "lying hamstring curls", "prone leg curl", "prone leg curls"], "machine", "Lower Body", ["Hamstrings"], "Knee Flexion"),
  exercise("seated_leg_curl", "Seated Leg Curl", ["seated leg curl", "seated leg curls", "seated hamstring curl", "seated hamstring curls"], "machine", "Lower Body", ["Hamstrings"], "Knee Flexion"),
];

const EXCLUDED_EXERCISE_PATTERNS = [/^power\s+squats?$/i];
const RESERVED_EXERCISE_HEADERS = new Set([
  "load", "notes", "reps", "rest", "sets", "volume", "weight",
]);

export function resolveTrainingExerciseIdentity(value, { workoutFocus = null } = {}) {
  const sourceExercisePhrase = String(value ?? "").trim();
  const normalizedExercisePhrase = normalizeExercisePhrase(sourceExercisePhrase);

  if (!sourceExercisePhrase) return createUnrecognizedResolution(sourceExercisePhrase);
  if (RESERVED_EXERCISE_HEADERS.has(normalizedExercisePhrase)) {
    return createUnrecognizedResolution(
      sourceExercisePhrase,
      "A structural workout header cannot become an exercise."
    );
  }
  if (EXCLUDED_EXERCISE_PATTERNS.some((pattern) => pattern.test(sourceExercisePhrase))) {
    return createUnrecognizedResolution(sourceExercisePhrase, "Founder Alpha has not validated this exercise identity.");
  }
  if (/^iso[-\s]?lateral\s+raises?$/i.test(sourceExercisePhrase)) {
    return {
      sourceExercisePhrase,
      normalizedExercisePhrase,
      matchedAlias: null,
      canonicalExerciseId: null,
      canonicalExerciseName: null,
      matchConfidence: "low",
      matchSignals: [
        "lexical_similarity_to_lateral_raise",
        "user_history_similarity_to_iso_lateral_high_row",
        workoutFocus ? `workout_focus_${normalizeExercisePhrase(workoutFocus)}` : null,
      ].filter(Boolean),
      modifierExtraction: {},
      alternativeCandidates: ["Iso-Lateral High Row", "Lateral Raise"],
      resolutionStatus: "ambiguous",
    };
  }

  const match = findExerciseAliasMatch(normalizedExercisePhrase);
  if (!match) return createUnrecognizedResolution(sourceExercisePhrase);

  return {
    sourceExercisePhrase,
    normalizedExercisePhrase,
    matchedAlias: match.alias,
    canonicalExerciseId: match.exercise.id,
    canonicalExerciseName: match.exercise.name,
    matchConfidence: "high",
    matchSignals: ["exact_alias"],
    modifierExtraction: extractExerciseModifiers(sourceExercisePhrase, match.exercise),
    alternativeCandidates: [],
    resolutionStatus: "resolved_high_confidence",
    exercise: match.exercise,
  };
}

export function getTrainingExerciseIdentityByName(value) {
  const resolved = resolveTrainingExerciseIdentity(value);
  if (resolved.resolutionStatus !== "resolved_high_confidence") return null;
  return resolved.exercise;
}

export function getCanonicalTrainingExerciseLabel(value) {
  const resolved = resolveTrainingExerciseIdentity(value);
  return resolved.canonicalExerciseName ?? String(value ?? "").trim();
}

export function getCanonicalTrainingExerciseSlug(value) {
  const identity = getTrainingExerciseIdentityByName(value);
  return identity?.id ?? slugify(getCanonicalTrainingExerciseLabel(value));
}

export function getFounderAlphaExerciseIdentityDiagnostics(value, options = {}) {
  const { exercise: _exercise, ...diagnostics } = resolveTrainingExerciseIdentity(value, options);
  return diagnostics;
}

function exercise(id, name, aliases, equipment, bodyRegion, primaryMuscleGroups, movementPattern, options = {}) {
  return {
    aliases,
    body_region: bodyRegion,
    default_load_type: options.defaultLoadType ?? null,
    default_measurement: options.defaultMeasurement ?? null,
    equipment,
    id,
    modifiers: options.modifiers ?? [],
    movement_pattern: movementPattern,
    name,
    primary_muscle_groups: primaryMuscleGroups,
    secondary_muscle_groups: [],
  };
}

function findExerciseAliasMatch(normalizedPhrase) {
  const matches = [];
  FOUNDER_ALPHA_TRAINING_EXERCISES.forEach((candidate) => {
    [candidate.name, ...candidate.aliases].forEach((alias) => {
      const normalizedAlias = normalizeExercisePhrase(alias);
      if (normalizedPhrase === normalizedAlias) {
        matches.push({ alias, exercise: candidate, score: normalizedAlias.length });
      }
    });
  });

  return matches.sort((left, right) => right.score - left.score)[0] ?? null;
}

function extractExerciseModifiers(sourceExercisePhrase, exerciseIdentity) {
  const text = String(sourceExercisePhrase ?? "").toLowerCase();
  const modifiers = {};

  if (exerciseIdentity?.id.startsWith("leg_press") && /\bfeet\b|\bfoot\b|\bmiddle\b|\bhigh\b|\blow\b/.test(text)) {
    if (/\bmiddle\b/.test(text)) modifiers.foot_position = "middle";
    if (/\bhigh\b/.test(text)) modifiers.foot_position = "high";
    if (/\blow\b/.test(text)) modifiers.foot_position = "low";
  }
  if (
    ["smith_machine_reverse_lunge", "dumbbell_reverse_lunge"].includes(exerciseIdentity?.id) &&
    /\bdeficit\b/.test(text)
  ) {
    modifiers.deficit = true;
  }

  return modifiers;
}

function createUnrecognizedResolution(sourceExercisePhrase, reason = "No canonical Founder Alpha exercise alias matched.") {
  return {
    sourceExercisePhrase,
    normalizedExercisePhrase: normalizeExercisePhrase(sourceExercisePhrase),
    matchedAlias: null,
    canonicalExerciseId: null,
    canonicalExerciseName: null,
    matchConfidence: "low",
    matchSignals: [],
    modifierExtraction: {},
    alternativeCandidates: [],
    resolutionStatus: "unrecognized",
    reason,
  };
}

export function normalizeExercisePhrase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bez\b/g, "ez")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
