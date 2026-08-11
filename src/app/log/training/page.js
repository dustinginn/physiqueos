import TrainingLogger from "../../../components/training/TrainingLogger";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { listCanonicalTrainingExerciseIdentities } from "../../../domain/models/trainingExerciseIdentity";

export const dynamic = "force-dynamic";

export default async function TrainingLoggerPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const [canonicalObjects, activeGoal] = await Promise.all([
    FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id),
    FounderRepositories.goals.getActiveGoal(user.id),
  ]);
  const initialDate = getLocalDateKey(
    new Date(),
    user.timeZone ?? user.timezone ?? "America/Los_Angeles"
  );
  const confirmedTrainingRecords = canonicalObjects
    .filter((record) =>
      record.evidence_type === "training" &&
      record.quality?.status !== "superseded" &&
      !record.quality?.supersededBy
    );
  const performedExerciseIds = [...new Set(confirmedTrainingRecords
    .flatMap((record) => (record.payload ?? record).exercises ?? [])
    .map((exercise) => exercise.canonicalExerciseId)
    .filter(Boolean))];
  const historySessions = confirmedTrainingRecords
    .map(projectTrainingHistorySession)
    .sort((left, right) => String(right.observed_at).localeCompare(String(left.observed_at)))
    .slice(0, 120);

  return (
    <TrainingLogger
      goalContext={projectGoalContext(activeGoal, initialDate)}
      initialCanonicalExercises={listCanonicalTrainingExerciseIdentities()}
      initialDate={initialDate}
      initialHistorySessions={historySessions}
      initialPerformedExerciseIds={performedExerciseIds}
      production
    />
  );
}

function projectTrainingHistorySession(record) {
  const session = record.payload ?? record;
  return {
    id: session.id ?? record.canonicalId,
    evidence_type: "training",
    observed_at: session.observed_at ?? record.lastObservedAt,
    exercises: (session.exercises ?? []).map((exercise) => ({
      id: exercise.id,
      canonicalExerciseId: exercise.canonicalExerciseId,
      name: exercise.name,
      body_region: exercise.body_region,
      equipment: exercise.equipment,
      ...(exercise.executionVariant ? { executionVariant: exercise.executionVariant } : {}),
      sets: (exercise.sets ?? []).map((set) => ({
        reps: set.reps,
        weight: set.weight ?? set.load,
        weight_unit: set.weight_unit ?? set.unit ?? "lb",
      })),
    })),
    exerciseRelationshipGroups: session.exerciseRelationshipGroups ?? [],
  };
}

function projectGoalContext(goal, date) {
  if (!goal) return null;
  const phases = goal.phasePlan?.phases ?? goal.phases ?? goal.phaseTimeline ?? [];
  const phase = phases.find((candidate) =>
    (!candidate.startDate || candidate.startDate <= date) &&
    (!candidate.endDate || date <= candidate.endDate)
  ) ?? goal.currentPhase ?? null;
  return {
    id: goal.id,
    title: goal.title,
    type: goal.type,
    strategy: goal.strategy?.type ?? goal.strategy ?? null,
    phase: phase ? {
      type: phase.type ?? null,
      label: phase.label ?? phase.name ?? phase.title ?? null,
      name: phase.name ?? null,
    } : null,
  };
}

function getLocalDateKey(value, timeZone = "America/Los_Angeles") {
  const resolvedTimeZone = timeZone || "America/Los_Angeles";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: resolvedTimeZone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
