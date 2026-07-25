import { resolveOverallGoalConfidenceReadModel } from "./OverallGoalConfidenceReadService";

export function diagnoseGoalConfidenceArchitecture(store, {
  currentDate = new Date("2026-07-23T12:00:00Z"),
} = {}) {
  const activeGoal = (store.goals ?? []).find(
    (goal) => goal.status === "active" && goal.type === "build_lean_mass"
  );
  if (!activeGoal) throw new Error("An active goal is required.");
  const base = inputs(store, activeGoal, currentDate);
  const current = resolveOverallGoalConfidenceReadModel(base);
  const fixture = (overrides) => resolveOverallGoalConfidenceReadModel({
    ...base,
    activeProtocols: [],
    canonicalEvidence: [],
    checkIns: [],
    dexaScans: [],
    nutritionContext: null,
    progressPhotos: [],
    trainingPerformance: null,
    ...overrides,
  }).value;

  return Object.freeze({
    canonical: current,
    storage: {
      persisted: false,
      snapshotCount: 0,
      causalDriverRecordCount: 0,
      legacyEvaluationConfidenceComputedSeparately: true,
    },
    rules: {
      base: 24,
      eachBooleanExecutionInput: 5,
      invalidTimelinePenalty: -10,
      phaseOutcomeEvidenceBonus: 5,
      ambitiousGoalCap: 49,
      floor: 12,
      ceiling: 58,
      rounding: "integer arithmetic",
      timeAloneMovesScore: false,
      repeatedIdenticalEvidenceMovesScore: false,
    },
    fixtureMovement: {
      newlyActivatedInsufficientHistory: fixture({}),
      oneStrongExecutionWeek: fixture({
        activeProtocols: [{}],
        checkIns: [{}],
        nutritionContext: {},
        trainingPerformance: { sessions: [{}] },
      }),
      incompleteDataWeek: fixture({}),
      weightIncreaseWithoutPerformance: fixture({}),
      productiveTrainingStableWeight: fixture({ trainingPerformance: { sessions: [{}] } }),
      bodyFatAboveGuardrail: fixture({ dexaScans: [{ bodyFat: { value: 10 } }] }),
      dexaConfirmedLeanGain: fixture({ dexaScans: [{ leanMass: { value: 150 } }] }),
      contradictoryDexaAndScale: fixture({ dexaScans: [{}] }),
      noNewMeaningfulEvidence: current.value,
      repeatedIdenticalEvidence: current.value,
    },
    dimensions: {
      execution: ["nutrition presence", "training presence", "activity/check-in presence", "protocol presence", "photo or DEXA presence"],
      direction: [],
      outcome: ["phase outcome evidence boolean only"],
    },
    weekly: {
      consumesCanonicalConfidence: false,
      hasWindowStartSnapshot: false,
      hasWindowEndSnapshot: false,
      hasPointChange: false,
      hasCausalDrivers: false,
    },
  });
}

function inputs(store, activeGoal, currentDate) {
  return {
    activeGoal,
    activeProtocols: (store.protocols ?? []).filter((item) => item.status === "active"),
    canonicalEvidence: store.canonicalEvidenceObjects ?? [],
    checkIns: store.dailyCheckIns ?? [],
    currentDate,
    dexaScans: store.dexaScans ?? [],
    nutritionContext: store.nutritionContext ?? null,
    progressPhotos: store.progressPhotos ?? [],
    timeZone: store.user?.timezone ?? "UTC",
    trainingPerformance: null,
  };
}
