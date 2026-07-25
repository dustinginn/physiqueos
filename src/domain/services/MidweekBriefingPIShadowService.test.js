import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditMidweekPIParity,
  createMidweekPIShadowResult,
} from "./MidweekBriefingPIShadowService";
import { createMidweekBriefingPIShadowDiagnostic } from "./MidweekBriefingService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";

const window = {
  id: "midweek:2026-07-19:2026-07-21:America/Los_Angeles",
  cadence: "midweek",
  briefingDate: "2026-07-22",
  startDate: "2026-07-19",
  endDate: "2026-07-21",
  timeZone: "America/Los_Angeles",
};
const comparisonWindow = {
  startDate: "2026-07-12",
  endDate: "2026-07-14",
};

function weight(id, measuredAt, value) {
  return { id, measuredAt, weight: { value, unit: "lb" } };
}

function day(date, intake, active, suffix) {
  return {
    date,
    nutritionDayId: `nutrition_${suffix}`,
    activityDayId: `activity_${suffix}`,
    calorieIntake: intake,
    activeCalories: active,
    rmr: 1800,
    rmrScanId: "dexa_rmr",
    rmrScanDate: "2026-07-01",
    estimatedExpenditure: 1800 + active,
    energyBalance: intake - 1800 - active,
    expenditureKind: "estimated_rmr_plus_active",
    completeness: "complete",
  };
}

function input(overrides = {}) {
  return {
    evidenceWindow: window,
    comparisonWindow,
    evaluationDate: "2026-07-22",
    timeZone: "America/Los_Angeles",
    weights: [
      weight("prior_1", "2026-07-12", 165),
      weight("prior_2", "2026-07-14", 165),
      weight("current_1", "2026-07-19", 166),
      weight("current_2", "2026-07-21", 166),
    ],
    energyDays: [
      day("2026-07-12", 2200, 500, "p1"),
      day("2026-07-14", 2200, 500, "p2"),
      day("2026-07-19", 2400, 600, "c1"),
      day("2026-07-20", 2400, 600, "c2"),
      day("2026-07-21", 2400, 600, "c3"),
    ],
    legacySemanticSummary: {
      weightDirection: "rising",
      intakeDirection: "rising",
      expenditureDirection: "rising",
      balanceDirection: "stable",
    },
    exactPrecomputed: true,
    ...overrides,
  };
}

function trainingSession(id, observedAt, load) {
  return {
    id,
    evidence_type: "training",
    observed_at: `${observedAt}T12:00:00Z`,
    exercises: [{
      exercise_id: "seated_cable_rows",
      name: "Seated Cable Rows",
      category: "Back",
      sets: [{ set_number: 1, weight: load, reps: 10 }],
    }],
  };
}

describe("Midweek PI shadow composition", () => {
  it("activates Training Energy only for the exact cadence Training window", () => {
    const sessions = [
      trainingSession("prior-training", "2026-07-13", 100),
      trainingSession("current-training", "2026-07-20", 110),
    ];
    const result = createMidweekPIShadowResult(input({
      canonicalTrainingEvidence: sessions,
      trainingReport: createTrainingPerformanceIntelligenceReport({
        canonicalObjects: sessions,
        now: "2026-07-22T12:00:00Z",
        generatedAt: "2026-07-22T12:00:00.000Z",
      }),
    }));
    expect(result.trainingEnergyReadiness).toMatchObject({
      authorityReady: true,
      compatibility: { state: "exact_match" },
      trainingEvidence: {
        currentWindowSessionCount: 1,
        comparisonWindowSessionCount: 1,
      },
    });
    expect(result.claims.some(
      (item) => item.kind === "training_energy_relationship"
    )).toBe(true);
  });
  it("preserves exact windows, weekly Energy structure, claims, and isolation", () => {
    const source = input();
    const before = structuredClone(source);
    const result = createMidweekPIShadowResult(source);
    expect(source).toEqual(before);
    expect(result.evidenceWindow).toEqual(window);
    expect(result.comparisonWindows.weight).toEqual(comparisonWindow);
    expect(result.observationCountsByDomain).toMatchObject({
      weight: 1,
      energy: 4,
    });
    expect(result.claims.some((claim) =>
      claim.participatingDomains.join("+") === "energy+weight"
    )).toBe(true);
    expect(result.energyTrendSummary).toMatchObject({
      currentAverageIntake: 2400,
      currentTotalIntake: 7200,
      currentAverageExpenditure: 2400,
      currentTotalExpenditure: 7200,
      currentAverageBalance: 0,
      pairedDayCount: 3,
      completeDayCount: 3,
      partialDayCount: 0,
      calculationMethod: "midweek_precomputed_energy_days",
    });
    expect(result.lifecycleResult.status).toBe("unavailable");
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      persistenceWrites: 0,
      energyPairedRange: {
        startDate: "2026-07-19",
        endDate: "2026-07-21",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /recommendation|sundayContinuity|prioritiesThroughSunday/
    );
  });

  it("is deterministic and evaluates lifecycle only with explicit prior claims", () => {
    const first = createMidweekPIShadowResult(input());
    expect(createMidweekPIShadowResult(input())).toEqual(first);
    const evaluated = createMidweekPIShadowResult(input({
      priorClaims: [],
    }));
    expect(evaluated.lifecycleResult.status).toBe("evaluated");
    expect(evaluated.lifecycleResult.currentClaims.every(
      (claim) => claim.lifecycle?.state
    )).toBe(true);
  });

  it.each([
    ["no evidence", {}],
    ["Weight only", { weights: input().weights }],
    ["Energy only", { energyDays: input().energyDays }],
  ])("handles %s without filler or execution failure", (_name, evidence) => {
    const result = createMidweekPIShadowResult({
      evidenceWindow: window,
      comparisonWindow,
      evaluationDate: "2026-07-22",
      ...evidence,
    });
    expect(result.primaryCandidate ?? null).toBeNull();
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.coverage).not.toHaveProperty("execution");
  });

  it("is exposed only through a diagnostic hook with no UI or storage path", () => {
    expect(createMidweekBriefingPIShadowDiagnostic(input())).toEqual(
      createMidweekPIShadowResult(input())
    );
    const service = fs.readFileSync(
      path.join(process.cwd(), "src/domain/services/MidweekBriefingService.js"),
      "utf8"
    );
    const shadow = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/domain/services/MidweekBriefingPIShadowService.js"
      ),
      "utf8"
    );
    expect(service.match(/createMidweekPIShadowResult\(/g)).toHaveLength(1);
    expect(shadow).not.toMatch(/Repository|localStorage|sessionStorage|new Date\(\s*\)/);
  });
});

describe("Midweek semantic parity", () => {
  it("distinguishes exact alignment, PI-only relationships, and conflicts", () => {
    const result = createMidweekPIShadowResult(input());
    expect(result.parityDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "weight",
        state: "exactly_aligned",
      }),
      expect.objectContaining({
        domain: "cross_domain_relationship",
        state: "pi_only",
      }),
    ]));
    const conflict = auditMidweekPIParity({
      observations: result.observations,
      legacySummary: { weightDirection: "falling" },
      exact: true,
    });
    expect(conflict).toContainEqual({
      domain: "weight",
      state: "semantic_conflict",
      legacy: "falling",
      pi: "rising",
    });
  });

  it("never grants exactly_aligned to approximate inputs", () => {
    const result = auditMidweekPIParity({
      observations: createMidweekPIShadowResult(input()).observations,
      legacySummary: { weightDirection: "rising" },
      exact: false,
    });
    expect(result).toContainEqual({
      domain: "weight",
      state: "aligned",
      legacy: "rising",
      pi: "rising",
    });
  });
});
