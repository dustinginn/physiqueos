import { describe, expect, it } from "vitest";
import {
  PI_CALIBRATION_ENERGY_DEFAULTS,
  resolvePICalibrationEnergyState,
} from "./PICalibrationEnergyStateResolver";
import {
  createPIDomainConsumptionIdentity,
  createPILowerLevelTriggerCandidate,
  normalizePIContributorLineage,
  PILowerLevelTriggerType,
  resolvePICadenceConsumptionRole,
} from "./PILowerLevelConfidenceContracts";
import {
  detectPILowerLevelConfidenceSemanticChange,
  explainPILowerLevelSemanticChange,
} from "./PILowerLevelConfidenceSemanticChangeService";
import {
  resolvePITrainingGoalConfidenceState,
} from "./PITrainingGoalConfidenceStateResolver";
import {
  createPIGoalConfidenceAssessment,
} from "./PIGoalConfidenceAssessmentModel";
import {
  PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS,
} from "./PIGoalConfidenceScoringService";

const context = {
  goalId: "goal",
  phaseId: "phase",
  semanticGoalType: "build_lean_mass",
  semanticPhaseType: "establish_maintenance",
  operatingState: "calibration",
};
const cutoff = "2026-07-25T23:59:59.999Z";

function energyRow(date, balance, completeness = "complete") {
  return {
    date,
    nutritionDayId: `nutrition_${date}`,
    activityDayId: `activity_${date}`,
    energyBalance: balance,
    estimatedExpenditure: 2500,
    rmr: 1800,
    activeCalories: 700,
    pairedCompleteness: completeness,
  };
}
function energy(rows, extra = {}) {
  return resolvePICalibrationEnergyState({
    ...context,
    rollingWindowId: "rolling:2026-07-19:2026-07-25",
    dailyRecords: rows,
    eligibleDayCount: rows.length,
    evidenceCutoff: cutoff,
    ...extra,
  });
}
function category(name, status, sessions = 2) {
  return {
    id: `performance|category|${name}`,
    category: name,
    status,
    supporting_session_ids: Array.from(
      { length: sessions },
      (_, index) => `${name}_${index}`
    ),
    explanation_data: { exercise_count: 2 },
  };
}
function exercise(name, status, sessions = 2) {
  return {
    id: `performance|exercise|${name}`,
    status,
    supporting_session_ids: Array.from(
      { length: sessions },
      (_, index) => `${name}_${index}`
    ),
    explanation_data: { frequency: { total_sessions: sessions } },
  };
}
function training(categories, extra = {}) {
  return resolvePITrainingGoalConfidenceState({
    ...context,
    canonicalSessionId: "training_session",
    finalizedReportId: "analysis_training",
    performanceEventIds: ["event_b", "event_a"],
    evidenceCutoff: cutoff,
    analysisComplete: true,
    performanceEventGenerationComplete: true,
    performanceEventPersistenceComplete: true,
    pendingReconciliation: false,
    trainingReport: {
      categoryObservations: categories,
      exerciseObservations: categories.map((item, index) =>
        exercise(`exercise_${index}`, item.status)
      ),
    },
    ...extra,
  });
}

describe("PI lower-level confidence semantic foundation", () => {
  it("uses an explicit conservative Energy calibration contract", () => {
    expect(PI_CALIBRATION_ENERGY_DEFAULTS).toMatchObject({
      deficitBelowKcalPerDay: -150,
      surplusAboveKcalPerDay: 250,
      minimumReliablePairs: 4,
      minimumCompletePairs: 3,
    });
    const near = energy([
      energyRow("2026-07-19", -80),
      energyRow("2026-07-20", -20),
      energyRow("2026-07-21", 20),
      energyRow("2026-07-22", 40),
    ]);
    expect(near).toMatchObject({
      state: "near_maintenance",
      reliabilityStatus: "reliable",
      publicationEligible: true,
    });
  });

  it.each([
    [-300, "persistent_deficit"],
    [350, "large_surplus"],
  ])("maps reliable balance %s to %s", (balance, state) => {
    expect(energy([
      energyRow("2026-07-19", balance),
      energyRow("2026-07-20", balance),
      energyRow("2026-07-21", balance),
      energyRow("2026-07-22", balance),
    ]).state).toBe(state);
  });

  it("keeps unmatched, sparse, and partial Energy evidence non-authoritative", () => {
    expect(energy([{
      date: "2026-07-19",
      nutritionDayId: "nutrition",
      energyBalance: null,
    }])).toMatchObject({
      state: "insufficient_or_incomplete",
      reliabilityStatus: "insufficient",
    });
    expect(energy([energyRow("2026-07-19", 0)])).toMatchObject({
      state: "insufficient_or_incomplete",
      reliabilityStatus: "insufficient",
    });
    expect(energy([
      energyRow("2026-07-19", -300, "partial"),
      energyRow("2026-07-20", -300, "partial"),
      energyRow("2026-07-21", -300, "partial"),
      energyRow("2026-07-22", -300, "partial"),
    ])).toMatchObject({
      state: "insufficient_or_incomplete",
      reliabilityStatus: "directional",
    });
  });

  it("rejects unsupported Energy Goal/phase context", () => {
    expect(() => energy([], { semanticPhaseType: "lean_mass_build" }))
      .toThrow("unsupported_goal_phase_operating_state");
  });

  it("ignores obsolete targets and never treats active calories as expenditure", () => {
    const result = energy([
      {
        ...energyRow("2026-07-19", null),
        targetCalories: 7000,
        estimatedExpenditure: null,
      },
      energyRow("2026-07-20", 0),
    ]);
    expect(result.state).toBe("insufficient_or_incomplete");
    expect(result.limitingReasons).toContain(
      "estimated_expenditure_basis_incomplete"
    );
  });

  it("gives reordered Energy source rows the same identity", () => {
    const rows = [
      energyRow("2026-07-19", -100),
      energyRow("2026-07-20", -100),
      energyRow("2026-07-21", -100),
      energyRow("2026-07-22", -100),
    ];
    expect(energy(rows).interpretationFingerprint)
      .toBe(energy([...rows].reverse()).interpretationFingerprint);
  });

  it("requires finalized Training inputs", () => {
    expect(training([], {
      analysisComplete: false,
      performanceEventPersistenceComplete: false,
    })).toMatchObject({
      state: "insufficient",
      finalized: false,
      publicationEligible: false,
    });
  });

  it("does not turn one or several same-session PRs into broad improvement", () => {
    expect(training([category("arms", "improving")]).state).toBe("insufficient");
    expect(training([category("arms", "improving")], {
      performanceEventIds: ["pr_1", "pr_2", "pr_3"],
    }).state).toBe("insufficient");
  });

  it.each([
    [
      [category("arms", "improving"), category("back", "improving")],
      "broad_constructive",
    ],
    [
      [category("arms", "plateauing"), category("back", "plateauing")],
      "stagnating",
    ],
    [
      [category("arms", "regressing"), category("back", "regressing")],
      "broad_regression",
    ],
    [
      [category("arms", "stable"), category("back", "stable")],
      "stable",
    ],
  ])("maps category breadth to %s", (categories, state) => {
    expect(training(categories).state).toBe(state);
  });

  it("does not map one poor category to broad regression", () => {
    expect(training([
      category("arms", "regressing"),
      category("back", "stable"),
    ]).state).toBe("stable");
  });

  it("normalizes Training event order deterministically", () => {
    const categories = [
      category("arms", "improving"),
      category("back", "improving"),
    ];
    expect(training(categories).interpretationFingerprint).toBe(
      training(categories, {
        performanceEventIds: ["event_a", "event_b"],
      }).interpretationFingerprint
    );
  });

  it("detects semantic transitions but ignores prose and numeric-only changes", () => {
    const prior = {
      ...energy([
        energyRow("2026-07-19", -50),
        energyRow("2026-07-20", -50),
        energyRow("2026-07-21", -50),
        energyRow("2026-07-22", -50),
      ]),
      explanation: "old prose",
    };
    const same = {
      ...prior,
      averageEstimatedDailyBalance: 20,
      explanation: "new prose",
      interpretationFingerprint: "different_lineage",
    };
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "energy",
      priorState: prior,
      nextState: same,
    }).outcome).toBe("non_material_change");
    const deficit = energy([
      energyRow("2026-07-19", -300),
      energyRow("2026-07-20", -300),
      energyRow("2026-07-21", -300),
      energyRow("2026-07-22", -300),
    ]);
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "energy",
      priorState: prior,
      nextState: deficit,
    })).toMatchObject({ outcome: "material_change", material: true });
  });

  it("returns awaiting, replay, cadence, and event outcomes", () => {
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "energy",
      nextState: { pairedDayCount: 0 },
    }).outcome).toBe("awaiting_pair_completion");
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "training",
      nextState: { finalized: false },
    }).outcome).toBe("awaiting_training_finalization");
    const next = energy([
      energyRow("2026-07-19", 0),
      energyRow("2026-07-20", 0),
      energyRow("2026-07-21", 0),
      energyRow("2026-07-22", 0),
    ]);
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "energy",
      nextState: next,
      priorState: next,
    }).outcome).toBe("already_represented");
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "energy",
      nextState: next,
      ownership: "cadence",
    })).toMatchObject({ outcome: "already_represented", ownership: "cadence" });
    expect(detectPILowerLevelConfidenceSemanticChange({
      domain: "energy",
      nextState: next,
      ownership: "event",
    }).outcome).toBe("higher_level_event_owned");
  });

  it("creates deterministic Energy consumption and trigger identities", () => {
    const state = energy([
      energyRow("2026-07-19", 0),
      energyRow("2026-07-20", 0),
      energyRow("2026-07-21", 0),
      energyRow("2026-07-22", 0),
    ]);
    const consumptionInput = {
      domain: "energy",
      sourceInterpretationId: state.id,
      interpretationFingerprint: state.interpretationFingerprint,
      goalId: "goal",
      phaseId: "phase",
      operatingState: "calibration",
      evidenceCutoff: cutoff,
      sourceEvidenceIds: ["activity", "nutrition"],
      transitionFromState: "insufficient_or_incomplete",
      transitionToState: state.state,
      domainIdentity: {
        pairedLocalDates: ["2026-07-22", "2026-07-19"],
        nutritionIds: state.canonicalNutritionIds,
        activityIds: state.canonicalActivityIds,
        rollingWindowId: state.rollingWindowId,
        interpretationVersion: state.interpretationVersion,
      },
    };
    const first = createPIDomainConsumptionIdentity(consumptionInput);
    const second = createPIDomainConsumptionIdentity({
      ...consumptionInput,
      sourceEvidenceIds: ["nutrition", "activity"],
    });
    expect(first.id).toBe(second.id);
    const triggerInput = {
      triggerType: PILowerLevelTriggerType.ENERGY,
      goalId: "goal",
      phaseId: "phase",
      operatingState: "calibration",
      sourceEvidenceIds: ["nutrition", "activity"],
      finalizedInterpretationId: state.id,
      interpretationFingerprint: state.interpretationFingerprint,
      evidenceCutoff: cutoff,
      semanticChangeType: "insufficient_to_near_maintenance",
      publicationEligibility: true,
      expectedCurrentSnapshotId: "snapshot",
      expectedRevision: 28,
      expectedSemanticDigest: "digest",
      consumption: consumptionInput,
    };
    expect(createPILowerLevelTriggerCandidate(triggerInput).id)
      .toBe(createPILowerLevelTriggerCandidate(triggerInput).id);
    expect(() => createPILowerLevelTriggerCandidate({
      ...triggerInput,
      triggerType: "evidence_confirmation",
    })).toThrow("Unsupported triggerType");
  });

  it("creates deterministic Training consumption identity", () => {
    const input = {
      domain: "training",
      sourceInterpretationId: "training_interpretation",
      interpretationFingerprint: "fingerprint",
      goalId: "goal",
      phaseId: "phase",
      operatingState: "calibration",
      evidenceCutoff: cutoff,
      sourceEvidenceIds: ["session"],
      transitionFromState: "stable",
      transitionToState: "broad_constructive",
      domainIdentity: {
        canonicalSessionId: "session",
        performanceEventIds: ["b", "a"],
        finalizedReportId: "analysis",
        categoryTrendFingerprint: "category_fingerprint",
        interpretationVersion: "training_v1",
      },
    };
    expect(createPIDomainConsumptionIdentity(input).id).toBe(
      createPIDomainConsumptionIdentity({
        ...input,
        domainIdentity: {
          ...input.domainIdentity,
          performanceEventIds: ["a", "b"],
        },
      }).id
    );
  });

  it("normalizes contributor lineage and cadence roles", () => {
    expect(normalizePIContributorLineage({
      consumedTransitionIds: ["b", "a", "a"],
      consumptionRole: "prior_context",
    }).consumedTransitionIds).toEqual(["a", "b"]);
    expect(resolvePICadenceConsumptionRole({
      consumedTransitionId: "transition",
      predecessorConsumedTransitionIds: ["transition"],
    })).toBe("prior_context");
    expect(resolvePICadenceConsumptionRole({
      consumedTransitionId: "transition",
      predecessorConsumedTransitionIds: ["transition"],
      hasNewCorroboration: true,
    })).toBe("new_corroboration");
    expect(resolvePICadenceConsumptionRole({
      consumedTransitionId: "new",
      predecessorConsumedTransitionIds: ["old"],
    })).toBe("new_effect");
  });

  it("preserves existing assessment compatibility and normalizes optional lineage", () => {
    const contributor = {
      id: "contributor",
      domain: "energy",
      label: "Energy evidence",
      direction: "supporting",
      strength: "high",
      confidence: { level: "high", method: "pi_v3_reasoning" },
      evidenceCompleteness: "complete",
      reason: "Supported.",
      sourceObservationIds: [],
      sourceClaimIds: [],
      canonicalEvidenceReferences: [],
      affectedScoreMovement: true,
      userFacing: true,
    };
    const base = {
      piVersion: "pi_v3",
      goalId: "goal",
      phaseId: "phase",
      operatingState: "calibration",
      context: {
        type: "energy_interpretation",
        cadence: null,
        evidenceWindowId: null,
        eventId: null,
      },
      evidenceCutoff: cutoff,
      score: { current: 50, prior: null, movement: {
        direction: "initial", magnitude: "none",
      } },
      contributors: [contributor],
      evidenceCompleteness: { overall: "complete" },
      reasoning: {},
      provenance: { generatedAt: cutoff },
    };
    expect(createPIGoalConfidenceAssessment(base).contributors[0])
      .not.toHaveProperty("consumptionRole");
    const fingerprint = `sha256_${"a".repeat(64)}`;
    expect(createPIGoalConfidenceAssessment({
      ...base,
      contributors: [{
        ...contributor,
        consumedTransitionIds: ["transition"],
        contributorSemanticFingerprint: fingerprint,
        sourceInterpretationId: "interpretation",
        consumptionRole: "new_effect",
      }],
    }).contributors[0]).toMatchObject({
      consumedTransitionIds: ["transition"],
      contributorSemanticFingerprint: fingerprint,
      sourceInterpretationId: "interpretation",
      consumptionRole: "new_effect",
    });
  });

  it("keeps existing movement limits and adds bounded lower-level limits", () => {
    expect(PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS).toMatchObject({
      energy_interpretation: 2,
      training_interpretation: 2,
      midweek_partial_window: 3,
      weekly_closed_window: 6,
      photo_event: 3,
      dexa_event: 15,
    });
  });

  it("produces plain-language explanations without internal jargon", () => {
    const reasons = [
      explainPILowerLevelSemanticChange({
        domain: "energy",
        outcome: "material_change",
        nextState: { state: "near_maintenance" },
      }),
      explainPILowerLevelSemanticChange({
        domain: "training",
        outcome: "material_change",
        nextState: { state: "broad_constructive" },
      }),
    ];
    for (const reason of reasons) {
      expect(reason).not.toMatch(/fingerprint|threshold|topology|semantic state/i);
    }
  });
});
