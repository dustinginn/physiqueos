import {
  DEFAULT_LOCAL_TIME_ZONE,
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../utils/localDate";
import { resolveExecutionPhase } from "./ExecutionPhaseResolver";

export const ExecutionPriorityOperationalState = Object.freeze({
  ACTIONABLE: "actionable",
  INACTIVE: "inactive",
  MISSING_EXECUTION: "missing_execution",
  NOT_SCHEDULED_TODAY: "not_scheduled_today",
  SETUP_REQUIRED: "setup_required",
});

export const ExecutionPriorityOperationalReason = Object.freeze({
  ACTIVE_PHASE: "active_phase",
  EXECUTION_INACTIVE: "execution_inactive",
  MISSING_ACTIVE_PHASE: "missing_active_phase",
  MISSING_EXECUTION: "missing_execution",
  MISSING_HISTORY_ANCHOR: "missing_history_anchor",
  NOT_SCHEDULED_TODAY: "not_scheduled_today",
});

export function findExecutionForProtocol(executionItems = [], protocolId) {
  const matches = executionItems.filter(
    (item) =>
      item?.protocolRootId === protocolId &&
      ["peptide", "supplement"].includes(item.type)
  );

  return {
    executionItem: matches.length === 1 ? matches[0] : null,
    matchCount: matches.length,
    reason:
      matches.length > 1
        ? "ambiguous_execution"
        : matches.length === 0
          ? "missing_execution"
          : null,
  };
}

export function projectExecutionPriority({
  executionItem = null,
  localDate,
  now = new Date(),
  protocol = null,
  reminder = null,
  timeZone = DEFAULT_LOCAL_TIME_ZONE,
} = {}) {
  const resolvedTimeZone = resolveLocalTimeZone(timeZone);
  const resolvedLocalDate =
    localDate || getLocalDateKey(now, resolvedTimeZone);
  const protocolRootId =
    executionItem?.protocolRootId ??
    protocol?.id ??
    reminder?.linkedEntityId ??
    null;
  const title =
    executionItem?.title ?? protocol?.name ?? reminder?.title ?? "Execution";
  const historyAnchorId = reminder?.id ?? null;
  const priorityId =
    historyAnchorId ??
    (executionItem?.id
      ? `execution-priority-${executionItem.id}-${resolvedLocalDate}`
      : `execution-setup-${protocolRootId ?? "unknown"}-${resolvedLocalDate}`);
  const executionHref = getExecutionHref(
    executionItem?.type ?? protocol?.category,
    protocolRootId,
    executionItem?.id
  );

  if (!executionItem) {
    const occurrenceEligible =
      reminder?.active !== false &&
      scheduleAppliesOnDate(reminder?.schedule, resolvedLocalDate);

    return createProjection({
      executionItem,
      executionHref,
      historyAnchorId,
      localDate: resolvedLocalDate,
      occurrenceEligible,
      operationalReason: ExecutionPriorityOperationalReason.MISSING_EXECUTION,
      operationalState: ExecutionPriorityOperationalState.MISSING_EXECUTION,
      priorityId,
      protocolRootId,
      reminder,
      schedule: null,
      timeZone: resolvedTimeZone,
      title,
    });
  }

  const schedule = executionItem.preferredSchedule ?? null;
  const occurrenceEligible = scheduleAppliesOnDate(
    schedule,
    resolvedLocalDate,
    executionItem.cadence
  );

  if (executionItem.active === false) {
    return createProjection({
      executionItem,
      executionHref,
      historyAnchorId,
      localDate: resolvedLocalDate,
      occurrenceEligible: false,
      operationalReason: ExecutionPriorityOperationalReason.EXECUTION_INACTIVE,
      operationalState: ExecutionPriorityOperationalState.INACTIVE,
      priorityId,
      protocolRootId,
      reminder,
      schedule,
      timeZone: resolvedTimeZone,
      title,
    });
  }

  if (!occurrenceEligible) {
    return createProjection({
      executionItem,
      executionHref,
      historyAnchorId,
      localDate: resolvedLocalDate,
      occurrenceEligible: false,
      operationalReason:
        ExecutionPriorityOperationalReason.NOT_SCHEDULED_TODAY,
      operationalState:
        ExecutionPriorityOperationalState.NOT_SCHEDULED_TODAY,
      priorityId,
      protocolRootId,
      reminder,
      schedule,
      timeZone: resolvedTimeZone,
      title,
    });
  }

  const phaseResolution = resolveExecutionPhase(
    executionItem,
    resolvedLocalDate
  );
  const phaseDose = normalizeDose(phaseResolution.current?.dose);
  const directDose = normalizeDose(executionItem.dose);
  const currentDose = phaseDose ?? directDose;
  const requiresActivePhase = executionItem.type === "peptide";
  const missingRequiredPhase = requiresActivePhase && !phaseResolution.current;
  const missingHistoryAnchor = !historyAnchorId;
  const setupRequired = missingRequiredPhase || missingHistoryAnchor;

  return createProjection({
    activePhase: phaseResolution.current,
    currentDose,
    executionItem,
    executionHref,
    historyAnchorId,
    localDate: resolvedLocalDate,
    nextPhase: phaseResolution.next,
    occurrenceEligible: true,
    operationalReason: missingRequiredPhase
      ? ExecutionPriorityOperationalReason.MISSING_ACTIVE_PHASE
      : missingHistoryAnchor
        ? ExecutionPriorityOperationalReason.MISSING_HISTORY_ANCHOR
        : ExecutionPriorityOperationalReason.ACTIVE_PHASE,
    operationalState: setupRequired
      ? ExecutionPriorityOperationalState.SETUP_REQUIRED
      : ExecutionPriorityOperationalState.ACTIONABLE,
    priorityId,
    protocolRootId,
    reminder,
    schedule,
    timeZone: resolvedTimeZone,
    title,
    transitionEffectiveToday:
      phaseResolution.current?.startDate === resolvedLocalDate,
  });
}

export function scheduleAppliesOnDate(
  schedule,
  localDate,
  cadence = null
) {
  if (!schedule || !localDate) return false;
  if (schedule.startDate && localDate < schedule.startDate) return false;
  if (schedule.endDate && localDate > schedule.endDate) return false;

  const cadenceType = cadence?.type ?? schedule.type ?? schedule.cadence;
  if (cadenceType === "every_x_days") {
    const anchor = schedule.anchorDate ?? schedule.startDate;
    const interval = Number(cadence?.interval ?? schedule.intervalDays ?? schedule.interval ?? 1);
    if (!anchor || !Number.isInteger(interval) || interval < 1) return false;
    const elapsed = Math.round(
      (Date.parse(`${localDate}T12:00:00Z`) -
        Date.parse(`${anchor}T12:00:00Z`)) /
        86400000
    );
    return elapsed >= 0 && elapsed % interval === 0;
  }
  const days = [
    ...new Set(
      schedule.daysOfWeek ??
        (schedule.dayOfWeek ? [schedule.dayOfWeek] : [])
    ),
  ];
  if (cadenceType === "daily" && days.length === 0) return true;
  if (days.length === 0) return false;

  return days.includes(getWeekday(localDate));
}

export function formatExecutionDose(dose) {
  if (!dose?.amount || !dose?.unit) return null;
  const amount = String(dose.amount).replace(/^(-?)\./, "$10.");
  return `${amount} ${dose.unit}`;
}

export function formatExecutionSchedule(schedule) {
  if (!schedule) return "Execution setup required";
  const days = schedule.cadence === "daily" || schedule.type === "daily"
    ? "Daily"
    : schedule.cadence === "every_x_days" || schedule.type === "every_x_days"
      ? `Every ${schedule.interval ?? schedule.intervalDays ?? 1} days`
      : formatDays(schedule.daysOfWeek);
  const exactTime = formatExactTime(schedule.timeOfDay);

  return [days, exactTime].filter(Boolean).join(" · ") || "Schedule pending";
}

function createProjection({
  activePhase = null,
  currentDose = null,
  executionItem,
  executionHref,
  historyAnchorId,
  localDate,
  nextPhase = null,
  occurrenceEligible,
  operationalReason,
  operationalState,
  priorityId,
  protocolRootId,
  reminder,
  schedule,
  timeZone,
  title,
  transitionEffectiveToday = false,
}) {
  return {
    executionId: executionItem?.id ?? null,
    protocolRootId,
    priorityId,
    historyAnchorId,
    title,
    executionStatus: executionItem
      ? executionItem.active === false
        ? "inactive"
        : "active"
      : "missing",
    occurrenceEligible,
    scheduleWeekdays: schedule?.daysOfWeek ?? [],
    exactLocalTime: schedule?.timeOfDay ?? null,
    timeOfDayLabel: formatTimeOfDayLabel(schedule?.timeOfDay),
    timingContext: executionItem?.timingContext ?? null,
    activePhase,
    currentDose: currentDose?.amount ?? null,
    doseUnit: currentDose?.unit ?? null,
    nextPhase,
    transitionEffectiveToday,
    operationalState,
    operationalReason,
    localDate,
    timeZone,
    executionHref,
    completable:
      operationalState === ExecutionPriorityOperationalState.ACTIONABLE &&
      Boolean(historyAnchorId),
    provenance: {
      priorityIdentity: historyAnchorId ? "reminder" : "execution",
      historyAnchor: historyAnchorId ? "reminder" : null,
      title: executionItem ? "execution" : protocolRootId ? "protocol" : "reminder",
      executionStatus: executionItem ? "execution" : null,
      occurrenceEligibility: executionItem ? "execution" : "reminder",
      schedule: executionItem ? "execution" : null,
      exactLocalTime: executionItem ? "execution" : null,
      timingContext: executionItem ? "execution" : null,
      activePhase: executionItem ? "execution" : null,
      currentDose: executionItem ? "execution" : null,
      nextPhase: executionItem ? "execution" : null,
    },
    reminderActive: reminder?.active ?? null,
  };
}

function normalizeDose(dose) {
  if (!dose?.amount || !dose?.unit) return null;

  return {
    amount: String(dose.amount),
    unit: String(dose.unit),
  };
}

function getExecutionHref(type, protocolRootId, executionId) {
  if (type === "peptide" && protocolRootId) {
    return `/profile/operating-plan/execution/peptides/${encodeURIComponent(protocolRootId)}`;
  }
  if (type === "supplement" && protocolRootId) {
    return `/profile/operating-plan/execution/supplements/${encodeURIComponent(protocolRootId)}`;
  }
  if (executionId) {
    return `/profile/operating-plan/execution/${encodeURIComponent(executionId)}`;
  }

  return "/profile/operating-plan";
}

function getWeekday(localDate) {
  const names = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return names[new Date(`${localDate}T12:00:00Z`).getUTCDay()];
}

function formatTimeOfDayLabel(value) {
  if (!value) return "Today";
  if (["evening", "night", "before_bed"].includes(value)) return "Tonight";
  if (value === "morning") return "Morning";
  if (value === "afternoon") return "Afternoon";
  if (/^\d{2}:\d{2}$/.test(value)) {
    const hour = Number(value.slice(0, 2));
    if (hour >= 17) return "Tonight";
    if (hour >= 12) return "Afternoon";
    return "Morning";
  }

  return "Today";
}

function formatExactTime(value) {
  if (!value) return null;
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";

  return `${hour % 12 || 12}:${minuteText} ${suffix}`;
}

function formatDays(days = []) {
  const labels = {
    sunday: "Sun",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
  };
  const formatted = days.map((day) => labels[day]).filter(Boolean);

  return formatted.join(",") === "Sun,Mon,Tue,Wed,Thu"
    ? "Sun–Thu"
    : formatted.join(", ");
}
