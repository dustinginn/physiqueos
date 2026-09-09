import { describe, expect, it } from "vitest";
import { resolveCanonicalEvidenceGoalPhaseAttribution } from "./CanonicalEvidenceGoalPhaseAttributionService";

const goal = {
  id: "goal-build",
  userId: "owner",
  primary: true,
  status: "active",
  phases: [
    phase("phase-1", "completed", "2026-07-01", "2026-08-01"),
    phase("phase-2", "active", "2026-08-01"),
  ],
};

describe("canonical Evidence Goal/Phase attribution", () => {
  it("uses Package 3 chronology for newly committed intended-date evidence", () => {
    expect(resolveCanonicalEvidenceGoalPhaseAttribution({
      evidenceObject: { evidence_type: "nutrition", observed_at: "2026-07-20" },
      goals: [goal],
      userId: "owner",
    })).toEqual({
      goalId: "goal-build",
      phaseId: "phase-1",
      source: "legacy_effective_date_fallback",
    });
  });

  it("keeps persisted historical attribution frozen across corrections", () => {
    expect(resolveCanonicalEvidenceGoalPhaseAttribution({
      evidenceObject: { evidence_type: "activity_day", observed_at: "2026-08-20" },
      existingObject: { goalId: "goal-old", phaseId: "phase-old" },
      goals: [goal],
      userId: "owner",
    })).toEqual({
      goalId: "goal-old",
      phaseId: "phase-old",
      source: "persisted_artifact",
    });
  });

  it("honors explicit persisted evidence attribution before current Goal state", () => {
    expect(resolveCanonicalEvidenceGoalPhaseAttribution({
      evidenceObject: {
        evidence_type: "nutrition",
        observed_at: "2026-08-20",
        goalId: "goal-explicit",
        phaseId: "phase-explicit",
      },
      goals: [goal],
      userId: "owner",
    })).toEqual({
      goalId: "goal-explicit",
      phaseId: "phase-explicit",
      source: "persisted_artifact",
    });
  });
});

function phase(id, status, startDate, completedAt = null) {
  return {
    id,
    goalId: "goal-build",
    name: id,
    purpose: id,
    order: id === "phase-1" ? 0 : 1,
    status,
    startDate,
    startedAt: startDate,
    completedAt,
    plannedReviewAt: "2026-09-01",
    reviewState: status === "completed" ? "decision_committed" : "scheduled",
    completionDecisionRequired: true,
    revision: 1,
  };
}
