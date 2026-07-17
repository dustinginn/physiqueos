import { describe, expect, it } from "vitest";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { createEvidenceReviewService } from "./EvidenceReviewService";
import {
  createEvidenceReviewPresentation,
  formatExerciseSet,
  presentEvidenceObject,
  repairPendingReviewExerciseIdentities,
  toggleEvidenceReviewItemDecision,
} from "./EvidenceReviewPresentationService";
import {
  getCanonicalTrainingExerciseLabel,
  getCanonicalTrainingExerciseSlug,
  resolveTrainingExerciseIdentity,
} from "../models/trainingExerciseIdentity";

const training = (overrides = {}) => ({
  id: "training-jul-12",
  evidence_type: "training",
  observed_at: "2026-07-12",
  metadata: { activity_type: "Traditional Strength Training", active_calories: 483, duration_seconds: 4602, average_heart_rate: 114 },
  exercises: [
    { name: "Pull-Ups", equipment: "bodyweight", sets: [{ reps: 12, weight: 0, load_type: "external_load" }] },
    { name: "Hanging Leg Raises", equipment: "bodyweight", sets: [{ reps: 15, weight: 0 }] },
    { name: "Iso Lateral High Rows", sets: [{ reps: 12, weight: 180, weight_unit: "lb" }] },
    { name: "Cable Crunches", sets: [{ reps: 20, weight: 110 }] },
    { name: "Seater cable row", sets: [{ reps: 15, weight: 120 }] },
    { name: "Planks", sets: [{ duration_seconds: 75 }] },
  ],
  ...overrides,
});

const evidencePackage = (objects = [training()]) => ({
  package_id: "package-1",
  evidence_objects: objects,
  provenance: { source_artifacts: [
    { kind: "screenshot", file_name: "IMG_1455.png", mime_type: "image/png" },
    { kind: "typed_evidence", file_name: "additional-evidence.txt", mime_type: "text/plain", text: "Original workout notes" },
  ] },
});

describe("Evidence Review presentation", () => {
  it("renders a human-readable training review with modality-aware sets and source details", () => {
    const result = createEvidenceReviewPresentation({ evidencePackage: evidencePackage() });
    const card = result.items[0];

    expect(card.date).toBe("Jul 12, 2026");
    expect(card.metrics).toEqual(expect.arrayContaining([
      { label: "Active calories", value: "483 cal" },
      { label: "Source", value: "Screenshot + Typed evidence" },
    ]));
    expect(card.exercises.map((exercise) => exercise.name)).toEqual([
      "Pull-Up", "Hanging Leg Raise", "Iso-Lateral High Row", "Cable Crunch", "Seated Cable Row", "Plank",
    ]);
    expect(card.exercises[0].sets).toEqual(["12 reps · Bodyweight"]);
    expect(card.exercises[4].sets).toEqual(["15 reps @ 120 lb"]);
    expect(card.exercises[5].sets).toEqual(["1:15"]);
    expect(card.sourceFiles).toContain("IMG_1455.png");
    expect(card.typedEvidence).toBe("Original workout notes");
  });

  it("persists exclusion state in the view model and disables an empty confirmation", () => {
    const objects = [training(), training({ id: "training-jul-11", observed_at: "2026-07-11" })];
    const result = createEvidenceReviewPresentation({ evidencePackage: evidencePackage(objects), itemDecisions: { "training-jul-11": { included: false } } });

    expect(result.items.map((item) => item.included)).toEqual([true, false]);
    expect(result.summary.text).toBe("1 workout");
    expect(result.summary.excluded).toBe(1);
    expect(result.summary.excludedText).toBe("1 workout excluded");

    const none = createEvidenceReviewPresentation({ evidencePackage: evidencePackage(objects), itemDecisions: { "training-jul-12": { included: false }, "training-jul-11": { included: false } } });
    expect(none.summary).toEqual({ included: 0, excluded: 2, text: "Nothing is currently selected", excludedText: "2 workouts excluded" });
  });

  it("toggles inclusion locally in both directions without mutating the prior decisions", () => {
    const initial = {};
    const excluded = toggleEvidenceReviewItemDecision(initial, "training-jul-12", true);
    expect(initial).toEqual({});
    expect(excluded).toEqual({ "training-jul-12": { included: false } });
    expect(createEvidenceReviewPresentation({ evidencePackage: evidencePackage(), itemDecisions: excluded }).items).toHaveLength(1);
    expect(createEvidenceReviewPresentation({ evidencePackage: evidencePackage(), itemDecisions: excluded }).items[0].included).toBe(false);

    const included = toggleEvidenceReviewItemDecision(excluded, "training-jul-12", false);
    expect(included).toEqual({ "training-jul-12": { included: true } });
    expect(createEvidenceReviewPresentation({ evidencePackage: evidencePackage(), itemDecisions: included }).summary.included).toBe(1);
  });

  it("formats current non-training evidence types without exposing internal fields", () => {
    const cases = [
      [{ id: "w", evidence_type: "weight", observed_at: "2026-07-12", value: 165.4, unit: "lb" }, "Weight"],
      [{ id: "a", evidence_type: "activity_day", observed_at: "2026-07-12", daily_activity: { move_calories: 900, exercise_minutes: 60 } }, "Activity"],
      [{ id: "n", evidence_type: "nutrition", observed_at: "2026-07-12", daily_totals: { calories: 1920, protein_g: 189, carbs_g: 146, fat_g: 64 } }, "Nutrition"],
      [{ id: "d", evidence_type: "dexa_scan", observed_at: "2026-07-12", metadata: { leanMass: 146.2, bodyFatPercentage: 10.7 } }, "DEXA"],
    ];
    cases.forEach(([object, title]) => {
      const card = presentEvidenceObject(object, evidencePackage([]));
      expect(card.title).toBe(title);
      expect(card.metrics.some((metric) => /canonical|provenance|id/i.test(metric.label))).toBe(false);
    });
  });

  it("never renders missing or zero duration as 0s", () => {
    expect(formatExerciseSet({ reps: 8 })).toBe("8 reps");
    expect(formatExerciseSet({ duration_seconds: null })).toBeNull();
    expect(formatExerciseSet({ duration_seconds: 0 })).toBeNull();
  });

  it("persists a stable item decision through repeated exclude and include transitions", async () => {
    let review = { id: "review-1", userId: "founder", status: "pending", interpretedEvidence: evidencePackage(), itemDecisions: {} };
    const repository = {
      getReviewById: async () => structuredClone(review),
      updateReview: async (_id, patch) => { review = { ...review, ...structuredClone(patch) }; return structuredClone(review); },
    };
    const service = createEvidenceReviewService({ repositories: { evidenceReviews: repository }, now: () => new Date("2026-07-13T12:00:00Z") });
    await service.setItemDecision("review-1", { itemId: "training-jul-12", included: false, decidedBy: "founder" });
    expect((await repository.getReviewById("review-1")).itemDecisions["training-jul-12"].included).toBe(false);
    await service.setItemDecision("review-1", { itemId: "training-jul-12", included: true, decidedBy: "founder" });
    const reloaded = await repository.getReviewById("review-1");
    expect(reloaded.itemDecisions["training-jul-12"].included).toBe(true);
    expect(createEvidenceReviewPresentation({ evidencePackage: reloaded.interpretedEvidence, itemDecisions: reloaded.itemDecisions }).summary.text).toBe("1 workout");
  });
});

describe("Cable Machine Front Raise canonical identity", () => {
  it.each(["Cable Machine Front Raise", "Cable Machine Front Raises", "cable machine front raises"])("resolves %s distinctly", (name) => {
    expect(resolveTrainingExerciseIdentity(name)).toEqual(expect.objectContaining({ canonicalExerciseId: "cable_machine_front_raise", canonicalExerciseName: "Cable Machine Front Raise" }));
  });

  it("keeps generic, dumbbell, lateral, and press identities separate", () => {
    expect(getCanonicalTrainingExerciseSlug("Front Raises")).toBe("front_raise");
    expect(getCanonicalTrainingExerciseSlug("Dumbbell Front Raises")).toBe("dumbbell_front_raise");
    expect(getCanonicalTrainingExerciseSlug("Lateral Raises")).toBe("lateral_raise");
    expect(getCanonicalTrainingExerciseSlug("Shoulder Press Machine")).toBe("shoulder_press_machine");
  });

  it("repairs a pending generic candidate from retained typed evidence without duplicating sets", () => {
    const source = evidencePackage([training({ exercises: [{ name: "Front Raises", sets: [{ reps: 13, weight: 110 }, { reps: 12, weight: 120 }, { reps: 10, weight: 130 }, { reps: 10, weight: 130 }] }] })]);
    source.provenance.source_artifacts[1].text = "Cable Machine Front Raises\n13r 110p\n12r 120p\n10r 130p\n10r 130p";
    const once = repairPendingReviewExerciseIdentities(source);
    const twice = repairPendingReviewExerciseIdentities(once);
    expect(twice.evidence_objects[0].exercises).toEqual([{ name: "Cable Machine Front Raise", equipment: "cable", sets: [{ reps: 13, weight: 110 }, { reps: 12, weight: 120 }, { reps: 10, weight: 130 }, { reps: 10, weight: 130 }] }]);
    expect(createEvidenceReviewPresentation({ evidencePackage: twice }).items[0].exercises[0]).toEqual({ name: "Cable Machine Front Raise", sets: ["13 reps @ 110 lb", "12 reps @ 120 lb", "10 reps @ 130 lb", "10 reps @ 130 lb"] });
  });
});

describe("Seated Cable Row canonical identity", () => {
  it.each(["Seater cable row", "Seater Cable Rows", "Seated Cable Row", "Seated Cable Rows", "seated cable row"])("resolves %s", (name) => {
    expect(resolveTrainingExerciseIdentity(name)).toEqual(expect.objectContaining({ canonicalExerciseId: "seated_cable_row", canonicalExerciseName: "Seated Cable Row" }));
  });

  it("does not merge unrelated row exercises", () => {
    expect(getCanonicalTrainingExerciseSlug("Iso-Lateral High Row")).toBe("iso_lateral_high_row");
    expect(getCanonicalTrainingExerciseSlug("Low Cable Row")).not.toBe("seated_cable_row");
  });

  it("consolidates historical spellings into one performance node without duplicate sessions", () => {
    const session = (id, name, date) => ({ id, evidence_type: "training", observed_at: date, metadata: { activity_type: "Strength" }, exercises: [{ name, sets: [{ reps: 12, weight: 110 }] }] });
    const report = createTrainingPerformanceIntelligenceReport({ trainingSessions: [session("one", "Seated Cable Row", "2026-07-01"), session("two", "Seater cable row", "2026-07-12"), session("two", "Seater cable row", "2026-07-12")] });
    const rows = report.exerciseObservations.filter((item) => item.exercise.name === "Seated Cable Row");

    expect(rows).toHaveLength(1);
    expect(rows[0].supporting_session_ids).toEqual(["one", "two"]);
    expect(getCanonicalTrainingExerciseLabel("Seater cable row")).toBe("Seated Cable Row");
  });
});
