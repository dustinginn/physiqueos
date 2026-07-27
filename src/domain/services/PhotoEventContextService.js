export async function resolvePhotoEventContext({ repositories, userId, evidenceDate }) {
  const [activeGoal, goals, executionItems, dexaScans] = await Promise.all([
    repositories.goals.getActiveGoal(userId),
    repositories.goals.listGoals(userId),
    repositories.executionItems?.listExecutionItems?.(userId) ?? [],
    repositories.dexaScans?.listDEXAScans?.(userId) ?? [],
  ]);
  const activePhase = activeGoal?.phases?.find((phase) => phase.status === "active") ?? null;
  const completedPriorGoal =
    goals.find((goal) => goal.id === activeGoal?.sourceGoalId && goal.status === "completed") ??
    goals.filter((goal) => goal.status === "completed")
      .sort((a, b) => String(b.completedAt ?? b.updatedAt).localeCompare(String(a.completedAt ?? a.updatedAt)))[0] ??
    null;
  return {
    evidenceDate: dateKey(evidenceDate),
    activeGoal: snapshotGoal(activeGoal),
    activePhase: snapshotPhase(activePhase),
    operatingState: activeGoal?.openingApproach
      ? { value: activeGoal.openingApproach.value ?? null, label: activeGoal.openingApproach.label ?? null }
      : null,
    completedPriorGoal: snapshotGoal(completedPriorGoal),
    latestCompletedDexa: [...dexaScans]
      .filter((scan) => dateKey(scan.measuredAt) <= dateKey(evidenceDate))
      .sort((a, b) => dateKey(b.measuredAt).localeCompare(dateKey(a.measuredAt)))[0] ?? null,
    futureMilestone: resolvePhotoEventFutureMilestone({
      evidenceDate,
      scheduledMeasurements: executionItems,
      completedDexaHistory: dexaScans,
      activeGoal,
    }),
  };
}

export function createPhotoInterpreterGoalContext(context, completionIntent = null) {
  if (completionIntent?.confirmationPurpose === "visible_abs_completion") {
    return "Visible Abs completion evaluation. For Front Relaxed, directly state whether lower abs are visibly present at rest, and identify any pose, abdominal visibility, lighting, framing, editing, or confidence limitation. Rear views cannot confirm completion.";
  }
  if (!context?.activeGoal) {
    return `Current goal context is unavailable. Treat this as neutral physique evidence dated ${context?.evidenceDate ?? "unknown"}; do not assume a cut, lean-gain phase, or visible-abs pursuit.`;
  }
  return [
    `Active primary goal: ${context.activeGoal.title} (${context.activeGoal.id}).`,
    context.activePhase ? `Active phase: ${context.activePhase.name}.` : "Active phase: unavailable.",
    context.operatingState?.value ? `Operating state: ${context.operatingState.value}.` : "Operating state: unavailable.",
    context.completedPriorGoal ? `Completed prior goal: ${context.completedPriorGoal.title}.` : null,
    `Photo evidence date: ${context.evidenceDate}.`,
    "Interpret only supported visual change; do not infer that the prior completed goal remains active.",
  ].filter(Boolean).join(" ");
}

export function resolvePhotoEventFutureMilestone({
  evidenceDate,
  scheduledMeasurements = [],
  completedDexaHistory = [],
  activeGoal = null,
} = {}) {
  const eventDate = dateKey(evidenceDate);
  const completedDates = new Set(completedDexaHistory.map((scan) => dateKey(scan.measuredAt)).filter(Boolean));
  return scheduledMeasurements
    .filter((item) =>
      item.type === "dexa_appointment" &&
      item.active !== false &&
      item.status === "scheduled" &&
      (!item.linkedGoalIds?.length || item.linkedGoalIds.includes(activeGoal?.id))
    )
    .map((item) => ({ item, date: dateKey(item.preferredSchedule?.date) }))
    .filter(({ date }) => date && date > eventDate && !completedDates.has(date))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.item.id).localeCompare(String(b.item.id)))
    .map(({ item, date }) => ({
      id: item.id,
      date,
      label: formatMilestone(item, date),
      source: "execution_item",
    }))[0] ?? null;
}

function snapshotGoal(goal) {
  return goal ? { id: goal.id, title: goal.title, status: goal.status ?? null } : null;
}

function snapshotPhase(phase) {
  return phase ? { id: phase.id, name: phase.name ?? phase.title, status: phase.status } : null;
}

function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function formatMilestone(item, date) {
  const friendlyDate = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
  const time = item.preferredSchedule?.timeOfDay
    ? new Date(`2000-01-01T${item.preferredSchedule.timeOfDay}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;
  return [`DEXA on ${friendlyDate}`, time].filter(Boolean).join(" at ");
}
