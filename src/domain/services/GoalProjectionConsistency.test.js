import { describe, expect, it } from "vitest";
import {
  GoalEvaluationService,
  formatProjectionDuration,
  getTimelineSemantics,
} from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";

const goal = {
  id: "goal_visible_abs_at_rest",
  title: "Visible abs at rest",
  metricKey: "visualDefinition",
  primary: true,
  status: "active",
};

describe("authoritative goal projection", () => {
  it("keeps a narrow seven-day estimate consistent", () => {
    expect(formatProjectionDuration({
      minimumDaysRemaining: 7,
      expectedDaysRemaining: 7,
      maximumDaysRemaining: 10,
    })).toBe("About 1 week");
  });

  it("describes an 8-14 day finish interval as 1-2 weeks", () => {
    expect(formatProjectionDuration({
      minimumDaysRemaining: 8,
      expectedDaysRemaining: 11,
      maximumDaysRemaining: 14,
    })).toBe("1-2 weeks");
  });

  it("uses Founder local date authority across a UTC date boundary", () => {
    const projection = getProjection(new Date("2026-07-13T06:30:00Z"));

    expect(projection.asOfDate).toBe("2026-07-12");
    expect(projection.evidenceThroughDate).toBe("2026-07-12");
  });

  it("shares one projection identity with Goal Intelligence", () => {
    const evaluations = getEvaluations();
    const projection = evaluations[0].projection;
    const intelligence = GoalIntelligenceService.getGoalIntelligence({
      activeGoal: goal,
      evaluations,
    });

    expect(intelligence.trajectory.projection).toBe(projection);
    expect(intelligence.trajectory.projectionId).toBe(projection.id);
    expect(intelligence.trajectory.daysRemaining).toBe(projection.daysRemaining);
    expect(intelligence.trajectory.projectedFinish).toBe(projection.projectedFinish);
  });

  it("preserves historical snapshots while a current projection changes", () => {
    const historicalSnapshot = structuredClone(getProjection(new Date("2026-07-10T12:00:00-07:00")));
    const currentProjection = getProjection(new Date("2026-07-12T12:00:00-07:00"));

    expect(historicalSnapshot.asOfDate).toBe("2026-07-10");
    expect(currentProjection.asOfDate).toBe("2026-07-12");
    expect(historicalSnapshot.asOfDate).toBe("2026-07-10");
  });

  it("labels confidence as trajectory confidence without narrowing estimate uncertainty", () => {
    const projection = getProjection();
    const [lower, upper] = projection.currentBodyFatRange.match(/\d+\.\d/g).map(Number);

    expect(projection.confidence.value).toBeGreaterThanOrEqual(90);
    expect(projection.confidence.meaning).toContain("not certainty");
    expect(upper - lower).toBeGreaterThanOrEqual(1);
  });

  it("does not fall back to an unrelated historical projection", () => {
    const intelligence = GoalIntelligenceService.getGoalIntelligence({
      activeGoal: goal,
      evaluations: [],
    });

    expect(intelligence.trajectory.projection).toBeNull();
    expect(intelligence.trajectory.projectedFinish).toBe("Pending");
    expect(intelligence.trajectory.daysRemaining).toBe("Pending");
  });

  it("is idempotent for identical evidence and time", () => {
    expect(getProjection()).toEqual(getProjection());
  });

  it("keeps numerical progress as the basis before the threshold is reached", () => {
    const semantics = getTimelineSemantics({ goal, bodyCompositionEstimate: { pointEstimateBodyFatPercent: 10, lowerBodyFatPercent: 9.4 } });
    expect(semantics.currentCompletionStage).toBe("progressing_toward_numerical_target");
    expect(semantics.assumedCheckpointCount).toBe(0);
  });

  it("switches the remaining criterion to visual confirmation in range", () => {
    const semantics = getTimelineSemantics({ goal, bodyCompositionEstimate: inRangeEstimate(), now: new Date("2026-07-13T12:00:00-07:00"), progressPhotos: [{ date: "2026-07-11" }] });
    expect(semantics.numericalThresholdStatus).toBe("reached");
    expect(semantics.remainingCriterion).toMatch(/visible lower-ab/i);
    expect(semantics.projectionBasis).toMatch(/weekly comparable progress-photo/i);
  });

  it("uses the next weekly photo checkpoint as the earliest confirmation opportunity", () => {
    const semantics = getTimelineSemantics({ goal, bodyCompositionEstimate: inRangeEstimate(), now: new Date("2026-07-13T12:00:00-07:00"), progressPhotos: [{ date: "2026-07-11" }] });
    expect(semantics.nextEvidenceCheckpoint).toBe("2026-07-18");
  });

  it("allows a second checkpoint when consistency is still developing", () => {
    const semantics = getTimelineSemantics({ goal, bodyCompositionEstimate: inRangeEstimate(), progressPhotos: [{ date: "2026-07-11" }] });
    expect(semantics.assumedCheckpointCount).toBe(2);
    expect(semantics.uncertaintyReason).toMatch(/second may be needed/i);
  });

  it("moves a missed checkpoint honestly without implying regression", () => {
    const semantics = getTimelineSemantics({ goal, bodyCompositionEstimate: inRangeEstimate(), now: new Date("2026-07-20T12:00:00-07:00"), progressPhotos: [{ date: "2026-07-11" }], visualProgressSupported: false });
    expect(semantics.nextEvidenceCheckpoint).toBe("2026-07-25");
    expect(semantics.uncertaintyReason).toMatch(/does not imply physiological regression/i);
  });

  it("does not mark a visually incomplete goal complete", () => {
    const semantics = getTimelineSemantics({ goal, bodyCompositionEstimate: inRangeEstimate(), visualConfirmed: false });
    expect(semantics.visualConfirmationStatus).not.toBe("confirmed");
    expect(semantics.currentCompletionStage).not.toBe("goal_visually_confirmed");
  });

  it.each([
    [6, 7, 7, "0-1 week"], [7, 8, 10, "About 1 week"], [8, 11, 14, "1-2 weeks"],
    [11, 14, 17, "About 2 weeks"], [15, 18, 21, "2-3 weeks"],
  ])("formats %i-%i elapsed days without an unjustified week", (minimumDaysRemaining, expectedDaysRemaining, maximumDaysRemaining, label) => {
    expect(formatProjectionDuration({ minimumDaysRemaining, expectedDaysRemaining, maximumDaysRemaining })).toBe(label);
  });
});

function inRangeEstimate() { return { pointEstimateBodyFatPercent: 8.5, lowerBodyFatPercent: 8.1, upperBodyFatPercent: 8.9 }; }

function getProjection(now = new Date("2026-07-12T12:00:00-07:00")) {
  return getEvaluations(now)[0].projection;
}

function getEvaluations(now = new Date("2026-07-12T12:00:00-07:00")) {
  return GoalEvaluationService.getGoalEvaluations({
    goals: [goal],
    dexaScans: [
      createDexa("2026-05-24", 180.9, 24.7, 13.6),
      createDexa("2026-06-20", 171.7, 18.4, 10.7),
    ],
    weightEntries: createWeights(),
    progressPhotos: [],
    protocols: [],
    now,
  });
}

function createDexa(measuredAt, totalMass, fatMass, bodyFatPercentage) {
  return {
    id: `dexa_${measuredAt}`,
    measuredAt,
    totalMass: { value: totalMass, unit: "lb" },
    fatMass: { value: fatMass, unit: "lb" },
    leanMass: { value: totalMass - fatMass, unit: "lb" },
    bodyFatPercentage,
  };
}

function createWeights() {
  const start = new Date("2026-06-20T12:00:00Z");

  return Array.from({ length: 23 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      id: `weight_${index}`,
      measuredAt: date.toISOString().slice(0, 10),
      weight: { value: Number((169.7 - index * 0.25).toFixed(2)), unit: "lb" },
    };
  });
}
