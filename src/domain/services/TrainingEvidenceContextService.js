import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { normalizeTrainingContextId } from "../../navigation/trainingTimelineNavigation";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { createProgressReportingService } from "./ProgressReportingService";
import { runRepositoryReadScope } from "../../application/read-models/RepositoryReadScope";

export async function getTrainingEvidenceContext({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  return runRepositoryReadScope({ repositories, readModel: "progress.training-context", callback: async () => {
    const user = await repositories.users.getCurrentUser();
    const goals = await repositories.goals.listGoals(user?.id);
    return createTrainingEvidenceContext({ context, currentDate, goals, user });
  }});
}

export function createTrainingEvidenceContext({
  context,
  currentDate = new Date(),
  goals = [],
  user = null,
} = {}) {
  const activeGoal = goals.find(
    (goal) => goal.status === "active" && goal.type === "build_lean_mass"
  );
  const completedGoal = goals.find(
    (goal) => goal.id === "goal_visible_abs_at_rest" && goal.status === "completed"
  );
  const selected = normalizeTrainingContextId(context);
  const labels = {
    "build-lean-mass": "Build Lean Mass",
    "visible-abs": "Visible Abs",
    all: "All Training",
  };
  const goal = selected === "build-lean-mass" ? activeGoal : selected === "visible-abs" ? completedGoal : null;
  const startDate = selected === "build-lean-mass"
    ? EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"].startDate
    : selected === "visible-abs" ? EVIDENCE_CONTEXT_WINDOWS["visible-abs"].startDate : null;
  const endDate = selected === "build-lean-mass"
    ? localDate(currentDate, user?.timezone ?? "America/Los_Angeles")
    : selected === "visible-abs" ? EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate : null;
  if (selected !== "all" && (!validDate(startDate) || !validDate(endDate))) {
    throw new Error(`The ${labels[selected]} lifecycle window is unavailable.`);
  }
  return Object.freeze({
    contextId: selected,
    selectedLabel: labels[selected],
    goalId: goal?.id ?? null,
    goalRevision: goal?.updatedAt ?? null,
    startDate,
    endDate,
    goalScoped: selected !== "all",
    type:
      selected === "all"
        ? "all_history"
        : goal.status === "completed"
          ? "completed_goal"
          : "active_goal",
    dateRangeLabel:
      selected === "all"
        ? "Complete history"
        : `${formatDate(startDate)}–${
            selected === "build-lean-mass" ? "Present" : formatDate(endDate)
          }`,
    options: Object.entries(labels).map(([id, label]) => ({
      id,
      label,
      selected: id === selected,
    })),
    source: selected === "all" ? "canonical_training_history" : "goal_lifecycle",
  });
}

export async function getTrainingTimelineReport({
  context,
  repositories = FounderRepositories,
} = {}) {
  return runRepositoryReadScope({ repositories, readModel: "progress.training-timeline", callback: async () => {
    const timeline = await getTrainingEvidenceContext({ context, repositories });
    const reporting = createProgressReportingService({ repositories });
    const { globalReport, scopedReport } = await reporting.getTrainingReports(
      undefined,
      {
        dateWindow: timeline.goalScoped
          ? { startDate: timeline.startDate, endDate: timeline.endDate }
          : null,
      }
    );

    return {
    timeline,
    report: timeline.goalScoped
      ? {
          ...scopedReport,
          trainingBreakdowns: mergeTrainingBreakdowns({
            globalBreakdowns: globalReport.trainingBreakdowns,
            scopedBreakdowns: scopedReport.trainingBreakdowns,
          }),
          trainingLibrary: globalReport.trainingLibrary,
        }
      : globalReport,
    };
  }});
}

export function mergeTrainingBreakdowns({
  globalBreakdowns = {},
  scopedBreakdowns = {},
}) {
  const scopedRegions = new Map(
    (scopedBreakdowns.resistance ?? []).map((region) => [region.label, region])
  );

  return {
    ...globalBreakdowns,
    cardio: scopedBreakdowns.cardio ?? [],
    resistance: (globalBreakdowns.resistance ?? []).map((region) => {
      const scopedRegion = scopedRegions.get(region.label);
      const scopedFamilies = new Map(
        (scopedRegion?.movementFamilies ?? scopedRegion?.muscleGroups ?? []).map(
          (family) => [family.label, family]
        )
      );
      const familyKey = region.movementFamilies ? "movementFamilies" : "muscleGroups";
      const globalFamilies =
        region.movementFamilies ?? region.muscleGroups ?? [];

      return {
        ...region,
        count: scopedRegion?.count ?? 0,
        [familyKey]: globalFamilies.map((family) => {
          const scopedFamily = scopedFamilies.get(family.label);
          const scopedExercises = new Map(
            (scopedFamily?.exercises ?? []).map((exercise) => [
              exercise.canonicalExerciseId ?? exercise.id ?? exercise.label,
              exercise,
            ])
          );

          return {
            ...family,
            count: scopedFamily?.count ?? 0,
            exercises: (family.exercises ?? []).map((exercise) => {
              const key =
                exercise.canonicalExerciseId ?? exercise.id ?? exercise.label;
              const scopedExercise = scopedExercises.get(key);

              return {
                ...exercise,
                sets: scopedExercise?.sets ?? [],
              };
            }),
          };
        }),
      };
    }),
  };
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function localDate(value, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
