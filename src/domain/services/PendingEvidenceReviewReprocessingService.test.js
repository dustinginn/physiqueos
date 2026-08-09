import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewRepository } from "../../data/repositories/EvidenceReviewRepository";
import { createEvidencePackageRepository } from "../../data/repositories/EvidencePackageRepository";
import { parseStrengthTrainingText } from "../models/trainingSessionEvidence";
import { JUL_14_STRENGTH_NOTE } from "../../fixtures/jul14StrengthEvidenceFixture";
import { JUL_25_STRENGTH_NOTE } from "../../fixtures/jul25TrainingEvidenceFixture";
import { createPendingEvidenceReviewReprocessingService } from "./PendingEvidenceReviewReprocessingService";

const REVIEW_ID = "evidence_review_20260715011556399";
const PACKAGE_ID = "evidence_submission_20260715011517048_images";

function fixture({ status = "pending", sources, canonical = [] } = {}) {
  const sourceArtifacts = sources ?? [
    { id: "typed_evidence_0", kind: "typed_evidence", text: JUL_14_STRENGTH_NOTE, uploaded_at: "2026-07-15T01:15:17.048Z" },
    { id: "artifact_1", kind: "screenshot", storage_path: "private/founder/evidence/uploads/strength.png", uploaded_at: "2026-07-15T01:15:17.048Z" },
  ];
  const evidencePackage = {
    package_id: PACKAGE_ID, captured_at: "2026-07-14", observed_date: "2026-07-14", userId: "founder",
    provenance: { submission_id: PACKAGE_ID, evidence_date: "2026-07-14", source_artifacts: sourceArtifacts },
    evidence_objects: [],
  };
  const malformed = { ...trainingObject([{ id: "leg_press_feet_middle", name: "Leg Press (Feet Middle)", sets: Array.from({ length: 10 }, (_, index) => ({ set_number: index + 1, reps: 10, weight: 35, weight_unit: "lb", provenance_ref: "typed_evidence_0" })), provenance_ref: "typed_evidence_0" }]), captured_at: "2026-07-14T18:01:00-07:00" };
  const review = {
    id: REVIEW_ID, userId: "founder", source: "universal_intake", status,
    createdAt: "2026-07-15T01:15:56.399Z", updatedAt: "2026-07-15T01:15:56.399Z",
    interpretedEvidence: { ...structuredClone(evidencePackage), evidence_objects: [malformed] },
    evidenceTypes: ["training"], confirmation: null, commitProgress: {}, itemDecisions: {},
  };
  const changes = [];
  const repositories = {
    evidenceReviews: createEvidenceReviewRepository([review], { onChange: (name) => changes.push(name) }),
    evidencePackages: createEvidencePackageRepository([evidencePackage], { onChange: vi.fn() }),
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => canonical) },
  };
  return { changes, evidencePackage, repositories, review };
}

function trainingObject(exercises = parseStrengthTrainingText(JUL_14_STRENGTH_NOTE)) {
  return {
    id: "training_2026-07-14_traditional-strength-training_1702-1801", evidence_type: "training", observed_at: "2026-07-14",
    metadata: { activity_type: "Traditional Strength Training", start_time: "17:02", end_time: "18:01", duration_seconds: 3547, active_calories: 494, total_calories: 591, average_heart_rate: 121 },
    source: { source_artifact_refs: ["strength.png", "typed_evidence_0"] }, provenance: { source_artifact_refs: ["strength.png", "typed_evidence_0"] }, exercises,
  };
}

function correctedPackage(base) {
  return { ...structuredClone(base), package_id: "temporary_reinterpretation_id", evidence_objects: [trainingObject()], diagnostics: { stages: [{ label: "Final canonical evidence" }] }, quality: { status: "complete" } };
}

describe("reprocessPendingReviewInPlace", () => {
  it("reparses Static Hold into the pending review without changing its sets or committing canonical evidence", async () => {
    const typedText = [
      "Spider Curls (Static Hold)",
      "35p 13r",
      "35p 10r",
      "35p 10r",
      "35p 10r",
    ].join("\n");
    const state = fixture({
      sources: [{ id: "typed_evidence_0", kind: "typed_evidence", text: typedText }],
    });
    const priorSets = parseStrengthTrainingText(typedText)[0].sets.map((set) => {
      const { executionVariant: _unused, ...copy } = set;
      return copy;
    });
    state.review.interpretedEvidence.evidence_objects = [trainingObject([{
      id: "spider_curls",
      name: "Spider Curls",
      canonicalExerciseId: "spider_curl",
      sets: structuredClone(priorSets),
    }])];
    const service = createPendingEvidenceReviewReprocessingService({
      repositories: state.repositories,
      reinterpret: async (sourcePackage) => ({
        ...structuredClone(sourcePackage),
        evidence_objects: [trainingObject(parseStrengthTrainingText(typedText))],
      }),
    });

    const result = await service.reprocessPendingReviewInPlace(REVIEW_ID);
    const exercise = result.review.interpretedEvidence.evidence_objects[0].exercises[0];
    expect(exercise).toMatchObject({
      id: "spider_curls",
      canonicalExerciseId: "spider_curl",
      executionVariant: { key: "static_hold", label: "Static Hold" },
    });
    expect(exercise.sets.map(({ reps, weight }) => [reps, weight])).toEqual([
      [13, 35], [10, 35], [10, 35], [10, 35],
    ]);
    expect(result.review.status).toBe("pending");
    expect(state.repositories.canonicalEvidence.listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);
  });

  it("reprocesses the retained July 25 Training candidate in place without changing its Activity object or source package", async () => {
    const packageId = "evidence_submission_20260726021441961_images";
    const reviewId = "evidence_review_20260726021515848";
    const artifacts = [
      { id: "screenshot_0", kind: "screenshot", storage_path: "private/founder/evidence/uploads/IMG_1668.png" },
      { id: "screenshot_1", kind: "screenshot", storage_path: "private/founder/evidence/uploads/IMG_1667.png" },
      { id: "typed_evidence_0", kind: "typed_evidence", text: JUL_25_STRENGTH_NOTE },
    ];
    const activity = {
      id: "training_2026-07-25_stair_stepper_1",
      evidence_type: "training",
      observed_at: "2026-07-25",
      metadata: { activity_type: "Stair Stepper", duration_seconds: 1127, active_calories: 229, average_heart_rate: 142 },
      exercises: [],
    };
    const strength = {
      id: "training_2026-07-25_traditional_strength_training_1",
      evidence_type: "training",
      observed_at: "2026-07-25",
      metadata: { activity_type: "Traditional Strength Training", duration_seconds: 6108, active_calories: 527, average_heart_rate: 109 },
      exercises: [{ id: "legacy_partial", name: "Spider Curls", sets: [{ set_number: 1, reps: 14, weight: 40, weight_unit: "lb" }] }],
    };
    const evidencePackage = {
      package_id: packageId,
      captured_at: "2026-07-25",
      observed_date: "2026-07-25",
      userId: "founder",
      provenance: { evidence_date: "2026-07-25", source_artifacts: artifacts },
      evidence_objects: [structuredClone(activity), structuredClone(strength)],
    };
    const review = {
      id: reviewId,
      userId: "founder",
      source: "universal_intake",
      status: "pending",
      createdAt: "2026-07-26T02:15:15.848Z",
      updatedAt: "2026-07-26T02:15:15.848Z",
      interpretedEvidence: structuredClone(evidencePackage),
      evidenceTypes: ["training"],
      confirmation: null,
      commitProgress: {},
      itemDecisions: {},
    };
    const changes = [];
    const repositories = {
      evidenceReviews: createEvidenceReviewRepository([review], { onChange: (name) => changes.push(name) }),
      evidencePackages: createEvidencePackageRepository([evidencePackage]),
      canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => []) },
    };
    const reinterpret = vi.fn(async () => ({
      ...structuredClone(evidencePackage),
      quality: { status: "complete" },
      evidence_objects: [
        structuredClone(activity),
        { ...structuredClone(strength), exercises: parseStrengthTrainingText(JUL_25_STRENGTH_NOTE) },
      ],
    }));
    const service = createPendingEvidenceReviewReprocessingService({ repositories, reinterpret, now: clock() });

    const result = await service.reprocessPendingReviewInPlace(reviewId);
    const updated = await repositories.evidenceReviews.getReviewById(reviewId);
    const [updatedActivity, updatedStrength] = updated.interpretedEvidence.evidence_objects;

    expect(result).toMatchObject({ changed: true, idempotent: false });
    expect(updated).toMatchObject({ id: reviewId, status: "pending", confirmation: null });
    expect(updatedActivity).toEqual(activity);
    expect(updatedStrength.exercises.map((exercise) => exercise.name)).toEqual([
      "Spider Curls",
      "EZ Bar Curls",
      "Cable Rope Pushdowns",
      "Straight Bar Cable Pushdowns",
      "Forearm Curls",
    ]);
    expect(updatedStrength.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(20);
    expect(updatedStrength.exercises[4].sets.map((set) => [set.reps, set.weight])).toEqual([
      [30, 80],
      [28, 80],
      [25, 80],
      [26, 80],
    ]);
    expect(await repositories.evidencePackages.getEvidencePackageById(packageId)).toEqual(evidencePackage);
    expect(changes).toEqual(["evidenceReviews", "evidenceReviews"]);

    const replay = await service.reprocessPendingReviewInPlace(reviewId);
    expect(replay).toMatchObject({ changed: false, idempotent: true });
    expect(reinterpret).toHaveBeenCalledTimes(1);
    expect(changes).toHaveLength(2);
  });

  it("replaces only the pending candidate and remains idempotent", async () => {
    const state = fixture();
    const originalPackage = structuredClone(state.evidencePackage);
    const originalCreatedAt = state.review.createdAt;
    const reinterpret = vi.fn(async () => correctedPackage(state.evidencePackage));
    const service = createPendingEvidenceReviewReprocessingService({ repositories: state.repositories, reinterpret, now: clock() });

    const first = await service.reprocessPendingReviewInPlace(REVIEW_ID);
    const updated = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    const exercises = updated.interpretedEvidence.evidence_objects[0].exercises;
    expect(first).toMatchObject({ changed: true, idempotent: false });
    expect(updated).toMatchObject({ id: REVIEW_ID, status: "pending", createdAt: originalCreatedAt, confirmation: null });
    expect(updated.interpretedEvidence.package_id).toBe(PACKAGE_ID);
    expect(updated.interpretedEvidence.observed_date).toBe("2026-07-14");
    expect(updated.interpretedEvidence.evidence_objects[0].captured_at).toBe("2026-07-14T18:01:00-07:00");
    expect(exercises.map((item) => item.id)).toEqual(["bulgarian_split_squat_smith_machine", "pendulum_squat_machine", "leg_extension", "leg_press_feet_middle"]);
    expect(exercises.flatMap((item) => item.sets)).toHaveLength(13);
    expect(exercises[0].sets.every((set) => set.load_type === "bodyweight")).toBe(true);
    expect(updated.interpretedEvidence.evidence_objects[0].metadata).toMatchObject({ duration_seconds: 3547, active_calories: 494, total_calories: 591, average_heart_rate: 121 });
    expect(updated.reprocessing).toMatchObject({ operation: "reprocessPendingReviewInPlace", status: "complete", sourcePackageId: PACKAGE_ID });
    expect(await state.repositories.evidencePackages.getEvidencePackageById(PACKAGE_ID)).toEqual(originalPackage);
    expect(state.changes).toEqual(["evidenceReviews", "evidenceReviews"]);

    const updatedAt = updated.updatedAt;
    const second = await service.reprocessPendingReviewInPlace(REVIEW_ID);
    expect(second).toMatchObject({ changed: false, idempotent: true });
    expect(reinterpret).toHaveBeenCalledTimes(1);
    expect((await state.repositories.evidenceReviews.getReviewById(REVIEW_ID)).updatedAt).toBe(updatedAt);
    expect(state.changes).toHaveLength(2);
  });

  it("preserves the prior candidate on failure and permits retry", async () => {
    const state = fixture();
    const before = structuredClone(state.review.interpretedEvidence);
    const reinterpret = vi.fn().mockRejectedValueOnce(Object.assign(new Error("provider unavailable"), { code: "PROVIDER_UNAVAILABLE" })).mockResolvedValueOnce(correctedPackage(state.evidencePackage));
    const service = createPendingEvidenceReviewReprocessingService({ repositories: state.repositories, reinterpret, now: clock() });
    await expect(service.reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toThrow("provider unavailable");
    let review = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    expect(review.interpretedEvidence).toEqual(before);
    expect(review.reprocessing).toMatchObject({ status: "failed", error: { code: "PROVIDER_UNAVAILABLE" } });
    await service.reprocessPendingReviewInPlace(REVIEW_ID);
    review = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    expect(review.status).toBe("pending");
    expect(review.reprocessing.status).toBe("complete");
    expect(review.interpretedEvidence.evidence_objects[0].exercises).toHaveLength(4);
  });

  it.each([
    ["confirmed review", { status: "confirmed" }, "REVIEW_NOT_PENDING"],
    ["missing sources", { sources: [] }, "SOURCE_ARTIFACTS_MISSING"],
    ["canonical linkage", { canonical: [{ provenance: { source_package_id: PACKAGE_ID } }] }, "CANONICAL_LINK_EXISTS"],
  ])("rejects %s", async (_name, overrides, code) => {
    const state = fixture(overrides);
    const service = createPendingEvidenceReviewReprocessingService({ repositories: state.repositories, reinterpret: vi.fn() });
    await expect(service.reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code });
    expect(state.changes).toHaveLength(0);
  });

  it("rejects a pending review whose execution already wrote a commit step", async () => {
    const state = fixture();
    state.review.commitProgress = { canonical_commit: { status: "completed" } };
    await expect(createPendingEvidenceReviewReprocessingService({ repositories: state.repositories }).reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code: "REVIEW_ALREADY_APPLIED" });
    expect(state.changes).toHaveLength(0);
  });

  it("rejects missing packages and active claims", async () => {
    const missing = fixture();
    missing.repositories.evidencePackages = createEvidencePackageRepository([]);
    await expect(createPendingEvidenceReviewReprocessingService({ repositories: missing.repositories }).reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    const active = fixture();
    active.review.reprocessing = { status: "in_progress" };
    await expect(createPendingEvidenceReviewReprocessingService({ repositories: active.repositories }).reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code: "REPROCESS_IN_PROGRESS" });
  });

  it("restores bodyweight semantics when a bodyweight-only exercise is reinterpreted as zero-load external weight", async () => {
    const state = semanticFixture({
      priorExercise: exerciseFixture("Hanging Leg Raise", [bodyweightSet(16)]),
      freshExercise: exerciseFixture("Hanging Leg Raise", [zeroLoadSet(16)]),
      sourceText: "Hanging Leg Raise\n16r bodyweight",
    });
    await reprocessSemanticFixture(state);
    expect(await currentSets(state)).toEqual([expect.objectContaining({
      reps: 16,
      load_type: "bodyweight",
      weight: null,
      weight_unit: null,
      measurement_type: "bodyweight_reps",
      set_type: "bodyweight_reps",
    })]);
  });

  it("preserves the stable exercise ID for the same canonical exercise and source order", async () => {
    const priorExercise = {
      ...exerciseFixture("Hanging Leg Raise", [bodyweightSet(16)]),
      id: "exercise_hanging_leg_raise_20260717",
    };
    const freshExercise = {
      ...exerciseFixture("Hanging Leg Raise", [zeroLoadSet(16)]),
      id: "ex_hanging_leg_raise_5",
    };
    const state = semanticFixture({
      priorExercise,
      freshExercise,
      sourceText: "Hanging Leg Raise\n16r bodyweight",
    });
    await reprocessSemanticFixture(state);
    const review = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    expect(review.interpretedEvidence.evidence_objects[0].exercises[0].id).toBe(
      "exercise_hanging_leg_raise_20260717"
    );
  });

  it.each([
    ["added Hanging Leg Raise load", "Hanging Leg Raise\n16 reps with added 10 lb", exerciseFixture("Hanging Leg Raise", [weightedSet(16, 10)])],
    ["weighted Pull-Up", "Pull-Up\n8 reps with added 10 lb", exerciseFixture("Pull-Up", [weightedSet(8, 10)])],
  ])("keeps %s distinct from plain bodyweight", async (_label, sourceText, freshExercise) => {
    const state = semanticFixture({
      priorExercise: exerciseFixture(freshExercise.name, [bodyweightSet(freshExercise.sets[0].reps)]),
      freshExercise,
      sourceText,
    });
    await reprocessSemanticFixture(state);
    expect(await currentSets(state)).toEqual([expect.objectContaining({
      load_type: "external_load",
      weight: 10,
      weight_unit: "lb",
    })]);
  });

  it("does not rewrite an explicitly assisted bodyweight-capable exercise", async () => {
    const state = semanticFixture({
      priorExercise: exerciseFixture("Hanging Leg Raise", [bodyweightSet(16)]),
      freshExercise: exerciseFixture("Hanging Leg Raise", [zeroLoadSet(16)]),
      sourceText: "Hanging Leg Raise\n16 reps assisted",
    });
    await reprocessSemanticFixture(state);
    expect(await currentSets(state)).toEqual([expect.objectContaining({
      load_type: "external_load",
      weight: 0,
      weight_unit: "lb",
    })]);
  });

  it("normalizes explicit zero additional load for a bodyweight-only exercise", async () => {
    const state = semanticFixture({
      priorExercise: exerciseFixture("Pull-Up", [bodyweightSet(8)]),
      freshExercise: exerciseFixture("Pull-Up", [zeroLoadSet(8)]),
      sourceText: "Pull-Up\n8 reps with 0 lb additional load",
    });
    await reprocessSemanticFixture(state);
    expect(await currentSets(state)).toEqual([expect.objectContaining({
      load_type: "bodyweight",
      weight: null,
      weight_unit: null,
    })]);
  });

  it("keeps a legitimate zero-pound machine set external-load", async () => {
    const state = semanticFixture({
      priorExercise: exerciseFixture("Leg Press", [zeroLoadSet(10)]),
      freshExercise: exerciseFixture("Leg Press", [zeroLoadSet(10)]),
      sourceText: "Leg Press\n10 reps at 0 lb",
    });
    await reprocessSemanticFixture(state);
    expect(await currentSets(state)).toEqual([expect.objectContaining({
      load_type: "external_load",
      weight: 0,
      weight_unit: "lb",
    })]);
  });

  it.each([
    ["changed reps", exerciseFixture("Front Raise", [bodyweightSet(10)]), exerciseFixture("Front Raise", [zeroLoadSet(12)])],
    ["changed set count", exerciseFixture("Front Raise", [bodyweightSet(10)]), exerciseFixture("Front Raise", [zeroLoadSet(10), zeroLoadSet(10, 2)])],
    ["exercise identity mismatch", exerciseFixture("Front Raise", [bodyweightSet(10)]), exerciseFixture("Dumbbell Front Raise", [zeroLoadSet(10)])],
  ])("does not blindly reuse prior semantics after %s", async (_label, priorExercise, freshExercise) => {
    const state = semanticFixture({ priorExercise, freshExercise, sourceText: `${freshExercise.name}\n10 reps` });
    await reprocessSemanticFixture(state);
    expect((await currentSets(state)).every((set) => set.load_type === "external_load")).toBe(true);
  });
});

function semanticFixture({ priorExercise, freshExercise, sourceText }) {
  const state = fixture();
  const sourceArtifact = state.evidencePackage.provenance.source_artifacts.find((artifact) => artifact.kind === "typed_evidence");
  sourceArtifact.text = sourceText;
  state.review.interpretedEvidence.provenance = structuredClone(state.evidencePackage.provenance);
  state.review.interpretedEvidence.evidence_objects = [trainingObject([priorExercise])];
  state.freshExercise = freshExercise;
  return state;
}

async function reprocessSemanticFixture(state) {
  const reinterpret = vi.fn(async () => ({
    ...correctedPackage(state.evidencePackage),
    evidence_objects: [trainingObject([state.freshExercise])],
  }));
  return createPendingEvidenceReviewReprocessingService({
    repositories: state.repositories,
    reinterpret,
    now: clock(),
  }).reprocessPendingReviewInPlace(REVIEW_ID);
}

async function currentSets(state) {
  const review = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
  return review.interpretedEvidence.evidence_objects[0].exercises[0].sets;
}

function exerciseFixture(name, sets) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    name,
    sets,
    provenance_ref: "typed_evidence_0",
  };
}

function bodyweightSet(reps, setNumber = 1) {
  return {
    set_number: setNumber,
    reps,
    weight: null,
    weight_unit: "bodyweight",
    load_type: "bodyweight",
    measurement_type: "bodyweight_reps",
    set_type: "bodyweight_reps",
    volume: null,
    duration_seconds: null,
    provenance_ref: "typed_evidence_0",
  };
}

function zeroLoadSet(reps, setNumber = 1) {
  return weightedSet(reps, 0, setNumber);
}

function weightedSet(reps, weight, setNumber = 1) {
  return {
    set_number: setNumber,
    reps,
    weight,
    weight_unit: "lb",
    load_type: "external_load",
    measurement_type: "weighted_reps",
    set_type: "weighted_reps",
    volume: reps * weight,
    duration_seconds: null,
    provenance_ref: "typed_evidence_0",
  };
}

function clock() {
  let tick = 0;
  return () => new Date(Date.parse("2026-07-15T02:00:00.000Z") + tick++ * 1000);
}
