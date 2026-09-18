const WINDOW = Object.freeze({
  startDate: "2026-09-01",
  endDate: "2026-09-18",
  cutoff: "2026-09-18T17:20:06.000Z",
});

const DAILY = Object.freeze([
  ["2026-09-01", 167.9, 2450, 172, 874, -227],
  ["2026-09-02", 167.9, 2449, 170, 998, -352],
  ["2026-09-03", 170.0, 3926, 202, 1038, 1085],
  ["2026-09-04", 170.6, 3564, 245, 768, 993],
  ["2026-09-05", 172.8, 3920, 184, 643, 1474],
  ["2026-09-06", null, 3920, 183, 341, 1776],
  ["2026-09-07", 172.2, 2632, 182, 231, 598],
  ["2026-09-08", 170.2, 2311, 165, 909, -401],
  ["2026-09-09", 171.8, 2256, 180, 912, -459],
  ["2026-09-10", 172.4, 2398, 179, 818, -223],
  ["2026-09-11", 172.9, 2598, 187, 799, -4],
  ["2026-09-12", 171.3, 4190, 192, 991, 1352],
  ["2026-09-13", 172.5, 2285, 178, 994, -556],
  ["2026-09-14", 171.3, 2442, 182, 948, -353],
  ["2026-09-15", 171.1, 2484, 181, 824, -187],
  ["2026-09-16", 172.2, 2664, 211, 841, -24],
  ["2026-09-17", 172.5, 2397, 197, 876, -326],
  ["2026-09-18", 173.0, null, null, null, null],
]);

const SEPTEMBER_TRAINING = Object.freeze([
  ["2026-09-01", ["shoulders", "core"]],
  ["2026-09-02", ["arms"]],
  ["2026-09-03", ["lower", "quads", "glutes"]],
  ["2026-09-04", ["chest"]],
  ["2026-09-08", ["shoulders"]],
  ["2026-09-09", ["arms"]],
  ["2026-09-10", ["glutes", "lower", "quads"]],
  ["2026-09-11", ["chest"]],
  ["2026-09-12", ["arms"]],
  ["2026-09-13", ["back", "core"]],
  ["2026-09-14", ["quads", "lower"]],
  ["2026-09-15", ["shoulders"]],
  ["2026-09-16", ["arms"]],
  ["2026-09-17", ["glutes", "lower"]],
  ["2026-09-18", ["chest", "core"]],
]);

const BASELINE_TRAINING = Object.freeze([
  ["2026-08-15", ["arms"]], ["2026-08-16", ["back", "core"]],
  ["2026-08-17", ["lower", "quads", "glutes"]],
  ["2026-08-18", ["shoulders"]], ["2026-08-19", ["arms"]],
  ["2026-08-20", ["lower", "quads", "glutes", "hamstrings"]],
  ["2026-08-21", ["chest"]], ["2026-08-22", ["arms"]],
  ["2026-08-23", ["back", "core"]],
  ["2026-08-24", ["lower", "quads", "glutes", "arms"]],
  ["2026-08-25", ["shoulders", "lower", "quads", "glutes", "arms"]],
  ["2026-08-26", ["arms"]],
  ["2026-08-27", ["lower", "quads", "glutes"]],
  ["2026-08-28", ["chest"]], ["2026-08-29", ["arms"]],
  ["2026-08-30", ["back", "core"]],
  ["2026-08-31", ["glutes", "lower"]],
]);

export function createSeptemberMonthlyV3StressTestFixture() {
  const nutrition = DAILY.filter((item) => item[2] != null).map((item) => ({
    id: `nutrition|${item[0]}`, date: item[0], value: item[3],
    metricName: "protein", unit: "g/day", expectedDays: 17, usable: true,
    direction: "supports", limitations: ["logged_intake_is_user_submitted"],
  }));
  const activity = DAILY.filter((item) => item[4] != null).map((item) => ({
    id: `activity|${item[0]}`, date: item[0], value: item[4],
    metricName: "active calories", unit: "kcal/day", expectedDays: 17,
    usable: true, direction: "supports",
    limitations: ["active_expenditure_is_wearable_estimated"],
  }));
  const energy = DAILY.filter((item) => item[5] != null).map((item) => ({
    id: `energy|${item[0]}`, date: item[0], balance: item[5],
    segment: item[0] <= "2026-09-12" ? "september_1_to_12" :
      "september_13_to_17",
    direction: item[5] >= 0 ? "supports" : "contradicts",
    limitations: ["intake_is_logged", "expenditure_is_wearable_estimated"],
  }));
  const weight = DAILY.filter((item) => item[1] != null).map((item) => ({
    id: `weight|${item[0]}`, date: item[0], value: item[1], usable: true,
    direction: "supports", expectedDays: 18,
    limitations: ["single_day_weight_varies"],
  }));
  return {
    window: { ...WINDOW },
    goalPolicy: {
      guardrail: { capability: "body_composition.body_fat_percentage",
        range: { min: 8, max: 9 } },
      domains: {
        bodyCompositionOutcome: { goalRelevance: "direct" },
        photos: { goalRelevance: "supporting" },
        training: { goalRelevance: "high" },
        nutrition: { goalRelevance: "supporting" },
        activity: { goalRelevance: "contextual" },
        energy: { goalRelevance: "supporting" },
        weight: { goalRelevance: "supporting" },
        recovery: { goalRelevance: "supporting" },
        execution: { goalRelevance: "supporting" },
      },
    },
    outcomes: [{
      id: "dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12",
      domain: "bodyCompositionOutcome", observedAt: "2026-09-12", quality: "robust",
      direction: "supports",
      statement: "The September DEXA measured 153.3 lb of lean mass, up 5.0 lb from August 15, with body fat at 8.1%.",
      strategicConsequence: "major_goal_progress_and_controlled_guardrail",
      narrativeConsequence: "monthly_major_highlight",
      facts: { objectiveValue: 153.3, objectiveChange: 5.0,
        objectiveUnit: "lb", totalMass: 174.7, fatMass: 14.2,
        guardrailValue: 8.1, goalProgress: 5.8,
        goalTarget: 10, goalFraction: 0.58, comparisonDate: "2026-08-15",
        evidenceName: "DEXA" },
    }],
    photos: [
      { id: "progress_photo_comparison|2026-08-08", observedAt: "2026-08-08",
        inWindow: false, comparability: "comparable", quality: "adequate",
        direction: "supports", observationCount: 5,
        statement: "The August 8 matched views showed a slightly tighter waist with stable upper-body appearance.",
        limitations: ["pre_window_carry_forward", "photo_quality_acceptance_deferred"] },
      { id: "progress_photo_comparison|2026-08-22", observedAt: "2026-08-22",
        inWindow: false, comparability: "comparable", quality: "adequate",
        direction: "supports", observationCount: 5,
        statement: "The August 22 matched views showed a stable waist and taper with signs of chest, shoulder, and arm fullness.",
        limitations: ["pre_window_carry_forward", "photo_quality_acceptance_deferred"] },
    ],
    training: {
      statement: "Fifteen detailed resistance-training sessions were recorded through September 18, with multiple personal progressions.",
      limitations: ["explicit_category_split_unavailable"],
      sessions: sessions(SEPTEMBER_TRAINING),
      baselineSessions: sessions(BASELINE_TRAINING),
      coachingCandidates: trainingCandidates(),
    },
    nutrition,
    activity,
    energy,
    weight,
    recovery: [],
    execution: [],
    historicalCalibration: [{
      id: "energy_calibration|2026-08-15_to_2026-09-12",
      comparable: true, derivedDirection: "contradicts",
      realizedOutcomeDirection: "supports", authoritativeOutcome: true,
      durationDays: 28,
      evidenceIds: [
        "dexa_event_dexa_submission_20260815181333895_review_pdf_1_2026_08_15",
        "dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12",
      ],
    }],
    communicationMemory: [{
      topicKey: "monthly|dexa",
      materialStateKey: "event_already_communicated_monthly_resurface_allowed",
    }],
    currentConfidence: 79,
  };
}

function sessions(values) {
  return values.map(([date, categories]) => ({
    id: `training|${date}|${categories.join("-")}`, date, categories,
  }));
}

function trainingCandidates() {
  return [
    candidate("leg_press", "Leg press", "session_volume", "record",
      13725, 11475, 19.6, 1),
    candidate("pull_ups", "Pull-ups", "session_volume", "record",
      675, 600, 12.5, 0.85, { load: 25, loadUnit: "lb" }),
    candidate("hyperextension", "Hyperextension machine", "session_volume",
      "record", 5700, 4800, 18.8, 0.7),
    candidate("shoulder_press", "Shoulder press machine", "load", "milestone",
      160, 150, 6.7, 0.6, { unit: "lb" }),
    candidate("chest_fly", "Plated chest fly", "session_volume", "record",
      3730, 3000, 24.3, 0.45),
  ];
}

function candidate(key, subjectLabel, metric, kind, currentValue,
  previousValue, percentChange, milestoneValue, extra = {}) {
  return {
    id: `training_observation|${key}|2026-09`,
    topicKey: `training|${key}|${metric}`,
    materialStateKey: `${currentValue}|${previousValue}`,
    subjectLabel, metric, kind, currentValue, previousValue, percentChange,
    milestoneValue, decisionImpact: 0.2, ...extra,
  };
}
