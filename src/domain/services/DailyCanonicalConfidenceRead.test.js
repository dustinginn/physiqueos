import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCanonicalDailyConfidencePresentation,
  createDailyBriefingService,
} from "./DailyBriefingService";

const canonical = Object.freeze({
  status: "canonical_v2",
  source: "canonical_confidence_v2_snapshot",
  canonicalSeries: true,
  value: 59,
  score: 59,
  numericValue: 59,
  percentageLabel: "59%",
  band: "developing",
  label: "Developing",
  assessmentId: "confidence_assessment_v2|current",
  snapshotId: "goal_confidence_snapshot_v2|goal|phase",
  goalId: "goal",
  phaseId: "phase",
  movement: "held",
  movementDirection: "held",
  movementMagnitude: "none",
  delta: 0,
  priorScore: 59,
  primaryReason: "Confidence remained stable because the outlook did not materially change.",
  explanation: "Confidence remained stable because the outlook did not materially change.",
  originatingPublisher: "weekly_briefing",
  originatingArtifactId: "weekly-one",
  modelVersion: "canonical_confidence_assessment_v2",
  piVersion: "confidence_v2",
});

describe("Daily canonical Confidence read", () => {
  it("overrides local evaluation display fields with the canonical presentation", () => {
    const briefing = applyCanonicalDailyConfidencePresentation({
      hero: { confidence: 99, confidenceLabel: "High Confidence" },
      confidenceReasons: [{ label: "Locally calculated reason", tone: "positive" }],
    }, canonical);
    expect(briefing.hero).toMatchObject({
      confidence: 59,
      confidenceLabel: "Developing",
    });
    expect(briefing.goalConfidence).toMatchObject({
      assessmentId: canonical.assessmentId,
      priorScore: 59,
      delta: 0,
      movementDirection: "held",
      originatingArtifactId: "weekly-one",
      source: "canonical_confidence_v2_snapshot",
    });
    expect(briefing.confidenceReasons).toEqual([{
      label: canonical.explanation,
      tone: "primary",
      source: canonical.source,
    }]);
  });

  it("renders unavailable without retaining or calculating a fallback score", () => {
    const unavailable = {
      status: "unavailable",
      source: "canonical_confidence_unavailable",
      canonicalSeries: false,
      value: null,
      assessmentId: null,
      fallbackReason: "canonical_series_unavailable",
    };
    const briefing = applyCanonicalDailyConfidencePresentation({
      hero: { confidence: 99, confidenceLabel: "High Confidence" },
      confidenceReasons: [{ label: "Local fallback", tone: "positive" }],
    }, unavailable);
    expect(briefing.hero).toMatchObject({
      confidence: null,
      confidenceLabel: "Unavailable",
    });
    expect(briefing.goalConfidence).toEqual(unavailable);
    expect(briefing.confidenceReasons).toEqual([]);
  });

  it("reads without publishing or mutating Confidence history", async () => {
    const store = JSON.parse(fs.readFileSync(
      "private/founder/runtime-store.json", "utf8"
    ));
    const before = JSON.stringify(store);
    const activeGoal = store.goals.find((goal) =>
      goal.primary && goal.status === "active");
    const artifact = {
      id: "daily-read-only",
      briefing: { hero: { confidence: 99, confidenceLabel: "Local" } },
    };
    const repositories = {
      users: {
        getCurrentUser: async () => ({ id: "founder" }),
        getUserById: async () => ({ id: "founder" }),
      },
      goals: { getActiveGoal: async () => activeGoal },
      dailyBriefings: {
        getLatestScheduledDailyBriefing: async () => artifact,
      },
    };
    const briefing = await createDailyBriefingService({
      repositories,
      confidenceStoreResolver: () => store,
    }).getLatestPersistedDailyBriefing("founder");
    expect(briefing.goalConfidence.assessmentId)
      .toBe(store.goalConfidenceSnapshots.find((item) =>
        item.goalId === activeGoal.id)?.currentAssessmentId);
    // Not a fixed magic number: this reads the real, evolving production store's latest
    // briefing-published Confidence (currently the Phase 1 weekly briefing, since Phase 2's
    // Starting Forecast is internal-only and does not supersede it), matching Home/Goal via
    // the shared ActiveGoalConfidencePresentationReadService ownership boundary.
    expect(briefing.hero.confidence).toBe(60);
    expect(JSON.stringify(store)).toBe(before);
  });

  it("does not use an assessment belonging to another Goal", async () => {
    const store = JSON.parse(fs.readFileSync(
      "private/founder/runtime-store.json", "utf8"
    ));
    const sourceGoal = {
      id: "other-goal",
      type: "build_lean_mass",
      primary: true,
      status: "active",
      openingApproach: { value: "calibration" },
      phases: [{ id: "other-phase", status: "active" }],
    };
    const repositories = {
      users: { getCurrentUser: async () => ({ id: "founder" }) },
      goals: { getActiveGoal: async () => sourceGoal },
      dailyBriefings: {
        getLatestScheduledDailyBriefing: async () => ({
          id: "daily-wrong-goal",
          briefing: { hero: { confidence: 99, confidenceLabel: "Local" } },
        }),
      },
    };
    const briefing = await createDailyBriefingService({
      repositories,
      confidenceStoreResolver: () => store,
    }).getLatestPersistedDailyBriefing();
    expect(briefing.goalConfidence).toMatchObject({
      status: "unavailable",
      source: "canonical_confidence_unavailable",
      value: null,
    });
    expect(briefing.hero.confidence).toBeNull();
  });
});
