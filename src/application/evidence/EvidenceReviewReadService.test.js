import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewReadService } from "./EvidenceReviewReadService.js";
import { getHealthKitWorkoutReconciliationId } from "../../domain/services/HealthKitWorkoutReconciliationService.js";

describe("EvidenceReviewReadService native detail", () => {
  it("refuses generic edit context for workout reconciliation records", async () => {
    const canonicalWorkoutId = "healthkit_canonical_workout_edit_blocked";
    const review = {
      schemaVersion: "healthkit-workout-reconciliation-v1",
      reviewKind: "healthkit_workout_reconciliation",
      id: getHealthKitWorkoutReconciliationId(canonicalWorkoutId),
      userId: "founder",
      canonicalWorkoutId,
      status: "pending",
      resolutionHistory: [{ mustNotEscape: true }],
      lifecycleHistory: [{ mustNotEscape: true }],
    };
    const store = {
      run: vi.fn(async (_scope, operation) => operation()),
      getReview: vi.fn(async () => review),
      getOwnerUserId: vi.fn(async () => "founder"),
    };

    await expect(createEvidenceReviewReadService({ store }).getEditContext(review.id)).resolves.toBeNull();
  });

  it("returns a typed workout reconciliation presentation without loading evidence objects", async () => {
    const canonicalWorkoutId = "healthkit_canonical_workout_one";
    const review = {
      schemaVersion: "healthkit-workout-reconciliation-v1",
      reviewKind: "healthkit_workout_reconciliation",
      id: getHealthKitWorkoutReconciliationId(canonicalWorkoutId),
      userId: "founder",
      canonicalWorkoutId,
      status: "pending",
      version: 2,
      createdAt: "2026-09-23T20:00:00.000Z",
      localDate: "2026-09-23",
      workout: { family: "strength", canonicalType: "traditional_strength_training", resolutionHistory: ["must-not-escape"] },
      candidates: [{ loggerSessionCanonicalId: "session-a", confidence: 95, basis: "logger_session_window", resolutionHistory: ["must-not-escape"] }],
      resolution: { action: "confirm", selectedLoggerSessionCanonicalId: "must-not-escape", linkId: "must-not-escape" },
    };
    const store = {
      run: vi.fn(async (_scope, operation) => operation()),
      getReview: vi.fn(async () => review),
      getOwnerUserId: vi.fn(async () => "founder"),
      getPackage: vi.fn(),
      listRelevantCanonicalObjects: vi.fn(),
    };
    const result = await createEvidenceReviewReadService({ store }).getReview(review.id);
    expect(result).toMatchObject({
      review: {
        id: review.id,
        status: "pending",
        version: 2,
        createdAt: "2026-09-23T20:00:00.000Z",
      },
      evidencePackage: null,
      canonicalObjects: [],
      presentation: {
        kind: "healthkit_workout_reconciliation",
        version: "2",
        actions: [
          { action: "confirm", loggerSessionCanonicalId: "session-a" },
          { action: "no_match" },
        ],
        strategicEvidenceEligibility: "quarantined",
      },
    });
    expect(result.review).not.toHaveProperty("candidates");
    expect(result.review).not.toHaveProperty("resolutionHistory");
    expect(result.presentation.workout).not.toHaveProperty("resolutionHistory");
    expect(result.presentation.candidates[0]).not.toHaveProperty("resolutionHistory");
    expect(result.presentation.resolution).toBeNull();
    expect(store.getPackage).not.toHaveBeenCalled();
    expect(store.listRelevantCanonicalObjects).not.toHaveBeenCalled();
  });

  it("never exposes raw malformed reconciliation terminal state beside the sanitized projection", async () => {
    const canonicalWorkoutId = "healthkit_canonical_workout_corrupt";
    const review = {
      schemaVersion: "healthkit-workout-reconciliation-v1",
      reviewKind: "healthkit_workout_reconciliation",
      id: getHealthKitWorkoutReconciliationId(canonicalWorkoutId),
      userId: "founder",
      canonicalWorkoutId,
      status: "resolved_confirmed",
      version: 7,
      createdAt: "2026-09-23T20:00:00.000Z",
      localDate: "2026-09-23",
      workout: { family: "strength", canonicalType: "traditional_strength_training" },
      candidates: [],
      resolution: { action: "confirm", selectedLoggerSessionCanonicalId: "session-a", linkId: "link-a" },
      resolutionHistory: [],
      lifecycleHistory: [],
    };
    const store = {
      run: vi.fn(async (_scope, operation) => operation()),
      getReview: vi.fn(async () => review),
      getOwnerUserId: vi.fn(async () => "founder"),
    };
    const result = await createEvidenceReviewReadService({ store }).getReview(review.id);
    expect(result.presentation).toMatchObject({ status: "invalid_terminal_history", resolution: null, actions: [] });
    expect(result.review).toEqual({
      id: review.id,
      status: "invalid_terminal_history",
      version: 7,
      createdAt: "2026-09-23T20:00:00.000Z",
    });
    expect(result.review).not.toHaveProperty("resolution");
    expect(result.review).not.toHaveProperty("resolutionHistory");
    expect(result.review).not.toHaveProperty("lifecycleHistory");
  });

  it("returns the same systemic presentation used by the web review surface", async () => {
    const interpretedEvidence = {
      package_id: "package-1",
      evidence_objects: [
        { id: "weight-1", evidence_type: "weight", observed_at: "2026-09-08", value: 170.4, unit: "lb" },
        { id: "training-1", evidence_type: "training", observed_at: "2026-09-08", exercises: [
          { id: "bench-1", name: "Bench Press", canonicalExerciseId: "bench_press", sets: [{ reps: 8, weight: 185 }] },
        ] },
        { id: "activity-1", evidence_type: "activity", observed_at: "2026-09-11", daily_activity: { move_calories: 799, exercise_minutes: 100 } },
        { id: "nutrition-1", evidence_type: "nutrition", observed_at: "2026-09-11", daily_totals: { calories: 650, protein_g: 52 }, meals: [{ id: "meal-1", name: "Lunch", totals: { calories: 650, protein_g: 52 }, foods: [{ id: "food-1", name: "Chicken bowl", servings: 1, nutrients: { calories: 650 } }] }] },
        { id: "dexa-1", evidence_type: "dexa_scan", observed_at: "2026-08-15", totalMass: { value: 161.1 }, bodyFatPercentage: 7.6, fatMass: { value: 12.8 }, leanMass: { value: 148.3 } },
        { id: "photos-1", evidence_type: "photo_session", observed_at: "2026-08-22", photos: [{ id: "photo-1", pose: "front_relaxed" }] },
      ],
      provenance: { source_artifacts: [{ kind: "typed_evidence", text: "170.4 lb and workout" }] },
    };
    const review = {
      id: "review-1", userId: "founder", status: "pending", version: 3,
      interpretedEvidence,
      itemDecisions: { "training-1": { included: false } },
    };
    const store = {
      run: vi.fn(async (_scope, operation) => operation()),
      getReview: vi.fn(async () => review),
      getOwnerUserId: vi.fn(async () => "founder"),
      getPackage: vi.fn(async () => null),
      listRelevantCanonicalObjects: vi.fn(async () => []),
    };

    const result = await createEvidenceReviewReadService({ store }).getReview("review-1");

    expect(result.presentation.summary).toMatchObject({ included: 5, excluded: 1 });
    expect(result.presentation.items[0]).toMatchObject({ title: "Weight", date: "Sep 8, 2026", included: true });
    expect(result.presentation.items[1]).toMatchObject({ title: "Workout", included: false });
    expect(result.presentation.items[1].exercises[0]).toMatchObject({ name: "Bench Press", sets: ["8 reps @ 185 lb"] });
    expect(result.presentation.items[2]).toMatchObject({ title: "Activity", metrics: expect.arrayContaining([{ label: "Active calories", value: "799 cal" }, { label: "Exercise", value: "100 min" }]) });
    expect(result.presentation.items[3]).toMatchObject({ title: "Nutrition", meals: [{ id: "meal-1", name: "Lunch", foodCount: 1, summary: "650 cal · 52 g protein", foods: [{ id: "food-1", name: "Chicken bowl", brand: null, serving: "1 serving", calories: "650 cal" }], totals: { calories: 650, protein_g: 52 } }] });
    expect(result.presentation.items[4]).toMatchObject({ title: "DEXA", metrics: expect.arrayContaining([{ label: "Total mass", value: "161.1 lb" }, { label: "Lean tissue", value: "148.3 lb" }]) });
    expect(result.presentation.items[5]).toMatchObject({ title: "Progress Photos", metrics: expect.arrayContaining([{ label: "Poses", value: expect.stringContaining("1 photo") }]) });
  });
});
