import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import {
  createPICrossDomainClaims,
  createTrainingWeightClaims,
  isPICrossDomainClaim,
} from "./PICrossDomainClaimService";

const currentWindow = { startDate: "2026-07-14", endDate: "2026-07-20" };
const comparisonWindow = {
  comparisonStartDate: "2026-07-07",
  comparisonEndDate: "2026-07-13",
};

function training({
  confidence = "high",
  evidenceCount = 4,
  goalContext = null,
  horizon = null,
  id = "performance|overall|resistance",
  pr = false,
  scope = "overall",
  status = "improving",
  subjectId = "resistance",
  volume = null,
  window = currentWindow,
} = {}) {
  const subjectType = {
    overall: "training_scope",
    category: "training_category",
    exercise: "exercise",
    generic: "training_summary",
  }[scope];
  return createPIObservation({
    id,
    domain: "training",
    kind: "training_performance",
    subject: { type: subjectType, id: subjectId, label: subjectId },
    status,
    direction: {
      improving: "positive",
      regressing: "negative",
      stable: "neutral",
      plateauing: "neutral",
      insufficient_data: "not_applicable",
    }[status],
    evidenceWindow: window,
    supportingEvidenceIds: Array.from(
      { length: evidenceCount },
      (_, index) => `session_${subjectId}_${index + 1}`
    ),
    confidence: {
      level: confidence,
      method: "training_session_count",
    },
    goalContext,
    explanationData: {
      ...(horizon ? { calculationHorizon: horizon } : {}),
      ...(scope === "exercise"
        ? {
            pr_detection: { detected: pr },
            volume_trend: {
              direction: volume,
              percent_change:
                volume === "up" ? 10 : volume === "down" ? -10 : 0,
            },
          }
        : {}),
    },
    provenance: {
      producer: "training_performance_intelligence_service",
      producerVersion: "training_performance_v1",
      calculationMethod: "legacy_training_performance_observation",
      sourceEvidenceIds: Array.from(
        { length: evidenceCount },
        (_, index) => `session_${subjectId}_${index + 1}`
      ),
    },
  });
}

function weight({
  confidence = "high",
  direction = "stable",
  goalContext = null,
  horizon = "rolling_7_days",
  id = null,
  kind = "weight_average_change",
  sampleCount = 6,
  window = currentWindow,
} = {}) {
  return createPIObservation({
    ...(id ? { id } : {}),
    domain: "weight",
    kind,
    semanticScope: `${horizon}.${kind === "weight_average_change" ? "average_comparison" : "short_window"}`,
    subject: { type: "whole_body_metric", id: "body_weight" },
    status: "observed",
    direction,
    evidenceWindow: { ...window, ...comparisonWindow },
    supportingEvidenceIds: Array.from(
      { length: sampleCount },
      (_, index) => `weight_${index + 1}`
    ),
    confidence: {
      level: confidence,
      method: "weight_evidence_sufficiency",
    },
    goalContext,
    explanationData: {
      currentSampleCount: sampleCount / 2,
      comparisonSampleCount: sampleCount / 2,
      calculationHorizon: horizon,
    },
    provenance: {
      producer: "weight_pi_observation_service",
      producerVersion: "weight_pi_v1",
      calculationMethod: "comparison_window_average_change",
      sourceEvidenceIds: Array.from(
        { length: sampleCount },
        (_, index) => `weight_${index + 1}`
      ),
    },
  });
}

function claim(trainingObservation, weightObservation = weight()) {
  return createTrainingWeightClaims(
    [trainingObservation],
    [weightObservation]
  )[0];
}

describe("Training × Weight supported relationships", () => {
  it.each([
    [training({ scope: "exercise", pr: true, volume: "up" }), "stable", "training_progress_weight_stability"],
    [training({ scope: "exercise", pr: true, volume: "up" }), "rising", "training_progress_weight_change"],
    [training({ scope: "exercise", pr: true, volume: "up" }), "falling", "training_progress_weight_change"],
    [training({ status: "improving" }), "stable", "training_progress_weight_stability"],
    [training({ status: "regressing" }), "stable", "training_regression_weight_stability"],
    [training({ status: "regressing" }), "rising", "training_regression_weight_change"],
    [training({ scope: "exercise", status: "stable", volume: "up" }), "stable", "training_volume_weight_stability"],
    [training({ scope: "exercise", status: "stable", volume: "down" }), "falling", "training_volume_weight_change"],
    [training({ scope: "exercise", status: "stable", volume: "flat" }), "rising", "training_volume_weight_change"],
    [training({ status: "stable" }), "rising", "weight_change_training_stability"],
  ])("creates a conservative %s relationship", (trainingObservation, weightDirection, kind) => {
    const result = claim(trainingObservation, weight({ direction: weightDirection }));
    expect(result.kind).toBe(kind);
    expect(result.explanationData).toMatchObject({
      trainingStatus: trainingObservation.status,
      weightDirection,
    });
    expect(isPICrossDomainClaim(result)).toBe(true);
  });

  it("does not synthesize unsupported generic Training summaries", () => {
    const claims = createTrainingWeightClaims(
      [training({ scope: "generic" })],
      [weight()]
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      kind: "insufficient_training_to_support_weight_claim",
      limitations: expect.arrayContaining(["training_observation_ineligible"]),
    });
  });

  it("rejects invalid observations", () => {
    expect(() => createTrainingWeightClaims([{ domain: "training" }], [])).toThrow();
  });
});

describe("Training × Weight deterministic selection", () => {
  it("prefers explicit progressive overload over generic improvement", () => {
    const explicit = training({
      id: "performance|exercise|row",
      scope: "exercise",
      subjectId: "row",
      pr: true,
      volume: "up",
    });
    const overall = training();
    const result = createTrainingWeightClaims([overall, explicit], [weight()])
      .find((item) => item.kind === "training_progress_weight_stability");
    expect(result.explanationData.trainingObservationId).toBe(explicit.id);
    expect(result.explanationData.suppressedEligibleTrainingObservationIds).toContain(
      overall.id
    );
  });

  it("prefers broader scope, then confidence, evidence support, and stable ID", () => {
    const category = training({
      id: "performance|category|back",
      scope: "category",
      subjectId: "back",
      confidence: "low",
    });
    const exercise = training({
      id: "performance|exercise|row",
      scope: "exercise",
      subjectId: "row",
      confidence: "high",
      volume: null,
    });
    expect(
      createTrainingWeightClaims([exercise, category], [weight()])[0]
        .explanationData.trainingObservationId
    ).toBe(category.id);

    const low = training({
      id: "performance|category|arms",
      scope: "category",
      subjectId: "arms",
      confidence: "low",
      evidenceCount: 10,
    });
    const highFew = training({
      id: "performance|category|chest",
      scope: "category",
      subjectId: "chest",
      confidence: "high",
      evidenceCount: 2,
    });
    expect(
      createTrainingWeightClaims([low, highFew], [weight()])[0]
        .explanationData.trainingObservationId
    ).toBe(highFew.id);

    const fewer = training({
      id: "performance|category|quads",
      scope: "category",
      subjectId: "quads",
      evidenceCount: 2,
    });
    const more = training({
      id: "performance|category|back",
      scope: "category",
      subjectId: "back",
      evidenceCount: 5,
    });
    expect(
      createTrainingWeightClaims([fewer, more], [weight()])[0]
        .explanationData.trainingObservationId
    ).toBe(more.id);

    const alpha = training({
      id: "performance|category|alpha",
      scope: "category",
      subjectId: "alpha",
    });
    const beta = training({
      id: "performance|category|beta",
      scope: "category",
      subjectId: "beta",
    });
    expect(
      createTrainingWeightClaims([beta, alpha], [weight()])[0]
        .explanationData.trainingObservationId
    ).toBe(alpha.id);
  });

  it("suppresses exercise floods and chooses average-comparison Weight", () => {
    const exercises = ["row", "curl", "press"].map((subjectId) =>
      training({
        id: `performance|exercise|${subjectId}`,
        scope: "exercise",
        subjectId,
        pr: true,
        volume: "up",
      })
    );
    const average = weight();
    const short = weight({ kind: "weight_short_window_change" });
    const claims = createTrainingWeightClaims(exercises, [short, average]);
    const progress = claims.filter((item) =>
      item.kind.startsWith("training_progress")
    );
    expect(progress).toHaveLength(1);
    expect(progress[0].explanationData.weightObservationId).toBe(average.id);
    expect(
      progress[0].explanationData.suppressedEligibleTrainingObservationIds
    ).toHaveLength(2);
  });

  it("marks conflicting progress and regression instead of silently merging", () => {
    const improving = training({
      id: "performance|category|back",
      scope: "category",
      subjectId: "back",
    });
    const regressing = training({
      id: "performance|category|legs",
      scope: "category",
      subjectId: "legs",
      status: "regressing",
    });
    const claims = createTrainingWeightClaims(
      [regressing, improving],
      [weight()]
    );
    expect(claims).toHaveLength(2);
    claims.forEach((item) =>
      expect(item.limitations).toContain("conflicting_training_directions")
    );
  });

  it("deduplicates repeats, rejects conflicts, and sorts deterministically", () => {
    const input = [training(), weight()];
    const forward = createPICrossDomainClaims(input);
    expect(createPICrossDomainClaims([...input].reverse())).toEqual(forward);
    expect(createPICrossDomainClaims([...input, ...input])).toEqual(forward);
    expect(forward.map((item) => item.id)).toEqual(
      forward.map((item) => item.id).sort()
    );
    expect(() =>
      createPICrossDomainClaims([
        training(),
        { ...training(), status: "regressing", direction: "negative" },
        weight(),
      ])
    ).toThrow(/Conflicting duplicate/);
  });
});

describe("Training × Weight eligibility and confidence", () => {
  it("matches compatible horizons and rejects incompatible horizons", () => {
    const compatible = claim(
      training({ horizon: "rolling_7_days" }),
      weight({ horizon: "rolling_7_days" })
    );
    expect(compatible.kind).toBe("training_progress_weight_stability");

    const incompatible = createTrainingWeightClaims(
      [training({ horizon: "rolling_30_days" })],
      [weight({ horizon: "rolling_7_days" })]
    );
    expect(incompatible.every((item) =>
      item.limitations.includes("semantic_horizon_mismatch")
    )).toBe(true);
  });

  it("requires overlap, limits partial overlap, and rejects one-day exercise overlap", () => {
    const nonOverlapping = createTrainingWeightClaims(
      [training({ window: { startDate: "2026-06-01", endDate: "2026-06-07" } })],
      [weight()]
    );
    expect(nonOverlapping.every((item) =>
      item.limitations.includes("evidence_windows_do_not_overlap")
    )).toBe(true);

    const partial = claim(
      training({ window: { startDate: "2026-07-10", endDate: "2026-07-17" } })
    );
    expect(partial.explanationData.evidenceOverlap).toBe("partial");
    expect(partial.limitations).toContain("evidence_window_overlap_partial");

    const event = createTrainingWeightClaims(
      [
        training({
          scope: "exercise",
          subjectId: "row",
          id: "performance|exercise|row",
          pr: true,
          volume: "up",
          window: { startDate: "2026-07-20", endDate: "2026-07-20" },
        }),
      ],
      [weight()]
    );
    expect(event.some((item) =>
      item.limitations.includes("training_scope_too_narrow_for_overlap")
    )).toBe(true);
  });

  it("accepts category/report scope and conservatively limits exercise-only scope", () => {
    expect(claim(training({ scope: "category", subjectId: "back" })).limitations)
      .not.toContain("training_scope_isolated_exercise");
    expect(claim(training()).limitations)
      .not.toContain("training_scope_isolated_exercise");
    const exerciseClaim = claim(
      training({
        id: "performance|exercise|row",
        scope: "exercise",
        subjectId: "row",
        pr: true,
        volume: "up",
      })
    );
    expect(exerciseClaim.limitations).toContain(
      "training_scope_isolated_exercise"
    );
    expect(exerciseClaim.confidence.level).toBe("moderate");
  });

  it("emits explicit insufficiency for missing or insufficient sides", () => {
    expect(createTrainingWeightClaims([], [weight()])[0].kind).toBe(
      "insufficient_training_to_support_weight_claim"
    );
    expect(createTrainingWeightClaims([training()], [])[0].kind).toBe(
      "insufficient_weight_to_support_training_claim"
    );
    const insufficientTraining = createTrainingWeightClaims(
      [training({ status: "insufficient_data" })],
      [weight()]
    )[0];
    expect(insufficientTraining.limitations).toContain(
      "training_observation_insufficient"
    );
    const insufficientWeight = weight();
    insufficientWeight.status = "insufficient_data";
    insufficientWeight.direction = "not_applicable";
    const result = createTrainingWeightClaims([training()], [insufficientWeight]);
    expect(result[0].limitations).toContain("weight_observation_insufficient");
  });

  it("uses weaker confidence and reduces it for inherited, narrow, or partial limitations", () => {
    const weaker = claim(
      training({ confidence: "moderate" }),
      weight({ confidence: "very_high" })
    );
    expect(weaker.confidence.level).toBe("moderate");

    const inheritedTraining = training({ confidence: "high" });
    inheritedTraining.confidence.limitations = ["limited_comparability"];
    const inherited = claim(inheritedTraining, weight({ confidence: "high" }));
    expect(inherited.confidence.level).toBe("moderate");

    const levels = { unevaluated: 0, low: 1, moderate: 2, high: 3, very_high: 4 };
    [weaker, inherited].forEach((item) => {
      item.confidence.factors.forEach((factor) =>
        expect(levels[item.confidence.level]).toBeLessThanOrEqual(
          levels[factor.level]
        )
      );
    });
    expect(claim(training(), weight()).confidence.level).toBe("high");
    expect(claim(training(), weight())).toEqual(claim(training(), weight()));
  });
});

describe("Training × Weight identity and Goal context", () => {
  it("keeps identity stable across dates, Weight directions, confidence, evidence, and Goal IDs", () => {
    const buildContext = goalContext("goal_build", "build_lean_mass");
    const cutContext = goalContext("goal_cut", "fat_loss");
    const first = claim(
      training({ goalContext: buildContext }),
      weight({ direction: "rising", goalContext: buildContext })
    );
    const advanced = claim(
      training({
        confidence: "moderate",
        evidenceCount: 8,
        goalContext: cutContext,
        window: { startDate: "2026-07-21", endDate: "2026-07-27" },
      }),
      weight({
        confidence: "moderate",
        direction: "falling",
        goalContext: cutContext,
        sampleCount: 8,
        window: { startDate: "2026-07-21", endDate: "2026-07-27" },
      })
    );
    expect(first.id).toBe(advanced.id);
  });

  it("separates progress, regression, volume, and horizons", () => {
    const progress = claim(training());
    const regression = claim(training({ status: "regressing" }));
    const volume = claim(
      training({
        id: "performance|exercise|row",
        scope: "exercise",
        subjectId: "row",
        status: "stable",
        volume: "up",
      })
    );
    const monthly = claim(
      training({ horizon: "rolling_30_days" }),
      weight({ horizon: "rolling_30_days" })
    );
    expect(new Set([progress.id, regression.id, volume.id, monthly.id]).size).toBe(4);
  });

  it("preserves Build Lean Mass and fat-loss Goal context without changing measured meaning", () => {
    const buildTraining = goalContext("goal_build", "build_lean_mass", "progress");
    const buildWeight = goalContext("goal_build", "build_lean_mass", "guardrail");
    const build = claim(
      training({ goalContext: buildTraining }),
      weight({ direction: "rising", goalContext: buildWeight })
    );
    const cut = claim(
      training({ goalContext: goalContext("goal_cut", "fat_loss", "context") }),
      weight({
        direction: "rising",
        goalContext: goalContext("goal_cut", "fat_loss", "progress"),
      })
    );
    expect(build.explanationData.goalContext).toMatchObject({
      training: {
        activeGoalId: "goal_build",
        semanticGoalType: "build_lean_mass",
        observationRole: "progress",
      },
      weight: {
        activeGoalId: "goal_build",
        guardrailRelevance: true,
      },
    });
    expect(cut.explanationData.goalContext.training.semanticGoalType).toBe(
      "fat_loss"
    );
    expect(build.explanationData.trainingStatus).toBe("improving");
    expect(build.explanationData.weightDirection).toBe("rising");
    expect(build).not.toHaveProperty("goalSuccess");
    expect(build).not.toHaveProperty("goalFailure");
  });

  it("contains no physiological, causal, recommendation, lifecycle, or narrative conclusion", () => {
    const result = claim(
      training({
        id: "performance|exercise|row",
        scope: "exercise",
        subjectId: "row",
        pr: true,
        volume: "up",
      }),
      weight({ direction: "rising" })
    );
    expect(result).not.toHaveProperty("narrative");
    expect(result).not.toHaveProperty("recommendation");
    expect(result).not.toHaveProperty("lifecycle");
    expect(result).not.toHaveProperty("novelty");
    expect(result).not.toHaveProperty("bodyComposition");
    expect(result.explanationData).not.toHaveProperty("causalConclusion");
    expect(JSON.stringify(result)).not.toMatch(
      /muscle gain|lean.mass gain|fat gain|recomp|maintenance calories|metabolism|recovery is|caused by|recommend|coach/i
    );
  });
});

function goalContext(activeGoalId, semanticGoalType, observationRole = "context") {
  return {
    activeGoalId,
    semanticGoalType,
    goalPhase: "maintenance",
    phaseAgeBand: "early",
    observationRole,
    primaryOutcomeRelevance: observationRole === "progress",
    guardrailRelevance: observationRole === "guardrail",
  };
}
