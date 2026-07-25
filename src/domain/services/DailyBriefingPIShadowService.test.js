import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditDailyPIShadowParity,
  createDailyPIShadowResult,
} from "./DailyBriefingPIShadowService";
import { createDailyBriefingPIShadowDiagnostic } from "./DailyBriefingService";

const evidenceWindow = {
  id: "daily:2026-07-20:America/Los_Angeles",
  cadence: "daily",
  briefingDate: "2026-07-21",
  date: "2026-07-20",
  startDate: "2026-07-20",
  endDate: "2026-07-20",
  start: "2026-07-20T00:00:00-07:00",
  end: "2026-07-20T23:59:59.999-07:00",
  timeZone: "America/Los_Angeles",
};

const buildGoal = {
  id: "goal_build_lean_mass",
  title: "Build Lean Mass",
  type: "build_lean_mass",
  status: "active",
  primary: true,
  timeline: { startDate: "2026-07-01", targetDate: "2026-10-31" },
  progressMeasurement: {
    predictiveSignals: [
      {
        id: "overload",
        evidenceType: "progressive_overload",
        importance: "strong",
        accepted: true,
      },
      {
        id: "weight",
        evidenceType: "scale_weight",
        importance: "supporting",
        accepted: true,
      },
    ],
    explanatorySignals: [
      {
        id: "calories",
        evidenceType: "calories",
        importance: "contextual",
        accepted: true,
      },
      {
        id: "activity",
        evidenceType: "activity",
        importance: "contextual",
        accepted: true,
      },
    ],
  },
  phases: [
    {
      id: "phase_maintenance",
      goalId: "goal_build_lean_mass",
      name: "Establish Maintenance",
      status: "active",
      order: 0,
      startDate: "2026-07-01",
    },
  ],
};

function weight(id, measuredAt, value) {
  return { id, measuredAt, weight: { value, unit: "lb" } };
}

function training(id, observedAt, load, reps) {
  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [
      {
        exercise_id: "seated_cable_rows",
        name: "Seated Cable Rows",
        category: "Back",
        sets: [{ set_number: 1, weight: load, reps }],
      },
    ],
  };
}

function completeInput(overrides = {}) {
  const dates = ["2026-07-07", "2026-07-13", "2026-07-14", "2026-07-20"];
  return {
    evidenceWindow,
    evaluationDate: "2026-07-21",
    timeZone: "America/Los_Angeles",
    activeGoal: buildGoal,
    weights: [
      weight("weight_prior_1", "2026-07-07", 165),
      weight("weight_prior_2", "2026-07-13", 165),
      weight("weight_current_1", "2026-07-14", 165),
      weight("weight_current_2", "2026-07-20", 165),
    ],
    canonicalTrainingEvidence: [
      training("training_1", "2026-07-14", 100, 10),
      training("training_2", "2026-07-20", 110, 10),
    ],
    energyReconciliationInput: {
      nutritionDays: dates.map((date, index) => ({
        id: `nutrition_${index}`,
        date,
        totals: { calories: index < 2 ? 2200 : 2400 },
      })),
      activityDays: dates.map((date, index) => ({
        id: `activity_${index}`,
        date,
        activeCalories: index < 2 ? 500 : 600,
      })),
      dexaScans: [
        {
          id: "dexa_rmr",
          measuredAt: "2026-07-01",
          restingMetabolicRate: { value: 1800 },
        },
      ],
    },
    ...overrides,
  };
}

function exactDailyInput(overrides = {}) {
  return completeInput({
    dailyWeightAssessment: {
      currentAverage: 165,
      comparisonAverage: 165,
      absoluteChange: 0,
      direction: "stable",
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
      currentEvidenceIds: ["weight_current_1", "weight_current_2"],
      comparisonEvidenceIds: ["weight_prior_1", "weight_prior_2"],
    },
    dailyEnergyAssessment: {
      evidenceDate: "2026-07-20",
      calorieIntake: 2400,
      activeCalories: 600,
      rmr: 1800,
      rmrScanId: "dexa_rmr",
      rmrScanDate: "2026-07-01",
      estimatedExpenditure: 2400,
      energyBalance: 0,
      nutritionDayId: "nutrition_3",
      activityDayId: "activity_3",
      nutritionCompleteness: "complete",
      activityCompleteness: "complete",
      pairedStatus: "complete",
      directions: {
        intake: "rising",
        expenditure: "rising",
        balance: "stable",
      },
    },
    ...overrides,
  });
}

describe("Daily Briefing PI shadow composition", () => {
  it("composes all existing PI stages without mutation, reads, writes, or prose", () => {
    const input = completeInput();
    const before = structuredClone(input);
    const result = createDailyPIShadowResult(input);

    expect(input).toEqual(before);
    expect(result.observationCountsByDomain).toMatchObject({
      training: expect.any(Number),
      weight: expect.any(Number),
      energy: expect.any(Number),
    });
    expect(result.observationCountsByDomain.training).toBeGreaterThan(0);
    expect(result.observationCountsByDomain.weight).toBeGreaterThan(0);
    expect(result.observationCountsByDomain.energy).toBeGreaterThan(0);
    expect(result.claims.some((claim) =>
      claim.participatingDomains.join("+") === "energy+weight"
    )).toBe(true);
    expect(result.claims.some((claim) =>
      claim.participatingDomains.join("+") === "training+weight"
    )).toBe(true);
    expect(result.observations.every((item) => item.goalContext)).toBe(true);
    expect(result.observations.filter((item) =>
      item.domain === "weight" || item.domain === "energy"
    ).every((item) => item.goalContext.observationRole === "context")).toBe(true);
    expect(result.observations.filter((item) =>
      item.domain === "training" && item.kind === "progressive_overload"
    ).every((item) =>
      item.goalContext.observationRole === "progress" &&
      item.goalContext.primaryOutcomeRelevance === true
    )).toBe(true);
    expect(result.lifecycleResult).toMatchObject({
      status: "unavailable",
      reason: "prior_pi_claims_not_supplied",
    });
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      persistenceWrites: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /"narrative"|"recommendation"|"coaching"|"persistence"/i
    );
  });

  it("is deterministic and evaluates lifecycle only from explicit prior claims", () => {
    const first = createDailyPIShadowResult({
      ...completeInput(),
      lifecycleMode: "new",
    });
    const second = createDailyPIShadowResult({
      ...completeInput(),
      lifecycleMode: "evaluate",
      priorClaims: first.lifecycleResult.currentClaims,
    });

    expect(createDailyPIShadowResult(completeInput())).toEqual(
      createDailyPIShadowResult(completeInput())
    );
    expect(first.lifecycleResult.status).toBe("evaluated");
    expect(second.lifecycleResult.status).toBe("evaluated");
    expect(second.lifecycleResult.currentClaims.every(
      (claim) => claim.lifecycle?.state
    )).toBe(true);
  });

  it("preserves the canonical Daily window and records every internal horizon", () => {
    const result = createDailyPIShadowResult(completeInput());
    expect(result.evidenceWindow).toEqual(evidenceWindow);
    expect(result.provenance).toMatchObject({
      evaluationDate: "2026-07-21",
      timeZone: "America/Los_Angeles",
      internalWindows: {
        weight: {
          semanticHorizon: "rolling_7_days",
          observationWindow: {
            startDate: "2026-07-14",
            endDate: "2026-07-20",
          },
        },
        energy: {
          semanticHorizon: "rolling_7_days",
          observationWindow: {
            startDate: "2026-07-14",
            endDate: "2026-07-20",
          },
        },
        training: {
          startDate: "2026-07-14",
          endDate: "2026-07-20",
          evidenceWindow: {
            startDate: "2026-07-20",
            endDate: "2026-07-20",
          },
          comparisonWindow: {
            startDate: "2026-07-19",
            endDate: "2026-07-19",
          },
          sourceWindow: {
            startDate: "2026-07-14",
            endDate: "2026-07-20",
          },
        },
      },
    });
    const trainingObservation = result.observations.find(
      (item) => item.domain === "training" &&
        item.subject.type === "training_scope"
    );
    expect(trainingObservation.evidenceWindow).toMatchObject({
      startDate: "2026-07-20",
      endDate: "2026-07-20",
    });
    expect(trainingObservation.explanationData.cadenceWindow).toMatchObject({
      currentWindowSessionCount: 1,
      comparisonWindowSessionCount: 0,
      authoritativeEligible: true,
    });
  });

  it.each([
    ["UTC", "2026-01-01"],
    ["Pacific/Auckland", "2026-12-31"],
  ])("passes an explicit %s boundary through unchanged", (timeZone, date) => {
    const window = {
      ...evidenceWindow,
      id: `daily:${date}:${timeZone}`,
      briefingDate: date,
      date,
      startDate: date,
      endDate: date,
      timeZone,
    };
    const result = createDailyPIShadowResult({
      evidenceWindow: window,
      evaluationDate: date,
      timeZone,
    });
    expect(result.evidenceWindow.startDate).toBe(date);
    expect(result.evidenceWindow.endDate).toBe(date);
    expect(result.provenance.timeZone).toBe(timeZone);
  });

  it.each([
    ["no evidence", {}],
    ["Weight only", { weights: completeInput().weights }],
    ["Training only", {
      canonicalTrainingEvidence: completeInput().canonicalTrainingEvidence,
    }],
    ["Energy only", {
      energyReconciliationInput: completeInput().energyReconciliationInput,
    }],
  ])("returns explicit non-negative missing coverage for %s", (_name, evidence) => {
    const result = createDailyPIShadowResult({
      evidenceWindow,
      evaluationDate: "2026-07-21",
      ...evidence,
    });
    expect(result.claims.every((claim) =>
      claim.kind.startsWith("insufficient_")
    )).toBe(true);
    expect(result.primaryCandidate).toBeNull();
    expect(result.coverage).not.toEqual(
      expect.objectContaining({ execution: "failed" })
    );
  });

  it("is reachable only through the explicit diagnostic helper", () => {
    const direct = createDailyPIShadowResult(completeInput());
    expect(createDailyBriefingPIShadowDiagnostic(completeInput())).toEqual(
      direct
    );

    const dailySource = fs.readFileSync(
      path.join(process.cwd(), "src/domain/services/DailyBriefingService.js"),
      "utf8"
    );
    const shadowSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/domain/services/DailyBriefingPIShadowService.js"
      ),
      "utf8"
    );
    expect(dailySource.match(/createDailyPIShadowResult\(/g)).toHaveLength(2);
    expect(dailySource).toContain(
      "resolveAuthoritativeDailyPISelection"
    );
    expect(dailySource).not.toMatch(/piShadow\s*:/);
    expect(shadowSource).not.toMatch(/new Date\(\s*\)/);
    expect(shadowSource).not.toMatch(/Repository|localStorage|sessionStorage/);
  });

  it("uses exact Daily modes without fallback limitations or diagnostics", () => {
    const result = createDailyPIShadowResult(exactDailyInput());
    expect(result.limitations).not.toContain(
      "daily_weight_semantics_use_rolling_7_day_shadow_window"
    );
    expect(result.limitations).not.toContain(
      "daily_energy_semantics_use_rolling_7_day_shadow_window"
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "daily_weight_window_extended_for_existing_pi_producer"
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "daily_energy_window_extended_for_existing_pi_producer"
    );
    expect(result.provenance.internalWindows).toMatchObject({
      weight: {
        mode: "exact_daily_precomputed",
        semanticHorizon: "daily",
      },
      energy: {
        mode: "exact_daily_precomputed",
        semanticHorizon: "daily",
      },
    });
    expect(result.claims.some((claim) =>
      claim.participatingDomains.join("+") === "energy+weight"
    )).toBe(true);
    expect(result.claims.some((claim) =>
      claim.participatingDomains.join("+") === "training+weight"
    )).toBe(true);
    expect(result.lifecycleResult.status).toBe("unavailable");
    expect(result.evidenceWindow).toEqual(evidenceWindow);
  });

  it("keeps exact output deterministic and fallback explicitly distinct", () => {
    const exact = createDailyPIShadowResult(exactDailyInput());
    expect(createDailyPIShadowResult(exactDailyInput())).toEqual(exact);
    const fallback = createDailyPIShadowResult(completeInput());
    expect(fallback.provenance.internalWindows.weight.mode).toBe("fallback");
    expect(fallback.provenance.internalWindows.energy.mode).toBe("fallback");
    expect(fallback.limitations).toEqual(expect.arrayContaining([
      "daily_weight_semantics_use_rolling_7_day_shadow_window",
      "daily_energy_semantics_use_rolling_7_day_shadow_window",
    ]));
  });
});

describe("Daily Briefing PI semantic parity audit", () => {
  it("classifies aligned, PI-only, and legacy-only semantics without prose", () => {
    const shadowResult = createDailyPIShadowResult(completeInput());
    const aligned = auditDailyPIShadowParity({
      shadowResult,
      legacySignals: {
        weightDirection: "stable",
        trainingStatus: "improving",
        energyCoverage: "complete",
      },
    });
    const piOnly = auditDailyPIShadowParity({ shadowResult });
    const legacyOnly = auditDailyPIShadowParity({
      shadowResult: createDailyPIShadowResult({
        evidenceWindow,
        evaluationDate: "2026-07-21",
      }),
      legacySignals: { genericTheme: true, thesisDomain: "weight" },
    });

    expect(aligned.diagnostics.filter((item) =>
      ["weight", "training", "energy"].includes(item.domain)
    ).every((item) => item.state === "aligned")).toBe(true);
    expect(piOnly.diagnostics).toContainEqual(
      expect.objectContaining({
        domain: "cross_domain_relationship",
        state: "pi_only",
      })
    );
    expect(legacyOnly.diagnostics).toContainEqual(
      expect.objectContaining({ domain: "thesis", state: "legacy_only" })
    );
    expect(aligned.provenance.proseCompared).toBe(false);
  });

  it("reports conflicts and insufficiency with structured evidence", () => {
    const shadowResult = createDailyPIShadowResult(completeInput());
    const conflict = auditDailyPIShadowParity({
      shadowResult,
      legacySignals: { weightDirection: "rising" },
    });
    const insufficient = auditDailyPIShadowParity({
      shadowResult: createDailyPIShadowResult({
        evidenceWindow,
        evaluationDate: "2026-07-21",
      }),
    });

    expect(conflict.diagnostics).toContainEqual({
      domain: "weight",
      state: "partially_aligned",
      legacy: "rising",
      pi: "stable",
    });
    expect(insufficient.overallState).toBe("insufficient_for_comparison");
  });

  it("uses a conservative semantic-conflict category for opposing movement", () => {
    const shadowResult = createDailyPIShadowResult(completeInput({
      weights: [
        weight("weight_prior_1", "2026-07-07", 163),
        weight("weight_prior_2", "2026-07-13", 163),
        weight("weight_current_1", "2026-07-14", 167),
        weight("weight_current_2", "2026-07-20", 167),
      ],
    }));
    const result = auditDailyPIShadowParity({
      shadowResult,
      legacySignals: { weightDirection: "falling" },
    });
    expect(result.diagnostics).toContainEqual({
      domain: "weight",
      state: "semantic_conflict",
      legacy: "falling",
      pi: "rising",
    });
  });

  it("reserves exactly_aligned for matching exact precomputed inputs", () => {
    const input = exactDailyInput();
    const exact = auditDailyPIShadowParity({
      shadowResult: createDailyPIShadowResult(input),
      legacySignals: {
        weightDirection: "stable",
        weightAssessment: input.dailyWeightAssessment,
        energyCoverage: "complete",
        energyAssessment: input.dailyEnergyAssessment,
      },
    });
    expect(exact.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "weight", state: "exactly_aligned" }),
      expect.objectContaining({ domain: "energy", state: "exactly_aligned" }),
      expect.objectContaining({
        domain: "cross_domain_relationship",
        state: "pi_only",
      }),
    ]));

    const fallback = auditDailyPIShadowParity({
      shadowResult: createDailyPIShadowResult(completeInput()),
      legacySignals: {
        weightDirection: "stable",
        energyCoverage: "complete",
      },
    });
    expect(fallback.diagnostics.some(
      (item) => item.state === "exactly_aligned"
    )).toBe(false);
  });
});
