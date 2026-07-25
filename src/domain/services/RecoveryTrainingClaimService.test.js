import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createRecoveryTrainingClaims } from "./RecoveryTrainingClaimService";

const window = { startDate: "2026-07-19", endDate: "2026-07-25" };
function observation(domain, kind, status, direction, subjectType, subjectId) {
  return createPIObservation({
    domain, kind, semanticScope: `weekly.${subjectId}`,
    subject: { type: subjectType, id: subjectId },
    status, direction, evidenceWindow: window,
    supportingEvidenceIds: [`${domain}-evidence`],
    confidence: { level: "moderate", limitations: [], method: "fixture" },
    explanationData: {},
    provenance: {
      producer: "fixture", producerVersion: "fixture_v1",
      calculationMethod: "fixture", sourceEvidenceIds: [`${domain}-evidence`],
    },
  });
}
function claims(trainingStatus, recoveryState, overrides = {}) {
  const recovery = observation(
    "recovery", "recovery_state",
    recoveryState === "strained" ? "regressing" : recoveryState,
    recoveryState === "strained" ? "negative" : recoveryState === "improving" ? "positive" : "stable",
    "recovery_scope", "whole_body"
  );
  const training = observation(
    "training", "training_progress",
    trainingStatus, trainingStatus === "improving" ? "positive" :
      trainingStatus === "regressing" ? "negative" : "stable",
    "training_scope", "resistance"
  );
  return createRecoveryTrainingClaims({
    recoveryAssessment: {
      compositeState: recoveryState, conflictState: "none",
      completeness: "complete", freshness: "current", coveredDayCount: 3,
      limitations: [],
    },
    recoveryObservations: [recovery],
    trainingObservations: [training],
    cadence: "weekly",
    ...overrides,
  });
}

describe("RecoveryTrainingClaimService", () => {
  it.each([
    ["improving", "stable", "training_progress_with_stable_recovery"],
    ["improving", "improving", "training_progress_with_improving_recovery"],
    ["improving", "strained", "training_progress_despite_strained_recovery"],
    ["stable", "strained", "training_stability_with_strained_recovery"],
    ["regressing", "strained", "training_decline_with_strained_recovery"],
    ["regressing", "stable", "training_decline_despite_stable_recovery"],
  ])("maps %s Training with %s Recovery", (training, recovery, expected) => {
    expect(claims(training, recovery)[0].explanationData.relationshipState).toBe(expected);
  });

  it("returns insufficiency for conflict and preserves observational limits", () => {
    const result = claims("improving", "stable");
    const conflicted = createRecoveryTrainingClaims({
      recoveryAssessment: {
        compositeState: "mixed", conflictState: "conflict",
        completeness: "partial", freshness: "current", limitations: ["conflict"],
      },
      recoveryObservations: [observation("recovery", "recovery_state", "observed", "unknown", "recovery_scope", "whole_body")],
      trainingObservations: [observation("training", "training_progress", "improving", "positive", "training_scope", "resistance")],
      cadence: "weekly",
    })[0];
    expect(conflicted.explanationData.relationshipState).toBe("training_recovery_relationship_insufficient");
    expect(result[0].explanationData).toMatchObject({
      causalInference: false, protocolConclusion: null,
    });
  });

  it("rejects mismatched windows and keeps identity independent of state", () => {
    const first = claims("improving", "stable")[0];
    const second = claims("regressing", "strained")[0];
    expect(first.id).toBe(second.id);
    const mismatchedRecovery = observation("recovery", "recovery_state", "stable", "stable", "recovery_scope", "whole_body");
    mismatchedRecovery.evidenceWindow.startDate = "2026-07-20";
    const mismatch = createRecoveryTrainingClaims({
      recoveryAssessment: { compositeState: "stable", conflictState: "none", limitations: [] },
      recoveryObservations: [mismatchedRecovery],
      trainingObservations: [observation("training", "training_progress", "improving", "positive", "training_scope", "resistance")],
      cadence: "weekly",
    })[0];
    expect(mismatch.explanationData.relationshipState).toBe("training_recovery_relationship_insufficient");
  });
});
