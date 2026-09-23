import { describe, expect, it } from "vitest";
import {
  assessDeterministicStrengthAutoConfirm,
  createHealthKitWorkoutReconciliationReview,
  projectHealthKitWorkoutReconciliationPresentation,
  resolveHealthKitWorkoutReconciliationRecord,
} from "./HealthKitWorkoutReconciliationService.js";

const DAY = "2026-09-23";
const NOW = "2026-09-23T23:30:00.000Z";

describe("deterministic Strength auto-confirm gate", () => {
  it("accepts the production-shaped Sep 23 Logger-window facts for hard-fact reasons, not the score alone", () => {
    const world = fixture();
    expect(assessDeterministicStrengthAutoConfirm(world)).toEqual({
      eligible: true,
      ruleVersion: "healthkit-strength-auto-confirm-v1",
      reasons: [],
      candidate: {
        loggerSessionCanonicalId: "logger-sep23",
        confidence: 95,
        basis: "logger_session_window",
        overlapSeconds: 3480,
        startAligned: true,
        endAligned: true,
      },
    });
  });

  it("refuses a high score with a competing plausible session", () => {
    const world = fixture();
    world.assessment = {
      ...world.assessment,
      outcome: "ambiguous_multiple",
      candidates: [
        ...world.assessment.candidates,
        { ...world.assessment.candidates[0], loggerSessionCanonicalId: "logger-other", confidence: 94 },
      ],
    };
    world.canonicalObjects.push(logger("logger-other"));
    expect(assessDeterministicStrengthAutoConfirm(world)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["assessment_not_confident", "candidate_not_unique"]),
    });
  });

  it("refuses incompatible family and a temporal/basis hard failure", () => {
    const incompatible = fixture();
    incompatible.canonicalWorkout = {
      ...incompatible.canonicalWorkout,
      current: { ...incompatible.canonicalWorkout.current, family: "cardio" },
    };
    expect(assessDeterministicStrengthAutoConfirm(incompatible).reasons).toContain("workout_not_strength");

    const temporal = fixture();
    temporal.assessment = {
      ...temporal.assessment,
      candidates: [{
        ...temporal.assessment.candidates[0],
        confidence: 99,
        basis: "temporal_and_telemetry",
        overlapSeconds: 0,
        startAligned: false,
        endAligned: false,
      }],
    };
    expect(assessDeterministicStrengthAutoConfirm(temporal)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["deterministic_basis_not_allowlisted"]),
    });
  });

  it("refuses active relationship competition and ignores history as an eligibility input", () => {
    const competed = fixture();
    competed.existingLinks.push({
      id: "other-link",
      status: "candidate",
      canonicalWorkoutId: competed.canonicalWorkout.id,
      loggerSessionCanonicalId: "logger-other",
    });
    expect(assessDeterministicStrengthAutoConfirm({
      ...competed,
      reconciliationHistory: [{ action: "confirm", confidenceAdjustment: 1000 }],
    })).toMatchObject({ eligible: false, reasons: ["competing_active_relationship"] });
  });

  it("refuses a possible duplicate Apple workout even when every match score and window fact is otherwise exact", () => {
    const world = fixture();
    world.canonicalWorkouts.push({
      ...world.canonicalWorkout,
      id: "workout-sep23-recreated",
      createdAt: "2026-09-23T23:31:00.000Z",
    });
    expect(assessDeterministicStrengthAutoConfirm(world)).toMatchObject({
      eligible: false,
      reasons: ["possible_duplicate_canonical_workout"],
    });
  });

  it("refuses a Logger session that is no longer active detailed Strength evidence", () => {
    const world = fixture();
    world.canonicalObjects[0] = {
      ...world.canonicalObjects[0],
      quality: { status: "superseded" },
    };
    expect(assessDeterministicStrengthAutoConfirm(world)).toMatchObject({
      eligible: false,
      reasons: ["logger_session_not_active_detailed_strength"],
    });
  });
});

describe("structured reconciliation history", () => {
  it("projects one concise review and records a strategically inert resolution exactly once", () => {
    const world = fixture();
    const ambiguous = {
      ...world.assessment,
      outcome: "ambiguous_multiple",
      reason: "multiple_plausible_logger_sessions",
      candidates: [
        ...world.assessment.candidates,
        { ...world.assessment.candidates[0], loggerSessionCanonicalId: "logger-other", confidence: 94 },
      ],
    };
    const review = createHealthKitWorkoutReconciliationReview({
      ownerUserId: "founder",
      canonicalWorkout: world.canonicalWorkout,
      assessment: ambiguous,
      now: NOW,
    });
    const presentation = projectHealthKitWorkoutReconciliationPresentation({ ...review, version: 1 });
    expect(presentation).toMatchObject({
      kind: "healthkit_workout_reconciliation",
      status: "pending",
      actions: [
        { action: "confirm", loggerSessionCanonicalId: "logger-sep23" },
        { action: "confirm", loggerSessionCanonicalId: "logger-other" },
        { action: "no_match" },
      ],
      strategicEvidenceEligibility: "quarantined",
    });
    const resolved = resolveHealthKitWorkoutReconciliationRecord(review, {
      action: "confirm",
      selectedLoggerSessionCanonicalId: "logger-sep23",
      linkId: "link-sep23",
      by: { kind: "founder", ref: "command" },
      now: NOW,
      basis: { mode: "founder_explicit_selection" },
    });
    expect(resolved).toMatchObject({
      status: "resolved_confirmed",
      resolution: {
        action: "confirm",
        selectedLoggerSessionCanonicalId: "logger-sep23",
        strategicEvidenceEligibility: "quarantined",
      },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(resolved.resolutionHistory).toHaveLength(1);
    expect(resolveHealthKitWorkoutReconciliationRecord(resolved, {
      action: "confirm",
      selectedLoggerSessionCanonicalId: "logger-other",
      now: NOW,
    })).toBe(resolved);
  });
});

function fixture() {
  const canonicalWorkout = workout();
  const assessment = {
    matcherVersion: "healthkit-strength-matcher-v5",
    outcome: "confident_match",
    reason: "single_overlapping_session",
    unverifiableSessionCount: 0,
    candidates: [{
      loggerSessionCanonicalId: "logger-sep23",
      confidence: 95,
      basis: "logger_session_window",
      reasons: ["only live Logger session", "completion aligns"],
      overlapSeconds: 3480,
      startAligned: true,
      endAligned: true,
    }],
  };
  const link = {
    id: "link-sep23",
    status: "candidate",
    canonicalWorkoutId: canonicalWorkout.id,
    loggerSessionCanonicalId: "logger-sep23",
  };
  return {
    canonicalWorkout,
    assessment,
    canonicalObjects: [logger("logger-sep23")],
    canonicalWorkouts: [canonicalWorkout],
    existingLinks: [link],
    link,
  };
}

function workout() {
  return {
    id: "workout-sep23",
    localDate: DAY,
    createdAt: NOW,
    current: {
      family: "strength",
      canonicalType: "traditional_strength_training",
      localDate: DAY,
      startedAt: `${DAY}T17:00:00.000Z`,
      endedAt: `${DAY}T18:00:00.000Z`,
      telemetry: { durationSeconds: 3600 },
    },
  };
}

function logger(id) {
  return {
    canonicalId: id,
    quality: { status: "active" },
    payload: {
      id,
      evidence_type: "training",
      observed_at: DAY,
      metadata: {
        activity_type: "Traditional Strength Training",
        logger_origin: "training_logger",
        logger_mode: "live",
        start_time: `${DAY}T17:01:00.000Z`,
        end_time: `${DAY}T17:59:00.000Z`,
      },
      exercises: [{ name: "exercise", sets: [{ reps: 8 }] }],
    },
  };
}
