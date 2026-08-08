import { describe, expect, it } from "vitest";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import { ForecastEngine } from "./ForecastEngine";
import {
  adaptForecastAssessmentToPreviousContext,
  adaptPIV1AssessmentToPreviousForecastContext,
} from "./PIV1ForecastCompatibilityAdapter";

describe("PIV1ForecastCompatibilityAdapter", () => {
  it("preserves unknown V2 semantics instead of mapping a V1 number", () => {
    const context = adaptPIV1AssessmentToPreviousForecastContext({
      id: "pi_assessment|legacy",
      goal: { goalId: "goal_build_muscle" },
      evidenceCutoff: "2026-07-31T23:59:59.999Z",
      score: {
        current: 82,
        movement: { direction: "held" },
      },
    });

    expect(context).toMatchObject({
      priorForecastRef: "pi_assessment|legacy",
      goalForecastStatus: "unknown",
      confidenceBand: "unknown",
      movementDirection: "no_meaningful_change",
      compatibility: {
        missingSemantics: ["v2_goal_forecast_status", "v2_confidence_band"],
        inferredSemantics: [],
      },
    });
  });

  it.each([
    ["increased", "increase"],
    ["decreased", "decrease"],
    ["held", "no_meaningful_change"],
    ["initial", "no_meaningful_change"],
  ])("maps legacy movement %s to %s only", (legacy, expected) => {
    const context = adaptPIV1AssessmentToPreviousForecastContext({
      id: "pi_assessment|movement",
      goalId: "goal_build_muscle",
      evidenceCutoff: "2026-07-31T23:59:59.999Z",
      score: { current: 50, movement: { direction: legacy } },
    });
    expect(context.movementDirection).toBe(expected);
    expect(context.confidenceBand).toBe("unknown");
  });

  it("is deterministic and ignores V1 numeric confidence and prose", () => {
    const first = {
      id: "pi_assessment|legacy",
      goalId: "goal_build_muscle",
      evidenceCutoff: "2026-07-31T23:59:59.999Z",
      score: { current: 20, movement: { direction: "increased" } },
      primaryReason: "legacy one",
      coachingImplication: "legacy one",
    };
    const second = structuredClone(first);
    second.score.current = 99;
    second.primaryReason = "legacy two";
    second.coachingImplication = "legacy two";

    expect(adaptPIV1AssessmentToPreviousForecastContext(second))
      .toEqual(adaptPIV1AssessmentToPreviousForecastContext(first));
  });

  it("adapts a canonical Forecast without semantic loss", () => {
    const assessment = ForecastEngine.forecast(createForecastV2Fixture());
    const context = adaptForecastAssessmentToPreviousContext(assessment);

    expect(context).toMatchObject({
      sourceType: "canonical_forecast_assessment",
      priorForecastRef: assessment.id,
      goalForecastStatus: assessment.goalForecastStatus,
      confidenceBand: assessment.confidenceBand,
    });
  });
});
