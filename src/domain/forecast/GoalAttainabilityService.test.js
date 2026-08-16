import { describe, expect, it } from "vitest";
import { evaluateGoalAttainability } from "./GoalAttainabilityService";

describe("Goal attainability evaluation", () => {
  it("makes Goal magnitude matter through remaining gap and the authorized envelope", () => {
    const modest = assess({ required: 4, progress: 2, segmentMin: 1, segmentMax: 4 });
    const aggressive = assess({ required: 10, progress: 2, segmentMin: 1, segmentMax: 4 });
    expect(modest).toMatchObject({ outlook: "feasible",
      remainingFeasibility: "inside_expected_envelope" });
    expect(aggressive).toMatchObject({ outlook: "at_risk",
      paceState: "positive_but_behind",
      remainingFeasibility: "outside_expected_envelope" });
  });

  it("distinguishes long runway from a late trajectory checkpoint", () => {
    const contract = contractFor({ required: 8, progress: 2, segmentMin: 0,
      segmentMax: 8 });
    contract.expectedTrajectory.segments = [
      segment("early", "2026-07-01", "2026-09-30", 0, 3),
      segment("late", "2026-10-01", "2026-10-31", 5, 8),
    ];
    const early = evaluateGoalAttainability({ goalContract: contract,
      timeline: timeline("2026-08-01", 91) });
    const late = evaluateGoalAttainability({ goalContract: contract,
      timeline: timeline("2026-10-30", 1) });
    expect(early.paceState).toBe("on_expected_trajectory");
    expect(late.paceState).toBe("positive_but_behind");
  });

  it.each([
    [9, 1, 8, "ahead"],
    [2, 1, 8, "on_expected_trajectory"],
    [0, 1, 4, "stalled"],
    [-1, 1, 4, "regressing"],
  ])("classifies cumulative progress %s against %s-%s as %s",
    (progress, min, max, expected) => {
      expect(assess({ required: 8, progress, segmentMin: min,
        segmentMax: max }).paceState).toBe(expected);
    });

  it("keeps missing baseline, trajectory, or firm timing unassessable", () => {
    const missingProgress = contractFor({ required: 8, progress: 2,
      segmentMin: 1, segmentMax: 8 });
    missingProgress.quantitativeProgress.status = "unavailable";
    missingProgress.quantitativeProgress.uncertainty = ["goal_baseline_unavailable"];
    expect(evaluateGoalAttainability({ goalContract: missingProgress,
      timeline: timeline("2026-08-01", 91) }).rationale)
      .toBe("goal_baseline_unavailable");

    const missingTrajectory = contractFor({ required: 8, progress: 2,
      segmentMin: 1, segmentMax: 8 });
    missingTrajectory.expectedTrajectory.segments = [];
    expect(evaluateGoalAttainability({ goalContract: missingTrajectory,
      timeline: timeline("2026-08-01", 91) }).rationale)
      .toBe("authorized_expected_trajectory_unavailable");

    expect(evaluateGoalAttainability({ goalContract: contractFor({ required: 8,
      progress: 2, segmentMin: 1, segmentMax: 8 }),
    timeline: { ...timeline("2026-08-01", 91), constraintType: "aspirational" } })
      .rationale).toBe("completion_timing_not_firm");
  });

  it("uses an upcoming authorized phase envelope without calling it on pace before activation", () => {
    const contract = contractFor({ progress: 2, required: 10,
      segmentMin: 0, segmentMax: 6 });
    contract.expectedTrajectory.segments[0].startBoundary = "2026-08-16";
    const result = evaluateGoalAttainability({ goalContract: contract,
      timeline: timeline("2026-08-15", 77) });
    expect(result).toMatchObject({ status: "assessed", trajectoryPhase: "upcoming",
      paceState: "positive_but_behind", outlook: "at_risk",
      remainingFeasibility: "outside_expected_envelope" });
  });
});

function assess({ required, progress, segmentMin, segmentMax }) {
  return evaluateGoalAttainability({ goalContract: contractFor({ required, progress,
    segmentMin, segmentMax }), timeline: timeline("2026-08-01", 91) });
}
function contractFor({ required, progress, segmentMin, segmentMax }) {
  return {
    objectives: [{ objectiveId: "objective-generic", required: true }],
    quantitativeProgress: {
      status: "available", cumulativeProgress: progress, requiredProgress: required,
      remainingGap: Math.max(0, required - progress), progressFraction: progress / required,
      baseline: { sourceRef: "baseline" }, current: { sourceRef: "current" },
      phase: { baseline: { sourceRef: "phase-baseline" }, cumulativeProgress: progress },
    },
    expectedTrajectory: { segments: [segment("active", "2026-07-01",
      "2026-10-31", segmentMin, segmentMax)] },
  };
}
function segment(id, start, end, min, max) { return { segmentId: id,
  startBoundary: start, endBoundary: end, progressScope: "phase",
  expectedObjectiveRanges: [{ expectationId: `${id}-range`,
    objectiveRef: "objective-generic", min, max, unit: "units" }] }; }
function timeline(cutoff, remainingDays) { return { phase: "active",
  constraintType: "firm", evidenceCutoff: cutoff, totalDays: 122,
  elapsedDays: 122 - remainingDays, remainingDays,
  elapsedFraction: (122 - remainingDays) / 122,
  remainingFraction: remainingDays / 122 }; }
