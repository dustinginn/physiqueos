import { describe, expect, it } from "vitest";
import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import {
  evaluatePIClaimMateriality,
  rankPIClaims,
  scorePIClaimForPriority,
  selectPIClaimsForNarrative,
} from "./PIClaimRankingService";

function claim({
  confidence = "high",
  coverage = "complete",
  goalContext = null,
  horizon = "rolling_7_days",
  kind = "intake_weight_stability",
  lastMaterialChangeDate = "2026-07-20",
  lifecycle = "new",
  limitations = [],
  overlap = "complete",
  trainingSubject = null,
  weightDirection = kind.includes("stability") ? "stable" : "rising",
} = {}) {
  const training = kind.includes("training");
  const value = createPICrossDomainClaim({
    kind,
    semanticScope: `${horizon}.${family(kind)}`,
    participatingObservationIds: [
      training ? "training_observation" : "energy_observation",
      "weight_observation",
    ],
    participatingDomains: training
      ? ["training", "weight"]
      : ["energy", "weight"],
    evidenceWindow: {
      startDate: "2026-07-14",
      endDate: "2026-07-20",
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
      relationship: family(kind),
      weightDirection,
      energyDirection: training ? null : "rising",
      trainingDirection:
        kind.includes("regression")
          ? "regressing"
          : training
            ? "improving"
            : null,
      trainingSubject,
      coverage: { state: coverage },
      evidenceOverlap: overlap,
      goalContext,
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
  return {
    ...value,
    lifecycle: {
      state: lifecycle,
      firstObservedDate: "2026-07-14",
      lastObservedDate: "2026-07-20",
      lastMaterialChangeDate,
      consecutiveObservationCount: 1,
      consecutiveUnchangedCount: 0,
      totalObservationCount: 1,
      missedEvaluationCount: 0,
      priorClaimId: null,
      priorConfidence: null,
      currentConfidence: confidence,
      changeReasons: [],
      resolutionReason: null,
      retirementReason: null,
      eligibility: lifecycle === "retired" ? "ineligible" : "eligible",
      provenance: {},
      limitations: [],
    },
  };
}

function family(kind) {
  if (kind.startsWith("intake")) return "intake";
  if (kind.startsWith("expenditure")) return "expenditure";
  if (kind.startsWith("energy_balance")) return "energy_balance";
  if (kind.includes("volume")) return "volume";
  if (kind.includes("regression")) return "regression";
  if (kind.includes("progress")) return "progress";
  return "insufficient";
}

function goalContext({
  activeGoalId = "goal_build",
  primary = false,
  guardrail = false,
  role = "context",
  semanticGoalType = "build_lean_mass",
} = {}) {
  return {
    training: {
      activeGoalId,
      semanticGoalType,
      observationRole: role,
      primaryOutcomeRelevance: primary,
      guardrailRelevance: guardrail,
    },
  };
}

const context = {
  evaluationDate: "2026-07-24",
  cadence: "weekly",
};

describe("PIClaimRankingService materiality", () => {
  it("keeps unsupported materiality conservative", () => {
    const result = evaluatePIClaimMateriality(
      claim({ confidence: "unevaluated", lifecycle: "unevaluated" })
    );
    expect(["unevaluated", "low"]).toContain(result.level);
    expect(result.limitations).toContain("confidence_unevaluated");
  });

  it("ranks change above stable and contradiction above ordinary change", () => {
    const stable = evaluatePIClaimMateriality(
      claim({ kind: "intake_weight_stability", lifecycle: "unchanged" })
    );
    const changing = evaluatePIClaimMateriality(
      claim({ kind: "intake_weight_change", lifecycle: "new" })
    );
    const contradicted = evaluatePIClaimMateriality(
      claim({ kind: "intake_weight_change", lifecycle: "contradicted" })
    );
    expect(changing.score).toBeGreaterThan(stable.score);
    expect(contradicted.score).toBeGreaterThan(changing.score);
    expect(contradicted.level).toMatch(/high|very_high/);
  });

  it("makes strengthened more material than unchanged without changing the claim", () => {
    const source = claim({ lifecycle: "strengthened" });
    const before = structuredClone(source);
    const strengthened = evaluatePIClaimMateriality(source);
    const unchanged = evaluatePIClaimMateriality(
      claim({ lifecycle: "unchanged" })
    );
    expect(strengthened.score).toBeGreaterThan(unchanged.score);
    expect(source).toEqual(before);
  });

  it("keeps weakened guardrail and missing-evidence insufficiency material", () => {
    const guardrail = evaluatePIClaimMateriality(
      claim({
        lifecycle: "weakened",
        goalContext: goalContext({ guardrail: true, role: "risk" }),
      })
    );
    const insufficiency = evaluatePIClaimMateriality(
      claim({
        kind: "insufficient_energy_to_explain_weight",
        coverage: "missing",
      })
    );
    expect(guardrail.score).toBeGreaterThan(insufficiency.score);
    expect(insufficiency.score).toBeGreaterThan(0);
  });

  it("raises broader Training scope over an isolated exercise", () => {
    const exercise = evaluatePIClaimMateriality(
      claim({
        kind: "training_progress_weight_stability",
        trainingSubject: { type: "exercise", id: "row" },
      })
    );
    const overall = evaluatePIClaimMateriality(
      claim({
        kind: "training_progress_weight_stability",
        trainingSubject: { type: "training_scope", id: "resistance" },
      })
    );
    expect(overall.score).toBeGreaterThan(exercise.score);
    expect(exercise.limitations).toContain("isolated_exercise_scope");
  });

  it("uses Goal relevance without assigning favorable or unfavorable meaning", () => {
    const relevant = evaluatePIClaimMateriality(
      claim({ goalContext: goalContext({ primary: true }) })
    );
    const unknown = evaluatePIClaimMateriality(claim());
    expect(relevant.score).toBeGreaterThan(unknown.score);
    expect(relevant).not.toHaveProperty("favorable");
    expect(relevant).not.toHaveProperty("unfavorable");
  });
});

describe("PIClaimRankingService lifecycle, confidence, and evidence scoring", () => {
  it("orders lifecycle states conservatively", () => {
    const score = (state) =>
      scorePIClaimForPriority(claim({ lifecycle: state }), context)
        .priorityScore;
    expect(score("contradicted")).toBeGreaterThan(score("unchanged"));
    expect(score("strengthened")).toBeGreaterThan(score("unchanged"));
    expect(score("weakened")).toBeGreaterThan(score("unchanged"));
    expect(score("background")).toBeLessThan(score("unchanged"));
    expect(
      scorePIClaimForPriority(claim({ lifecycle: "retired" }), context)
        .eligible
    ).toBe(false);
    expect(score("resolved")).toBeLessThan(score("strengthened"));
    expect(score("new")).toBeGreaterThan(score("unevaluated"));
  });

  it("uses confidence without mutating it", () => {
    const highClaim = claim({ confidence: "high" });
    const before = structuredClone(highClaim);
    const high = scorePIClaimForPriority(highClaim, context);
    const low = scorePIClaimForPriority(
      claim({ confidence: "low" }),
      context
    );
    expect(high.priorityScore).toBeGreaterThan(low.priorityScore);
    expect(high.scoreComponents.confidence).toBeGreaterThan(
      low.scoreComponents.confidence
    );
    expect(highClaim).toEqual(before);
  });

  it("does not let low-confidence contradiction automatically beat strong supported change", () => {
    const contradiction = scorePIClaimForPriority(
      claim({ confidence: "low", lifecycle: "contradicted" }),
      context
    );
    const strong = scorePIClaimForPriority(
      claim({
        confidence: "very_high",
        lifecycle: "strengthened",
        goalContext: goalContext({ primary: true }),
      }),
      context
    );
    expect(strong.priorityScore).toBeGreaterThan(contradiction.priorityScore);
  });

  it("orders complete, partial, and missing evidence", () => {
    const score = (coverage) =>
      scorePIClaimForPriority(claim({ coverage }), context).priorityScore;
    expect(score("complete")).toBeGreaterThan(score("partial"));
    expect(score("partial")).toBeGreaterThan(score("missing"));
  });

  it("penalizes inherited limitations and isolated Training scope", () => {
    const clean = scorePIClaimForPriority(
      claim({
        kind: "training_progress_weight_stability",
        trainingSubject: { type: "training_scope", id: "resistance" },
      }),
      context
    );
    const limited = scorePIClaimForPriority(
      claim({
        kind: "training_progress_weight_stability",
        limitations: ["limited_comparability"],
        trainingSubject: { type: "exercise", id: "row" },
      }),
      context
    );
    expect(clean.priorityScore).toBeGreaterThan(limited.priorityScore);
    expect(limited.penaltyReasons).toContain("inherited_limitations");
  });
});

describe("PIClaimRankingService Goal context and recency", () => {
  it("prioritizes Build Lean Mass Training context over contextual Weight × Energy", () => {
    const training = scorePIClaimForPriority(
      claim({
        kind: "training_progress_weight_stability",
        goalContext: goalContext({ primary: true }),
        trainingSubject: { type: "training_scope", id: "resistance" },
      }),
      context
    );
    const energy = scorePIClaimForPriority(
      claim({ goalContext: goalContext({ role: "context" }) }),
      context
    );
    expect(training.scoreComponents.goalRelevance).toBeGreaterThan(
      energy.scoreComponents.goalRelevance
    );
  });

  it("does not penalize Weight increase as inherently negative", () => {
    const rising = scorePIClaimForPriority(
      claim({ kind: "intake_weight_change", weightDirection: "rising" }),
      context
    );
    const falling = scorePIClaimForPriority(
      claim({ kind: "intake_weight_change", weightDirection: "falling" }),
      context
    );
    expect(rising.priorityScore).toBe(falling.priorityScore);
  });

  it("supports configured fat-loss relevance without changing identity or direction", () => {
    const source = claim({
      kind: "intake_weight_change",
      goalContext: goalContext({
        activeGoalId: "goal_cut",
        semanticGoalType: "fat_loss",
      }),
    });
    const ranked = scorePIClaimForPriority(
      source,
      { ...context, domainRelevance: { "energy+weight": "primary" } }
    );
    expect(ranked.scoreComponents.goalRelevance).toBe(14);
    expect(ranked.claim.id).toBe(source.id);
    expect(ranked.claim.explanationData.weightDirection).toBe("rising");
    expect(ranked).not.toHaveProperty("goalSuccess");
  });

  it("boosts recent material change but not old unchanged or window advancement", () => {
    const recent = scorePIClaimForPriority(
      claim({ lifecycle: "strengthened", lastMaterialChangeDate: "2026-07-23" }),
      context
    );
    const old = scorePIClaimForPriority(
      claim({ lifecycle: "unchanged", lastMaterialChangeDate: "2026-01-01" }),
      context
    );
    const advanced = claim({
      lifecycle: "unchanged",
      lastMaterialChangeDate: "2026-01-01",
    });
    advanced.evidenceWindow = {
      startDate: "2026-07-18",
      endDate: "2026-07-24",
      comparisonStartDate: null,
      comparisonEndDate: null,
    };
    const advancedScore = scorePIClaimForPriority(advanced, context);
    expect(recent.scoreComponents.recency).toBeGreaterThan(0);
    expect(old.scoreComponents.recency).toBe(0);
    expect(advancedScore.scoreComponents.recency).toBe(0);
  });

  it("handles missing dates and local-date boundaries deterministically without a runtime clock", () => {
    const missing = claim();
    missing.lifecycle.lastMaterialChangeDate = null;
    const first = scorePIClaimForPriority(missing, {
      evaluationDate: "2026-07-24",
      cadence: "daily",
    });
    const second = scorePIClaimForPriority(missing, {
      evaluationDate: "2026-07-24",
      cadence: "daily",
    });
    expect(first).toEqual(second);
    expect(first.scoreComponents.recency).toBe(0);
  });
});

describe("PIClaimRankingService ranking and selection", () => {
  it("is deterministic across input order with stable tie-breaking", () => {
    const values = [
      claim({ kind: "intake_weight_stability" }),
      claim({ kind: "expenditure_weight_stability" }),
      claim({
        kind: "training_progress_weight_stability",
        trainingSubject: { type: "training_scope", id: "resistance" },
      }),
    ];
    const forward = rankPIClaims(values, context);
    const reverse = rankPIClaims([...values].reverse(), context);
    expect(reverse).toEqual(forward);
    expect(forward.rankedClaims.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("selects one primary and at most two semantically distinct supporting claims", () => {
    const result = selectPIClaimsForNarrative(
      [
        claim({
          kind: "training_progress_weight_stability",
          lifecycle: "strengthened",
          goalContext: goalContext({ primary: true }),
          trainingSubject: { type: "training_scope", id: "resistance" },
        }),
        claim({ kind: "intake_weight_stability" }),
        claim({ kind: "expenditure_weight_stability" }),
        claim({ kind: "energy_balance_weight_stability" }),
      ],
      context
    );
    expect(result.primary).toHaveLength(1);
    expect(result.supporting.length).toBeLessThanOrEqual(2);
    const families = [...result.primary, ...result.supporting].map(
      (item) => item.tieBreakData.semanticFamily
    );
    expect(new Set(families).size).toBe(families.length);
  });

  it("returns no primary when every claim is weak", () => {
    const result = selectPIClaimsForNarrative(
      [
        claim({
          confidence: "low",
          lifecycle: "unchanged",
          coverage: "missing",
          limitations: ["weak_support"],
        }),
      ],
      context
    );
    expect(result.primary).toEqual([]);
  });

  it("separates background and suppressed claims", () => {
    const result = selectPIClaimsForNarrative(
      [
        claim({ lifecycle: "background" }),
        claim({ lifecycle: "retired", kind: "expenditure_weight_stability" }),
      ],
      context
    );
    expect(result.background).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0].selectionState).toBe("ineligible");
  });

  it("honors configurable limits, domain filters, and insufficiency eligibility", () => {
    const result = selectPIClaimsForNarrative(
      [
        claim({
          kind: "training_progress_weight_stability",
          trainingSubject: { type: "training_scope", id: "resistance" },
        }),
        claim({ kind: "intake_weight_stability" }),
        claim({ kind: "insufficient_energy_to_explain_weight" }),
      ],
      context,
      {
        maxPrimaryClaims: 0,
        maxSupportingClaims: 1,
        allowedDomainPairs: ["training+weight"],
        includeInsufficiency: false,
      }
    );
    expect(result.primary).toEqual([]);
    expect(result.supporting).toHaveLength(1);
    expect(result.supporting[0].claim.participatingDomains).toContain("training");
    expect(result.suppressed.length).toBeGreaterThanOrEqual(2);
  });

  it("suppresses weaker duplicate semantic families with diagnostics", () => {
    const strong = claim({
      kind: "intake_weight_change",
      confidence: "high",
      lifecycle: "strengthened",
    });
    const weak = claim({
      kind: "intake_weight_stability",
      confidence: "low",
      lifecycle: "unchanged",
    });
    const result = rankPIClaims([weak, strong], context);
    expect(result.rankedClaims.filter((item) =>
      item.selectionState === "suppressed"
    )).toHaveLength(1);
    expect(result.diagnostics.some((item) =>
      item.code === "semantic_family_duplicate"
    )).toBe(true);
  });
});

describe("PIClaimRankingService cross-domain combinations and diagnostics", () => {
  it("lets new Training progress outrank unchanged contextual Energy under Build Lean Mass", () => {
    const result = rankPIClaims(
      [
        claim({
          kind: "training_progress_weight_stability",
          lifecycle: "new",
          goalContext: goalContext({ primary: true }),
          trainingSubject: { type: "training_scope", id: "resistance" },
        }),
        claim({
          lifecycle: "unchanged",
          goalContext: goalContext({ role: "context" }),
        }),
      ],
      context
    );
    expect(result.rankedClaims[0].claim.kind).toBe(
      "training_progress_weight_stability"
    );
  });

  it("lets supported contradiction outrank routine progress", () => {
    const result = rankPIClaims(
      [
        claim({
          kind: "intake_weight_change",
          lifecycle: "contradicted",
          confidence: "high",
        }),
        claim({
          kind: "training_progress_weight_stability",
          lifecycle: "unchanged",
          trainingSubject: { type: "training_scope", id: "resistance" },
        }),
      ],
      context
    );
    expect(result.rankedClaims[0].claim.lifecycle.state).toBe("contradicted");
  });

  it("keeps low-confidence and resolved insufficiency behind stronger support", () => {
    const result = rankPIClaims(
      [
        claim({
          kind: "training_progress_weight_stability",
          lifecycle: "strengthened",
          goalContext: goalContext({ primary: true }),
          trainingSubject: { type: "training_scope", id: "resistance" },
        }),
        claim({
          kind: "insufficient_energy_to_explain_weight",
          confidence: "low",
          lifecycle: "new",
          coverage: "missing",
        }),
        claim({
          kind: "insufficient_weight_to_support_energy_claim",
          confidence: "low",
          lifecycle: "resolved",
          coverage: "missing",
        }),
      ],
      context
    );
    expect(result.rankedClaims[0].claim.kind).toBe(
      "training_progress_weight_stability"
    );
  });

  it("diagnoses duplicate, invalid, unsupported, and conflicting inputs deterministically", () => {
    const duplicate = claim();
    const conflict = claim({
      kind: "intake_weight_change",
      lifecycle: "contradicted",
    });
    const inputs = [duplicate, duplicate, { id: "invalid" }, conflict];
    const first = rankPIClaims(inputs, context);
    const second = rankPIClaims([...inputs].reverse(), context);
    expect(first.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["duplicate_claim_id", "invalid_claim"])
    );
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.rankedClaims.map((item) => item.claimId)).toEqual(
      second.rankedClaims.map((item) => item.claimId)
    );
  });

  it("contains no narrative, recommendation, UI, persistence, or physiological conclusion", () => {
    const result = selectPIClaimsForNarrative([claim()], context);
    expect(result).not.toHaveProperty("narrative");
    expect(result).not.toHaveProperty("ui");
    expect(result).not.toHaveProperty("persistence");
    expect(result).not.toHaveProperty("bodyCompositionConclusion");
    expect(result).not.toHaveProperty("causalConclusion");
    expect(result).not.toHaveProperty("route");
    expect(JSON.stringify(result)).not.toMatch(
      /muscle gain|fat gain|maintenance calories|caused by|recommend|coach|goal success|goal failure/i
    );
  });
});
