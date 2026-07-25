import {
  cadenceSummary,
  validateDexaCadencePayload,
  validatePhotoCadencePayload,
} from "./protocolCadencePresentation";

const WATCH_SIGNALS = "Weight trend, training performance, recovery, and progress photos";

export function presentProtocolTransitionPlan(category, payload = {}, context = {}) {
  const displayName = context.displayName ?? displayCategory(category);
  const registry = {
    energy: presentEnergy,
    nutrition: presentNutrition,
    activity: presentActivity,
    training: presentTraining,
    briefings: presentBriefings,
    recovery: () => simple("Recovery approach", "Continue the recovery routine that supports training quality, sleep, and sustainable workload."),
    weight: () => simple("Tracking rhythm", "Record morning weight and use the weekly trend to guide decisions."),
    photos: presentPhotos,
    dexa: presentDexa,
    peptide: () => simple("Schedule", ({ weekly: "Once weekly", five_nights: "Sunday through Thursday nights", keep_current: "Keep the current schedule" })[payload.scheduleChoice] ?? "Keep the current schedule"),
    supplement: () => simple("Schedule", ({ daily: "Daily", every_other_day: "Every other day", keep_current: "Keep the current schedule" })[payload.scheduleChoice] ?? "Keep the current schedule"),
    medication: () => simple("Medication plan", "Carry the reviewed medication approach into the new goal."),
  };
  const sections = (registry[category] ?? (() => simple("Plan", `Carry the reviewed ${displayName.toLowerCase()} approach into the new goal.`)))();
  return {
    title: `Your new ${displayName} plan`,
    sections: sections.map((section, index) => ({ ...section, order: index + 1 })),
    footer: "This plan will be used for your new goal after the full transition is confirmed.",
  };

  function presentEnergy() {
    const calories = payload.calorieStrategy === "estimated_maintenance"
      ? "Begin near estimated maintenance and adjust from the overall trend."
      : "Increase calories gradually from your recent cut intake.";
    const activity = payload.activityStrategy === "reduce_slightly"
      ? "Reduce cardio slightly while observing weight, training, and recovery."
      : "Keep your current activity level initially while observing how your body responds.";
    return [
      section("begin", "How we’ll begin", "Maintenance calibration"),
      section("calories", "Calories", calories),
      section("activity", "Activity", activity),
      section("review", "Review rhythm", "Evaluate the overall trend each week rather than reacting to individual days."),
      section("watch", "What we’ll watch", WATCH_SIGNALS),
      section("learning", "What we’re still learning", "Your true maintenance intake and the balance of calories and activity that best supports lean-mass growth."),
    ];
  }

  function presentNutrition() {
    const protein = payload.proteinBasis === "fixed"
      ? section("protein", "Protein", `${payload.fixedProtein ?? payload.proteinTarget ?? 180} g per day`)
      : section("protein", "Protein", `${payload.proteinRatio ?? 1} g per pound of body weight`, `About ${payload.proteinTarget ?? Math.round((context.openingBaseline?.dexaWeight ?? 180) * (payload.proteinRatio ?? 1))} g per day`);
    const calories = payload.calorieStrategy === "estimated_maintenance"
      ? "Begin near estimated maintenance"
      : payload.calorieStrategy === "custom"
        ? "Use the reviewed custom calorie range"
        : "Increase gradually alongside maintenance calibration";
    const carbohydrates = ({ balanced: "Use a balanced carbohydrate approach", lower: "Use a lower-carbohydrate approach", performance: "Prioritize training performance" })[payload.carbohydrateStrategy] ?? "Prioritize training performance";
    const fats = payload.fatStrategy === "fixed" ? "Use the reviewed fixed fat target" : "Maintain a sustainable minimum";
    const flexibility = payload.trainingDayFlexibility || payload.restDayFlexibility
      ? "Allow different targets where training and rest days benefit from flexibility"
      : "Use the same targets across training and rest days";
    return [protein, section("calories", "Calories", calories), section("carbohydrates", "Carbohydrates", carbohydrates), section("fats", "Fats", fats), section("flexibility", "Flexibility", flexibility)];
  }

  function presentActivity() {
    const approach = ({ reduce_slightly: "Reduce activity slightly while observing response", flexible: "Use a flexible weekly activity target", keep_current: "Keep current activity while observing response" })[payload.activityStrategy] ?? "Keep current activity while observing response";
    const frequency = ({ as_needed: "as needed", two: "twice per week", three: "three times per week" })[payload.cardioFrequency] ?? "as needed";
    const duration = payload.cardioDuration === "flexible" || !payload.cardioDuration ? "with flexible duration" : `for ${payload.cardioDuration} minutes`;
    return [section("approach", "Starting approach", approach), section("cardio", "Cardio", `Schedule cardio ${frequency}, ${duration}.`), section("review", "Review", "Evaluate weekly alongside calorie intake, training, and recovery.")];
  }

  function presentTraining() {
    const priority = payload.priorities?.length ? `Increase emphasis for ${payload.priorities.join(", ")}.` : "Keep emphasis balanced until a specific priority is selected.";
    const progression = ({ targeted_volume: "Add targeted weekly volume while monitoring recovery.", exercise_selection: "Adjust exercise selection where it better supports the selected priorities.", keep_structure: "Continue progressive overload within the current structure." })[payload.trainingEmphasis] ?? "Continue progressive overload within the current structure.";
    return [section("structure", "Training structure", payload.structure ?? "Keep the current split"), section("priority", "Priority", priority), section("progression", "Progression", progression)];
  }

  function presentBriefings() {
    const days = payload.days?.length ? payload.days.join(" and ") : "Wednesday and Sunday";
    return [section("rhythm", "Coaching rhythm", `${payload.cadence ?? "Twice weekly"}, on ${days}`), section("evidence", "Daily evidence", "Continue collecting daily evidence between coaching updates.")];
  }

  function presentPhotos() {
    const validation = validatePhotoCadencePayload(payload);
    if (!validation.valid) throw new Error(validation.message);
    return [
      section("schedule", "Schedule", cadenceSummary(payload)),
      section("purpose", "What the photos will help us see", "Track physique changes, identify where new size is being added, and monitor whether body fat remains within the goal’s guardrail."),
      section("comparison", "Comparison approach", "Use consistent poses and similar conditions so changes remain meaningful over time."),
    ];
  }

  function presentDexa() {
    const validation = validateDexaCadencePayload(payload);
    if (!validation.valid) throw new Error(validation.message);
    return [
      section("schedule", "Schedule", cadenceSummary(payload)),
      section("measure", "What we’ll measure", "Lean mass, fat mass, and body-fat percentage"),
      section("purpose", "Why it matters", "DEXA will be the primary way we confirm that lean mass is increasing while body fat remains within the goal’s guardrail."),
    ];
  }
}

function section(id, label, primaryValue, supportingText) {
  return { id, label, primaryValue, ...(supportingText ? { supportingText } : {}) };
}

function simple(label, value) {
  return [section("plan", label, value)];
}

function displayCategory(category) {
  return ({
    energy: "Energy Balance",
    nutrition: "Nutrition",
    training: "Training",
    activity: "Activity",
    recovery: "Recovery",
    weight: "Weight Tracking",
    photos: "Progress Photos",
    dexa: "DEXA",
    briefings: "Coaching Updates",
    medication: "Medication",
    peptide: "Peptide",
    supplement: "Supplement",
  })[category] ?? "Protocol";
}
