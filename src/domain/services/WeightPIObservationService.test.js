import { describe, expect, it } from "vitest";
import { isPIObservation } from "./PIObservationService";
import {
  createDailyWeightPIObservations,
  createWeightPIObservations,
} from "./WeightPIObservationService";

const currentWindow = { startDate: "2026-07-14", endDate: "2026-07-20" };
const priorWindow = { startDate: "2026-07-07", endDate: "2026-07-13" };

function weight(id, date, value) {
  return { id, measuredAt: date, weight: { value, unit: "lb" } };
}

function observations(overrides = {}) {
  return createWeightPIObservations({
    weights: [
      weight("prior_2", "2026-07-13", 165),
      weight("current_2", "2026-07-20", 167),
      weight("prior_1", "2026-07-07", 163),
      weight("current_1", "2026-07-14", 165),
    ],
    observationWindow: currentWindow,
    comparisonWindow: priorWindow,
    ...overrides,
  });
}

describe("WeightPIObservationService", () => {
  it("returns no observations for no evidence by default", () => {
    expect(
      createWeightPIObservations({
        weights: [],
        observationWindow: currentWindow,
      })
    ).toEqual([]);
  });

  it("represents no evidence and one isolated entry as insufficient on request", () => {
    const none = createWeightPIObservations({
      weights: [],
      observationWindow: currentWindow,
      requestedScopes: ["short_window"],
      includeInsufficientData: true,
    });
    const isolated = createWeightPIObservations({
      weights: [weight("only", "2026-07-18", 166)],
      observationWindow: currentWindow,
      requestedScopes: ["short_window"],
      includeInsufficientData: true,
    });

    expect(none[0]).toMatchObject({
      status: "insufficient_data",
      direction: "not_applicable",
      supportingEvidenceIds: [],
      confidence: { level: "unevaluated" },
    });
    expect(isolated[0]).toMatchObject({
      status: "insufficient_data",
      supportingEvidenceIds: ["only"],
      confidence: { level: "low" },
    });
  });

  it.each([
    [165, 165, "stable"],
    [165, 167, "rising"],
    [167, 165, "falling"],
  ])("reports %s to %s as measured %s movement", (first, latest, direction) => {
    const [observation] = createWeightPIObservations({
      weights: [
        weight("first", "2026-07-14", first),
        weight("latest", "2026-07-20", latest),
      ],
      observationWindow: currentWindow,
      requestedScopes: ["short_window"],
    });

    expect(observation).toMatchObject({
      kind: "weight_short_window_change",
      status: "observed",
      direction,
      explanationData: {
        priorValue: first,
        currentValue: latest,
        absoluteChange: latest - first,
        sampleCount: 2,
      },
    });
    expect(["positive", "negative", "improving", "regressing"]).not.toContain(
      observation.direction
    );
  });

  it("preserves production average values and comparison difference", () => {
    const averageObservation = observations().find(
      (item) => item.kind === "weight_average_change"
    );
    expect(averageObservation).toMatchObject({
      direction: "rising",
      explanationData: {
        currentAverage: 166,
        comparisonAverage: 164,
        absoluteChange: 2,
        currentSampleCount: 2,
        comparisonSampleCount: 2,
      },
    });
  });

  it("keeps identity stable across status and advancing windows", () => {
    const rising = observations({
      requestedScopes: ["short_window"],
    })[0];
    const falling = createWeightPIObservations({
      weights: [
        weight("later_1", "2026-07-21", 168),
        weight("later_2", "2026-07-27", 166),
      ],
      observationWindow: { startDate: "2026-07-21", endDate: "2026-07-27" },
      requestedScopes: ["short_window"],
    })[0];
    expect(rising.id).toBe(falling.id);
    expect(rising.direction).toBe("rising");
    expect(falling.direction).toBe("falling");
  });

  it("uses different semantic IDs for different horizons", () => {
    const seven = observations({
      requestedScopes: ["short_window"],
      semanticHorizon: "rolling_7_days",
    })[0];
    const thirty = observations({
      requestedScopes: ["short_window"],
      semanticHorizon: "rolling_30_days",
    })[0];
    expect(seven.id).not.toBe(thirty.id);
  });

  it("normalizes supporting IDs, ordering, provenance, and contract output", () => {
    const result = observations();
    expect(result.map((item) => item.id)).toEqual(
      result.map((item) => item.id).sort()
    );
    expect(result.every(isPIObservation)).toBe(true);
    result.forEach((observation) => {
      expect(observation.supportingEvidenceIds).toEqual(
        [...observation.supportingEvidenceIds].sort()
      );
      expect(observation.provenance).toMatchObject({
        producer: "weight_pi_observation_service",
        producerVersion: "weight_pi_v1",
      });
      expect(JSON.stringify(observation)).not.toMatch(
        /stay the course|should|recommend/i
      );
    });
  });

  it("suppresses insufficient average comparisons unless requested", () => {
    const input = {
      weights: [weight("only", "2026-07-18", 166)],
      observationWindow: currentWindow,
      comparisonWindow: priorWindow,
      requestedScopes: ["average_comparison"],
    };
    expect(createWeightPIObservations(input)).toEqual([]);
    expect(
      createWeightPIObservations({
        ...input,
        includeInsufficientData: true,
      })[0]
    ).toMatchObject({
      kind: "weight_average_change",
      status: "insufficient_data",
    });
  });
});

describe("Daily Weight PI observation parity adapter", () => {
  function assessment(overrides = {}) {
    return {
      currentAverage: 166,
      comparisonAverage: 165,
      absoluteChange: 1,
      direction: "rising",
      unit: "lb",
      currentSampleCount: 7,
      comparisonSampleCount: 7,
      currentDateRange: {
        startDate: "2026-07-14",
        endDate: "2026-07-20",
      },
      comparisonDateRange: {
        startDate: "2026-07-07",
        endDate: "2026-07-13",
      },
      currentEvidenceIds: ["current_2", "current_1"],
      comparisonEvidenceIds: ["prior_2", "prior_1"],
      ...overrides,
    };
  }

  it.each([
    [165, 165, 0, "stable"],
    [166, 165, 1, "rising"],
    [164, 165, -1, "falling"],
  ])("preserves exact Daily averages and %s direction", (
    currentAverage,
    comparisonAverage,
    absoluteChange,
    direction
  ) => {
    const [observation] = createDailyWeightPIObservations({
      precomputedAssessment: assessment({
        currentAverage,
        comparisonAverage,
        absoluteChange,
        direction,
      }),
    });
    expect(observation).toMatchObject({
      kind: "weight_daily_rolling_average_change",
      direction,
      explanationData: {
        currentAverage,
        comparisonAverage,
        absoluteChange,
        currentSampleCount: 7,
        comparisonSampleCount: 7,
        stabilityThreshold: 0,
        calculationMethod: "daily_last_seven_entries_vs_prior_seven_entries",
      },
      evidenceWindow: {
        startDate: "2026-07-14",
        endDate: "2026-07-20",
        comparisonStartDate: "2026-07-07",
        comparisonEndDate: "2026-07-13",
      },
      supportingEvidenceIds: [
        "current_1",
        "current_2",
        "prior_1",
        "prior_2",
      ],
    });
    expect(observation.id).toContain("daily.rolling_average_comparison");
    expect(observation).not.toHaveProperty("favorable");
    expect(observation).not.toHaveProperty("unfavorable");
  });

  it("keeps identity stable across direction and window advancement", () => {
    const rising = createDailyWeightPIObservations({
      precomputedAssessment: assessment(),
    })[0];
    const falling = createDailyWeightPIObservations({
      precomputedAssessment: assessment({
        currentAverage: 164,
        absoluteChange: -1,
        direction: "falling",
        currentDateRange: {
          startDate: "2026-07-15",
          endDate: "2026-07-21",
        },
        comparisonDateRange: {
          startDate: "2026-07-08",
          endDate: "2026-07-14",
        },
        currentEvidenceIds: ["advanced"],
      }),
    })[0];
    expect(falling.id).toBe(rising.id);
  });

  it.each([
    ["no evidence", {}, "unevaluated"],
    ["one entry", {
      currentAverage: 166,
      currentSampleCount: 1,
      currentEvidenceIds: ["only"],
      currentDateRange: {
        startDate: "2026-07-20",
        endDate: "2026-07-20",
      },
    }, "low"],
    ["no current comparison", {
      comparisonAverage: 165,
      comparisonSampleCount: 7,
      comparisonEvidenceIds: ["prior"],
    }, "low"],
  ])("represents %s as suppressible insufficiency", (_name, value, level) => {
    expect(createDailyWeightPIObservations({
      precomputedAssessment: value,
    })).toEqual([]);
    const [observation] = createDailyWeightPIObservations({
      precomputedAssessment: value,
      includeInsufficientData: true,
    });
    expect(observation).toMatchObject({
      status: "insufficient_data",
      direction: "not_applicable",
      confidence: { level },
    });
  });

  it("rejects inconsistent precomputed direction without mutating input", () => {
    const input = assessment();
    const before = structuredClone(input);
    expect(() => createDailyWeightPIObservations({
      precomputedAssessment: { ...input, direction: "falling" },
    })).toThrow(/direction/);
    expect(input).toEqual(before);
  });
});
