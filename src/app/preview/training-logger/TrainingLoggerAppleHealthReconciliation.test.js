import { describe, expect, it } from "vitest";
import {
  APPLE_HEALTH_MATCH_STATES,
  APPLE_HEALTH_RECONCILIATION_FIXTURES,
  APPLE_WORKOUT_CANONICAL_OWNER_TYPES,
  APPLE_WORKOUT_CONSUMPTION_STATES,
  canFinalizeAppleHealthReconciliation,
  consumeAppleWorkoutEvidence,
  continueWithoutStrengthEvidence,
  createAppleHealthReconciliation,
  finalizeAppleHealthReconciliation,
  listUnlinkedStrengthCandidates,
  selectStrengthEvidence,
} from "./TrainingLoggerAppleHealthReconciliation";

describe("Training Logger Apple Health reconciliation", () => {
  it("filters linked workouts before candidate presentation", () => {
    const reconciliation = createAppleHealthReconciliation({
      evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.BATCH,
      workoutDate: "2026-08-10",
    });
    expect(reconciliation.strengthCandidateIds).toEqual([
      "apple_workout_strength_20260810_1612",
    ]);
    expect(reconciliation.strengthCandidateIds).not.toContain(
      "apple_workout_strength_consumed_20260810_0700"
    );
    expect(listUnlinkedStrengthCandidates({
      evidenceItems: reconciliation.normalizedEvidence,
      workoutDate: "2026-08-10",
    }).every((item) => item.consumption.state === APPLE_WORKOUT_CONSUMPTION_STATES.UNLINKED))
      .toBe(true);
  });

  it("keeps every proposed batch item on the detailed workout date", () => {
    const reconciliation = createAppleHealthReconciliation({
      evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.BATCH,
      workoutDate: "2026-08-09",
    });
    expect(reconciliation.strengthCandidateIds).toEqual([]);
    expect(reconciliation.additionalEvidenceActions).toEqual([]);
    expect(reconciliation.matchState).toBe(APPLE_HEALTH_MATCH_STATES.NONE);
  });

  it("requires explicit selection when multiple unlinked strength workouts are plausible", () => {
    let reconciliation = createAppleHealthReconciliation({
      evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.MULTIPLE,
      workoutDate: "2026-08-10",
    });
    expect(reconciliation.matchState).toBe(APPLE_HEALTH_MATCH_STATES.MULTIPLE);
    expect(reconciliation.selectedStrengthSourceId).toBeNull();
    expect(canFinalizeAppleHealthReconciliation(reconciliation)).toBe(false);
    reconciliation = selectStrengthEvidence(
      reconciliation,
      reconciliation.strengthCandidateIds[1]
    );
    expect(reconciliation.selectedStrengthSourceId).toBe(
      "apple_workout_functional_20260810_1740"
    );
    expect(canFinalizeAppleHealthReconciliation(reconciliation)).toBe(true);
  });

  it("allows no-match logging without fabricating a strength link", () => {
    let reconciliation = createAppleHealthReconciliation({
      evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.NONE,
      workoutDate: "2026-08-10",
    });
    expect(reconciliation.matchState).toBe(APPLE_HEALTH_MATCH_STATES.NONE);
    expect(canFinalizeAppleHealthReconciliation(reconciliation)).toBe(false);
    reconciliation = continueWithoutStrengthEvidence(reconciliation);
    reconciliation = finalizeAppleHealthReconciliation(reconciliation);
    expect(reconciliation.proposedCanonicalRecords[0]).toMatchObject({
      canonicalOwnerType: APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
      sourceWorkoutId: null,
      disposition: "create_detailed_workout_without_apple_link",
    });
  });

  it("prevents one source workout from being consumed twice", () => {
    const reconciliation = createAppleHealthReconciliation({
      evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.BATCH,
      workoutDate: "2026-08-10",
    });
    const sourceWorkoutId = reconciliation.selectedStrengthSourceId;
    const first = consumeAppleWorkoutEvidence(reconciliation.normalizedEvidence, {
      sourceWorkoutId,
      canonicalOwnerType: APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
      canonicalOwnerId: "training_session_one",
    });
    expect(first.consumed).toBe(true);
    const second = consumeAppleWorkoutEvidence(first.evidenceItems, {
      sourceWorkoutId,
      canonicalOwnerType: APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
      canonicalOwnerId: "training_session_two",
    });
    expect(second).toMatchObject({
      consumed: false,
      reason: "source_already_consumed_or_missing",
    });
    expect(second.evidenceItems.find((item) => item.sourceWorkoutId === sourceWorkoutId).consumption)
      .toMatchObject({ canonicalOwnerId: "training_session_one" });
  });

  it("consumes strength, cardio, and activity independently into separate owner concepts", () => {
    const reconciliation = finalizeAppleHealthReconciliation(
      createAppleHealthReconciliation({
        evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.BATCH,
        workoutDate: "2026-08-10",
      })
    );
    expect(reconciliation.proposedCanonicalRecords).toHaveLength(3);
    expect(reconciliation.proposedCanonicalRecords.map((record) => record.canonicalOwnerType))
      .toEqual([
        APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
        APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT,
        APPLE_WORKOUT_CANONICAL_OWNER_TYPES.ACTIVITY_RECORD,
      ]);
    const consumedIds = reconciliation.normalizedEvidence
      .filter((item) => item.consumption.state === APPLE_WORKOUT_CONSUMPTION_STATES.CONSUMED)
      .map((item) => item.sourceWorkoutId);
    expect(new Set(consumedIds).size).toBe(consumedIds.length);
    expect(reconciliation.proposedCanonicalRecords.map((record) => record.sourceWorkoutId))
      .toEqual(expect.arrayContaining([
        "apple_workout_strength_20260810_1612",
        "apple_workout_stairs_20260810_1714",
        "apple_workout_walk_20260810_1752",
      ]));
  });
});
