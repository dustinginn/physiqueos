import { describe, expect, it } from "vitest";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import { ForecastEngine } from "./ForecastEngine";
import { validateForecastAssessment } from "./ForecastAssessmentModel";
import {
  adaptForecastAssessmentToPreviousContext,
  adaptPIV1AssessmentToPreviousForecastContext,
} from "./PIV1ForecastCompatibilityAdapter";

const forecast = (options = {}) =>
  ForecastEngine.forecast(createForecastV2Fixture(options));

describe("ForecastEngine", () => {
  it("creates the canonical categorical Forecast Assessment", () => {
    const result = forecast();

    expect(result.goalForecastStatus).toBe("on_forecast");
    expect(result.confidenceBand).toBe("high");
    expect(result.forecastDirection).toBe("stable");
    expect(result.movement.direction).toBe("no_meaningful_change");
    expect(result.objectiveForecasts[0].forecastState).toBe("feasible");
    expect(result.guardrailForecasts[0].forecastState)
      .toBe("likely_respected");
    expect(result.interpretationRef).toMatch(/^structured_interpretation\|/);
    expect(result.forecastMetadata.shadowOnly).toBe(true);
    expect(validateForecastAssessment(result)).toBe(true);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it.each([
    ["ahead_of_forecast", "very_high", (input) => {
      input.evidenceDescriptors[0].measurements[0].value = 4;
    }],
    ["on_forecast", "high", () => {}],
    ["forecast_uncertain", "moderate", (input) => {
      input.evidenceDescriptors[0].measurements =
        input.evidenceDescriptors[0].measurements.filter((item) =>
          item.metric !== "lean_mass_change_lb");
    }],
    ["forecast_at_risk", "low", (input) => {
      input.evidenceDescriptors[0].measurements[1].value = 11.5;
    }],
    ["forecast_unlikely", "very_low", (input) => {
      input.evidenceDescriptors[0].measurements[1].value = 13;
    }],
  ])("classifies %s with %s band", (status, band, arrange) => {
    const result = forecast({ arrangeInterpretationInput: arrange });
    expect(result.goalForecastStatus).toBe(status);
    expect(result.confidenceBand).toBe(band);
  });

  it("uses Developing when Interpretation quality is materially limited", () => {
    const result = forecast({
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[1].quality.provenanceIntegrity = "unknown";
      },
    });
    expect(result.goalForecastStatus).toBe("forecast_uncertain");
    expect(result.confidenceBand).toBe("developing");
  });

  it("fails closed when remaining timeline semantics are unavailable", () => {
    const result = forecast({
      arrangeGoalContract(goal) {
        goal.timeline = {};
      },
    });
    expect(result.timeline.phase).toBe("unknown");
    expect(result.goalForecastStatus).toBe("forecast_uncertain");
    expect(result.forecastExplanation.primaryLimitingFactors)
      .toContain("timeline_unknown");
  });

  it("calculates conservative increase, decrease, and no-meaningful-change", () => {
    const base = forecast();
    const baseContext = adaptForecastAssessmentToPreviousContext(base);
    const ahead = forecast({
      previousForecastContext: baseContext,
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].measurements[0].value = 4;
      },
    });
    expect(ahead.movement.direction).toBe("increase");

    const aheadContext = adaptForecastAssessmentToPreviousContext(ahead);
    const weakened = forecast({ previousForecastContext: aheadContext });
    expect(weakened.movement.direction).toBe("decrease");

    const held = forecast({ previousForecastContext: baseContext });
    expect(held.movement.direction).toBe("no_meaningful_change");
  });

  it("holds movement when the prior Forecast used another Strategy revision", () => {
    const base = forecast();
    const context = {
      ...adaptForecastAssessmentToPreviousContext(base),
      strategyRevision: "strategy_revision_previous",
    };
    const ahead = forecast({
      previousForecastContext: context,
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].measurements[0].value = 4;
      },
    });
    expect(ahead.movement).toMatchObject({
      direction: "no_meaningful_change",
      rationale: "prior_strategy_revision_changed",
    });
  });

  it("does not move the Forecast when only milestone time advances", () => {
    const arrangeGoalContract = (goal) => {
      goal.relevantEvidence.entries[0].appliesTo.milestoneRefs = [];
      goal.milestones[0].timing.expectedDateOrWindow = "2026-08-05";
    };
    const first = forecast({ arrangeGoalContract });
    expect(first.milestoneForecasts[0].status).toBe("pending");
    const previousForecastContext = adaptForecastAssessmentToPreviousContext(first);
    const later = forecast({
      previousForecastContext,
      arrangeGoalContract,
      arrangeInterpretationInput(input) {
        input.evaluationContext.evidenceCutoff = "2026-08-10T23:59:59.999Z";
        input.evaluationContext.interpretedAt = "2026-08-11T12:00:00.000Z";
      },
    });

    expect(later.milestoneForecasts[0].status).toBe("overdue_unresolved");
    expect(later.goalForecastStatus).toBe(first.goalForecastStatus);
    expect(later.confidenceBand).toBe(first.confidenceBand);
    expect(later.movement).toMatchObject({
      direction: "no_meaningful_change",
      rationale: "interpretation_semantics_unchanged",
    });
  });

  it("accepts V1 only as explicitly unknown Previous Forecast semantics", () => {
    const context = adaptPIV1AssessmentToPreviousForecastContext({
      id: "pi_assessment|legacy",
      goalId: "goal_build_muscle",
      evidenceCutoff: "2026-07-31T23:59:59.999Z",
      score: { current: 91, movement: { direction: "increased" } },
    });
    const result = forecast({ previousForecastContext: context });

    expect(result.movement).toMatchObject({
      direction: "no_meaningful_change",
      rationale: "prior_forecast_semantics_unavailable",
    });
    expect(result.forecastMetadata).toMatchObject({
      previousContextAdapterVersion: "pi_v1_forecast_context_adapter_v1",
      previousContextMissingSemantics: [
        "v2_confidence_band", "v2_goal_forecast_status",
      ],
    });
  });

  it("makes Goal Milestones visible and applies required overdue checkpoints", () => {
    const base = forecast();
    expect(base.milestoneForecasts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        milestoneId: "milestone_calibration_complete",
        status: "supported",
      }),
      expect.objectContaining({
        milestoneId: "milestone_first_validation",
        status: "pending",
      }),
    ]));

    const overdue = forecast({
      arrangeGoalContract(goal) {
        goal.relevantEvidence.entries[0].appliesTo.milestoneRefs = [];
      },
    });
    expect(overdue.milestoneForecasts).toContainEqual(expect.objectContaining({
      milestoneId: "milestone_calibration_complete",
      status: "overdue_unresolved",
    }));
    expect(overdue.goalForecastStatus).toBe("forecast_at_risk");
    expect(overdue.forecastExplanation.primaryLimitingFactors)
      .toContain("milestone_overdue_unresolved:milestone_calibration_complete");
  });

  it("distinguishes a due checkpoint from a contradicted checkpoint", () => {
    const due = forecast({
      arrangeGoalContract(goal) {
        goal.relevantEvidence.entries[0].appliesTo.milestoneRefs = [];
        goal.milestones[0].timing.expectedDateOrWindow = {
          start: "2026-07-25", end: "2026-08-05",
        };
      },
    });
    expect(due.milestoneForecasts[0].status).toBe("due_unresolved");

    const contradicted = forecast({
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].observations = [{
          targetType: "milestone",
          targetId: "milestone_calibration_complete",
          agreement: "contradicts",
        }];
      },
    });
    expect(contradicted.milestoneForecasts[0].status).toBe("contradicted");
    expect(contradicted.goalForecastStatus).toBe("forecast_at_risk");
  });

  it("carries uncertainty and Next Decisive Evidence from Interpretation", () => {
    const result = forecast({
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].measurements =
          input.evidenceDescriptors[0].measurements.filter((item) =>
            item.metric !== "lean_mass_change_lb");
        input.evidenceDescriptors[0].quality.comparisonAdequacy = "missing";
      },
    });

    expect(result.remainingUncertainty.items.some((item) =>
      item.kind === "comparison_missing")).toBe(true);
    expect(result.nextDecisiveEvidence).toMatchObject({
      status: "identified",
      evidenceCapability: "dexa_body_composition",
      expectedEventType: "dexa_scan",
    });
  });

  it("rejects raw evidence and every non-contract top-level input", () => {
    const fixture = createForecastV2Fixture();
    expect(() => ForecastEngine.forecast({
      ...fixture,
      evidenceDescriptors: [],
    })).toThrow("Forecast accepts no input field: evidenceDescriptors");
    expect(() => ForecastEngine.forecast({
      ...fixture,
      dexa: { value: 1 },
    })).toThrow("Forecast accepts no input field: dexa");
    expect(() => ForecastEngine.forecast({
      ...fixture,
      previousForecastContext: {
        goalId: fixture.goalContract.goal.goalId,
        rawEvidence: [{ type: "dexa" }],
      },
    })).toThrow("Previous Forecast Context cannot contain rawEvidence");
  });

  it("rejects Goal and Interpretation identity mismatches", () => {
    const fixture = createForecastV2Fixture();
    fixture.goalContract.goal.goalId = "another_goal";
    expect(() => ForecastEngine.forecast(fixture))
      .toThrow("Forecast Goal Contract and Interpretation identity mismatch");
  });

  it("does not read the Goal evidence map", () => {
    const fixture = createForecastV2Fixture();
    Object.defineProperty(fixture.goalContract, "relevantEvidence", {
      configurable: true,
      get() {
        throw new Error("Forecast attempted to read Goal evidence mappings.");
      },
    });
    expect(() => ForecastEngine.forecast(fixture)).not.toThrow();
  });

  it("is deterministic, immutable, and leaves every input unchanged", () => {
    const input = createForecastV2Fixture();
    const before = structuredClone(input);
    const first = ForecastEngine.forecast(input);
    const second = ForecastEngine.forecast(structuredClone(input));

    expect(input).toEqual(before);
    expect(first.id).toBe(second.id);
    expect(first.forecastMetadata.inputFingerprint)
      .toBe(second.forecastMetadata.inputFingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.objectiveForecasts)).toBe(true);
  });

  it("fingerprints bounded durability semantics independent of period order", () => {
    const emerging = forecastWithDurability([]);
    const repeated = forecastWithDurability([historicalPeriod(1)]);
    const sustained = forecastWithDurability([
      historicalPeriod(1), historicalPeriod(2),
    ]);
    const reordered = forecastWithDurability([
      historicalPeriod(2), historicalPeriod(1),
    ]);
    expect(emerging.forecastMetadata.interpretationSemanticFingerprint)
      .not.toBe(repeated.forecastMetadata.interpretationSemanticFingerprint);
    expect(repeated.forecastMetadata.interpretationSemanticFingerprint)
      .not.toBe(sustained.forecastMetadata.interpretationSemanticFingerprint);
    expect(reordered.forecastMetadata.interpretationSemanticFingerprint)
      .toBe(sustained.forecastMetadata.interpretationSemanticFingerprint);
  });
});

function forecastWithDurability(priorPeriods) {
  return forecast({
    arrangeInterpretationInput(input) {
      const training = input.evidenceDescriptors.find((item) =>
        item.capability === "training_execution");
      training.temporalIdentity = canonicalPeriod(3);
      input.durabilityContext = {
        currentPeriod: canonicalPeriod(3), priorPeriods,
      };
    },
  });
}

function historicalPeriod(number) {
  return { ...canonicalPeriod(number), signals: [{
    capability: "training_execution", direction: "supports",
    lineageDigest: `sha256_week_${number}`, lineageAvailable: true,
  }] };
}

function canonicalPeriod(number) {
  const dates = [
    ["2026-07-12", "2026-07-18"],
    ["2026-07-19", "2026-07-25"],
    ["2026-07-26", "2026-08-01"],
  ][number - 1];
  return {
    schemaVersion: "confidence_durability_period_v1",
    id: `confidence_week|${dates[0]}|${dates[1]}|America/Los_Angeles`,
    kind: "canonical_week", startDate: dates[0], endDate: dates[1],
    timeZone: "America/Los_Angeles", state: "completed",
    occurrenceId: `weekly-${number}`,
  };
}

function forbiddenKeys(value, path = []) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const next = [...path, key];
    const forbidden = /(presentation|jsx|html|narrative|publication|render|component|markup|className|style|copy|probability|percentage|score)/i
      .test(key) || key.toLowerCase() === "confidence"
      ? [next.join(".")] : [];
    return [...forbidden, ...forbiddenKeys(child, next)];
  });
}
