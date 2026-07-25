export const STRATEGY_EDITOR_TYPES = Object.freeze(["briefings", "nutrition", "training"]);
export const NUTRITION_APPROACH_OPTIONS = Object.freeze({
  calorieStrategy: ["increase_gradually", "hold_steady", "reduce_gradually"],
  carbohydrateStrategy: ["performance", "balanced", "lower_carbohydrate"],
  fatStrategy: ["sustainable_minimum", "balanced", "higher_fat"],
});
export const TRAINING_AREAS = Object.freeze([
  "arms", "core", "lower_body", "back", "chest", "shoulders",
]);
export const TRAINING_PROGRESSION_OPTIONS = Object.freeze(["conservative", "moderate", "aggressive"]);
export const TRAINING_PHASE_OPTIONS = Object.freeze(["maintenance", "lean_mass_build", "cut"]);

export function createStrategyEditorModel({ protocol, strategyType, version }) {
  if (!protocol || !version || !["nutrition", "training"].includes(strategyType)) return null;
  if (strategyType === "nutrition") {
    const strategy = nutritionStrategy(protocol, version);
    return {
      strategyType,
      protocolId: protocol.id,
      title: "Edit Nutrition Strategy",
      proteinBasis: strategy.proteinBasis === "fixed_grams" ? "fixed_grams" : "body_weight",
      proteinRatio: positive(strategy.proteinRatio) ?? 1,
      fixedProtein: positive(strategy.fixedProtein ?? strategy.proteinTarget) ?? null,
      calorieStrategy: strategy.calorieStrategy ?? "increase_gradually",
      carbohydrateStrategy: strategy.carbohydrateStrategy ?? "performance",
      fatStrategy: strategy.fatStrategy ?? "sustainable_minimum",
      options: NUTRITION_APPROACH_OPTIONS,
    };
  }
  const strategy = version.trainingStrategy ?? {};
  const frequencies = Object.fromEntries(TRAINING_AREAS.map((area) => [
    area,
    nonNegative(strategy.weeklyFrequencies?.[area]) ?? 0,
  ]));
  return {
    strategyType,
    protocolId: protocol.id,
    title: "Edit Training Strategy",
    frequencies,
    weeklySessionTarget: Object.values(frequencies).reduce((sum, value) => sum + value, 0),
    priorities: strategy.physiquePriorities ?? [],
    progression: strategy.progression?.pace ?? "moderate",
    phase: strategy.nutritionPhase ?? "maintenance",
    options: {
      areas: TRAINING_AREAS,
      progression: TRAINING_PROGRESSION_OPTIONS,
      phases: TRAINING_PHASE_OPTIONS,
    },
  };
}

export function buildStrategySuccessorPayload({ form, protocol, strategyType, version }) {
  if (!protocol || !version) return invalid("This strategy is no longer available.");
  if (strategyType === "nutrition") return buildNutrition({ form, protocol, version });
  if (strategyType === "training") return buildTraining({ form, version });
  return invalid("This strategy cannot be edited here.");
}

export function strategyEditorMessage(outcome) {
  return ({
    unchanged_successor: "No changes to save.",
    duplicate_successor: "This strategy has already been saved.",
    expected_version_conflict: "This strategy changed while you were editing it. Review the latest version and try again.",
    invalid_successor: "Review the highlighted fields and try again.",
    goal_or_provenance_invalid: "This strategy could not be validated for the current Goal.",
    persistence_failure: "We could not save this strategy. Nothing was changed.",
    rollback_failure: "We could not confirm this strategy update. Review the current strategy before trying again.",
  })[outcome] ?? "We could not save this strategy. Nothing was changed.";
}

export function coachingUpdatesEditorMessage(outcome) {
  return ({
    unchanged_configuration: "No changes to save.",
    duplicate_configuration: "These coaching settings have already been saved.",
    expected_version_conflict: "Your coaching schedule changed while you were editing it. Review the latest settings and try again.",
    invalid_midweek_schedule: "Review the selected coaching schedule and try again.",
    invalid_weekly_schedule: "Review the selected coaching schedule and try again.",
    daily_not_permitted: "Routine Daily Briefings are not available for this Goal.",
    no_routine_surface: "Keep at least one coaching update enabled.",
    invalid_notification_preference: "Choose how you want to receive coaching updates.",
    invalid_goal_policy: "These coaching settings are not available for the current Goal.",
    scheduler_application_failure: "We could not update your coaching schedule. Nothing was changed.",
    home_resolution_failure: "We could not update your coaching schedule. Nothing was changed.",
    verification_failure: "We could not confirm your coaching schedule. Nothing was changed.",
    concurrency_conflict: "Your coaching schedule changed while you were editing it. Review the latest settings and try again.",
    persistence_failure: "We could not update your coaching schedule. Nothing was changed.",
    rollback_failure: "We could not confirm your coaching schedule. Review the current settings before trying again.",
  })[outcome] ?? "We could not update your coaching schedule. Nothing was changed.";
}

export function nutritionStrategy(protocol, version) {
  return structuredClone(
    version?.effectiveStrategy ??
    version?.change?.reviewedChanges ??
    protocol?.effectiveStrategy ??
    {},
  );
}

function buildNutrition({ form, protocol, version }) {
  const basis = text(form, "proteinBasis");
  if (!["body_weight", "fixed_grams"].includes(basis)) return invalid("Choose a protein target method.");
  const ratio = number(form, "proteinRatio");
  const fixed = number(form, "fixedProtein");
  if (basis === "body_weight" && (!ratio || ratio < 0.5 || ratio > 2)) {
    return invalid("Enter a multiplier between 0.5 and 2.");
  }
  if (basis === "fixed_grams" && (!fixed || fixed < 50 || fixed > 400)) {
    return invalid("Enter a daily protein target between 50 and 400 grams.");
  }
  const approaches = {};
  for (const [field, options] of Object.entries(NUTRITION_APPROACH_OPTIONS)) {
    const value = text(form, field);
    if (!options.includes(value)) return invalid(`Choose a valid ${field}.`);
    approaches[field] = value;
  }
  const current = nutritionStrategy(protocol, version);
  const effectiveStrategy = {
    ...current,
    proteinBasis: basis,
    proteinRatio: basis === "body_weight" ? ratio : null,
    fixedProtein: basis === "fixed_grams" ? fixed : current.fixedProtein,
    proteinTarget: basis === "fixed_grams" ? fixed : current.proteinTarget,
    ...approaches,
  };
  if (sameNutritionStrategy(current, effectiveStrategy)) {
    return { valid: false, outcome: "unchanged_successor", error: "No changes to save." };
  }
  return valid({
    ...structuredClone(version),
    intent: version.intent?.summary
      ? structuredClone(version.intent)
      : { summary: "Support the active Goal with the current Nutrition strategy." },
    effectiveStrategy,
  });
}

function buildTraining({ form, version }) {
  const weeklyFrequencies = {};
  for (const area of TRAINING_AREAS) {
    const value = number(form, `frequency_${area}`);
    if (!Number.isInteger(value) || value < 0 || value > 7) {
      return invalid("Weekly area targets must be whole numbers from 0 to 7.");
    }
    weeklyFrequencies[area] = value;
  }
  if (Object.values(weeklyFrequencies).reduce((sum, value) => sum + value, 0) < 1) {
    return invalid("Add at least one weekly area session.");
  }
  const priorities = values(form, "priorities").filter((item) => TRAINING_AREAS.includes(item));
  if (!priorities.length) return invalid("Choose at least one prioritized muscle group.");
  const progression = text(form, "progression");
  const phase = text(form, "phase");
  if (!TRAINING_PROGRESSION_OPTIONS.includes(progression) || !TRAINING_PHASE_OPTIONS.includes(phase)) {
    return invalid("Choose supported progression and phase values.");
  }
  const current = version.trainingStrategy ?? {};
  const nextStrategy = {
    ...current,
    weeklyFrequencies,
    physiquePriorities: priorities,
    progression: { ...(current.progression ?? {}), pace: progression },
    nutritionPhase: phase,
  };
  if (JSON.stringify(current) === JSON.stringify(nextStrategy)) {
    return { valid: false, outcome: "unchanged_successor", error: "No changes to save." };
  }
  return valid({
    ...structuredClone(version),
    trainingStrategy: nextStrategy,
  });
}

function text(form, key) { return String(form.get(key) ?? ""); }
function values(form, key) { return form.getAll(key).map(String); }
function number(form, key) { const value = Number(form.get(key)); return Number.isFinite(value) ? value : null; }
function positive(value) { const result = Number(value); return Number.isFinite(result) && result > 0 ? result : null; }
function nonNegative(value) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : null; }
function sameNutritionStrategy(left, right) {
  return ["proteinBasis", "proteinRatio", "fixedProtein", "proteinTarget",
    "calorieStrategy", "carbohydrateStrategy", "fatStrategy"]
    .every((field) => JSON.stringify(left[field] ?? null) === JSON.stringify(right[field] ?? null));
}
function invalid(error) { return { valid: false, error }; }
function valid(successorVersion) { return { valid: true, successorVersion }; }
