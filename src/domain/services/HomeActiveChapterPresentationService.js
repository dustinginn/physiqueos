import { resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";

const BUILD_LEAN_MASS_TYPE = "build_lean_mass";

export function deriveHomeActiveChapterPresentation({
  activeGoal,
  briefingCard,
  commitments = [],
  goals = [],
  operatingPlan,
  reminders = [],
  currentDate,
  timeZone,
  evidenceSummary,
  dexaScans,
  trajectory: suppliedTrajectory,
  overallGoalConfidence,
  coachingUpdates = null,
} = {}) {
  if (activeGoal?.type !== BUILD_LEAN_MASS_TYPE || activeGoal.status !== "active") {
    return null;
  }

  const trajectory = suppliedTrajectory ?? resolveHomeGoalTrajectory({ activeGoal, currentDate, timeZone, evidenceSummary, dexaScans });
  if (!trajectory.hasExplicitPhases) return null;
  if (trajectory.blockingReasons.length) {
    console.warn("[HomeGoalTrajectory] Active phase unavailable", { goalId: activeGoal.id, blockingReasons: trajectory.blockingReasons });
  }
  const cadence = coachingUpdates ??
    operatingPlan?.coachingCadence ??
    activeGoal.coachingCadenceReference ??
    null;
  const guardrail = trajectory.overallGoal.sharedGuardrails.find((item) => /body fat/i.test(item)) ?? null;
  const schedulerIntent = reminders.find(
    (item) => item.intentType === "apply_goal_transition_schedule" &&
      item.relatedGoalIds?.includes(activeGoal.id)
  );
  const sourceGoal = goals.find((goal) => goal.id === activeGoal.sourceGoalId) ?? null;

  return {
    activeGoalId: activeGoal.id,
    hero: {
      confidence: trajectory.confidence.numericValue,
      confidenceState: trajectory.confidence.qualitativeLevel,
      goalIcon: "dumbbell",
      goalLabel: activeGoal.title,
      headline: trajectory.activePhase?.phaseName ?? "Phase unavailable",
      primaryTimeline: trajectory.activePhase?.friendlyTimeline ?? "Timeline not established",
      plannedReviewDate: trajectory.activePhase?.calculatedPlannedReviewDate ?? null,
      supportLine: trajectory.activePhase?.purpose ?? "Phase details are unavailable.",
      confidenceDetail: {
        qualitativeLevel: trajectory.confidence.qualitativeLevel,
        supportingFactors: trajectory.confidence.supportingFactors,
        limitingFactors: trajectory.confidence.limitingFactors,
        clarifyingFactors: trajectory.confidence.clarifyingFactors,
        uncertaintyStatement: trajectory.confidence.uncertaintyStatement,
      },
      confidenceSource: overallGoalConfidence?.source ?? null,
      mode: "phase_trajectory",
      supportingMetrics: [
        trajectory.activePhase && { label: "Current phase", value: trajectory.activePhase.phaseName, icon: "phase" },
      ].filter(Boolean),
      schedulerMessage: null,
    },
    goals: [{
      id: activeGoal.id,
      title: activeGoal.title,
      primary: true,
      icon: "dumbbell",
      color: "effort",
      href: "/goals/build-lean-mass",
      presentation: {
        mode: "phase_trajectory_goal",
        trajectory,
        guardrail,
        additionalGuardrails: trajectory.overallGoal.sharedGuardrails.filter((item) => item !== guardrail),
      },
    }],
    briefingCard: markPreviousChapterBriefing({
      activeGoal,
      briefingCard,
      sourceGoal,
    }),
    schedulerPending: schedulerIntent?.status === "pending_after_commit",
    guardrail,
    cadence,
    trajectory,
    eligibleCommitments: filterHomeCommitmentsForActiveGoal(commitments, activeGoal.id),
  };
}

export function filterHomeRemindersForActiveGoal(reminders = [], activeGoalId) {
  return reminders.filter((reminder) => {
    const goalIds = reminder.relatedGoalIds ?? [];
    return goalIds.length === 0 || goalIds.includes(activeGoalId);
  });
}

export function filterHomeCommitmentsForActiveGoal(commitments = [], activeGoalId) {
  return commitments.filter(
    (commitment) => commitment.active !== false && commitment.linkedGoalIds?.includes(activeGoalId)
  );
}

function markPreviousChapterBriefing({ activeGoal, briefingCard, sourceGoal }) {
  if (!briefingCard?.createdAt || !activeGoal?.activatedAt) return briefingCard;

  const briefingTime = Date.parse(briefingCard.createdAt);
  const activationTime = Date.parse(activeGoal.activatedAt);
  if (!Number.isFinite(briefingTime) || !Number.isFinite(activationTime) || briefingTime >= activationTime) {
    return briefingCard;
  }

  const sourceTitle = sourceGoal?.title ?? "the previous goal";
  return {
    ...briefingCard,
    sectionLabel: "Previous Chapter Briefing",
    prompt: `From the ${normalizeSourceTitle(sourceTitle)} chapter. Your next briefing will evaluate Build Lean Mass.`,
    chapterContext: "previous",
  };
}

function formatCadence(cadence) {
  if (cadence.type === "twice_weekly" && cadence.days?.length) {
    return cadence.days.map(capitalize).join(" & ");
  }

  return String(cadence.type ?? "Selected").replaceAll("_", " ");
}

function normalizeSourceTitle(title) {
  return /^visible abs at rest$/i.test(title) ? "Visible Abs" : title;
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}
