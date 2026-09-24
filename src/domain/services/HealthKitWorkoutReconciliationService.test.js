import { describe, expect, it } from "vitest";
import {
  assessDeterministicStrengthAutoConfirm,
  createHealthKitWorkoutReconciliationReview,
  hasExactHealthKitWorkoutReconciliationResolution,
  hasExactStoredHealthKitWorkoutReconciliationTerminal,
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
        substantiveOverlap: null,
        trustedLoggerProvenance: null,
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

  it("requires verified temporal compatibility even for explicit source identity", () => {
    const world = fixture();
    const explicit = (temporal = {}) => ({
      ...world.assessment.candidates[0],
      confidence: 100,
      basis: "explicit_source_identity",
      substantiveOverlap: false,
      overlapSeconds: null,
      startAligned: null,
      endAligned: null,
      ...temporal,
    });
    for (const candidate of [
      explicit(),
      explicit({ overlapSeconds: 0, startAligned: false, endAligned: false }),
      explicit({ overlapSeconds: 3000, substantiveOverlap: true, startAligned: false, endAligned: false }),
    ]) {
      expect(assessDeterministicStrengthAutoConfirm({
        ...world,
        assessment: { ...world.assessment, candidates: [candidate] },
      })).toMatchObject({
        eligible: false,
        reasons: expect.arrayContaining(["deterministic_basis_not_allowlisted"]),
      });
    }
    expect(assessDeterministicStrengthAutoConfirm({
      ...world,
      assessment: {
        ...world.assessment,
        candidates: [explicit({
          substantiveOverlap: true,
          overlapSeconds: 3480,
          startAligned: true,
          endAligned: false,
        })],
      },
    })).toMatchObject({ eligible: true, reasons: [] });
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

  it.each(["screenshot", "voice", "import", "manual"])("refuses aligned %s evidence without trusted live Logger provenance", (modality) => {
    const world = fixture();
    world.canonicalObjects[0] = {
      ...world.canonicalObjects[0],
      payload: {
        ...world.canonicalObjects[0].payload,
        source: { application: "Untrusted evidence", modality },
        metadata: {
          ...world.canonicalObjects[0].payload.metadata,
          logger_origin: undefined,
          logger_mode: undefined,
        },
      },
    };
    world.assessment = {
      ...world.assessment,
      candidates: [{
        ...world.assessment.candidates[0],
        confidence: 100,
        basis: "explicit_source_identity",
        substantiveOverlap: true,
        trustedLoggerProvenance: false,
      }],
    };
    expect(assessDeterministicStrengthAutoConfirm(world)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["logger_session_provenance_untrusted"]),
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
      basis: { mode: "founder_explicit_selection", matcherVersion: "healthkit-strength-matcher-v5", rejectedAlternativeLoggerSessionCanonicalIds: [] },
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
    expect(projectHealthKitWorkoutReconciliationPresentation({ ...resolved, version: 2 })).toMatchObject({
      status: "resolved_confirmed",
      resolution: {
        action: "confirm",
        selectedLoggerSessionCanonicalId: "logger-sep23",
        linkId: "link-sep23",
      },
    });
    expect(resolved.resolutionHistory).toHaveLength(1);
    expect(hasExactHealthKitWorkoutReconciliationResolution(resolved, {
      action: "confirm", selectedLoggerSessionCanonicalId: "logger-sep23", linkId: "link-sep23",
      ownerUserId: "founder", canonicalWorkoutId: world.canonicalWorkout.id,
    })).toBe(true);
    for (const corrupt of [
      { ...resolved, id: "healthkit_workout_reconciliation_wrong" },
      { ...resolved, userId: "other-user" },
      { ...resolved, canonicalWorkoutId: "other-workout" },
      { ...resolved, resolutionHistory: [{ ...resolved.resolutionHistory[0], at: "2026-09-23T23:31:00.000Z" }] },
      { ...resolved, resolutionHistory: [{ ...resolved.resolutionHistory[0], by: { kind: "founder", ref: "other" } }] },
      { ...resolved, resolutionHistory: [{ ...resolved.resolutionHistory[0], basis: { mode: "invented" } }] },
      { ...resolved, resolution: { ...resolved.resolution, by: { kind: "system_matcher", ref: "wrong-actor" } }, resolutionHistory: [{ ...resolved.resolutionHistory[0], by: { kind: "system_matcher", ref: "wrong-actor" } }] },
      { ...resolved, resolution: { ...resolved.resolution, basis: { mode: "founder_explicit_selection" } }, resolutionHistory: [{ ...resolved.resolutionHistory[0], basis: { mode: "founder_explicit_selection" } }] },
      { ...resolved, resolution: { ...resolved.resolution, basis: { ...resolved.resolution.basis, matcherVersion: "forged" } }, resolutionHistory: [{ ...resolved.resolutionHistory[0], basis: { ...resolved.resolutionHistory[0].basis, matcherVersion: "forged" } }] },
      { ...resolved, resolution: { ...resolved.resolution, basis: { ...resolved.resolution.basis, actorRef: "other-command" } }, resolutionHistory: [{ ...resolved.resolutionHistory[0], basis: { ...resolved.resolutionHistory[0].basis, actorRef: "other-command" } }] },
      { ...resolved, resolution: { ...resolved.resolution, basis: { ...resolved.resolution.basis, ruleVersion: "healthkit-strength-auto-confirm-v1" } }, resolutionHistory: [{ ...resolved.resolutionHistory[0], basis: { ...resolved.resolutionHistory[0].basis, ruleVersion: "healthkit-strength-auto-confirm-v1" } }] },
      { ...resolved, lifecycleHistory: resolved.lifecycleHistory.map((entry) => entry.status === "resolved_confirmed" ? { ...entry, at: "2026-09-23T23:31:00.000Z" } : entry) },
      { ...resolved, lifecycleHistory: [resolved.lifecycleHistory[0], { status: "garbage", at: "2030-01-01T00:00:00.000Z", by: { kind: "system_matcher" } }, resolved.lifecycleHistory.at(-1)] },
      { ...resolved, lifecycleHistory: [resolved.lifecycleHistory[0], { status: "pending", at: "2030-01-01T00:00:00.000Z", by: { kind: "system_matcher" } }, resolved.lifecycleHistory.at(-1)] },
      { ...resolved, updatedAt: "2026-09-23T23:31:00.000Z" },
      { ...resolved, strategicEvidenceEligibility: "eligible" },
      { ...resolved, evidenceEligibility: { ...resolved.evidenceEligibility, state: "eligible" } },
    ]) {
      expect(hasExactHealthKitWorkoutReconciliationResolution(corrupt, {
        action: "confirm", selectedLoggerSessionCanonicalId: "logger-sep23", linkId: "link-sep23",
        ownerUserId: "founder", canonicalWorkoutId: world.canonicalWorkout.id,
      })).toBe(false);
      expect(projectHealthKitWorkoutReconciliationPresentation({ ...corrupt, version: 2 }, {
        ownerUserId: "founder", canonicalWorkoutId: world.canonicalWorkout.id,
      }))
        .toMatchObject({ status: expect.stringMatching(/^invalid_/), resolution: null, actions: [] });
    }
    const automatic = resolveHealthKitWorkoutReconciliationRecord(review, {
      action: "confirm",
      selectedLoggerSessionCanonicalId: "logger-sep23",
      linkId: "link-sep23",
      by: { kind: "system_matcher", ref: "healthkit-strength-auto-confirm-v1" },
      now: NOW,
      basis: { mode: "deterministic_auto_confirm", ruleVersion: "healthkit-strength-auto-confirm-v1" },
    });
    expect(hasExactHealthKitWorkoutReconciliationResolution(automatic, {
      action: "confirm", selectedLoggerSessionCanonicalId: "logger-sep23", linkId: "link-sep23",
    })).toBe(true);
    for (const forged of [
      { ruleVersion: "healthkit-strength-auto-confirm-v999", actorRef: "healthkit-strength-auto-confirm-v1" },
      { ruleVersion: "healthkit-strength-auto-confirm-v1", actorRef: "other-rule" },
    ]) {
      const corrupt = {
        ...automatic,
        resolution: { ...automatic.resolution, basis: { ...automatic.resolution.basis, ...forged } },
        resolutionHistory: [{ ...automatic.resolutionHistory[0], basis: { ...automatic.resolutionHistory[0].basis, ...forged } }],
      };
      expect(hasExactStoredHealthKitWorkoutReconciliationTerminal(corrupt)).toBe(false);
    }
    const noMatch = resolveHealthKitWorkoutReconciliationRecord(review, {
      action: "no_match",
      by: { kind: "founder", ref: "no-match-command" },
      now: NOW,
      basis: {
        mode: "founder_explicit_no_match",
        matcherVersion: "healthkit-strength-matcher-v5",
        freshAssessmentOutcome: "ambiguous_multiple",
        releasedCandidateLinkIds: [],
      },
    });
    expect(hasExactStoredHealthKitWorkoutReconciliationTerminal(noMatch)).toBe(true);
    const noMatchWithRule = {
      ...noMatch,
      resolution: { ...noMatch.resolution, basis: { ...noMatch.resolution.basis, ruleVersion: "healthkit-strength-auto-confirm-v1" } },
      resolutionHistory: [{ ...noMatch.resolutionHistory[0], basis: { ...noMatch.resolutionHistory[0].basis, ruleVersion: "healthkit-strength-auto-confirm-v1" } }],
    };
    expect(hasExactStoredHealthKitWorkoutReconciliationTerminal(noMatchWithRule)).toBe(false);
    expect(hasExactStoredHealthKitWorkoutReconciliationTerminal({
      ...noMatch,
      lifecycleHistory: [
        noMatch.lifecycleHistory[0],
        { status: "garbage", at: "2030-01-01T00:00:00.000Z", by: { kind: "system_matcher" } },
        noMatch.lifecycleHistory.at(-1),
      ],
    })).toBe(false);
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
