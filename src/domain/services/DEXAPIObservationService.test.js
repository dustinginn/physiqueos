import { describe, expect, it } from "vitest";
import { applyPIGoalContextToObservations, createPIGoalContext } from "./PIObservationGoalContextService";
import { createDEXAPIObservations } from "./DEXAPIObservationService";

describe("DEXA PI observations", () => {
  it("preserves exact whole-body scan comparison and provenance", () => {
    const observations = createDEXAPIObservations({ scans: scans() });
    expect(observations.find((item) => item.kind === "dexa_lean_mass_change")).toMatchObject({
      direction: "rising",
      supportingEvidenceIds: ["dexa-current", "dexa-prior"],
      explanationData: {
        comparisonScanDate: "2026-06-20",
        currentScanDate: "2026-07-18",
        priorValue: 146.2,
        currentValue: 148,
        absoluteChange: 1.8,
        unit: "lb",
        baselineSelectionMethod: "immediate_prior_eligible_scan",
      },
      provenance: { producer: "dexa_pi_observation_service", calculationMethod: "whole_body_scan_to_scan_delta" },
    });
    expect(observations.find((item) => item.kind === "dexa_body_fat_percentage_change").direction).toBe("falling");
    expect(observations.find((item) => item.kind === "dexa_rmr_change").direction).toBe("rising");
  });

  it("uses persistent metric identities while event snapshot identity is scan-scoped", () => {
    const first = createDEXAPIObservations({ scans: scans() });
    const changed = scans();
    changed[1].leanMass.value = 145;
    const second = createDEXAPIObservations({ scans: changed });
    expect(id(first, "dexa_lean_mass_change")).toBe(id(second, "dexa_lean_mass_change"));
    expect(first.find((item) => item.kind === "dexa_lean_mass_change").direction).toBe("rising");
    expect(second.find((item) => item.kind === "dexa_lean_mass_change").direction).toBe("falling");
    expect(id(first, "dexa_measurement_snapshot")).toContain("dexa-current");
  });

  it("selects the immediate prior eligible scan and excludes superseded records", () => {
    const input = [
      scans()[0],
      { ...scans()[0], id: "superseded", measuredAt: "2026-07-10", quality: { status: "superseded" } },
      scans()[1],
    ];
    const observation = createDEXAPIObservations({ scans: input })
      .find((item) => item.kind === "dexa_fat_mass_change");
    expect(observation.explanationData.comparisonScanId).toBe("dexa-prior");
  });

  it("emits snapshot and insufficient comparison for one scan", () => {
    const observations = createDEXAPIObservations({ scans: [scans()[1]] });
    expect(observations.map((item) => item.kind)).toEqual([
      "dexa_insufficient_comparison",
      "dexa_measurement_snapshot",
    ]);
  });

  it("preserves valid metrics and reports missing or mismatched metrics conservatively", () => {
    const input = scans();
    input[1].leanMass.value = null;
    input[1].fatMass.unit = "kg";
    const observations = createDEXAPIObservations({ scans: input });
    const insufficient = observations.find((item) => item.kind === "dexa_insufficient_comparison");
    expect(insufficient.confidence.limitations).toEqual([
      "current_lean_mass_unavailable",
      "fat_mass_unit_mismatch",
    ]);
    expect(observations.some((item) => item.kind === "dexa_body_fat_percentage_change")).toBe(true);
  });

  it("maps neutral measurements into existing Goal roles without conclusions", () => {
    const observations = createDEXAPIObservations({ scans: scans() });
    const goalContext = createPIGoalContext({
      activeGoal: {
        id: "goal-build",
        title: "Build Lean Mass",
        type: "build_lean_mass",
        status: "active",
        target: { type: "numeric_change", metric: "lean_mass", direction: "increase", amount: 10, unit: "lb" },
        guardrails: [{ id: "guardrail_body_fat", text: "Maintain approximately 8–9% body fat.", accepted: true }],
      },
      currentDate: "2026-07-24T12:00:00Z",
      timeZone: "America/Los_Angeles",
    });
    const contextualized = applyPIGoalContextToObservations(observations, goalContext);
    expect(contextualized.find((item) => item.kind === "dexa_lean_mass_change").goalContext.observationRole).toBe("progress");
    expect(contextualized.find((item) => item.kind === "dexa_body_fat_percentage_change").goalContext.observationRole).toBe("guardrail");
    expect(JSON.stringify(contextualized)).not.toMatch(/goal success|goal failure|caused|hypertrophy/i);
  });

  it("is deterministic, JSON-safe, and input-immutable", () => {
    const input = scans();
    const before = structuredClone(input);
    const first = createDEXAPIObservations({ scans: input });
    expect(createDEXAPIObservations({ scans: input })).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(input).toEqual(before);
  });
});

function scans() {
  return [
    {
      id: "dexa-prior", measuredAt: "2026-06-20",
      totalMass: { value: 171.7, unit: "lb" },
      bodyFatPercentage: 10.7,
      fatMass: { value: 18.4, unit: "lb" },
      leanMass: { value: 146.2, unit: "lb" },
      restingMetabolicRate: { value: 1760, unit: "kcal/day" },
    },
    {
      id: "dexa-current", measuredAt: "2026-07-18",
      totalMass: { value: 166, unit: "lb" },
      bodyFatPercentage: 8.5,
      fatMass: { value: 14, unit: "lb" },
      leanMass: { value: 148, unit: "lb" },
      restingMetabolicRate: { value: 1800, unit: "kcal/day" },
    },
  ];
}

function id(observations, kind) {
  return observations.find((item) => item.kind === kind).id;
}
