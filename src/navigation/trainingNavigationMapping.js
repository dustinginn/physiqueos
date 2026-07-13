export const TRAINING_NAVIGATION_CATEGORIES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
];

const EXPLICIT_EXERCISE_NAVIGATION_CATEGORIES = {
  "barbell-front-raises": "shoulders",
  "bench-press": "chest",
  "cable-crunch": "core",
  "cable-crunches": "core",
  "cable-rope-pushdown": "triceps",
  "cable-rope-pushdowns": "triceps",
  "cable-rope-push-down": "triceps",
  "cable-rope-push-downs": "triceps",
  "cable-straight-bar-pushdown": "triceps",
  "cable-straight-bar-pushdowns": "triceps",
  "cable-straight-bar-push-down": "triceps",
  "cable-straight-bar-push-downs": "triceps",
  "cable-machine-seated-mid-cable-row": "back",
  "ez-bar-curls": "biceps",
  "forearm-curl": "biceps",
  "forearm-curls": "biceps",
  "hanging-leg-raise": "core",
  "hanging-leg-raises": "core",
  "high-row-machine": "back",
  "incline-bench-press": "chest",
  "incline-dumbbell-press": "chest",
  "iso-lateral-high-row": "back",
  "lateral-raise-machine": "shoulders",
  "lateral-raises-machine": "shoulders",
  "hip-abduction-machine": "glutes",
  "hip-thrust": "glutes",
  "hip-thrusts": "glutes",
  "leg-press": "quads",
  "leg-press-high-and-narrow": "hamstrings",
  "leg-press-high-and-narrow-feet": "hamstrings",
  "machine-lateral-raise": "shoulders",
  "machine-lateral-raises": "shoulders",
  plank: "core",
  planks: "core",
  "chest-fly": "chest",
  "chest-fly-machine": "chest",
  "chest-flies": "chest",
  "chest-flies-machine": "chest",
  "seated-cable-row": "back",
  "seated-cable-rows": "back",
  "seated-abduction": "glutes",
  "seated-abductions": "glutes",
  "shoulder-press-machine": "shoulders",
  "spider-curl": "biceps",
  "spider-curls": "biceps",
  "reverse-curl": "biceps",
  "reverse-curls": "biceps",
  "reverse-wrist-curl": "biceps",
  "reverse-wrist-curls": "biceps",
  squat: "quads",
  "sumo-squat": "glutes",
  "sumo-squat-machine": "glutes",
  "wrist-curl": "biceps",
  "wrist-curls": "biceps",
  "triceps-pushdown": "triceps",
  "triceps-pushdowns": "triceps",
  "triceps-push-down": "triceps",
  "triceps-push-downs": "triceps",
};

const REGION_NAVIGATION_CATEGORIES = {
  back: "back",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  core: "core",
  glutes: "glutes",
  hamstrings: "hamstrings",
  quads: "quads",
  shoulders: "shoulders",
  triceps: "triceps",
};

const FAMILY_NAVIGATION_CATEGORIES = {
  curl: "biceps",
  "flat-press": "chest",
  "front-raises": "shoulders",
  "horizontal-row": "back",
  "hip-abduction": "glutes",
  "hip-thrust": "glutes",
  "leg-press": "quads",
  "lateral-raises": "shoulders",
  "shoulder-press": "shoulders",
  squat: "quads",
  "sumo-squat": "glutes",
  "vertical-pull": "back",
};

export function withPrimaryTrainingNavigationCategory(exercise = {}) {
  const resolution = resolvePrimaryTrainingNavigationCategory(exercise);

  return {
    ...exercise,
    navigationCategoryConfidence: resolution.confidence,
    navigationCategorySource: resolution.source,
    primaryNavigationCategory: resolution.primaryNavigationCategory,
  };
}

export function getPrimaryTrainingNavigationGroup(exercise = {}) {
  return resolvePrimaryTrainingNavigationCategory(exercise).primaryNavigationCategory;
}

export function resolvePrimaryTrainingNavigationCategory(exercise = {}) {
  const labelSlug = slugify(exercise.label);
  const familySlug = slugify(exercise.familyLabel);
  const regionSlug = slugify(exercise.regionLabel);
  const primaryMuscleSlugs = (exercise.primaryMuscleGroups ?? []).map(slugify);
  const existingNavigationCategory = normalizeNavigationCategory(
    exercise.primaryNavigationCategory ?? exercise.navigationCategory
  );

  if (existingNavigationCategory) {
    return {
      confidence: "high",
      primaryNavigationCategory: existingNavigationCategory,
      source: "exercise_navigation_category",
    };
  }

  if (hasHamstringBiasedLegPressVariation(exercise)) {
    return {
      confidence: "high",
      primaryNavigationCategory: "hamstrings",
      source: "variation_mapping",
    };
  }

  if (EXPLICIT_EXERCISE_NAVIGATION_CATEGORIES[labelSlug]) {
    return {
      confidence: "high",
      primaryNavigationCategory: EXPLICIT_EXERCISE_NAVIGATION_CATEGORIES[labelSlug],
      source: "explicit_exercise_mapping",
    };
  }

  if (FAMILY_NAVIGATION_CATEGORIES[familySlug]) {
    return {
      confidence: "high",
      primaryNavigationCategory: FAMILY_NAVIGATION_CATEGORIES[familySlug],
      source: "movement_family_mapping",
    };
  }

  const primaryMuscleGroup = primaryMuscleSlugs.find(
    (muscle) => REGION_NAVIGATION_CATEGORIES[muscle]
  );

  if (primaryMuscleGroup) {
    return {
      confidence: "medium",
      primaryNavigationCategory: REGION_NAVIGATION_CATEGORIES[primaryMuscleGroup],
      source: "primary_muscle_mapping",
    };
  }

  if (REGION_NAVIGATION_CATEGORIES[regionSlug]) {
    return {
      confidence: "medium",
      primaryNavigationCategory: REGION_NAVIGATION_CATEGORIES[regionSlug],
      source: "region_mapping",
    };
  }

  const fallbackCategory = getFallbackNavigationCategory({
    familySlug,
    labelSlug,
  });

  return {
    confidence: fallbackCategory ? "low" : "unmapped",
    primaryNavigationCategory: fallbackCategory,
    source: fallbackCategory ? "conservative_name_fallback" : "unmapped",
  };
}

function hasHamstringBiasedLegPressVariation(exercise = {}) {
  const text = [
    exercise.label,
    exercise.name,
    exercise.canonicalName,
    exercise.familyLabel,
    exercise.variation,
    exercise.variant,
    exercise.notes,
    exercise.sourceText,
    exercise.originalText,
    exercise.detail,
    ...(exercise.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!/\bleg\s+press\b/.test(text)) return false;

  return (
    /\bhigh(?:er)?\b/.test(text) &&
    /\bnarrow\b|\bclose\s+stance\b|\bfeet\s+close\b/.test(text)
  );
}

function getFallbackNavigationCategory({ familySlug, labelSlug }) {
  const text = `${labelSlug} ${familySlug}`;

  if (/\bbench|pec|flye?|incline-press|decline-press|flat-press\b/.test(text)) {
    return "chest";
  }
  if (/\bshoulder|overhead|lateral-raise|front-raise\b/.test(text)) {
    return "shoulders";
  }
  if (/\bcurl|biceps?\b/.test(text)) return "biceps";
  if (/\btriceps?|pressdown|pushdown|skull-crusher\b/.test(text)) {
    return "triceps";
  }
  if (/\brow|pull-up|pulldown|lat\b/.test(text)) return "back";
  if (/\bcore|abs?|leg-raise|hanging|crunch|plank\b/.test(text)) return "core";
  if (/\bquad|squat|leg-extension\b/.test(text)) return "quads";
  if (/\bhamstring|leg-curl|rdl\b/.test(text)) return "hamstrings";
  if (/\bglute|hip-thrust|bridge\b/.test(text)) return "glutes";
  if (/\bcalf|calves\b/.test(text)) return "calves";

  return null;
}

function normalizeNavigationCategory(value) {
  const slug = slugify(value);

  return TRAINING_NAVIGATION_CATEGORIES.includes(slug) ? slug : null;
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
