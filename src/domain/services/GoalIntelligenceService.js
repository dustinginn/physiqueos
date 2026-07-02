const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export function createGoalIntelligenceService() {
  return {
    getGoalIntelligence({ evaluations = [], activeGoal = null } = {}) {
      const goalSummaries = evaluations.map(mapEvaluationToGoalSummary);
      const activeEvaluation =
        evaluations.find((evaluation) => evaluation.goalId === activeGoal?.id) ??
        evaluations.find((evaluation) => evaluation.goalId === VISIBLE_ABS_GOAL_ID) ??
        null;
      const activeSummary =
        goalSummaries.find((goal) => goal.id === activeEvaluation?.goalId) ?? null;
      const projection = activeEvaluation?.projection ?? null;

      return {
        trajectory: {
          label: "Trajectory",
          title: getTrajectoryTitle(activeSummary),
          description: getTrajectoryDescription(activeSummary),
          confidence: activeEvaluation?.goalConfidence?.value ?? activeEvaluation?.confidence ?? 0,
          confidenceLabel: activeEvaluation?.goalConfidence?.label ?? "Confidence",
          goalConfidence: activeEvaluation?.goalConfidence ?? null,
          projectedFinish: projection?.projectedFinish ?? "Pending",
          daysRemaining: projection?.daysRemaining ?? "Pending",
        },
        goals: goalSummaries,
      };
    },
  };
}

export const GoalIntelligenceService = createGoalIntelligenceService();

function mapEvaluationToGoalSummary(evaluation) {
  const visualIdentity = getGoalVisualIdentity(evaluation);

  return {
    id: evaluation.goalId,
    title: evaluation.title,
    current: evaluation.current,
    target: evaluation.target,
    progress: evaluation.progress,
    primary: evaluation.primary,
    icon: visualIdentity.icon,
    color: visualIdentity.color,
    progressColor: visualIdentity.progressColor,
    summary: evaluation.summary,
    confidence: evaluation.goalConfidence?.value ?? evaluation.confidence,
    goalProgress: evaluation.goalProgress,
    goalConfidence: evaluation.goalConfidence,
    presentation: evaluation.primary
      ? {
          mode: "primary_goal",
        }
      : evaluation.presentation ?? {
          mode: "supporting_objective",
          status: evaluation.current,
          detail: evaluation.summary,
          label: "Status",
        },
  };
}

function getGoalVisualIdentity(evaluation) {
  if (evaluation.primary) {
    return {
      icon: "target",
      color: "primary",
      progressColor: "#3BC35B",
    };
  }

  if (evaluation.metricKey === "leanMass") {
    return {
      icon: "dumbbell",
      color: "effort",
      progressColor: "#F59E0B",
    };
  }

  if (evaluation.metricKey === "bodyFatPercentage") {
    return {
      icon: "shield",
      color: "success",
      progressColor: "#16A34A",
    };
  }

  return {
    icon: "compass",
    color: "evidence",
    progressColor: "#0EA5E9",
  };
}

function getTrajectoryTitle(activeSummary) {
  if (!activeSummary) return "Awaiting evidence.";
  if (activeSummary.id === VISIBLE_ABS_GOAL_ID && activeSummary.progress >= 60) {
    return "On track for visible abs.";
  }

  if (activeSummary.progress >= 80) return "Making steady progress.";
  if (activeSummary.progress >= 60) return "Momentum remains strong.";

  return "On pace.";
}

function getTrajectoryDescription(activeSummary) {
  if (!activeSummary) return "Import evidence to generate trajectory.";

  return activeSummary.summary ?? "Evidence supports the current direction.";
}
