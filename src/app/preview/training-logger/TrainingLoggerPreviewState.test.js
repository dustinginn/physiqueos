import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptTrainingCategorySuggestion,
  addTrainingExercise,
  addTrainingSet,
  APPLE_HEALTH_MATCH_STATES,
  APPLE_WORKOUT_CANONICAL_OWNER_TYPES,
  applyProgressionSuggestion,
  assignTrainingVariant,
  buildEvidenceReviewHandoff,
  buildTrainingWorkoutSummary,
  canContinueFromReconciliation,
  continueWithoutAppleHealthMatch,
  createTrainingLoggerPreviewDraft,
  createTrainingSuperset,
  finalizeTrainingLoggerReconciliation,
  getSupersetContext,
  initializeTrainingLoggerMode,
  keepPreviousPerformance,
  listTrainingLoggerCategories,
  listTrainingLoggerExercises,
  loadAppleHealthReconciliationFixture,
  PROGRESSION_CHOICES,
  removeTrainingExercise,
  removeTrainingSet,
  removeTrainingSuperset,
  removeTrainingVariant,
  selectAppleHealthMatch,
  toggleAppleHealthAdditionalEvidence,
  toggleTrainingCategory,
  TRAINING_LOGGER_CATEGORY_SUGGESTION,
  TRAINING_LOGGER_DENSITY_CONTRACT,
  TRAINING_LOGGER_MODES,
  TRAINING_LOGGER_STEPS,
  toggleTrainingSetCompletion,
  updateTrainingSet,
  updateWorkoutContext,
} from "./TrainingLoggerPreviewState";

const componentSource = fs.readFileSync(
  new URL("../../../components/training/TrainingLoggerClient.jsx", import.meta.url),
  "utf8"
);
const previewWrapperSource = fs.readFileSync(
  new URL("./TrainingLoggerPreview.jsx", import.meta.url),
  "utf8"
);
const stateSource = fs.readFileSync(
  new URL("./TrainingLoggerPreviewState.js", import.meta.url),
  "utf8"
);
const reconciliationSource = fs.readFileSync(
  new URL("./TrainingLoggerAppleHealthReconciliation.js", import.meta.url),
  "utf8"
);
const routeSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");

describe("Training Logger preview state", () => {
  it("initializes live and retrospective modes into one shared draft architecture", () => {
    const entry = createTrainingLoggerPreviewDraft({ workoutDate: "2026-08-10" });
    expect(entry).toMatchObject({
      previewVersion: "training_logger_preview_v1_3",
      mode: null,
      step: TRAINING_LOGGER_STEPS.ENTRY,
      isolation: {
        persistence: "memory_only",
        canonicalTrainingSessionWritesEnabled: false,
        fixtureHistoryReadOnly: true,
      },
    });
    expect(routeSource).toContain("Training Logger Preview V1.3");

    const live = initializeTrainingLoggerMode(entry, TRAINING_LOGGER_MODES.LIVE);
    const retrospective = initializeTrainingLoggerMode(
      entry,
      TRAINING_LOGGER_MODES.RETROSPECTIVE
    );
    expect(live).toMatchObject({
      mode: "live",
      step: TRAINING_LOGGER_STEPS.CATEGORIES,
      startedAtLabel: "Started now",
      workoutTime: null,
    });
    expect(retrospective).toMatchObject({
      mode: "retrospective",
      step: TRAINING_LOGGER_STEPS.CATEGORIES,
      startedAtLabel: null,
      workoutDate: "2026-08-10",
      workoutTime: null,
    });
    expect(Object.keys(live).sort()).toEqual(Object.keys(retrospective).sort());
  });

  it("keeps retrospective date context without fabricating an exact start time", () => {
    let draft = createTrainingLoggerPreviewDraft({
      mode: TRAINING_LOGGER_MODES.RETROSPECTIVE,
      workoutDate: "2026-08-10",
    });
    draft = updateWorkoutContext(draft, {
      workoutDate: "2026-08-02",
      workoutTime: "17:30",
    });
    expect(draft.workoutDate).toBe("2026-08-02");
    expect(draft.workoutTime).toBeNull();
    expect(componentSource).toContain("Past workout date");
    expect(componentSource).not.toContain('type="time"');
  });

  it("exposes a practical user-facing area layer without changing canonical anatomy", () => {
    expect(listTrainingLoggerCategories()).toEqual([
      "Chest",
      "Back",
      "Shoulders",
      "Biceps",
      "Triceps",
      "Core",
      "Quads",
      "Hamstrings",
      "Glutes",
      "Calves",
    ]);
    expect(listTrainingLoggerCategories()).not.toContain("Lower Body");
    expect(listTrainingLoggerCategories()).not.toContain("Adductors");
    expect(listTrainingLoggerCategories()).toEqual(expect.arrayContaining([
      "Quads", "Glutes", "Hamstrings", "Calves",
    ]));
  });

  it("supports multi-select categories and the synthetic learned suggestion", () => {
    let draft = initializeTrainingLoggerMode(
      createTrainingLoggerPreviewDraft(),
      TRAINING_LOGGER_MODES.LIVE
    );
    draft = toggleTrainingCategory(draft, "Chest");
    draft = toggleTrainingCategory(draft, "Back");
    expect(draft.selectedCategories).toEqual(["Chest", "Back"]);
    draft = toggleTrainingCategory(draft, "Chest");
    expect(draft.selectedCategories).toEqual(["Back"]);

    draft = acceptTrainingCategorySuggestion(draft);
    expect(draft.selectedCategories).toEqual(["Biceps", "Triceps", "Core"]);
    expect(draft.acceptedSuggestionId).toBe("suggested_arms_core");
    expect(draft.selectedCategories.every((category) =>
      listTrainingLoggerCategories().includes(category)
    )).toBe(true);
    expect(TRAINING_LOGGER_CATEGORY_SUGGESTION).toMatchObject({
      source: "synthetic_preview_fixture",
      futureLearningSource: "confirmed_training_evidence_history",
    });
  });

  it("filters canonical exercise choices by category and search", () => {
    const biceps = listTrainingLoggerExercises({ categories: ["Biceps"] });
    const triceps = listTrainingLoggerExercises({ categories: ["Triceps"] });
    const hamstrings = listTrainingLoggerExercises({ categories: ["Hamstrings"] });
    expect(biceps.map((exercise) => exercise.id)).toContain("spider_curl");
    expect(biceps.map((exercise) => exercise.id)).not.toContain("bench_press");
    expect(triceps.map((exercise) => exercise.id)).toContain("cable_pushdown");
    expect(hamstrings.map((exercise) => exercise.id)).toContain("lying_leg_curl");
    expect(listTrainingLoggerExercises({
      categories: ["Biceps", "Triceps", "Core"],
      search: "hanging",
    }).map((exercise) => exercise.id)).toEqual(["hanging_leg_raise"]);
    expect(componentSource).toContain('"Search your exercises"');
    expect(componentSource).toContain('"Search all exercises"');
    expect(componentSource).toContain("onToggleExercise(exercise.id)");
  });

  it("adds and removes canonical exercise occurrences without changing their identities", () => {
    let draft = createTrainingLoggerPreviewDraft({ mode: TRAINING_LOGGER_MODES.LIVE });
    draft = addTrainingExercise(draft, "spider_curl");
    draft = addTrainingExercise(draft, "cable_pushdown");
    expect(draft.exercises).toHaveLength(2);
    expect(draft.exercises[0]).toMatchObject({
      canonicalExerciseId: "spider_curl",
      name: "Spider Curls",
    });
    expect(draft.exercises[0].exerciseOccurrenceId).toBe(draft.exercises[0].id);
    expect(draft.exercises[0].id).not.toBe(draft.exercises[1].id);

    draft = removeTrainingExercise(draft, draft.exercises[0].id);
    expect(draft.exercises.map((exercise) => exercise.canonicalExerciseId))
      .toEqual(["cable_pushdown"]);
  });

  it("prepopulates sets from read-only comparable history and supports edit/add/remove", () => {
    let draft = addTrainingExercise(
      createTrainingLoggerPreviewDraft({ mode: TRAINING_LOGGER_MODES.LIVE }),
      "spider_curl"
    );
    const occurrence = draft.exercises[0];
    expect(occurrence.previousPerformance).toMatchObject({ reps: 12, load: 35, setCount: 4 });
    expect(occurrence.sets).toHaveLength(4);
    expect(occurrence.sets.every((set) => set.reps === 12 && set.load === 35)).toBe(true);

    draft = updateTrainingSet(draft, occurrence.id, occurrence.sets[0].id, {
      reps: 10,
      load: 40,
    });
    expect(draft.exercises[0].sets[0]).toMatchObject({ reps: 10, load: 40, confirmed: false });

    draft = addTrainingSet(draft, occurrence.id);
    expect(draft.exercises[0].sets).toHaveLength(5);
    expect(draft.exercises[0].sets[4]).toMatchObject({ reps: 12, load: 35, confirmed: false });
    draft = removeTrainingSet(draft, occurrence.id, draft.exercises[0].sets[1].id);
    expect(draft.exercises[0].sets).toHaveLength(4);
    expect(draft.exercises[0].sets.map((set) => set.order)).toEqual([1, 2, 3, 4]);
  });

  it("toggles Done in both directions and updates completed-set counts", () => {
    let draft = createProvingDraft();
    const occurrence = draft.exercises[0];
    const set = occurrence.sets[0];
    expect(buildTrainingWorkoutSummary(draft).confirmedSetCount).toBe(0);

    draft = toggleTrainingSetCompletion(draft, occurrence.id, set.id);
    expect(draft.exercises[0].sets[0].confirmed).toBe(true);
    expect(buildTrainingWorkoutSummary(draft).confirmedSetCount).toBe(1);

    draft = toggleTrainingSetCompletion(draft, occurrence.id, set.id);
    expect(draft.exercises[0].sets[0].confirmed).toBe(false);
    expect(buildTrainingWorkoutSummary(draft).confirmedSetCount).toBe(0);
  });

  it("moves recommendation selection and set values between previous and suggestion", () => {
    let draft = addTrainingExercise(
      createTrainingLoggerPreviewDraft({ mode: TRAINING_LOGGER_MODES.LIVE }),
      "spider_curl"
    );
    const occurrence = draft.exercises[0];
    expect(occurrence.progressionChoice).toBe(PROGRESSION_CHOICES.PREVIOUS);
    expect(occurrence.sets.every((set) => set.reps === 12 && set.load === 35)).toBe(true);

    draft = applyProgressionSuggestion(draft, occurrence.id);
    expect(draft.exercises[0].progressionChoice).toBe(PROGRESSION_CHOICES.SUGGESTION);
    expect(draft.exercises[0].sets.every((set) => set.reps === 8 && set.load === 40)).toBe(true);

    draft = keepPreviousPerformance(draft, occurrence.id);
    expect(draft.exercises[0].progressionChoice).toBe(PROGRESSION_CHOICES.PREVIOUS);
    expect(draft.exercises[0].sets.every((set) => set.reps === 12 && set.load === 35)).toBe(true);

    draft = updateTrainingSet(draft, occurrence.id, occurrence.sets[0].id, { reps: 11 });
    expect(draft.exercises[0].progressionChoice).toBeNull();
  });

  it("assigns and removes production-shaped Variant context without altering canonical identity", () => {
    let draft = addTrainingExercise(
      createTrainingLoggerPreviewDraft({ mode: TRAINING_LOGGER_MODES.LIVE }),
      "spider_curl"
    );
    const occurrenceId = draft.exercises[0].id;
    draft = assignTrainingVariant(draft, occurrenceId, "Static Hold");
    expect(draft.exercises[0]).toMatchObject({
      id: occurrenceId,
      exerciseOccurrenceId: occurrenceId,
      canonicalExerciseId: "spider_curl",
      name: "Spider Curls",
      executionVariant: {
        key: "static_hold",
        label: "Static Hold",
        rawLabel: "Static Hold",
      },
    });
    expect(draft.exercises[0].previousPerformance.context).toContain("Static Hold");

    draft = removeTrainingVariant(draft, occurrenceId);
    expect(draft.exercises[0].executionVariant).toBeNull();
    expect(draft.exercises[0].canonicalExerciseId).toBe("spider_curl");
  });

  it("creates and removes canonical Superset relationship groups", () => {
    let draft = createProvingDraft();
    const [spider, pushdown] = draft.exercises;
    draft = createTrainingSuperset(draft, spider.id, pushdown.id);
    expect(draft.exerciseRelationshipGroups).toHaveLength(1);
    expect(draft.exerciseRelationshipGroups[0]).toMatchObject({
      relationshipType: "superset",
      memberExerciseIds: [spider.id, pushdown.id],
      provenance_ref: "training_logger_preview_draft",
    });
    expect(getSupersetContext(draft, spider.id).partners[0].canonicalExerciseId)
      .toBe("cable_pushdown");

    draft = removeTrainingSuperset(draft, draft.exerciseRelationshipGroups[0].id);
    expect(draft.exerciseRelationshipGroups).toEqual([]);
  });

  it("preserves Variant and Superset as independent, coexisting context", () => {
    let draft = createProvingDraft();
    const [spider, pushdown] = draft.exercises;
    draft = assignTrainingVariant(draft, spider.id, "Static Hold");
    draft = createTrainingSuperset(draft, spider.id, pushdown.id);
    expect(draft.exercises[0].canonicalExerciseId).toBe("spider_curl");
    expect(draft.exercises[0].executionVariant.key).toBe("static_hold");
    expect(draft.exerciseRelationshipGroups[0].memberExerciseIds)
      .toEqual([spider.id, pushdown.id]);
    expect(draft.exercises[0].previousPerformance.context)
      .toBe("Static Hold · Superset with Cable Rope Pushdowns");
  });

  it("builds the workout completion summary", () => {
    let draft = createProvingDraft();
    draft = assignTrainingVariant(draft, draft.exercises[0].id, "Static Hold");
    draft = createTrainingSuperset(draft, draft.exercises[0].id, draft.exercises[1].id);
    draft = toggleTrainingSetCompletion(
      draft,
      draft.exercises[0].id,
      draft.exercises[0].sets[0].id
    );
    expect(buildTrainingWorkoutSummary(draft)).toEqual({
      exerciseCount: 2,
      setCount: 8,
      confirmedSetCount: 1,
      variantCount: 1,
      supersetCount: 1,
      durationMinutes: 54,
    });
  });

  it("derives strong, multiple, and no-match states without user-facing scenario controls", () => {
    let draft = createProvingDraft();
    expect(draft.reconciliation.matchState).toBe(APPLE_HEALTH_MATCH_STATES.STRONG);
    expect(draft.reconciliation.strengthCandidateIds).toHaveLength(1);
    expect(draft.reconciliation.selectedStrengthSourceId).toBe(
      "apple_workout_strength_20260810_1612"
    );
    expect(canContinueFromReconciliation(draft)).toBe(true);

    draft = loadAppleHealthReconciliationFixture(draft, "MULTIPLE");
    expect(draft.reconciliation.strengthCandidateIds).toHaveLength(2);
    expect(draft.reconciliation.selectedStrengthSourceId).toBeNull();
    expect(canContinueFromReconciliation(draft)).toBe(false);
    draft = selectAppleHealthMatch(draft, draft.reconciliation.strengthCandidateIds[1]);
    expect(canContinueFromReconciliation(draft)).toBe(true);

    draft = loadAppleHealthReconciliationFixture(draft, "NONE");
    expect(draft.reconciliation.strengthCandidateIds).toEqual([]);
    expect(canContinueFromReconciliation(draft)).toBe(false);
    draft = continueWithoutAppleHealthMatch(draft);
    expect(canContinueFromReconciliation(draft)).toBe(true);
    expect(componentSource).not.toContain("Preview match scenario");
    expect(componentSource).not.toContain('"Strong"');
  });

  it("lets one batch independently include or exclude additional cardio evidence", () => {
    let draft = createProvingDraft();
    const cardioAction = draft.reconciliation.additionalEvidenceActions.find((action) =>
      action.canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
    );
    expect(cardioAction.included).toBe(true);
    draft = toggleAppleHealthAdditionalEvidence(draft, cardioAction.sourceWorkoutId);
    expect(draft.reconciliation.additionalEvidenceActions.find(
      (action) => action.sourceWorkoutId === cardioAction.sourceWorkoutId
    ).included).toBe(false);
    draft = finalizeTrainingLoggerReconciliation(draft);
    expect(draft.reconciliation.proposedCanonicalRecords.some(
      (record) => record.canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
    )).toBe(false);
  });

  it("builds a dated batch Evidence Review handoff without an Execution Context card", () => {
    let draft = createProvingDraft();
    const [spider, pushdown] = draft.exercises;
    draft = assignTrainingVariant(draft, spider.id, "Static Hold");
    draft = createTrainingSuperset(draft, spider.id, pushdown.id);
    draft = finalizeTrainingLoggerReconciliation(draft);
    const handoff = buildEvidenceReviewHandoff(draft);
    expect(handoff).toMatchObject({
      status: "ready_to_log",
      previewOnly: true,
      workoutDetails: {
        exerciseCount: 2,
        setCount: 8,
        variantCount: 1,
        supersetCount: 1,
        workoutDate: "2026-08-10",
        workoutTime: null,
      },
      appleHealth: {
        status: "matched",
        strengthWorkout: {
          workoutType: "Traditional Strength Training",
          sessionDate: "2026-08-10",
          durationMinutes: 54,
          activeCalories: 430,
        },
      },
    });
    expect(handoff.structuredTrainingContext.executionContexts[0]).toMatchObject({
      canonicalExerciseId: "spider_curl",
      executionVariant: { key: "static_hold" },
    });
    expect(handoff.structuredTrainingContext.exerciseRelationshipGroups).toHaveLength(1);
    expect(handoff.appleHealth.acceptedWorkouts.map((workout) => workout.workoutType)).toEqual([
      "Traditional Strength Training",
      "Stair Stepper",
      "Walking",
    ]);
    expect(handoff.proposedCanonicalRecords.map((record) => record.canonicalOwnerType)).toEqual([
      APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
      APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT,
      APPLE_WORKOUT_CANONICAL_OWNER_TYPES.ACTIVITY_RECORD,
    ]);
    expect(handoff).not.toHaveProperty("editableSets");
    expect(componentSource).not.toContain('title="Execution Context"');
    expect(componentSource).toContain("workout.activeCalories");
  });

  it("has no production TrainingSession write, network, persistence, or server-action boundary", () => {
    const previewSource = `${previewWrapperSource}\n${stateSource}\n${reconciliationSource}\n${routeSource}`;
    expect(previewSource).not.toMatch(
      /fetch\(|FounderRepositories|CanonicalExerciseWorkoutCommitService|EvidenceIntakeService|createCanonical|updateCanonical|revalidatePath|server action|localStorage|sessionStorage/
    );
    expect(previewWrapperSource).not.toContain("<form");
    expect(previewWrapperSource).not.toContain("production");
    expect(componentSource).toContain("No production workout was created");
    expect(stateSource).toContain("canonicalTrainingSessionWritesEnabled: false");
    expect(stateSource).toContain('persistence: "memory_only"');
    expect(routeSource).not.toMatch(/actions|repositories|services/);
    expect(reconciliationSource).toContain('HEALTH_KIT: "healthkit"');
    expect(reconciliationSource).toContain(
      'SCREENSHOT_INTERPRETATION: "apple_health_screenshot_interpretation"'
    );
  });

  it("uses the canonical phone shell and a context-readable, set-dense layout contract", () => {
    expect(componentSource).toContain("max-w-[393px]");
    expect(componentSource).toContain("min-h-14");
    expect(componentSource).toContain("min-h-11");
    expect(componentSource).toContain("pb-36");
    expect(componentSource).toContain("bottom-24");
    expect(componentSource).toContain(
      "grid-cols-[26px_minmax(52px,1fr)_minmax(62px,1fr)_40px_48px]"
    );
    expect(componentSource).toContain('data-density-contract="v1.3"');
    expect(componentSource).toContain('className="px-3 pb-2 pt-3"');
    expect(componentSource).toContain('className="px-2.5 pb-2.5 pt-1"');
    expect(componentSource).toContain("previousContext");
    expect(componentSource).toContain("overflow-hidden rounded-xl border");
    expect(componentSource).toContain('aria-label="Add Set"');
    expect(componentSource).toContain('className="flex h-10 min-w-0 items-center"');
    expect(componentSource).toContain("h-8 min-w-0 w-full rounded-md");
    expect(componentSource).toContain("aria-pressed={suggestionSelected}");
    expect(componentSource).toContain("aria-pressed={previousSelected}");
    expect(TRAINING_LOGGER_DENSITY_CONTRACT).toMatchObject({
      canonicalShellWidthPx: 393,
      narrowShellWidthPx: 360,
      primaryTapTargetPx: 44,
      denseSetControlTargetPx: 40,
      setRowVisualHeightPx: 40,
      setRowGapPx: 0,
      setHeaderWithAddSetHeightPx: 40,
      exerciseCardGapPx: 8,
    });
    expect(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_3StructuralTarget.ordinaryHeaderContextPx
    ).toBeGreaterThan(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_2StructuralEstimate.headerContextPx
    );
    expect(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_3StructuralTarget.recommendationPx
    ).toBe(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_2StructuralEstimate.recommendationPx
    );
    expect(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_3StructuralTarget.setSectionPx
    ).toBeLessThan(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_2StructuralEstimate.setSectionPx
    );
    expect(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_3StructuralTarget.ordinaryFourSetCardMaxPx
    ).toBeLessThan(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_2StructuralEstimate.ordinaryFourSetCardPx
    );
    expect(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_2StructuralEstimate.setSectionPx
      - TRAINING_LOGGER_DENSITY_CONTRACT.v1_3StructuralTarget.setSectionPx
    ).toBe(47);
    expect(
      TRAINING_LOGGER_DENSITY_CONTRACT.v1_2StructuralEstimate.ordinaryFourSetCardPx
      - TRAINING_LOGGER_DENSITY_CONTRACT.v1_3StructuralTarget.ordinaryFourSetCardMaxPx
    ).toBe(42);
    expect(componentSource).not.toMatch(/max-w-screen|max-w-7xl/);
  });

  it("preserves every accepted active-logger action after the density refactor", () => {
    [
      "Use suggestion",
      "Keep previous",
      "Add Variant",
      "Link as Superset",
      "Remove Exercise",
      "Add Set",
      "Add Exercise",
      "Finish Workout",
      "Mark set ${set.order} done",
      "Remove set ${set.order}",
    ].forEach((label) => expect(componentSource).toContain(label));
  });
});

function createProvingDraft() {
  let draft = createTrainingLoggerPreviewDraft({ mode: TRAINING_LOGGER_MODES.LIVE });
  draft = addTrainingExercise(draft, "spider_curl");
  draft = addTrainingExercise(draft, "cable_pushdown");
  return draft;
}
