import { describe, expect, it } from "vitest";
import { isPIObservation } from "./PIObservationService";
import { reconcileEnergyDays } from "./EnergyDailyReconciliationService";
import { createEnergyPresentation } from "./EnergyEvidenceService";
import {
  createDailyEnergyPIObservations,
  createEnergyPIObservations,
} from "./EnergyPIObservationService";

const currentWindow = { startDate: "2026-07-14", endDate: "2026-07-20" };
const priorWindow = { startDate: "2026-07-07", endDate: "2026-07-13" };
const dexaScans = [
  {
    id: "dexa_rmr",
    measuredAt: "2026-07-01",
    restingMetabolicRate: { value: 1800 },
  },
];

function inputs({
  currentIntake = [2400, 2400],
  currentActivity = [600, 600],
  priorIntake = [2200, 2200],
  priorActivity = [500, 500],
  scans = dexaScans,
} = {}) {
  const dates = ["2026-07-07", "2026-07-13", "2026-07-14", "2026-07-20"];
  const nutritionValues = [...priorIntake, ...currentIntake];
  const activityValues = [...priorActivity, ...currentActivity];
  return {
    nutritionDays: dates
      .map((date, index) =>
        nutritionValues[index] == null
          ? null
          : {
              id: `nutrition_${index}`,
              date,
              totals: { calories: nutritionValues[index] },
            }
      )
      .filter(Boolean),
    activityDays: dates
      .map((date, index) =>
        activityValues[index] == null
          ? null
          : {
              id: `activity_${index}`,
              date,
              activeCalories: activityValues[index],
            }
      )
      .filter(Boolean),
    dexaScans: scans,
  };
}

function observations(overrides = {}) {
  return createEnergyPIObservations({
    reconciliationInput: inputs(),
    observationWindow: currentWindow,
    comparisonWindow: priorWindow,
    ...overrides,
  });
}

describe("EnergyPIObservationService", () => {
  it("returns no observations for no evidence by default", () => {
    expect(
      createEnergyPIObservations({
        reconciliationInput: {},
        observationWindow: currentWindow,
      })
    ).toEqual([]);
  });

  it("represents missing Nutrition or Activity without fabricating balance", () => {
    const nutritionOnly = createEnergyPIObservations({
      reconciliationInput: inputs({
        currentActivity: [null, null],
        priorActivity: [null, null],
      }),
      observationWindow: currentWindow,
      requestedKinds: ["energy_balance", "paired_day_coverage"],
      includeInsufficientData: true,
    });
    const activityOnly = createEnergyPIObservations({
      reconciliationInput: inputs({
        currentIntake: [null, null],
        priorIntake: [null, null],
      }),
      observationWindow: currentWindow,
      requestedKinds: ["energy_balance", "paired_day_coverage"],
      includeInsufficientData: true,
    });

    expect(nutritionOnly.find((item) => item.kind === "energy_balance")).toMatchObject({
      status: "insufficient_data",
      direction: "not_applicable",
    });
    expect(
      nutritionOnly.find((item) => item.kind === "paired_day_coverage")
        .explanationData
    ).toMatchObject({ nutritionOnlyDays: 2, completePairedDays: 0 });
    expect(
      activityOnly.find((item) => item.kind === "paired_day_coverage")
        .explanationData
    ).toMatchObject({ activityOnlyDays: 2, completePairedDays: 0 });
  });

  it("maps one and multiple paired days conservatively", () => {
    const one = createEnergyPIObservations({
      reconciliationInput: {
        nutritionDays: [
          { id: "n", date: "2026-07-14", totals: { calories: 2400 } },
        ],
        activityDays: [
          { id: "a", date: "2026-07-14", activeCalories: 600 },
        ],
        dexaScans,
      },
      observationWindow: currentWindow,
      requestedKinds: ["paired_day_coverage"],
    })[0];
    const multiple = observations({
      requestedKinds: ["paired_day_coverage"],
    })[0];

    expect(one).toMatchObject({
      status: "observed",
      confidence: { level: "low" },
      explanationData: { completePairedDays: 1 },
    });
    expect(multiple).toMatchObject({
      confidence: { level: "moderate" },
      explanationData: { completePairedDays: 2 },
    });
  });

  it.each([
    ["energy_intake", inputs({ currentIntake: [2200, 2200] }), "stable"],
    ["energy_intake", inputs({ currentIntake: [2400, 2400] }), "rising"],
    ["energy_intake", inputs({ currentIntake: [2000, 2000] }), "falling"],
    ["energy_expenditure", inputs({ currentActivity: [500, 500] }), "stable"],
    ["energy_expenditure", inputs({ currentActivity: [700, 700] }), "rising"],
    ["energy_expenditure", inputs({ currentActivity: [300, 300] }), "falling"],
    ["energy_balance", inputs({ currentIntake: [2200, 2200], currentActivity: [500, 500] }), "stable"],
    ["energy_balance", inputs({ currentIntake: [2500, 2500], currentActivity: [500, 500] }), "rising"],
    ["energy_balance", inputs({ currentIntake: [2100, 2100], currentActivity: [500, 500] }), "falling"],
  ])("reports %s movement as %s without goal valence", (kind, reconciliationInput, direction) => {
    const [observation] = createEnergyPIObservations({
      reconciliationInput,
      observationWindow: currentWindow,
      comparisonWindow: priorWindow,
      requestedKinds: [kind],
    });
    expect(observation).toMatchObject({
      status: "observed",
      direction,
    });
    expect(["positive", "negative", "improving", "regressing"]).not.toContain(
      observation.direction
    );
  });

  it("preserves reconciliation values, RMR, balance, counts, and boundaries", () => {
    const reconciliationInput = inputs();
    const sourceDays = reconcileEnergyDays(reconciliationInput);
    const sourceCurrent = sourceDays.filter(
      (day) => day.date >= currentWindow.startDate && day.date <= currentWindow.endDate
    );
    const sourceSummary = createEnergyPresentation({ days: sourceCurrent }).summary;
    const result = observations();
    const intake = result.find((item) => item.kind === "energy_intake");
    const expenditure = result.find((item) => item.kind === "energy_expenditure");
    const balance = result.find((item) => item.kind === "energy_balance");
    const coverage = result.find((item) => item.kind === "paired_day_coverage");

    expect(intake.explanationData.currentAverage).toBe(sourceSummary.averageIntake);
    expect(expenditure.explanationData.currentAverage).toBe(
      sourceSummary.averageExpenditure
    );
    expect(balance.explanationData.currentAverage).toBe(
      sourceSummary.averageBalance
    );
    expect(coverage.explanationData.completePairedDays).toBe(
      sourceSummary.completeDays
    );
    expect(expenditure.explanationData.limitations).toContain(
      "expenditure_is_estimated_rmr_plus_active_calories"
    );
    expect(expenditure.supportingEvidenceIds).toContain("dexa_rmr");
    expect(expenditure.explanationData.rmrSources).toEqual([
      {
        scanId: "dexa_rmr",
        scanDate: "2026-07-01",
        value: 1800,
        unit: "kcal_per_day",
      },
    ]);
    expect(expenditure.evidenceWindow).toMatchObject({
      startDate: currentWindow.startDate,
      endDate: currentWindow.endDate,
      comparisonStartDate: priorWindow.startDate,
      comparisonEndDate: priorWindow.endDate,
    });
  });

  it("preserves partial and missing-RMR completeness limitations", () => {
    const days = reconcileEnergyDays(
      inputs({
        currentActivity: [null, 600],
        scans: [],
      })
    );
    const result = createEnergyPIObservations({
      days,
      observationWindow: currentWindow,
      requestedKinds: ["paired_day_coverage"],
      includeInsufficientData: true,
    })[0];

    expect(result.explanationData).toMatchObject({
      completePairedDays: 0,
      nutritionOnlyDays: 1,
      missingRmrDays: 1,
      partialDays: 2,
    });
    expect(result.confidence.level).toBe("unevaluated");
    expect(result.confidence.limitations).toEqual(
      expect.arrayContaining([
        "nutrition_without_activity",
        "paired_inputs_without_historical_rmr",
      ])
    );
  });

  it("keeps persistent identity stable when values and windows change", () => {
    const rising = observations({ requestedKinds: ["energy_intake"] })[0];
    const falling = createEnergyPIObservations({
      reconciliationInput: inputs({
        currentIntake: [1800, 1800],
        priorIntake: [2200, 2200],
      }),
      observationWindow: currentWindow,
      comparisonWindow: priorWindow,
      requestedKinds: ["energy_intake"],
    })[0];
    const advanced = createEnergyPIObservations({
      reconciliationInput: {
        nutritionDays: [
          { id: "later", date: "2026-07-27", totals: { calories: 2100 } },
        ],
      },
      observationWindow: { startDate: "2026-07-21", endDate: "2026-07-27" },
      requestedKinds: ["energy_intake"],
    })[0];

    expect(rising.id).toBe(falling.id);
    expect(rising.id).toBe(advanced.id);
    expect(rising.direction).toBe("rising");
    expect(falling.direction).toBe("falling");
  });

  it("separates horizons, normalizes IDs, and validates contract output", () => {
    const seven = observations({ semanticHorizon: "rolling_7_days" });
    const thirty = observations({ semanticHorizon: "rolling_30_days" });
    expect(seven.map((item) => item.id)).not.toEqual(
      thirty.map((item) => item.id)
    );
    expect(seven.map((item) => item.id)).toEqual(
      seven.map((item) => item.id).sort()
    );
    expect(seven.every(isPIObservation)).toBe(true);
    seven.forEach((observation) => {
      expect(observation.supportingEvidenceIds).toEqual(
        [...observation.supportingEvidenceIds].sort()
      );
      expect(observation.provenance).toMatchObject({
        producer: "energy_pi_observation_service",
        producerVersion: "energy_pi_v1",
      });
      expect(JSON.stringify(observation)).not.toMatch(
        /stay the course|should|recommend/i
      );
    });
  });
});

describe("Daily Energy PI observation parity adapter", () => {
  function assessment(overrides = {}) {
    return {
      evidenceDate: "2026-07-20",
      calorieIntake: 2400,
      activeCalories: 600,
      rmr: 1800,
      rmrScanId: "dexa_rmr",
      rmrScanDate: "2026-07-01",
      estimatedExpenditure: 2400,
      energyBalance: 0,
      nutritionDayId: "nutrition_day",
      activityDayId: "activity_day",
      nutritionCompleteness: "complete",
      activityCompleteness: "complete",
      pairedStatus: "complete",
      directions: {
        intake: "rising",
        expenditure: "rising",
        balance: "stable",
      },
      ...overrides,
    };
  }

  it("preserves exact Daily values, completeness, RMR, provenance, and IDs", () => {
    const input = assessment();
    const before = structuredClone(input);
    const observations = createDailyEnergyPIObservations({
      precomputedAssessment: input,
    });
    const intake = observations.find((item) => item.kind === "energy_intake");
    const expenditure = observations.find(
      (item) => item.kind === "energy_expenditure"
    );
    const balance = observations.find((item) => item.kind === "energy_balance");
    const coverage = observations.find(
      (item) => item.kind === "paired_day_coverage"
    );

    expect(intake).toMatchObject({
      direction: "rising",
      explanationData: {
        value: 2400,
        calorieIntake: 2400,
        activeCalories: 600,
        selectedRmr: 1800,
        estimatedExpenditure: 2400,
        energyBalance: 0,
        nutritionCompleteness: "complete",
        activityCompleteness: "complete",
        pairedStatus: "complete",
        calculationMethod: "daily_precomputed_energy_assessment",
      },
    });
    expect(intake.id).toContain("daily.intake");
    expect(expenditure.explanationData.value).toBe(2400);
    expect(balance.explanationData.value).toBe(0);
    expect(coverage).toMatchObject({
      status: "observed",
      evidenceWindow: {
        startDate: "2026-07-20",
        endDate: "2026-07-20",
      },
      explanationData: {
        completePairedDays: 1,
        pairedStatus: "complete",
      },
    });
    expect(coverage.supportingEvidenceIds).toEqual([
      "activity_day",
      "dexa_rmr",
      "nutrition_day",
    ]);
    expect(observations.every(
      (item) => item.confidence.level === "moderate"
    )).toBe(true);
    expect(input).toEqual(before);
  });

  it.each([
    ["partial Nutrition", {
      nutritionCompleteness: "partial",
      pairedStatus: "nutrition-only",
      activeCalories: null,
      rmr: null,
      rmrScanId: null,
      estimatedExpenditure: null,
      energyBalance: null,
      activityDayId: null,
    }],
    ["partial Activity", {
      activityCompleteness: "partial",
      pairedStatus: "activity-only",
      calorieIntake: null,
      nutritionDayId: null,
      estimatedExpenditure: 2400,
      energyBalance: null,
    }],
    ["missing historical RMR", {
      rmr: null,
      rmrScanId: null,
      rmrScanDate: null,
      estimatedExpenditure: null,
      energyBalance: null,
      pairedStatus: "missing-rmr",
    }],
  ])("maps %s conservatively", (_name, overrides) => {
    const observations = createDailyEnergyPIObservations({
      precomputedAssessment: assessment(overrides),
      includeInsufficientData: true,
    });
    expect(observations.some(
      (item) => item.confidence.level === "low"
    )).toBe(true);
    expect(observations.find(
      (item) => item.kind === "paired_day_coverage"
    ).status).toBe("insufficient_data");
  });

  it("uses persistent daily semantic IDs across evidence dates", () => {
    const first = createDailyEnergyPIObservations({
      precomputedAssessment: assessment(),
    });
    const next = createDailyEnergyPIObservations({
      precomputedAssessment: assessment({
        evidenceDate: "2026-07-21",
        nutritionDayId: "nutrition_next",
        activityDayId: "activity_next",
      }),
    });
    expect(next.map((item) => item.id)).toEqual(
      first.map((item) => item.id)
    );
  });

  it("keeps completely missing Daily energy suppressible and non-negative", () => {
    expect(createDailyEnergyPIObservations({
      precomputedAssessment: {
        evidenceDate: "2026-07-20",
      },
    })).toEqual([]);
    const result = createDailyEnergyPIObservations({
      precomputedAssessment: {
        evidenceDate: "2026-07-20",
      },
      includeInsufficientData: true,
    });
    expect(result.every(
      (item) =>
        item.status === "insufficient_data" &&
        item.direction === "not_applicable"
    )).toBe(true);
  });

  it("contains no maintenance, coaching, or valenced conclusion", () => {
    const result = createDailyEnergyPIObservations({
      precomputedAssessment: assessment(),
    });
    expect(JSON.stringify(result)).not.toMatch(
      /maintenance|recommend|coach|favorable|unfavorable|good|bad/i
    );
  });
});
