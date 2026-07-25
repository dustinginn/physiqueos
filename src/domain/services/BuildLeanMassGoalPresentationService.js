import { FounderRepositories } from "../../data/repositories/founderRepositories";

export async function getBuildLeanMassGoalPresentation() {
  const user = await FounderRepositories.users.getCurrentUser();
  const goals = await FounderRepositories.goals.listGoals(user?.id);
  const goal = goals.find((item) => item.type === "build_lean_mass" && item.status === "active");

  if (!goal) {
    throw new Error("The active Build Lean Mass goal is unavailable.");
  }

  return composeBuildLeanMassGoalPresentation(goal);
}

export function composeBuildLeanMassGoalPresentation(goal) {
  const known = goal.openingApproach?.known ?? [];
  const unknown = goal.openingApproach?.unknown ?? [];
  const guardrails = goal.guardrails?.filter((item) => item.accepted !== false) ?? [];
  const outcomes = goal.progressMeasurement?.outcomeMeasures?.filter((item) => item.accepted !== false) ?? [];
  const activatedAt = goal.activatedAt ?? goal.updatedAt ?? "2026-01-01";

  return {
    id: `narrative_goal_${goal.id}`,
    goalId: goal.id,
    hero: {
      title: goal.title,
      state: "Calibration Active",
      conclusion: goal.openingApproach?.recommendationReason ??
        "The active plan is calibrating the inputs required for productive lean-mass gain.",
      confidence: 0,
      confidenceLabel: "Building",
      estimate: null,
    },
    journeyMap: {
      progress: null,
      summary: "The transition is complete. The current chapter establishes a productive baseline before judging lean-mass progress.",
      stops: [
        { state: "complete", label: "Start", detail: "Build Lean Mass activated" },
        { state: "current", label: "Today", detail: "Calibration active" },
        { state: "next", label: "Next Milestone", detail: unknown[0] ?? "Maintenance intake calibrated" },
        { state: "destination", label: "Goal", detail: goal.title },
      ],
    },
    groundCovered: known.slice(0, 3).map((item) => ({
      title: item,
      body: "Established during the completed goal transition and retained as current planning context.",
    })),
    roadAhead: unknown.slice(0, 4).map((item) => ({
      type: "calibration",
      label: item,
      detail: "The active plan will use incoming evidence to establish this baseline safely.",
    })),
    completionCriteria: outcomes.map((item) => ({
      label: item.label,
      status: "In Progress",
    })),
    strategy: {
      conclusion: "Calibrate before making strong claims about productive surplus or measurable tissue gain.",
      pillars: guardrails.map((item) => ({
        label: item.text,
        detail: "Accepted guardrail for the active Build Lean Mass chapter.",
      })),
      constraint: guardrails[0]?.text ?? "Keep body-composition change inside the accepted guardrails.",
    },
    turningPoints: [{
      date: activatedAt,
      label: "Build Lean Mass Activated",
      body: "The prior goal completed and this goal became the sole active primary chapter.",
    }],
    confidence: {
      value: 0,
      label: "building",
      summary: "Confidence begins low until the new goal establishes its own calibration evidence.",
      reasons: known.slice(0, 3).map((item) => `${item} is available as starting context.`),
      watching: unknown[0] ?? "The first goal-period calibration evidence.",
    },
    protocols: [],
    transition: null,
    provenance: {
      presentationOnly: true,
      persisted: false,
      source: "active_build_lean_mass_goal",
    },
  };
}
