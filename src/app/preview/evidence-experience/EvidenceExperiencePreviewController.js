export const EVIDENCE_EXPERIENCE_STATES = Object.freeze({
  CAPTURE: "capture",
  UPLOADING: "uploading",
  REVIEWING: "reviewing",
  CONFIRM: "confirm",
  EDIT: "edit",
  SAVING: "saving",
  RECOGNITION: "recognition",
  COMPLETE: "complete",
});

export const EVIDENCE_EXPERIENCE_TIMING = Object.freeze({
  REVIEWING: 400,
  CONFIRM: 1600,
  RECOGNITION: 500,
  COMPLETE: 1300,
});

export const EVIDENCE_EXPERIENCE_OUTCOMES = Object.freeze({
  PERSONAL_BEST: "personal_best",
  WORKOUT_SAVED: "workout_saved",
  PROTEIN_TARGET: "protein_target",
  NUTRITION_SAVED: "nutrition_saved",
});

export const EVIDENCE_EXPERIENCE_TYPES = Object.freeze({
  WORKOUT: "workout",
  NUTRITION: "nutrition",
});

export function getPreviewOutcomeOptions(evidenceType) {
  return evidenceType === EVIDENCE_EXPERIENCE_TYPES.NUTRITION
    ? Object.freeze([
      Object.freeze({
        label: "Protein Target",
        value: EVIDENCE_EXPERIENCE_OUTCOMES.PROTEIN_TARGET,
      }),
      Object.freeze({
        label: "Nutrition Saved",
        value: EVIDENCE_EXPERIENCE_OUTCOMES.NUTRITION_SAVED,
      }),
    ])
    : Object.freeze([
      Object.freeze({
        label: "Personal Best",
        value: EVIDENCE_EXPERIENCE_OUTCOMES.PERSONAL_BEST,
      }),
      Object.freeze({
        label: "Workout Saved",
        value: EVIDENCE_EXPERIENCE_OUTCOMES.WORKOUT_SAVED,
      }),
    ]);
}

export function getPreviewOutcomeResult(outcome, context = {}) {
  if (outcome === EVIDENCE_EXPERIENCE_OUTCOMES.PROTEIN_TARGET) {
    return Object.freeze({
      title: "Protein Target Reached",
      body: `You finished the day with ${context.protein ?? "174"} g of protein.`,
      tone: "progress",
    });
  }
  if (outcome === EVIDENCE_EXPERIENCE_OUTCOMES.NUTRITION_SAVED) {
    return Object.freeze({
      title: "Nutrition Saved",
      body: "Your nutrition for the day has been added to your progress.",
      tone: "quiet_success",
    });
  }
  if (outcome === EVIDENCE_EXPERIENCE_OUTCOMES.WORKOUT_SAVED) {
    return Object.freeze({
      title: "Workout Saved",
      body: "Your workout has been added to your progress.",
      tone: "quiet_success",
    });
  }
  return Object.freeze({
    title: "New Incline Bench Press Personal Best",
    body: "185 lb × 8 is your strongest recorded set.",
    tone: "progress",
  });
}

export function createPreviewWorkout(date) {
  return Object.freeze({
    workoutType: "Outdoor Walk",
    date,
    startTime: "11:25 AM",
    endTime: "11:40 AM",
    durationMinutes: "15",
    distanceMiles: "0.96",
    activeCalories: "116",
    totalCalories: "141",
    averageHeartRate: "111",
    averagePace: "15:34",
    elevationGainFeet: "5",
    effort: "Easy",
  });
}

export function updatePreviewWorkout(workout, changes = {}) {
  return Object.freeze({ ...workout, ...changes });
}

export function createPreviewNutritionDay(date) {
  return Object.freeze({
    date,
    calories: "2080",
    protein: "174",
    carbohydrates: "188",
    fat: "68",
    mealCount: "4",
    meals: Object.freeze([
      createPreviewMeal("Breakfast", "Greek Yogurt Bowl", "420", "38", "46", "10"),
      createPreviewMeal("Lunch", "Chicken Sandwich", "560", "48", "52", "18"),
      createPreviewMeal("Dinner", "Salmon, Rice, and Vegetables", "760", "58", "70", "28"),
      createPreviewMeal("Snacks", "Protein Shake and Fruit", "340", "30", "20", "12"),
    ]),
  });
}

export function updatePreviewNutritionDay(day, changes = {}) {
  return Object.freeze({
    ...day,
    ...changes,
    meals: Object.freeze((changes.meals ?? day.meals).map((meal) =>
      Object.freeze({ ...meal })
    )),
  });
}

function createPreviewMeal(slot, name, calories, protein, carbohydrates, fat) {
  return Object.freeze({
    slot,
    name,
    calories,
    protein,
    carbohydrates,
    fat,
  });
}

export function isHistoricalPreviewDate(selectedDate, todayDate) {
  return Boolean(selectedDate && todayDate && selectedDate !== todayDate);
}

export function formatPreviewEvidenceDate(date, locale) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

export function createEvidenceExperiencePreviewSequence({
  onStateChange,
  schedule = globalThis.setTimeout,
  cancelSchedule = globalThis.clearTimeout,
} = {}) {
  if (typeof onStateChange !== "function") {
    throw new TypeError("Preview sequence requires an onStateChange callback.");
  }

  let timers = [];
  let active = false;
  let currentState = EVIDENCE_EXPERIENCE_STATES.CAPTURE;

  function cancel() {
    timers.forEach((timer) => cancelSchedule(timer));
    timers = [];
    active = false;
  }

  function start() {
    cancel();
    active = true;
    publish(EVIDENCE_EXPERIENCE_STATES.UPLOADING);
    timers = [
      schedule(() => advance(EVIDENCE_EXPERIENCE_STATES.REVIEWING), EVIDENCE_EXPERIENCE_TIMING.REVIEWING),
      schedule(() => {
        advance(EVIDENCE_EXPERIENCE_STATES.CONFIRM);
        active = false;
        timers = [];
      }, EVIDENCE_EXPERIENCE_TIMING.CONFIRM),
    ];
  }

  function confirm() {
    cancel();
    if (currentState !== EVIDENCE_EXPERIENCE_STATES.CONFIRM) return false;
    active = true;
    publish(EVIDENCE_EXPERIENCE_STATES.SAVING);
    timers = [
      schedule(() => advance(EVIDENCE_EXPERIENCE_STATES.RECOGNITION), EVIDENCE_EXPERIENCE_TIMING.RECOGNITION),
      schedule(() => {
        advance(EVIDENCE_EXPERIENCE_STATES.COMPLETE);
        active = false;
        timers = [];
      }, EVIDENCE_EXPERIENCE_TIMING.COMPLETE),
    ];
    return true;
  }

  function advance(state) {
    if (active) publish(state);
  }

  function publish(state) {
    currentState = state;
    onStateChange(state);
  }

  return Object.freeze({ start, confirm, cancel });
}
