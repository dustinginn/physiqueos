import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptTrainingCategorySuggestion,
  addTrainingExercise,
  addTrainingSet,
  APPLE_HEALTH_MATCH_STATES,
  assignTrainingVariant,
  buildEvidenceReviewHandoff,
  buildTrainingWorkoutSummary,
  canContinueFromReconciliation,
  confirmTrainingSet,
  continueWithoutAppleHealthMatch,
  createTrainingLoggerPreviewDraft,
  createTrainingSuperset,
  getSupersetContext,
  initializeTrainingLoggerMode,
  listTrainingLoggerExercises,
  removeTrainingExercise,
  removeTrainingSet,
  removeTrainingSuperset,
  removeTrainingVariant,
  selectAppleHealthMatch,
  setAppleHealthMatchState,
  toggleTrainingCategory,
  TRAINING_LOGGER_MODES,
  TRAINING_LOGGER_STEPS,
  updateTrainingSet,
} from "./TrainingLoggerPreviewState";

const componentSource = fs.readFileSync(
  new URL("./TrainingLoggerPreview.jsx", import.meta.url),
  "utf8"
);
const stateSource = fs.readFileSync(
  new URL("./TrainingLoggerPreviewState.js", import.meta.url),
  "utf8"
);
const routeSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");

describe("Training Logger preview state", () => {
  it("initializes live and retrospective modes into one shared draft architecture", () => {
    const entry = createTrainingLoggerPreviewDraft({ workoutDate: "2026-08-10" });
    expect(entry).toMatchObject({
      mode: null,
      step: TRAINING_LOGGER_STEPS.ENTRY,
      isolation: {
        persistence: "memory_only",
        canonicalTrainingSessionWritesEnabled: false,
        fixtureHistoryReadOnly: true,
      },
    });

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
      workoutTime: "17:30",
    });
    expect(Object.keys(live).sort()).toEqual(Object.keys(retrospective).sort());
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
    expect(draft.selectedCategories).toEqual(["Arms", "Core"]);
    expect(draft.acceptedSuggestionId).toBe("suggested_arms_core");
  });

  it("filters canonical exercise choices by category and search", () => {
    const arms = listTrainingLoggerExercises({ categories: ["Arms"] });
    expect(arms.map((exercise) => exercise.id)).toContain("spider_curl");
    expect(arms.map((exercise) => exercise.id)).toContain("cable_pushdown");
    expect(arms.every((exercise) => exercise.body_region === "Arms")).toBe(true);
    expect(listTrainingLoggerExercises({
      categories: ["Arms", "Core"],
      search: "hanging",
    }).map((exercise) => exercise.id)).toEqual(["hanging_leg_raise"]);
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

  it("prepopulates sets from read-only comparable history and supports edit/add/remove/confirm", () => {
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
    draft = confirmTrainingSet(draft, occurrence.id, occurrence.sets[0].id);
    expect(draft.exercises[0].sets[0]).toMatchObject({ reps: 10, load: 40, confirmed: true });

    draft = addTrainingSet(draft, occurrence.id);
    expect(draft.exercises[0].sets).toHaveLength(5);
    expect(draft.exercises[0].sets[4]).toMatchObject({ reps: 12, load: 35, confirmed: false });
    draft = removeTrainingSet(draft, occurrence.id, draft.exercises[0].sets[1].id);
    expect(draft.exercises[0].sets).toHaveLength(4);
    expect(draft.exercises[0].sets.map((set) => set.order)).toEqual([1, 2, 3, 4]);
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
    draft = confirmTrainingSet(draft, draft.exercises[0].id, draft.exercises[0].sets[0].id);
    expect(buildTrainingWorkoutSummary(draft)).toEqual({
      exerciseCount: 2,
      setCount: 8,
      confirmedSetCount: 1,
      variantCount: 1,
      supersetCount: 1,
      durationMinutes: 54,
    });
  });

  it("models Apple Health strong, multiple, and no-match decisions explicitly", () => {
    let draft = createProvingDraft();
    expect(draft.reconciliation.matchState).toBe(APPLE_HEALTH_MATCH_STATES.STRONG);
    expect(draft.reconciliation.candidates).toHaveLength(1);
    expect(canContinueFromReconciliation(draft)).toBe(false);
    draft = selectAppleHealthMatch(draft, draft.reconciliation.candidates[0].id);
    expect(canContinueFromReconciliation(draft)).toBe(true);

    draft = setAppleHealthMatchState(draft, APPLE_HEALTH_MATCH_STATES.MULTIPLE);
    expect(draft.reconciliation.candidates).toHaveLength(2);
    expect(draft.reconciliation.selectedMatchId).toBeNull();
    expect(canContinueFromReconciliation(draft)).toBe(false);

    draft = setAppleHealthMatchState(draft, APPLE_HEALTH_MATCH_STATES.NONE);
    expect(draft.reconciliation.candidates).toEqual([]);
    expect(canContinueFromReconciliation(draft)).toBe(false);
    draft = continueWithoutAppleHealthMatch(draft);
    expect(canContinueFromReconciliation(draft)).toBe(true);
  });

  it("builds a concise Evidence Review handoff without asking for set re-entry", () => {
    let draft = createProvingDraft();
    const [spider, pushdown] = draft.exercises;
    draft = assignTrainingVariant(draft, spider.id, "Static Hold");
    draft = createTrainingSuperset(draft, spider.id, pushdown.id);
    draft = selectAppleHealthMatch(draft, draft.reconciliation.candidates[0].id);
    const handoff = buildEvidenceReviewHandoff(draft);
    expect(handoff).toMatchObject({
      status: "ready_to_log",
      previewOnly: true,
      workoutDetails: { exerciseCount: 2, setCount: 8, variantCount: 1, supersetCount: 1 },
      appleHealth: { status: "matched" },
    });
    expect(handoff.executionContexts[0]).toMatchObject({
      canonicalExerciseId: "spider_curl",
      executionVariant: { key: "static_hold" },
    });
    expect(handoff.exerciseRelationshipGroups).toHaveLength(1);
    expect(handoff).not.toHaveProperty("editableSets");
  });

  it("has no production TrainingSession write, network, persistence, or server-action boundary", () => {
    const previewSource = `${componentSource}\n${stateSource}\n${routeSource}`;
    expect(previewSource).not.toMatch(
      /fetch\(|FounderRepositories|CanonicalExerciseWorkoutCommitService|EvidenceIntakeService|createCanonical|updateCanonical|revalidatePath|server action|localStorage|sessionStorage/
    );
    expect(componentSource).not.toContain("<form");
    expect(componentSource).toContain("No production workout was created");
    expect(stateSource).toContain("canonicalTrainingSessionWritesEnabled: false");
    expect(stateSource).toContain('persistence: "memory_only"');
    expect(routeSource).not.toMatch(/actions|repositories|services/);
  });

  it("uses the canonical phone-width shell, large tap targets, and bottom-nav clearance", () => {
    expect(componentSource).toContain("max-w-[393px]");
    expect(componentSource).toContain("min-h-14");
    expect(componentSource).toContain("min-h-11");
    expect(componentSource).toContain("pb-36");
    expect(componentSource).toContain("bottom-24");
    expect(componentSource).toContain(
      "grid-cols-[32px_minmax(58px,1fr)_minmax(68px,1fr)_44px_32px]"
    );
    expect(componentSource).not.toMatch(/max-w-screen|max-w-7xl/);
  });
});

function createProvingDraft() {
  let draft = createTrainingLoggerPreviewDraft({ mode: TRAINING_LOGGER_MODES.LIVE });
  draft = addTrainingExercise(draft, "spider_curl");
  draft = addTrainingExercise(draft, "cable_pushdown");
  return draft;
}
