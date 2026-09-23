import { describe, expect, it } from "vitest";
import { summarizeHealthKitTrainingReconciliation } from "./HealthKitTrainingReconciliationAudit.js";

const DAY = "2026-09-22";
const logger = (id, extra = {}) => ({
  canonicalId: id, version: 2, quality: { status: "active" },
  provenance: { evidence_package_ids: [`training_logger_submission_${id}`, ...(extra.packages ?? [])], evidence_review_ids: extra.reviews ?? [], contributing_evidence_object_ids: [], source_artifact_refs: [] },
  payload: {
    id, evidence_type: "training", observed_at: DAY,
    source: { application: extra.application ?? "Training Logger", modality: extra.modality ?? "manual" },
    metadata: { activity_type: "Traditional Strength Training", logger_origin: "training_logger", ...(extra.metadata ?? {}) },
    exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }, { reps: 5, weight: 225 }] }, { name: "Bench", sets: [{ reps: 8, weight: 155 }] }],
  },
});
const telemetryOnly = (id) => ({
  canonicalId: id, version: 1, quality: { status: "active" },
  provenance: { evidence_package_ids: ["pkg-screenshot"], evidence_review_ids: ["rev-1"] },
  payload: { id, evidence_type: "training", observed_at: DAY, source: { application: "Apple Fitness", modality: "screenshot" }, metadata: { activity_type: "Traditional Strength Training", start_time: "x", active_calories: 400 }, exercises: [] },
});
const review = (extra = {}) => ({
  id: "rev-1", status: "confirmed",
  interpretedEvidence: { package_id: "pkg-screenshot", review_metadata: extra.metadata ?? {}, evidence_objects: [{ evidence_type: "training", observed_at: DAY, reconciliation: extra.reconciliation }] },
  commitProgress: { canonical_commit: { status: "completed", result: { canonicalEvidenceIds: extra.canonicalIds ?? [] } } },
});
const workout = (id, family, canonicalType) => ({ id, localDate: DAY, current: { family, canonicalType }, evidenceEligibility: { state: "quarantined" }, revision: 1, linkAssessment: family === "strength" ? { outcome: "confident_match" } : undefined, coexistence: family === "cardio" ? { state: "no_other_source" } : undefined });
const link = (workoutId, sessionId) => ({ id: `link-${workoutId}`, localDate: DAY, status: "candidate", matchOutcome: "confident_match", matchBasis: "temporal_and_telemetry", confidence: 99, canonicalWorkoutId: workoutId, loggerSessionCanonicalId: sessionId, contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" }, evidenceEligibility: { state: "quarantined" } });

describe("same-event Training reconciliation audit", () => {
  it("reports one_logical_event when the screenshot was merged into the Logger object (target-bound support) and never leaks content", () => {
    const summary = summarizeHealthKitTrainingReconciliation({
      canonicalEvidenceObjects: [logger("S1", { packages: ["pkg-screenshot"], reviews: ["rev-1"], application: "Training Logger + Apple Fitness", modality: "mixed", metadata: { start_time: "x", end_time: "y", duration_seconds: 3600, active_calories: 400 } })],
      evidenceReviews: [review({ metadata: { recoveryContext: { kind: "training_logger_support" }, targetTrainingSessionCanonicalId: "S1" }, reconciliation: { match_basis: "explicit_native_training_support_binding", target_canonical_id: "S1" }, canonicalIds: ["S1"] })],
      evidencePackages: [{ id: "pkg-screenshot", status: "confirmed", evidence_objects: [{ evidence_type: "training", observed_at: DAY }] }],
      trainingPerformanceEvents: [{ id: "e1", workoutDate: DAY, sourceCanonicalTrainingId: "S1", sourceSessionId: "S1" }],
      canonicalWorkouts: [workout("w-strength", "strength", "traditional_strength_training"), workout("w-walk-1", "cardio", "walking"), workout("w-walk-2", "cardio", "walking")],
      links: [link("w-strength", "S1")],
      claims: [],
      localDate: DAY,
    });
    expect(summary.shape).toBe("one_logical_event");
    expect(summary.training).toMatchObject({ activeStrengthCount: 1, activeStrengthTelemetryOnlyCount: 0, supersededStrengthCount: 0, activeStrengthCarryingScreenshotPackage: 1 });
    expect(summary.training.records[0]).toMatchObject({ active: true, isStrength: true, exerciseCount: 2, setCount: 3, sourceModality: "mixed", loggerOrigin: "training_logger", telemetryPresent: { startTime: true, activeCalories: true } });
    expect(summary.screenshotReviews[0]).toMatchObject({ status: "confirmed", recoveryContextKind: "training_logger_support", explicitSupportBindings: 1, canonicalCommitStatus: "completed" });
    expect(summary.screenshotReviews[0].targetTrainingSessionCanonicalId).toBe(summary.training.records[0].canonicalId);
    expect(summary.trainingPerformanceEvents).toMatchObject({ count: 1, pointingAtActiveStrength: 1 });
    expect(summary.healthKit).toMatchObject({ strengthWorkoutCount: 1, cardioWorkoutCount: 2, cardioWithLinks: 0, confirmedLinkCount: 0 });
    expect(summary.healthKit.links[0]).toMatchObject({ status: "candidate", confidence: 99, loggerSessionIsTheActiveStrengthObject: true, claimsHeld: 0 });
    const text = JSON.stringify(summary);
    for (const leak of ["Squat", "Bench", "225", "155", "S1", "w-strength", "rev-1", "pkg-screenshot"]) expect(text).not.toContain(leak);
  });

  it("reports a second telemetry-only object when an unbound screenshot did not match the Logger session", () => {
    const summary = summarizeHealthKitTrainingReconciliation({
      canonicalEvidenceObjects: [logger("S1"), telemetryOnly("SHOT")],
      evidenceReviews: [review({ canonicalIds: ["SHOT"] })],
      canonicalWorkouts: [workout("w-strength", "strength", "traditional_strength_training")],
      links: [link("w-strength", "S1")],
      localDate: DAY,
    });
    expect(summary.shape).toBe("second_telemetry_only_object");
    expect(summary.training).toMatchObject({ activeStrengthCount: 1, activeStrengthTelemetryOnlyCount: 1, activeStrengthCarryingScreenshotPackage: 0 });
    expect(summary.healthKit.links[0].loggerSessionIsTheActiveStrengthObject).toBe(true);
  });

  it("reports multiple active strength objects, and a superseded Logger object whose candidate no longer points at the active object", () => {
    const two = summarizeHealthKitTrainingReconciliation({
      canonicalEvidenceObjects: [logger("S1"), logger("S2")], canonicalWorkouts: [workout("w", "strength", "traditional_strength_training")], links: [link("w", "S1")], localDate: DAY,
    });
    expect(two.shape).toBe("multiple_active_strength_objects");
    const superseded = { ...logger("S1"), quality: { status: "superseded", supersededBy: "S1-merged" } };
    const merged = logger("S1-merged", { packages: ["pkg-screenshot"] });
    const summary = summarizeHealthKitTrainingReconciliation({
      canonicalEvidenceObjects: [superseded, merged], evidenceReviews: [review({ canonicalIds: ["S1-merged"] })], canonicalWorkouts: [workout("w", "strength", "traditional_strength_training")], links: [link("w", "S1")], localDate: DAY,
    });
    expect(summary.shape).toBe("one_logical_event");
    expect(summary.training).toMatchObject({ activeStrengthCount: 1, supersededStrengthCount: 1 });
    expect(summary.training.records.find((r) => !r.active).supersededBy).toBe(summary.training.records.find((r) => r.active).canonicalId);
    expect(summary.healthKit.links[0].loggerSessionIsTheActiveStrengthObject).toBe(false);
  });

  it("ignores other days and reports no active strength object when the day has none", () => {
    const summary = summarizeHealthKitTrainingReconciliation({ canonicalEvidenceObjects: [{ ...logger("S1"), payload: { ...logger("S1").payload, observed_at: "2026-09-21" } }], localDate: DAY });
    expect(summary.shape).toBe("no_active_strength_object");
    expect(summary.training.records).toHaveLength(0);
  });
});
