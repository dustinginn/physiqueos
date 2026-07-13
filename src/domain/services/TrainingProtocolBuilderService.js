export const TRAINING_PROTOCOL_TYPE = "training";
export const TRAINING_PROTOCOL_ID = "protocol_training_founder_maintenance";
export const TRAINING_GOAL_ID = "goal_visible_abs_at_rest";

export const DEFAULT_TRAINING_FREQUENCIES = {
  arms: 2,
  core: 2,
  lower_body: 2,
  back: 1,
  chest: 1,
  shoulders: 1,
};

export const DEFAULT_TRAINING_RHYTHM = [
  { day: "monday", focus: ["chest", "shoulders"] },
  { day: "tuesday", focus: ["lower_body"] },
  { day: "wednesday", focus: ["arms", "core"] },
  { day: "thursday", focus: ["back"] },
  { day: "friday", focus: ["lower_body"] },
  { day: "saturday", focus: ["arms", "core"] },
  { day: "sunday", focus: [], mode: "flexible_recovery" },
];
const TRAINING_OBJECTIVES = new Set(["preserve_lean_mass", "recomposition", "maximize_muscle_growth", "improve_performance"]);
const NUTRITION_PHASES = new Set(["deficit", "maintenance", "surplus"]);
const PROGRESSION_PACES = new Set(["conservative", "moderate", "aggressive"]);

export function validateTrainingProtocolInput(input = {}) {
  const errors = [];
  if (!TRAINING_OBJECTIVES.has(input.objective)) errors.push("Choose a valid training objective.");
  if (!Array.isArray(input.priorities) || input.priorities.length === 0) errors.push("Choose at least one physique priority.");
  if (!NUTRITION_PHASES.has(input.nutritionPhase)) errors.push("Choose a valid nutrition phase.");
  if (!PROGRESSION_PACES.has(input.progressionPace)) errors.push("Choose a valid progression pace.");
  Object.keys(DEFAULT_TRAINING_FREQUENCIES).forEach((area) => {
    const value = Number(input.frequencies?.[area]);
    if (!Number.isInteger(value) || value < 0 || value > 4) errors.push(`Choose a valid weekly frequency for ${area}.`);
  });
  if (!Array.isArray(input.preferredRhythm) || input.preferredRhythm.length !== 7) {
    errors.push("Define a preferred rhythm for each day of the week.");
  }
  return { valid: errors.length === 0, errors };
}

export function createTrainingProtocolBuilderService({ repositories }) {
  return {
    async getBuilderContext(userId) {
      const [goal, activeProtocol] = await Promise.all([
        repositories.goals.getGoalById(TRAINING_GOAL_ID),
        repositories.protocols.getActiveProtocolByType(userId, TRAINING_PROTOCOL_TYPE),
      ]);
      const currentVersion = activeProtocol
        ? await repositories.protocolVersions.getCurrentVersion(activeProtocol.id)
        : null;

      return {
        activeProtocol,
        currentVersion,
        goal: goal ?? { id: TRAINING_GOAL_ID, title: "Visible Abs at Rest" },
        phase: { id: "maintenance", label: "Maintenance" },
        currentPhase: { id: "late_stage_cut", label: "Late-stage cut" },
        futurePhase: { id: "lean_bulk", label: "Lean bulk" },
        defaultFrequencies: { ...DEFAULT_TRAINING_FREQUENCIES },
        defaultRhythm: structuredClone(DEFAULT_TRAINING_RHYTHM),
        effectiveDateLabel: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Los_Angeles" }).format(new Date()),
      };
    },
  };
}

export function createFounderTrainingProtocolActivation({
  confirmedAt,
  effectiveAt,
  frequencies = DEFAULT_TRAINING_FREQUENCIES,
  nutritionPhase = "maintenance",
  objective = "preserve_lean_mass",
  preferredRhythm = DEFAULT_TRAINING_RHYTHM,
  priorities = ["arms", "core", "lower_body"],
  progressionPace = "moderate",
  recoveryGates = ["recovery_declines", "pain_develops", "performance_regresses", "evidence_incomplete"],
  userId,
}) {
  const timestamp = confirmedAt || new Date().toISOString();
  const weeklyExpectations = Object.entries(frequencies).map(([area, target]) => ({
    id: `weekly_${area}_frequency`,
    metric: "muscle_group_training_frequency",
    area,
    operator: "at_least",
    target: Number(target),
    unit: "sessions",
    cadence: "weekly",
    includedEvidenceTypes: ["training_session"],
  }));
  const rhythm = preferredRhythm;

  return {
    protocol: {
      id: TRAINING_PROTOCOL_ID,
      userId,
      protocolType: TRAINING_PROTOCOL_TYPE,
      category: "training",
      name: "Maintenance Training Strategy",
    },
    version: {
      id: `${TRAINING_PROTOCOL_ID}_v1`,
      effectiveAt,
      author: { type: "user", id: userId, displayName: "Founder" },
      change: {
        reason: "Define the training strategy for maintenance and long-term progression.",
        changedFields: [],
        previousVersionId: null,
      },
      goalLinks: [{ goalId: TRAINING_GOAL_ID, relationship: "supports" }],
      phaseContext: {
        id: "maintenance",
        label: "Maintenance",
        transitionFrom: "late_stage_cut",
        futurePhase: "lean_bulk",
        confirmedByUser: true,
      },
      intent: {
        summary: "Preserve lean mass through the end of the cut, then restore performance and build gradual progression in maintenance.",
        primaryObjective: objective,
        physiquePriorities: [...priorities],
      },
      expectations: weeklyExpectations,
      evaluationWindows: [{
        id: "weekly_training_frequency",
        cadence: "weekly",
        unit: "sessions_by_area",
        evaluationMode: "frequency_completion",
        schedulePolicy: "preferred_days_are_flexible",
        weekStartsOn: "monday",
      }],
      trainingStrategy: {
        objective,
        physiquePriorities: [...priorities],
        weeklyFrequencies: { ...frequencies },
        preferredRhythm: structuredClone(rhythm),
        progression: {
          pace: progressionPace,
          defaultRule: {
            type: "double_progression_confirmed_sessions",
            successfulSessionsRequired: 2,
            condition: "reach_top_of_rep_range",
            action: "increase_load",
          },
          exerciseOverrides: [],
        },
        nutritionPhase,
        recoveryGates: [...recoveryGates],
      },
      coachingPolicy: {
        trainingDayPriorities: true,
        dailyBriefingMateriality: "selective",
        sundayWeeklyReview: "full_review_later",
        pushAlertsEnabled: false,
        movedSessionPolicy: "do_not_classify_as_missed_when_weekly_frequency_remains_recoverable",
      },
      reviewTriggers: [
        { type: "goal_transition" },
        { type: "nutrition_phase_change" },
        { type: "sustained_recovery_concern" },
        { type: "persistent_performance_regression" },
        { type: "strategy_no_longer_matches_progress" },
      ],
      evidenceBasis: {
        evidenceTypes: ["training_session"],
        directEvidenceConfidence: "moderate",
        limitations: ["Exercise-level progression evaluation is not active yet."],
      },
      confirmation: {
        confirmedByUser: true,
        confirmedAt: timestamp,
        statement: "The Founder reviewed and approved this Training strategy.",
        authority: "founder_confirmation",
        protocolConfidence: "high",
      },
      createdAt: timestamp,
    },
  };
}
