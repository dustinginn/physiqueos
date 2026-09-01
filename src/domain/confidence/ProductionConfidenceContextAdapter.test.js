import { describe, expect, it } from "vitest";
import {
  adaptBriefingArtifactToEvidenceDescriptors,
  adaptBriefingArtifactToExecutionContext,
  adaptDEXAEventToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
  assertCanonicalEvidenceDescriptorCoverage,
  isQualifyingPhotoEventInterpretation,
} from "./ProductionConfidenceContextAdapter";

describe("production Confidence V2 context adapters", () => {
  it("fails closed when mapped canonical dependencies collapse to fallback context", () => {
    const artifact = { id: "monthly-august", dependencyManifest: {
      canonicalDependencies: [{ evidenceType: "training" },
        { evidenceType: "nutrition" }],
    } };
    const goalContract = { relevantEvidence: { entries: [
      { evidenceMapId: "training", evidenceCapability: "training_progression",
        role: "primary" },
      { evidenceMapId: "energy", evidenceCapability: "energy_availability",
        role: "supporting" },
    ] } };
    expect(() => assertCanonicalEvidenceDescriptorCoverage({
      artifact, goalContract,
      evidenceDescriptors: [{ capability: "execution_context",
        sourceEvidenceIds: [], sourceObservationIds: [] }],
    })).toThrow(expect.objectContaining({
      code: "confidence_evidence_normalization_coverage_failure",
    }));
    expect(assertCanonicalEvidenceDescriptorCoverage({
      artifact, goalContract,
      evidenceDescriptors: [{ capability: "training_progression",
        sourceEvidenceIds: ["training-1"], sourceObservationIds: ["obs-1"] }],
    })).toBe(true);
    expect(assertCanonicalEvidenceDescriptorCoverage({
      artifact: { id: "empty", dependencyManifest: { canonicalDependencies: [] } },
      goalContract,
      evidenceDescriptors: [{ capability: "execution_context" }],
    })).toBe(true);
  });

  it("maps a Monthly DEXA snapshot as baseline context without claiming progress", () => {
    const descriptors = adaptBriefingArtifactToEvidenceDescriptors({
      artifact: {
        id: "monthly-august",
        cadence: "monthly",
        evidenceCutoff: "2026-09-01T06:59:59.999Z",
        evidenceWindow: { id: "monthly:august", startDate: "2026-08-01",
          endDate: "2026-08-31", closed: true },
        briefing: { provenance: { evidenceRefs: [] } },
      },
      piEnvelope: { observations: [{
        id: "dexa-snapshot", domain: "dexa",
        kind: "dexa_measurement_snapshot", status: "observed",
        direction: "neutral",
        evidenceWindow: { startDate: "2026-08-15", endDate: "2026-08-15" },
        supportingEvidenceIds: ["dexa-aug-15"],
        confidence: { level: "high", limitations: [] },
        explanationData: { measurements: {} },
        provenance: { producer: "dexa_pi_observation_service",
          sourceEvidenceIds: ["dexa-aug-15"] },
      }] },
    });
    expect(descriptors).toContainEqual(expect.objectContaining({
      capability: "dexa_body_composition", agreement: "indeterminate",
      strength: "high", sourceEvidenceIds: ["dexa-aug-15"],
    }));
  });

  it("materializes a Goal Contract from accepted production Goal semantics", () => {
    const contract = adaptProductionGoalToCanonicalContract(goal(), {
      activePhase: goal().phases[0],
    });
    expect(contract).toMatchObject({
      contractVersion: "goal_contract_v2_production_adapter_v1",
      goal: { goalId: "goal-one" },
      objectives: [{ measurement: { metricOrCapability: "lean_mass_change_lb" },
        completionThreshold: { operator: "gte", value: 10 } }],
      guardrails: [{ monitoredMetricOrCapability: "body_fat_pct",
        constraint: { kind: "bounded_range", min: 8, max: 9 },
        warningThreshold: { operator: "outside", min: 8, max: 9 },
        violationThreshold: { operator: "outside", min: 6, max: 11 } }],
    });
    expect(contract.relevantEvidence.entries.every((item) =>
      item.appliesTo.objectiveRefs.length || item.appliesTo.guardrailRefs.length ||
      item.appliesTo.hypothesisRefs.length)).toBe(true);
    expect(contract.expectedTrajectory.segments).toEqual([]);
    expect(contract.quantitativeProgress.status).toBe("unavailable");
  });

  it("normalizes a real DEXA comparison into Goal-readable measurements", () => {
    const descriptors = adaptDEXAEventToEvidenceDescriptors({
      priorScan: scan("prior", 150, 14, 8, 170),
      scan: scan("current", 152.5, 15.2, 8.4, 173),
    });
    expect(descriptors[0].measurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "lean_mass_change_lb", value: 2.5 }),
      expect.objectContaining({ metric: "fat_mass_change_lb", value: 1.2 }),
      expect.objectContaining({ metric: "body_fat_pct", value: 8.4 }),
    ]));
  });

  it("fails closed instead of fabricating an incomplete Goal Objective", () => {
    expect(() => adaptProductionGoalToCanonicalContract({ id: "goal" }))
      .toThrow(/canonical_goal_objective_incomplete/);
  });

  it("qualifies a Goal-relevant canonical visual interpretation, including no-change reads", () => {
    expect(isQualifyingPhotoEventInterpretation({ goalId: "goal-one", narrative: {
      poseInterpretations: [{ goalId: "goal-one", goalRelevance: "primary",
        confidence: "moderate", observations: ["Condition appears stable."] }],
    } })).toBe(true);
    expect(isQualifyingPhotoEventInterpretation({ goalId: "goal-one", narrative: {
      poseInterpretations: [{ goalId: "other", goalRelevance: "primary",
        confidence: "moderate", observations: ["Unrelated change."] }],
    } })).toBe(false);
  });

  it("propagates structured cadence PI evidence without double-counting Photo authority", () => {
    const artifact = cadenceArtifact();
    const descriptors = adaptBriefingArtifactToEvidenceDescriptors({
      artifact,
      piEnvelope: artifact.briefing.weeklyNarrative.context.pi,
    });
    expect(descriptors.map((item) => item.capability)).toEqual([
      "training_progression", "energy_availability", "body_weight_trend",
      "recovery_capacity", "progress_photos",
    ]);
    expect(descriptors[0]).toMatchObject({
      agreement: "supports", strength: "high",
      sourceObservationIds: ["performance|overall|resistance"],
    });
    const photos = descriptors.filter((item) =>
      item.capability === "progress_photos");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      agreement: "supports", strength: "moderate",
      sourceEvidenceIds: ["photo-prior", "photo-session"],
    });
    expect(photos[0].sourceObservationIds).toHaveLength(2);
    expect(JSON.stringify(photos[0])).not.toContain("photo-assessment");
    expect(descriptors.find((item) =>
      item.capability === "body_weight_trend").measurements[0])
      .toMatchObject({ metric: "body_weight_change_lb", value: -0.2 });
  });

  it("separates canonical execution exposure from partial evidence completeness", () => {
    const artifact = cadenceArtifact();
    expect(adaptBriefingArtifactToExecutionContext({
      artifact,
      piEnvelope: artifact.briefing.weeklyNarrative.context.pi,
      cadence: "weekly",
      operatingState: "calibration",
    })).toMatchObject({
      adequacy: "adequate", elapsedTimeAdequacy: "adequate",
      operatingState: "calibration", refs: ["training-one", "training-two"],
      evidenceCompleteness: {
        overall: "partial",
        domains: { energy: "partial", training: "complete", weight: "complete" },
      },
    });
  });

  it("uses the synthetic fallback only for a genuinely evidence-empty cadence", () => {
    const artifact = { id: "empty", evidenceWindow: {
      endDate: "2026-08-08", closed: true,
    }, briefing: {} };
    expect(adaptBriefingArtifactToEvidenceDescriptors({ artifact }))
      .toEqual([expect.objectContaining({
        capability: "execution_context",
        sourceObservationIds: [], sourceClaimIds: [],
        quality: expect.objectContaining({
          limitations: ["outcome_evidence_not_present_in_normalized_context"],
        }),
      })]);
    expect(adaptBriefingArtifactToExecutionContext({
      artifact, cadence: "weekly",
    })).toMatchObject({ adequacy: "unknown", refs: [],
      evidenceCompleteness: { overall: "unknown", domains: {} } });
  });

  it("normalizes the production-shaped Midweek shadow envelope", () => {
    const artifact = cadenceArtifact();
    artifact.cadence = "midweek";
    artifact.evidenceWindow = {
      id: "midweek:2026-08-02:2026-08-04:America/Los_Angeles",
      cadence: "midweek", startDate: "2026-08-02", endDate: "2026-08-04",
      timeZone: "America/Los_Angeles", closed: true,
    };
    const pi = artifact.briefing.weeklyNarrative.context.pi;
    const descriptors = adaptBriefingArtifactToEvidenceDescriptors({
      artifact,
      piEnvelope: { shadow: { observations: pi.observations,
        coverage: { training: "available", energy: "partial" } },
        selection: pi.rankedClaims },
    });
    const training = descriptors.find((item) =>
      item.capability === "training_progression");
    expect(training).toMatchObject({
      agreement: "supports",
      temporalIdentity: {
        id: "confidence_week|2026-08-02|2026-08-08|America/Los_Angeles",
        state: "preliminary",
      },
    });
    expect(descriptors.some((item) =>
      item.capability === "execution_context")).toBe(false);
    expect(adaptBriefingArtifactToExecutionContext({
      artifact,
      piEnvelope: { shadow: { observations: pi.observations,
        coverage: { training: "available", energy: "partial" } } },
      cadence: "midweek",
    })).toMatchObject({ adequacy: "adequate", refs: [
      "training-one", "training-two",
    ] });
  });
});

function goal() {
  return {
    id: "goal-one", type: "body_composition", updatedAt: "2026-07-20T00:00:00Z",
    purpose: "Build lean mass while controlling body fat",
    target: { type: "numeric_change", metric: "lean_mass", direction: "increase",
      amount: 10, unit: "lb", description: "Build 10 lb lean mass",
      targetDate: "2026-10-31" },
    timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" },
    openingApproach: { value: "calibration", known: [], unknown: [] },
    phases: [{ id: "phase-one", status: "active", name: "Calibration",
      purpose: "Establish maintenance", successCriteria: [] }],
    guardrails: [{ id: "body-fat", text: "Maintain approximately 8-9% body fat.",
      accepted: true }],
    progressMeasurement: { outcomeMeasures: [{ id: "dexa", evidenceType:
      "dexa_lean_mass", role: "outcome", accepted: true }],
    predictiveSignals: [{ id: "training", evidenceType: "training_trend",
      role: "predictive", accepted: true }], explanatorySignals: [] },
  };
}
function scan(id, lean, fat, bodyFat, weight) {
  return { id, measuredAt: "2026-08-01T08:00:00-07:00",
    leanMass: { value: lean }, fatMass: { value: fat },
    bodyFatPercentage: bodyFat, totalMass: { value: weight } };
}

function cadenceArtifact() {
  const window = { startDate: "2026-08-02", endDate: "2026-08-08",
    closed: true };
  const observation = (id, domain, kind, extra = {}) => ({
    id, domain, kind, status: "observed", direction: "not_applicable",
    evidenceWindow: { ...window, comparisonStartDate: "2026-07-26",
      comparisonEndDate: "2026-08-01" },
    confidence: { level: "moderate", limitations: [] },
    supportingEvidenceIds: [], provenance: { producer: `${domain}_producer` },
    explanationData: {}, ...extra,
  });
  const observations = [
    observation("performance|overall|resistance", "training",
      "training_performance", { status: "improving", direction: "positive",
        confidence: { level: "high", limitations: [] },
        supportingEvidenceIds: ["training-two", "training-one"] }),
    observation("energy", "energy", "energy_balance"),
    observation("weight", "weight", "weight_average_change", {
      direction: "falling", explanationData: { absoluteChange: -0.2,
        comparisonSampleCount: 7, unit: "lb" } }),
    observation("recovery", "recovery", "recovery_state", {
      status: "insufficient_data", confidence: { level: "low",
        limitations: ["recovery_evidence_unavailable"] } }),
    observation("photo-leanness", "photos", "photo_leanness_change", {
      direction: "rising", supportingEvidenceIds: ["photo-session", "photo-prior"],
      explanationData: { currentSessionId: "photo-session",
        comparisonSessionId: "photo-prior", comparisonQuality: "high" } }),
    observation("photo-muscularity", "photos", "photo_muscularity_change", {
      status: "stable", direction: "stable",
      supportingEvidenceIds: ["photo-session", "photo-prior"],
      explanationData: { currentSessionId: "photo-session",
        comparisonSessionId: "photo-prior", comparisonQuality: "high" } }),
    observation("photo-comparability", "photos", "photo_comparability", {
      confidence: { level: "high", limitations: [] },
      supportingEvidenceIds: ["photo-session", "photo-prior"] }),
  ];
  return { id: "weekly", evidenceWindow: window, briefing: {
    weeklyNarrative: { context: {
      currentPeriodPhotoEvent: { briefing: { photoEventNarrative: {
        goalConfidence: { assessmentId: "photo-assessment", score: 59 },
      } } },
      evidenceCompleteness: {
        energy: "partial", training: "available", weight: "available",
      },
      pi: { observations, rankedClaims: {
      primary: [], supporting: [], background: [],
    } } } },
  } };
}
