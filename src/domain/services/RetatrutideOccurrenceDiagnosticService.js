const RETATRUTIDE_PROTOCOL_ID = "protocol_retatrutide_founder";
const RETATRUTIDE_REMINDER_ID = "reminder_retatrutide";
const RETATRUTIDE_COMMITMENT_ID = "execution_retatrutide";
const BUILD_LEAN_MASS_GOAL_ID =
  "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass";
const BODY_FAT_GUARDRAIL_ID = "goal_maintain_8_9_body_fat";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export function diagnoseRetatrutideOccurrences(store, {
  occurrenceDate = "2026-07-23",
} = {}) {
  const protocol = (store.protocols ?? []).find((item) => item.id === RETATRUTIDE_PROTOCOL_ID);
  const reminder = (store.reminders ?? []).find((item) => item.id === RETATRUTIDE_REMINDER_ID);
  const commitment = (store.executionItems ?? []).find((item) => item.id === RETATRUTIDE_COMMITMENT_ID);
  if (!protocol || !reminder || !commitment) {
    throw new Error("The authoritative Retatrutide protocol graph is incomplete.");
  }
  const effective = resolveDoseForDate(protocol, occurrenceDate);
  const previous = previousDoseStep(protocol, effective);
  const next = nextDoseStep(protocol, effective);
  const doseChangeId = `dose-change-${protocol.id}-${occurrenceDate}`;
  const execution = Object.freeze({
    displayedTitle: "Retatrutide",
    displayedDose: formatDose(protocol.dose),
    priorityId: reminder.id,
    occurrenceId: null,
    sourceProtocolId: protocol.id,
    sourceReminderId: reminder.id,
    sourceCommitmentId: commitment.id,
    sourceScheduleOrTaperStepId: "weekly:thursday:night",
    occurrenceDate,
    occurrenceType: "scheduled_protocol_execution",
    lifecycleStatus: reminder.active ? "open_derived_occurrence" : "inactive",
    active: reminder.active === true && protocol.status === "active",
    completionBearing: true,
    completed: sameDate(reminder.completedAt, occurrenceDate),
    idempotencyKey: null,
    detailRoute: `/priorities/${reminder.id}`,
    detailResolverBranch: "protocol_reminder",
    goalRelationshipSource: "PriorityDetailService operatingPlan.primaryGoalId with hard-coded Visible Abs fallback",
    bodyFatGuardrailRelationship: protocol.relatedGoalIds?.includes(BODY_FAT_GUARDRAIL_ID),
    currentDoseValue: protocol.dose?.value ?? null,
    effectiveDoseValue: effective?.dose ?? null,
    previousDoseValue: previous?.dose ?? null,
    nextPlannedTaperStep: next ?? null,
    persisted: false,
    completionRepositoryTargetId: reminder.id,
  });
  const doseChange = Object.freeze({
    displayedTitle: `${protocol.name} ${effective?.dose} ${effective?.doseUnit}`,
    displayedDose: effective ? `${effective.dose} ${effective.doseUnit}` : null,
    priorityId: doseChangeId,
    occurrenceId: null,
    sourceProtocolId: protocol.id,
    sourceReminderId: null,
    sourceCommitmentId: null,
    sourceScheduleOrTaperStepId: effective?.label ?? null,
    occurrenceDate,
    occurrenceType: "dose_change_notice",
    lifecycleStatus: "open_derived_notice",
    active: protocol.status === "active" && effective?.startDate === occurrenceDate,
    completionBearing: false,
    completed: false,
    idempotencyKey: doseChangeId,
    detailRoute: `/priorities/${doseChangeId}`,
    detailResolverBranch: "fallback_no_persisted_reminder",
    goalRelationshipSource: "PriorityDetailService hard-coded Visible Abs fallback",
    bodyFatGuardrailRelationship: protocol.relatedGoalIds?.includes(BODY_FAT_GUARDRAIL_ID),
    currentDoseValue: effective?.dose ?? null,
    previousDoseValue: previous?.dose ?? null,
    nextPlannedTaperStep: next ?? null,
    persisted: false,
    completionRepositoryTargetId: null,
  });
  return Object.freeze({
    occurrenceDate,
    protocol: Object.freeze({
      id: protocol.id,
      status: protocol.status,
      storedDose: protocol.dose,
      effectiveDose: effective,
      previousDose: previous,
      nextDose: next,
      schedule: protocol.schedule,
      preparation: {
        timingContext: protocol.schedule?.timingContext ?? null,
        persistedInstruction: commitment.notes ?? protocol.notes ?? null,
      },
      effectiveTimestamp: null,
      timezone: reminder.schedule?.timezone ?? store.user?.timezone ?? null,
      exactTimestampResolved: false,
      currentGoalIds: protocol.currentGoalIds ?? [],
      historicalGoalIds: protocol.historicalGoalIds ?? [],
      hasBuildLeanMassRelationship:
        protocol.currentGoalIds?.includes(BUILD_LEAN_MASS_GOAL_ID)
        || protocol.relatedGoalIds?.includes(BUILD_LEAN_MASS_GOAL_ID),
      hasBodyFatGuardrail: protocol.relatedGoalIds?.includes(BODY_FAT_GUARDRAIL_ID),
      hasVisibleAbsHistory:
        protocol.historicalGoalIds?.includes(VISIBLE_ABS_GOAL_ID)
        || protocol.relatedGoalIds?.includes(VISIBLE_ABS_GOAL_ID),
    }),
    tiles: Object.freeze({ execution, doseChange }),
    completion: Object.freeze({
      ownerType: "reminder",
      ownerId: reminder.id,
      commitmentId: commitment.id,
      executionCompletesIntendedHistory: true,
      doseChangeCompletesIntendedHistory: false,
      doseChangeHasCompletionAction: false,
      duplicateCompletionRiskToday: false,
      riskIfFallbackWereMadeCompletable:
        "Completing the notice independently could leave the scheduled reminder open or create two records for one injection.",
    }),
    staleReadModels: Object.freeze({
      storedDoseStaleForDate: protocol.dose?.value !== effective?.dose,
      operatingPlanPrimaryGoalId: store.operatingPlan?.primaryGoalId ?? null,
      protocolCurrentGoalId: protocol.currentGoalIds?.[0] ?? null,
      executionCommitmentGoalIds: commitment.linkedGoalIds ?? [],
      priorityDetailPrimaryGoalStale:
        store.operatingPlan?.primaryGoalId !== protocol.currentGoalIds?.[0],
      genericFallbackReason:
        "The dose-change ID has no persisted reminder, so PriorityDetailService falls through to createFallbackPriorityDetail.",
    }),
  });
}

export function resolveDoseForDate(protocol, date) {
  return [...(protocol.doseHistory ?? [])]
    .filter((entry) => entry.startDate <= date && (!entry.endDate || entry.endDate >= date))
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0] ?? null;
}

function previousDoseStep(protocol, effective) {
  if (!effective) return null;
  return [...(protocol.doseHistory ?? [])]
    .filter((entry) => entry.endDate && entry.endDate < effective.startDate)
    .sort((left, right) => right.endDate.localeCompare(left.endDate))[0] ?? null;
}

function nextDoseStep(protocol, effective) {
  if (!effective) return null;
  return [...(protocol.doseHistory ?? [])]
    .filter((entry) => entry.startDate > effective.startDate)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0] ?? null;
}

function formatDose(dose) {
  return dose?.value != null && dose?.unit ? `${dose.value} ${dose.unit}` : null;
}

function sameDate(value, date) {
  if (!value) return false;
  return String(value).slice(0, 10) === date;
}
