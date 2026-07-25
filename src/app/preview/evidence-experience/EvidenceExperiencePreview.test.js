import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceExperiencePreviewSequence,
  createPreviewNutritionDay,
  createPreviewWorkout,
  EVIDENCE_EXPERIENCE_OUTCOMES,
  EVIDENCE_EXPERIENCE_STATES,
  EVIDENCE_EXPERIENCE_TYPES,
  formatPreviewEvidenceDate,
  getPreviewOutcomeOptions,
  getPreviewOutcomeResult,
  isHistoricalPreviewDate,
  updatePreviewNutritionDay,
  updatePreviewWorkout,
} from "./EvidenceExperiencePreviewController";

const componentSource = fs.readFileSync(
  new URL("./EvidenceExperiencePreview.jsx", import.meta.url),
  "utf8"
);
const controllerSource = fs.readFileSync(
  new URL("./EvidenceExperiencePreviewController.js", import.meta.url),
  "utf8"
);
const routeSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const productionRouteSource = fs.readFileSync(
  new URL("../../log/page.js", import.meta.url),
  "utf8"
);

describe("Evidence Experience preview isolation", () => {
  it("stops at Confirm Workout after reviewing and never reaches recognition automatically", () => {
    vi.useFakeTimers();
    const states = [];
    const sequence = createEvidenceExperiencePreviewSequence({
      onStateChange: (state) => states.push(state),
    });

    sequence.start();
    expect(states).toEqual([EVIDENCE_EXPERIENCE_STATES.UPLOADING]);
    vi.advanceTimersByTime(400);
    expect(states.at(-1)).toBe(EVIDENCE_EXPERIENCE_STATES.REVIEWING);
    vi.advanceTimersByTime(1200);
    expect(states.at(-1)).toBe(EVIDENCE_EXPERIENCE_STATES.CONFIRM);
    vi.runAllTimers();
    expect(states).not.toContain(EVIDENCE_EXPERIENCE_STATES.RECOGNITION);
    vi.useRealTimers();
  });

  it("allows Saving and Recognition only after explicit confirmation", () => {
    vi.useFakeTimers();
    const states = [];
    const sequence = createEvidenceExperiencePreviewSequence({
      onStateChange: (state) => states.push(state),
    });

    expect(sequence.confirm()).toBe(false);
    sequence.start();
    vi.advanceTimersByTime(1600);
    expect(sequence.confirm()).toBe(true);
    expect(states.at(-1)).toBe(EVIDENCE_EXPERIENCE_STATES.SAVING);
    vi.advanceTimersByTime(500);
    expect(states.at(-1)).toBe(EVIDENCE_EXPERIENCE_STATES.RECOGNITION);
    vi.advanceTimersByTime(800);
    expect(states.at(-1)).toBe(EVIDENCE_EXPERIENCE_STATES.COMPLETE);
    vi.useRealTimers();
  });

  it("defaults to Personal Best and offers a quiet non-milestone save result", () => {
    expect(EVIDENCE_EXPERIENCE_TYPES.WORKOUT).toBe("workout");
    expect(EVIDENCE_EXPERIENCE_OUTCOMES.PERSONAL_BEST).toBe("personal_best");
    expect(getPreviewOutcomeResult()).toEqual({
      title: "New Incline Bench Press Personal Best",
      body: "185 lb × 8 is your strongest recorded set.",
      tone: "progress",
    });
    const saved = getPreviewOutcomeResult(
      EVIDENCE_EXPERIENCE_OUTCOMES.WORKOUT_SAVED
    );
    expect(saved).toEqual({
      title: "Workout Saved",
      body: "Your workout has been added to your progress.",
      tone: "quiet_success",
    });
    expect(`${saved.title} ${saved.body}`).not.toMatch(
      /personal best|milestone|improv|record|trend|recommend/i
    );
  });

  it("provides deterministic Nutrition Day data and Nutrition-specific outcomes", () => {
    const nutrition = createPreviewNutritionDay("2026-07-04");
    expect(nutrition).toMatchObject({
      date: "2026-07-04",
      calories: "2080",
      protein: "174",
      carbohydrates: "188",
      fat: "68",
      mealCount: "4",
    });
    expect(nutrition.meals).toHaveLength(4);
    expect(nutrition.meals.map((meal) => meal.slot)).toEqual([
      "Breakfast", "Lunch", "Dinner", "Snacks",
    ]);
    expect(getPreviewOutcomeOptions(EVIDENCE_EXPERIENCE_TYPES.NUTRITION)).toEqual([
      { label: "Protein Target", value: EVIDENCE_EXPERIENCE_OUTCOMES.PROTEIN_TARGET },
      { label: "Nutrition Saved", value: EVIDENCE_EXPERIENCE_OUTCOMES.NUTRITION_SAVED },
    ]);
    expect(getPreviewOutcomeOptions(EVIDENCE_EXPERIENCE_TYPES.NUTRITION)
      .map((option) => option.label)).not.toContain("Personal Best");
    expect(getPreviewOutcomeResult(
      EVIDENCE_EXPERIENCE_OUTCOMES.PROTEIN_TARGET,
      nutrition
    )).toMatchObject({
      title: "Protein Target Reached",
      body: "You finished the day with 174 g of protein.",
    });
    const saved = getPreviewOutcomeResult(
      EVIDENCE_EXPERIENCE_OUTCOMES.NUTRITION_SAVED
    );
    expect(saved).toMatchObject({
      title: "Nutrition Saved",
      body: "Your nutrition for the day has been added to your progress.",
    });
    expect(`${saved.title} ${saved.body}`).not.toMatch(
      /target|milestone|improv|record|trend|recommend/i
    );
  });

  it("cancels pending work during reset, resubmission, or navigation", () => {
    vi.useFakeTimers();
    const states = [];
    const sequence = createEvidenceExperiencePreviewSequence({
      onStateChange: (state) => states.push(state),
    });

    sequence.start();
    sequence.cancel();
    vi.runAllTimers();
    expect(states).toEqual([EVIDENCE_EXPERIENCE_STATES.UPLOADING]);

    sequence.start();
    sequence.start();
    vi.runAllTimers();
    expect(states.filter((state) => state === EVIDENCE_EXPERIENCE_STATES.CONFIRM)).toHaveLength(1);
    expect(states).not.toContain(EVIDENCE_EXPERIENCE_STATES.RECOGNITION);
    vi.useRealTimers();
  });

  it("applies saved edits while a discarded draft leaves the summary unchanged", () => {
    const workout = createPreviewWorkout("2026-07-25");
    const discardedDraft = { ...workout, workoutType: "Indoor Walk" };
    expect(workout.workoutType).toBe("Outdoor Walk");
    expect(discardedDraft.workoutType).toBe("Indoor Walk");

    const updated = updatePreviewWorkout(workout, {
      workoutType: "Evening Walk",
      date: "2026-07-04",
      distanceMiles: "1.10",
    });
    expect(updated).toMatchObject({
      workoutType: "Evening Walk",
      date: "2026-07-04",
      distanceMiles: "1.10",
    });
    expect(workout).toMatchObject({
      workoutType: "Outdoor Walk",
      date: "2026-07-25",
      distanceMiles: "0.96",
    });
  });

  it("keeps Nutrition edits local and carries protein, date, and meal changes downstream", () => {
    const nutrition = createPreviewNutritionDay("2026-07-25");
    const discardedDraft = structuredClone(nutrition);
    discardedDraft.protein = "190";
    expect(nutrition.protein).toBe("174");

    const meals = nutrition.meals.map((meal, index) =>
      index === 0 ? { ...meal, name: "Updated Yogurt Bowl", protein: "42" } : meal
    );
    const updated = updatePreviewNutritionDay(nutrition, {
      date: "2026-07-04",
      calories: "2140",
      protein: "190",
      meals,
    });
    expect(updated).toMatchObject({
      date: "2026-07-04",
      calories: "2140",
      protein: "190",
    });
    expect(updated.meals[0]).toMatchObject({
      name: "Updated Yogurt Bowl",
      protein: "42",
    });
    expect(getPreviewOutcomeResult(
      EVIDENCE_EXPERIENCE_OUTCOMES.PROTEIN_TARGET,
      updated
    ).body).toBe("You finished the day with 190 g of protein.");
    expect(formatPreviewEvidenceDate(updated.date, "en-US")).toBe(
      "Saturday, July 4, 2026"
    );
  });

  it("omits context for today and formats historical dates in the user's locale", () => {
    expect(isHistoricalPreviewDate("2026-07-25", "2026-07-25")).toBe(false);
    expect(isHistoricalPreviewDate("2026-07-04", "2026-07-25")).toBe(true);
    expect(formatPreviewEvidenceDate("2026-07-04", "en-US")).toBe(
      "Saturday, July 4, 2026"
    );
  });

  it("has no production submission, networking, persistence, or repository boundary", () => {
    const previewSource = `${componentSource}\n${routeSource}`;
    expect(previewSource).not.toMatch(
      /fetch\(|server action|\/log\/upload|FounderRepositories|EvidenceIntakeService|OCR|Parser|localStorage|sessionStorage|router\.push|revalidatePath/
    );
    expect(componentSource).toContain("event.preventDefault()");
    expect(componentSource).toContain("sequenceRef.current?.start()");
    expect(componentSource).toContain("sequenceRef.current?.confirm()");
    expect(componentSource).toContain('type="button"');
  });

  it("leaves the production evidence submit path unchanged and separate", () => {
    expect(productionRouteSource).toContain('uploadAnythingAction="/log/upload"');
    expect(routeSource).not.toContain("LogHubScreen");
    expect(routeSource).not.toContain("UploadAnythingForm");
  });

  it("keeps the approved copy and reduced-motion treatment", () => {
    const previewSource = `${componentSource}\n${controllerSource}`;
    expect(previewSource).toContain("Uploading your workout…");
    expect(previewSource).toContain("Reviewing your workout");
    expect(previewSource).toContain("Does this look right?");
    expect(previewSource).toContain("Confirm workout");
    expect(previewSource).toContain("Saving your workout…");
    expect(previewSource).toContain("New Incline Bench Press Personal Best");
    expect(previewSource).toContain("185 lb × 8 is your strongest recorded set.");
    expect(previewSource).toContain("Workout Saved");
    expect(previewSource).toContain("Preview evidence type");
    expect(previewSource).toContain("Uploading your nutrition…");
    expect(previewSource).toContain("Reviewing your nutrition");
    expect(previewSource).toContain("Confirm nutrition");
    expect(previewSource).toContain("Saving your nutrition…");
    expect(previewSource).toContain("Protein Target Reached");
    expect(previewSource).toContain("Nutrition Saved");
    expect(componentSource).toContain("Preview outcome");
    expect(componentSource).toContain('type="radio"');
    expect(componentSource).toContain("setWorkout(createPreviewWorkout(initialDate))");
    expect(componentSource).toContain(
      "setPreviewOutcome(EVIDENCE_EXPERIENCE_OUTCOMES.PERSONAL_BEST)"
    );
    expect(componentSource).toContain(
      "setEvidenceType(EVIDENCE_EXPERIENCE_TYPES.WORKOUT)"
    );
    expect(componentSource).toContain("setNutritionDay(createPreviewNutritionDay(initialDate))");
    expect(componentSource).toContain("setNutritionDay(createPreviewNutritionDay(evidenceDate))");
    expect(componentSource).toContain("if (fileInputRef.current) fileInputRef.current.value =");
    expect(componentSource).toContain("(saving || canShowRecognition) && contextualDate");
    expect(componentSource).toContain("reviewing && contextualDate");
    expect(componentSource).toContain("motion-reduce:animate-none");
    expect(previewSource).not.toMatch(
      /\bprocessing\b|\bparser\b|\bparsing\b|\bOCR\b|\breconciliation\b|\bcanonicalization\b|\bschema\b|\bprovenance\b|\bcandidate\b|\blifecycle\b|\bconfidence score\b|\bruntime\b/i
    );
  });
});
