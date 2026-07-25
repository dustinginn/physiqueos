import { describe, expect, it } from "vitest";
import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import {
  detectPIClaimMaterialChange,
  evaluatePIClaimLifecycle,
  evaluatePIClaimSetLifecycle,
} from "./PIClaimLifecycleService";

function claim({
  confidence = "moderate",
  coverage = "complete",
  energyDirection = "rising",
  goalContext = null,
  horizon = "rolling_7_days",
  kind = "intake_weight_stability",
  limitations = [],
  overlap = "complete",
  trainingDirection = null,
  trainingSubject = null,
  weightDirection = kind.includes("stability") ? "stable" : "rising",
  window = { startDate: "2026-07-14", endDate: "2026-07-20" },
} = {}) {
  const training = kind.includes("training");
  return createPICrossDomainClaim({
    kind,
    semanticScope: `${horizon}.${relationship(kind)}`,
    participatingObservationIds: [
      training ? "training_observation" : "energy_observation",
      "weight_observation",
    ],
    participatingDomains: training
      ? ["training", "weight"]
      : ["energy", "weight"],
    evidenceWindow: {
      ...window,
      comparisonStartDate: null,
      comparisonEndDate: null,
    },
    confidence: {
      level: confidence,
      limitations,
      method: "weakest_participant_with_limitation_reduction",
    },
    materiality: {
      level: "unevaluated",
      method: "ranking_not_implemented",
    },
    explanationData: {
      semanticHorizon: horizon,
      relationship: relationship(kind),
      energyDirection: training ? undefinedValue() : energyDirection,
      trainingDirection,
      trainingStatus: trainingDirection,
      trainingSubject,
      weightDirection,
      coverage: { state: coverage },
      evidenceOverlap: overlap,
      goalContext,
      currentAverage: 100,
    },
    provenance: {
      producer: "pi_cross_domain_claim_service",
      producerVersion: training
        ? "pi_training_weight_claims_v1"
        : "pi_weight_energy_claims_v1",
      calculationMethod: training
        ? "training_weight_observation_relationship"
        : "weight_energy_observation_relationship",
      sourceObservationIds: [
        training ? "training_observation" : "energy_observation",
        "weight_observation",
      ],
      producerChain: [],
    },
    limitations,
  });
}

function undefinedValue() {
  return null;
}

function relationship(kind) {
  if (kind.startsWith("intake")) return "intake";
  if (kind.startsWith("expenditure")) return "expenditure";
  if (kind.startsWith("energy_balance")) return "energy_balance";
  if (kind.includes("training_volume")) return "volume";
  if (kind.includes("training_regression")) return "regression";
  if (kind.includes("training_progress")) return "progress";
  if (kind.includes("training_stability")) return "stability";
  return "insufficient";
}

const completeOptions = {
  evaluationDate: "2026-07-20",
  evaluationCoverage: "complete",
};

describe("PIClaimLifecycleService new and unchanged", () => {
  it("marks first appearance new with deterministic metadata", () => {
    const current = claim();
    const result = evaluatePIClaimLifecycle(current, null, completeOptions);
    expect(result.lifecycle).toMatchObject({
      state: "new",
      firstObservedDate: "2026-07-20",
      lastObservedDate: "2026-07-20",
      lastMaterialChangeDate: "2026-07-20",
      consecutiveObservationCount: 1,
      consecutiveUnchangedCount: 0,
      totalObservationCount: 1,
      missedEvaluationCount: 0,
      currentConfidence: "moderate",
      eligibility: "eligible",
      provenance: {
        producer: "pi_claim_lifecycle_service",
        producerVersion: "pi_claim_lifecycle_v1",
      },
    });
    expect(current).not.toHaveProperty("lifecycle");
  });

  it("keeps equivalent meaning unchanged across window, evidence, and numeric churn", () => {
    const prior = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const current = claim({
      window: { startDate: "2026-07-21", endDate: "2026-07-27" },
    });
    current.participatingObservationIds = ["replacement_a", "replacement_b"];
    current.explanationData.currentAverage = 101;
    const result = evaluatePIClaimLifecycle(current, prior, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
    });
    expect(result.lifecycle).toMatchObject({
      state: "unchanged",
      firstObservedDate: "2026-07-20",
      lastObservedDate: "2026-07-27",
      lastMaterialChangeDate: "2026-07-20",
      consecutiveObservationCount: 2,
      consecutiveUnchangedCount: 1,
      totalObservationCount: 2,
    });
  });

  it("does not mutate current or prior claims and is deterministic", () => {
    const current = claim();
    const prior = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const beforeCurrent = structuredClone(current);
    const beforePrior = structuredClone(prior);
    const first = evaluatePIClaimLifecycle(current, prior, completeOptions);
    const second = evaluatePIClaimLifecycle(current, prior, completeOptions);
    expect(first).toEqual(second);
    expect(current).toEqual(beforeCurrent);
    expect(prior).toEqual(beforePrior);
  });
});

describe("PIClaimLifecycleService material support changes", () => {
  it.each([
    [claim({ confidence: "high" }), claim({ confidence: "moderate" }), "strengthened", "confidence_increased"],
    [claim({ coverage: "complete" }), claim({ coverage: "partial" }), "strengthened", "coverage_improved"],
    [claim(), claim({ limitations: ["paired_energy_coverage_partial"] }), "strengthened", "limitations_removed"],
    [claim({ overlap: "complete" }), claim({ overlap: "partial" }), "strengthened", "evidence_overlap_improved"],
    [
      claim({ trainingDirection: "improving", trainingSubject: { type: "training_scope", id: "resistance" }, kind: "training_progress_weight_stability" }),
      claim({ trainingDirection: "improving", trainingSubject: { type: "exercise", id: "row" }, kind: "training_progress_weight_stability" }),
      "strengthened",
      "training_scope_broadened",
    ],
    [claim({ confidence: "low" }), claim({ confidence: "moderate" }), "weakened", "confidence_decreased"],
    [claim({ coverage: "partial" }), claim({ coverage: "complete" }), "weakened", "coverage_declined"],
    [claim({ limitations: ["new_limitation"] }), claim(), "weakened", "limitations_added"],
    [claim({ overlap: "partial" }), claim({ overlap: "complete" }), "weakened", "evidence_overlap_declined"],
  ])("classifies support change as %s", (current, priorBase, state, reason) => {
    const prior = evaluatePIClaimLifecycle(priorBase, null, completeOptions);
    const result = evaluatePIClaimLifecycle(current, prior, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
    });
    expect(result.id).toBe(prior.id);
    expect(result.lifecycle.state).toBe(state);
    expect(result.lifecycle.changeReasons).toContain(reason);
    expect(result.lifecycle.firstObservedDate).toBe("2026-07-20");
    expect(result.lifecycle.lastMaterialChangeDate).toBe("2026-07-27");
  });

  it("does not strengthen from duplicate evidence IDs alone", () => {
    const prior = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const current = claim();
    current.provenance.sourceObservationIds.push("duplicate_only");
    expect(
      evaluatePIClaimLifecycle(current, prior, {
        ...completeOptions,
        evaluationDate: "2026-07-27",
      }).lifecycle.state
    ).toBe("unchanged");
  });

  it("strengthens from additional comparable persistence only when configured", () => {
    const prior = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const result = evaluatePIClaimLifecycle(claim(), prior, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
      persistenceStrengthensAt: 2,
    });
    expect(result.lifecycle).toMatchObject({
      state: "strengthened",
      changeReasons: ["relationship_persisted"],
      totalObservationCount: 2,
    });
  });

  it("inverts evidence improvement for an insufficiency claim", () => {
    const priorBase = claim({
      kind: "insufficient_energy_to_explain_weight",
      confidence: "moderate",
      coverage: "missing",
    });
    const prior = evaluatePIClaimLifecycle(priorBase, null, completeOptions);
    const current = claim({
      kind: "insufficient_energy_to_explain_weight",
      confidence: "moderate",
      coverage: "partial",
    });
    const result = evaluatePIClaimLifecycle(current, prior, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
    });
    expect(result.lifecycle.state).toBe("weakened");
  });
});

describe("PIClaimLifecycleService contradiction and resolution", () => {
  it("detects same-ID intake direction contradiction structurally", () => {
    const prior = evaluatePIClaimLifecycle(
      claim({ energyDirection: "rising" }),
      null,
      completeOptions
    );
    const current = claim({ energyDirection: "falling" });
    const result = evaluatePIClaimLifecycle(current, prior, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
    });
    expect(result.lifecycle).toMatchObject({
      state: "contradicted",
      priorClaimId: prior.id,
      changeReasons: ["measured_direction_contradicted"],
    });
  });

  it("detects cross-ID Weight stability→change and Training progress→regression", () => {
    const energyPrior = claim({ kind: "intake_weight_stability" });
    const energyCurrent = claim({ kind: "intake_weight_change" });
    const trainingPrior = claim({
      kind: "training_progress_weight_stability",
      trainingDirection: "improving",
      trainingSubject: { type: "training_scope", id: "resistance" },
    });
    const trainingCurrent = claim({
      kind: "training_regression_weight_stability",
      trainingDirection: "regressing",
      trainingSubject: { type: "training_scope", id: "resistance" },
    });
    const result = evaluatePIClaimSetLifecycle(
      [energyCurrent, trainingCurrent],
      [energyPrior, trainingPrior],
      completeOptions
    );
    expect(result.currentClaims.every((item) =>
      item.lifecycle.state === "contradicted"
    )).toBe(true);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.currentClaims.map((item) => item.lifecycle.priorClaimId))
      .toEqual(expect.arrayContaining([energyPrior.id, trainingPrior.id]));
  });

  it("does not contradict different horizons, domain pairs, or Training subjects", () => {
    const prior = claim({
      kind: "training_progress_weight_stability",
      trainingDirection: "improving",
      trainingSubject: { type: "exercise", id: "row" },
    });
    const differentHorizon = claim({
      horizon: "rolling_30_days",
      kind: "training_regression_weight_stability",
      trainingDirection: "regressing",
      trainingSubject: { type: "exercise", id: "row" },
    });
    const differentSubject = claim({
      kind: "training_regression_weight_stability",
      trainingDirection: "regressing",
      trainingSubject: { type: "exercise", id: "press" },
    });
    const energy = claim({ kind: "intake_weight_change" });
    const result = evaluatePIClaimSetLifecycle(
      [differentHorizon, differentSubject, energy],
      [prior],
      completeOptions
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("resolves insufficiency with supported evidence and links both identities", () => {
    const prior = claim({
      kind: "insufficient_energy_to_explain_weight",
      coverage: "missing",
    });
    const current = claim({ kind: "intake_weight_stability" });
    const result = evaluatePIClaimSetLifecycle(
      [current],
      [prior],
      completeOptions
    );
    expect(result.currentClaims[0].lifecycle).toMatchObject({
      state: "new",
      priorClaimId: prior.id,
      changeReasons: ["prior_semantic_state_resolved"],
    });
    expect(result.transitionedPriorClaims[0].lifecycle).toMatchObject({
      state: "resolved",
      priorClaimId: current.id,
      resolutionReason: "sufficient_relationship_evidence_available",
    });
  });

  it.each([
    ["complete", "resolved"],
    ["partial", "new"],
    ["unknown", "new"],
  ])("handles omitted prior under %s coverage as %s", (coverage, state) => {
    const prior = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const result = evaluatePIClaimSetLifecycle([], [prior], {
      ...completeOptions,
      evaluationCoverage: coverage,
      evaluationDate: "2026-07-27",
    });
    expect(result.transitionedPriorClaims[0].lifecycle.state).toBe(state);
    if (coverage === "complete") {
      expect(result.transitionedPriorClaims[0].lifecycle.resolutionReason)
        .toBe("absent_after_complete_evaluation");
    }
  });
});

describe("PIClaimLifecycleService background, retirement, and context", () => {
  it("backgrounds only after configurable complete unchanged evaluations", () => {
    const first = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const second = evaluatePIClaimLifecycle(claim(), first, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
      backgroundThreshold: 2,
    });
    const partial = evaluatePIClaimLifecycle(claim(), second, {
      evaluationDate: "2026-08-03",
      evaluationCoverage: "partial",
      backgroundThreshold: 2,
    });
    const third = evaluatePIClaimLifecycle(claim(), partial, {
      ...completeOptions,
      evaluationDate: "2026-08-10",
      backgroundThreshold: 2,
    });
    expect(second.lifecycle.state).toBe("unchanged");
    expect(partial.lifecycle.consecutiveUnchangedCount).toBe(1);
    expect(third.lifecycle.state).toBe("background");
  });

  it("lets background strengthen and return active", () => {
    const first = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const background = evaluatePIClaimLifecycle(claim(), first, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
      backgroundThreshold: 1,
    });
    const strengthened = evaluatePIClaimLifecycle(
      claim({ confidence: "high" }),
      background,
      {
        ...completeOptions,
        evaluationDate: "2026-08-03",
        backgroundThreshold: 1,
      }
    );
    expect(background.lifecycle.state).toBe("background");
    expect(strengthened.lifecycle.state).toBe("strengthened");
    expect(strengthened.lifecycle.consecutiveUnchangedCount).toBe(0);
  });

  it("retires resolved claims after a configurable complete-absence threshold", () => {
    const initial = evaluatePIClaimLifecycle(claim(), null, completeOptions);
    const resolved = evaluatePIClaimSetLifecycle([], [initial], {
      ...completeOptions,
      evaluationDate: "2026-07-27",
      retirementThreshold: 2,
    }).transitionedPriorClaims[0];
    const retired = evaluatePIClaimSetLifecycle([], [resolved], {
      ...completeOptions,
      evaluationDate: "2026-08-03",
      retirementThreshold: 2,
    }).transitionedPriorClaims[0];
    expect(resolved.lifecycle.state).toBe("resolved");
    expect(retired.lifecycle).toMatchObject({
      state: "retired",
      retirementReason: "resolved_claim_retained_beyond_threshold",
      eligibility: "ineligible",
    });
    expect(retired.id).toBe(initial.id);
  });

  it("records Goal context change without changing direction or support state", () => {
    const priorBase = claim({
      goalContext: {
        training: {
          activeGoalId: "goal_a",
          goalPhase: "phase_1",
          observationRole: "progress",
        },
      },
    });
    const current = claim({
      goalContext: {
        training: {
          activeGoalId: "goal_b",
          goalPhase: "phase_2",
          observationRole: "context",
        },
      },
    });
    const prior = evaluatePIClaimLifecycle(priorBase, null, completeOptions);
    const result = evaluatePIClaimLifecycle(current, prior, {
      ...completeOptions,
      evaluationDate: "2026-07-27",
    });
    expect(result.id).toBe(prior.id);
    expect(result.lifecycle.state).toBe("unchanged");
    expect(result.lifecycle.changeReasons).toContain("goal_context_changed");
    expect(result.explanationData.weightDirection).toBe("stable");
    expect(result).not.toHaveProperty("goalSuccess");
    expect(result).not.toHaveProperty("goalFailure");
  });
});

describe("PIClaimLifecycleService claim-set safety", () => {
  it("sorts deterministically and distinguishes current from transitioned prior", () => {
    const current = [
      claim({ kind: "expenditure_weight_stability" }),
      claim({ kind: "intake_weight_stability" }),
    ];
    const first = evaluatePIClaimSetLifecycle(current, [], completeOptions);
    const second = evaluatePIClaimSetLifecycle(
      [...current].reverse(),
      [],
      completeOptions
    );
    expect(first).toEqual(second);
    expect(first.currentClaims.map((item) => item.id)).toEqual(
      first.currentClaims.map((item) => item.id).sort()
    );
    expect(first.transitionedPriorClaims).toEqual([]);
  });

  it("rejects duplicate and invalid claim sets", () => {
    const value = claim();
    expect(() =>
      evaluatePIClaimSetLifecycle([value, value], [], completeOptions)
    ).toThrow(/Duplicate currentClaims/);
    expect(() =>
      evaluatePIClaimSetLifecycle([], [value, value], completeOptions)
    ).toThrow(/Duplicate priorClaims/);
    expect(() =>
      evaluatePIClaimSetLifecycle([{ id: "bad" }], [], completeOptions)
    ).toThrow();
  });

  it("exposes material-change diagnostics without prose-based identity", () => {
    const previous = claim({ confidence: "moderate" });
    const current = claim({ confidence: "high" });
    expect(detectPIClaimMaterialChange(current, previous)).toEqual({
      material: true,
      state: "strengthened",
      reasons: ["confidence_increased"],
    });
  });

  it("contains no narrative, coaching, ranking, persistence, or causal output", () => {
    const result = evaluatePIClaimSetLifecycle([claim()], [], completeOptions);
    expect(result).not.toHaveProperty("ranking");
    expect(result).not.toHaveProperty("persistence");
    expect(result.currentClaims[0]).not.toHaveProperty("narrative");
    expect(result.currentClaims[0]).not.toHaveProperty("recommendation");
    expect(JSON.stringify(result)).not.toMatch(
      /muscle gain|fat gain|caused by|recommend|coach|success|failure/i
    );
  });
});
