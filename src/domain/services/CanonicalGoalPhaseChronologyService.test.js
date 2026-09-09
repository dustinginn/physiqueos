import { describe, expect, it } from "vitest";
import {
  resolveCanonicalGoalPhaseChronology,
  resolveFrozenGoalPhaseAttribution,
} from "./CanonicalGoalPhaseChronologyService.js";

const goal = {
  id: "goal-build",
  userId: "owner",
  primary: true,
  status: "active",
  phases: [
    {
      id: "phase-1", goalId: "goal-build", name: "Calibration", purpose: "Calibrate.",
      order: 0, status: "completed", startDate: "2026-07-01", startedAt: "2026-07-01",
      completedAt: "2026-07-31T23:59:00.000Z", plannedReviewAt: "2026-07-31",
      reviewState: "decision_committed", completionDecisionRequired: true, revision: 1,
    },
    {
      id: "phase-2", goalId: "goal-build", name: "Build", purpose: "Build.",
      order: 1, status: "active", startDate: "2026-08-01", startedAt: "2026-08-01",
      plannedReviewAt: "2026-09-01", reviewState: "scheduled",
      completionDecisionRequired: true, revision: 1,
    },
  ],
};

describe("canonical Goal Phase chronology", () => {
  it("selects the Phase effective on the intended calendar date", () => {
    expect(resolveCanonicalGoalPhaseChronology(goal, { asOf: "2026-07-20" }).effectivePhase.id)
      .toBe("phase-1");
    expect(resolveCanonicalGoalPhaseChronology(goal, { asOf: "2026-08-20" }).effectivePhase.id)
      .toBe("phase-2");
  });

  it("rejects Phase ownership mismatch and ambiguous chronology", () => {
    expect(() => resolveCanonicalGoalPhaseChronology({
      ...goal,
      phases: [{ ...goal.phases[0], goalId: "other" }],
    })).toThrow(/ownership/i);
    expect(() => resolveCanonicalGoalPhaseChronology({
      ...goal,
      phases: [goal.phases[0], { ...goal.phases[1], startDate: "2026-07-15", startedAt: "2026-07-15" }],
    }, { asOf: "2026-07-20" })).toThrow(/multiple phases/i);
    expect(() => resolveCanonicalGoalPhaseChronology({
      ...goal,
      phases: [goal.phases[1], { ...goal.phases[1], id: "phase-duplicate" }],
    })).toThrow(/more than one committed active phase|multiple current phases/i);
  });

  it("treats a transition date as the new Phase's first effective day", () => {
    const transitionGoal = {
      ...goal,
      phases: [
        { ...goal.phases[0], completedAt: "2026-08-01T08:00:00.000Z" },
        goal.phases[1],
      ],
    };
    expect(resolveCanonicalGoalPhaseChronology(transitionGoal, {
      asOf: "2026-08-01",
    }).effectivePhase.id).toBe("phase-2");
  });

  it.each(["evidence", "dexa_event", "photo_event", "weekly", "midweek", "monthly", "confidence"])(
    "keeps stored %s attribution frozen when current lifecycle state changes",
    (artifactType) => {
    const artifact = { id: `${artifactType}-1`, artifactType, goalId: "goal-old", phaseId: "phase-old" };
    expect(resolveFrozenGoalPhaseAttribution({
      artifact,
      fallbackGoal: goal,
      asOf: "2026-08-20",
    })).toEqual({
      goalId: "goal-old",
      phaseId: "phase-old",
      source: "persisted_artifact",
    });
    },
  );
});
