import { normalizeProgressPhotoCategory } from "../models/progressPhotoPoseVocabulary";
import {
  DEFAULT_LOCAL_TIME_ZONE,
  getLocalDateKey,
  getPreviousLocalDayWindow,
} from "../utils/localDate";
import { normalizeProtocolRecurrence } from "./ProtocolRecurrenceNormalizationService";
import { isProtocolDateOnCycle } from "./ProtocolOccurrenceResolver";
import {
  ExecutionPriorityOperationalReason,
  ExecutionPriorityOperationalState,
  findExecutionForProtocol,
  formatExecutionDose,
  formatExecutionSchedule,
  projectExecutionPriority,
} from "./ExecutionPriorityProjectionService";
import {
  DexaPriorityStage,
  projectDexaAppointmentPriority,
} from "./DexaAppointmentLifecycleService";
import {
  isMorningWeighInDue,
  isMorningWeighInSatisfied,
  MORNING_WEIGH_IN_REMINDER_ID,
  resolveMorningWeighInSupport,
} from "./TrackingSupportService";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MORNING_RECONCILIATION_REMINDER_TYPES = new Set([
  "evidence_reminder",
  "protocol",
  "protocol_reminder",
  "recovery_reminder",
  "supplement_reminder",
  "progress_photo",
  "dexa",
  "morning_weigh_in",
  "other",
]);

const TERMINAL_PRIORITY_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  "dismissed",
  "moved",
  "rescheduled",
  "resolved",
  "skipped",
  "superseded",
]);

const TERMINAL_RECONCILIATION_STATUSES = new Set([
  "completed",
  "dismissed",
  "moved",
  "note",
  "rescheduled",
  "skipped",
]);

export function createDailyFocusService() {
  return {
    getDailyFocus({
      checkIns = [],
      latestWeight = null,
      weightEntries = [],
      protocols = [],
      executionItems = [],
      progressPhotos = [],
      reminders = [],
      now = new Date(),
      timeZone = DEFAULT_LOCAL_TIME_ZONE,
    } = {}) {
      const today = getLocalDateKey(now, timeZone);
      const dayName = getDayName(today);
      const todaysCheckIn = checkIns.find((checkIn) => checkIn.date === today);
      const executionProtocolItems = getExecutionBackedProtocolItems({
        dayName,
        executionItems,
        now,
        protocols,
        reminders,
        timeZone,
        today,
      });
      const executionBackedProtocolIds = new Set(
        protocols
          .filter((item) => ["peptide", "recovery", "supplement"].includes(item.category))
          .map((item) => item.id)
          .filter(Boolean)
      );
      const executionBackedReminderIds = new Set(
        reminders
          .filter(
            (reminder) =>
              executionBackedProtocolIds.has(reminder.linkedEntityId) &&
              isExecutionBackedReminder(reminder)
          )
          .map((reminder) => reminder.id)
      );
      const doseChangeItem = getLegacyReminderOnlyDoseChangeItem({
        excludedProtocolIds: executionBackedProtocolIds,
        protocols,
        today,
        now,
      });
      const morningWeightItem = getMorningWeightItem({
        checkIns,
        executionItems,
        latestWeight,
        now,
        protocols,
        reminders,
        timeZone,
        today,
        weightEntries,
      });
      const highPriorityItems = [
        morningWeightItem,
        ...getDexaAppointmentItems({ executionItems, now, timeZone }),
        ...getProgressPhotoItems({ progressPhotos, reminders, today, dayName, now }),
        doseChangeItem,
        ...executionProtocolItems,
        ...getPersistentReminderItems({
          reminders,
          today,
          dayName,
          excludedReminderIds: new Set([
            ...executionBackedReminderIds,
            ...(morningWeightItem ? [MORNING_WEIGH_IN_REMINDER_ID] : []),
          ]),
        }),
      ].filter(Boolean);
      const sessions = getDailySessionsFromItems(highPriorityItems);
      const sessionItemIds = new Set(
        sessions.flatMap((session) => session.items.map((item) => item.id))
      );
      const sessionPriorities = sessions
        .filter((session) => session.pendingCount > 0 || session.items.some((item) => item.satisfiedByEvidence))
        .map(mapSessionToPriority);
      const primaryItems = highPriorityItems.filter(
        (item) => !item.completed && !sessionItemIds.has(item.id)
      );
      const fallbackItems = shouldSurfaceFallbackHabits({
        checkIns,
        latestWeight,
        weightEntries,
        today,
        now,
      })
        ? [
            getProteinItem({ todaysCheckIn }),
            getActivityItem({ todaysCheckIn }),
            getSleepItem({ todaysCheckIn }),
          ]
        : [];
      const candidates = [...sessionPriorities, ...primaryItems, ...fallbackItems].filter(Boolean);

      return candidates
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 4)
        .map(({ priority, ...item }) => item);
    },
    getDailySessions({
      checkIns = [],
      executionItems = [],
      latestWeight = null,
      now = new Date(),
      progressPhotos = [],
      protocols = [],
      reminders = [],
      timeZone = DEFAULT_LOCAL_TIME_ZONE,
      weightEntries = [],
    } = {}) {
      const today = getLocalDateKey(now, timeZone);
      const dayName = getDayName(today);
      const todaysCheckIn = checkIns.find((checkIn) => checkIn.date === today);
      const items = [
        getMorningWeightItem({ checkIns, executionItems, latestWeight, now, protocols, reminders, timeZone, today, weightEntries }),
        ...getProgressPhotoItems({ progressPhotos, reminders, today, dayName, now }),
      ].filter(Boolean);

      return getDailySessionsFromItems(items);
    },
    getReconciliationItems({
      checkIns = [],
      dexaScans = [],
      now = new Date(),
      progressPhotos = [],
      reminders = [],
      weightEntries = [],
    } = {}) {
      return reminders
        .filter((reminder) => isRecurringReminder(reminder))
        .map((reminder) => {
          if (
            reminder.linkedEvidenceType === "progress_photo" &&
            getSessionTimeBlock(reminder.schedule?.timeOfDay) !== "morning"
          ) {
            return null;
          }

          const occurrence = getMostRecentUnknownOccurrence({
            checkIns,
            dexaScans,
            now,
            progressPhotos,
            reminder,
            weightEntries,
          });

          if (!occurrence) return null;

          return {
            id: reminder.id,
            title: reminder.title,
            date: occurrence.date,
            dateLabel: occurrence.label,
            type: reminder.type,
            linkedEvidenceType: reminder.linkedEvidenceType,
          };
        })
        .filter(Boolean);
    },
    getPreviousDayIncompletePriorityItems(options = {}) {
      return getPreviousDayIncompletePrioritySelection(options).items;
    },
    getPreviousDayIncompletePrioritySelection(options = {}) {
      return getPreviousDayIncompletePrioritySelection(options);
    },
  };
}

export const DailyFocusService = createDailyFocusService();

export function getPreviousDayIncompletePriorityItems(options = {}) {
  return getPreviousDayIncompletePrioritySelection(options).items;
}

export function getPreviousDayIncompletePrioritySelection({
  checkIns = [],
  dexaScans = [],
  now = new Date(),
  progressPhotos = [],
  reminders = [],
  timeZone = DEFAULT_LOCAL_TIME_ZONE,
  weightEntries = [],
} = {}) {
  const window = getPreviousLocalDayWindow({ now, timeZone });
  const dayName = getDayName(window.previousLocalDate);
  const exclusions = [];
  const items = [];

  for (const reminder of reminders) {
    const exclusionReason = getPreviousDayPriorityExclusionReason({
      checkIns,
      date: window.previousLocalDate,
      dayName,
      dexaScans,
      progressPhotos,
      reminder,
      timeZone: window.timeZone,
      weightEntries,
    });

    if (exclusionReason) {
      exclusions.push({
        priorityId: reminder?.id ?? null,
        reason: exclusionReason,
      });
      continue;
    }

    items.push({
      id: reminder.id,
      occurrenceKey: createPriorityOccurrenceKey(
        reminder.id,
        window.previousLocalDate
      ),
      occurrenceDate: window.previousLocalDate,
      date: window.previousLocalDate,
      dateLabel: "Yesterday",
      title: String(reminder.title).trim(),
      type: reminder.type,
      linkedEvidenceType: reminder.linkedEvidenceType ?? null,
      context: formatReminderMetadata(reminder),
    });
  }

  return Object.freeze({
    window,
    items: Object.freeze(items),
    diagnostics: Object.freeze({
      checkInLocalDate: window.currentLocalDate,
      previousLocalDate: window.previousLocalDate,
      timeZone: window.timeZone,
      inputPriorityCount: reminders.length,
      eligiblePriorityCount: items.length,
      promptPriorityIds: Object.freeze(items.map((item) => item.id)),
      exclusions: Object.freeze(exclusions),
      existingReconciliationKeys: Object.freeze(
        getReconciliationsForDate(checkIns, window.previousLocalDate)
          .map((item) =>
            createPriorityOccurrenceKey(
              item.reminderId,
              item.occurrenceDate ?? window.previousLocalDate
            )
          )
      ),
    }),
  });
}

export function createPriorityOccurrenceKey(priorityId, occurrenceDate) {
  return `${String(priorityId ?? "").trim()}:${String(occurrenceDate ?? "").trim()}`;
}

function getPreviousDayPriorityExclusionReason({
  checkIns,
  date,
  dayName,
  dexaScans,
  progressPhotos,
  reminder,
  timeZone,
  weightEntries,
}) {
  if (!isUserFacingMorningReconciliationReminder(reminder)) {
    return "not_user_facing";
  }
  if (!isPriorityRecordOpen(reminder)) return "priority_resolved";
  if (!reminderAppliesToday(reminder, dayName, date)) {
    return "not_scheduled_previous_day";
  }
  if (hasTerminalReconciliation(checkIns, date, reminder.id)) {
    return "dated_reconciliation";
  }
  if (hasDatedReminderCompletion(reminder, date, timeZone)) {
    return "dated_completion";
  }
  if (
    hasEvidenceForReminderOccurrence({
      checkIns,
      date,
      dexaScans,
      progressPhotos,
      reminder,
      timeZone,
      weightEntries,
    })
  ) {
    return "completion_evidence";
  }

  return null;
}

function isUserFacingMorningReconciliationReminder(reminder) {
  if (!reminder?.id || !String(reminder.title ?? "").trim()) return false;
  if (String(reminder.id).includes("_reminder_intent")) return false;
  if (!MORNING_RECONCILIATION_REMINDER_TYPES.has(reminder.type)) return false;
  if (
    reminder.internal === true ||
    reminder.internalOnly === true ||
    reminder.userFacing === false ||
    reminder.visibility === "internal"
  ) {
    return false;
  }

  return true;
}

function isPriorityRecordOpen(reminder) {
  if (reminder.active === false) return false;
  if (
    reminder.archived === true ||
    reminder.archivedAt ||
    reminder.cancelledAt ||
    reminder.dismissedAt ||
    reminder.supersededAt ||
    reminder.supersededBy
  ) {
    return false;
  }

  return !TERMINAL_PRIORITY_STATUSES.has(
    String(reminder.status ?? reminder.resolution ?? "").toLowerCase()
  );
}

function hasTerminalReconciliation(checkIns, date, reminderId) {
  return getReconciliationsForDate(checkIns, date).some(
    (item) =>
      item.reminderId === reminderId &&
      TERMINAL_RECONCILIATION_STATUSES.has(String(item.status ?? "").toLowerCase())
  );
}

function getReconciliationsForDate(checkIns, date) {
  const checkIn = checkIns.find((item) => item.date === date);
  return Array.isArray(checkIn?.reconciliation) ? checkIn.reconciliation : [];
}

function hasDatedReminderCompletion(reminder, date, timeZone) {
  if (getLocalDateKey(reminder.completedAt, timeZone) === date) return true;

  const history = Array.isArray(reminder.completionHistory)
    ? reminder.completionHistory
    : reminder.completionHistory
      ? [reminder.completionHistory]
      : [];

  return history.some((entry) => {
    const explicitDate =
      entry.occurrenceDate ??
      entry.occurrence_date ??
      entry.evidenceDate ??
      entry.evidence_date;
    if (explicitDate) return String(explicitDate).slice(0, 10) === date;
    return getLocalDateKey(entry.completedAt, timeZone) === date;
  });
}

function getDayName(dateKey) {
  const index = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return DAY_NAMES[index];
}

function getPersistentReminderItems({
  reminders,
  today,
  dayName,
  excludedReminderIds = new Set(),
}) {
  return reminders
    .filter(
      (reminder) =>
        !excludedReminderIds.has(reminder.id) &&
        reminder.persistenceMode === "always_visible" &&
        reminder.active &&
        reminderAppliesToday(reminder, dayName, today)
    )
    .map((reminder) => {
      const completed = isSameLocalDate(reminder.completedAt, today);
      const state = getPriorityState(reminder.schedule?.timeOfDay);

      if (completed) return null;

      return {
        id: reminder.id,
        label: reminder.title,
        subtitle: state.label,
        metadata: formatReminderMetadata(reminder),
        href: `/priorities/${reminder.id}`,
        icon: getReminderIcon(reminder),
        color: getReminderColor(reminder),
        completed,
        completable: true,
        completionId: reminder.id,
        state: state.name,
        priority: state.priorityOffset + 18,
      };
    })
    .filter(Boolean);
}

function getMorningWeightItem({ checkIns, executionItems, latestWeight, now, protocols, reminders, timeZone, today, weightEntries }) {
  const support = resolveMorningWeighInSupport({ executionItems, protocols, reminders });
  if (!support) {
    const legacyReminder = reminders.find((item) => item.id === MORNING_WEIGH_IN_REMINDER_ID);
    if (legacyReminder?.active === false) return null;
    const todaysCheckIn = checkIns.find((item) => item.date === today);
    return getLegacyMorningWeightItem({ latestWeight, todaysCheckIn, today, now, timeZone });
  }
  if (!support.reminder.active || !isMorningWeighInDue(support.supportSchedule, today)) return null;
  const completed = isMorningWeighInSatisfied({
    checkIns,
    latestWeight,
    localDate: today,
    reminder: support.reminder,
    timeZone,
    weightEntries,
  });
  const timing = support.executionItem.preferredSchedule?.timeOfDay;
  const state = getPriorityState(timing, now, timeZone);
  return {
    id: support.reminder.id,
    label: "Morning Weigh-In",
    subtitle: state.label,
    metadata: support.supportSummary,
    href: completed ? `/priorities/${support.reminder.id}` : "/check-in/morning",
    icon: "scale",
    color: "evidence",
    completed,
    satisfiedByEvidence: completed,
    completable: false,
    session: getSessionTimeBlock(timing),
    state: state.name,
    priority: state.priorityOffset + 10,
  };
}

function getLegacyMorningWeightItem({ latestWeight, todaysCheckIn, today, now, timeZone }) {
  const completed = Boolean(todaysCheckIn?.weightEntryId) || isSameLocalDate(latestWeight?.measuredAt, today);
  const state = getPriorityState("morning", now, timeZone);
  return {
    id: "verified-weight", label: "Morning Weight", subtitle: state.label, metadata: "Fasted",
    href: "/check-in/morning", icon: "scale", color: "evidence", completed,
    session: "morning", state: state.name, priority: state.priorityOffset + 10,
  };
}

function getDexaAppointmentItems({ executionItems, now, timeZone }) {
  const appointment = executionItems.find((item) => item.id === "execution_next_dexa");
  const projection = projectDexaAppointmentPriority({
    appointment,
    now,
    timeZone: appointment?.timezone ?? timeZone,
  });
  if (!projection) return [];
  const upload = projection.stage === DexaPriorityStage.UPLOAD_RESULTS;

  return [{
    id: projection.priorityId,
    label: projection.label,
    subtitle: projection.subtitle,
    metadata: projection.metadata,
    href: projection.href,
    icon: "target",
    color: upload ? "warning" : "evidence",
    completed: false,
    completable: false,
    executionId: appointment.id,
    occurrenceDate: projection.scheduledDate,
    state: upload ? "overdue" : "upcoming",
    priority: projection.priority,
    changeLabel: upload ? "Results needed" : null,
    alwaysShowMetadata: true,
    dexaProjection: projection,
  }];
}

function getProgressPhotoItems({ progressPhotos, reminders, today, dayName, now }) {
  const photoReminders = reminders.filter(
    (item) =>
      item.linkedEvidenceType === "progress_photo" &&
      item.active &&
      isProgressPhotoReminder(item) &&
      reminderAppliesToday(item, dayName, today)
  );

  if (photoReminders.length === 0) return [];

  const todaysPhotos = getProgressPhotoCompletionRecords(progressPhotos).filter(
    (photo) => photo.date === today
  );

  return photoReminders.map((reminder) => {
    const expectedViews = reminder.expectedViews ?? [];
    const primaryExpectedView = expectedViews[0] ?? "";
    const defaultView = primaryExpectedView.split("-")[0] || "front";
    const timeBlock = getSessionTimeBlock(reminder.schedule?.timeOfDay);
    const completedCategoryIds = new Set(
      todaysPhotos
        .map(getProgressPhotoCompletionCategoryId)
        .filter((categoryId) => categoryId !== "unknown")
    );
    const normalizedExpectedViews = expectedViews.map(
      normalizeExpectedProgressPhotoCategoryId
    );
    const completedViewCount = normalizedExpectedViews.filter((expectedView) =>
      completedCategoryIds.has(expectedView)
    ).length;
    const evidenceSatisfied = (reminder.completionHistory ?? []).some((entry) =>
      entry.satisfactionType === "progress_photo_session_confirmed" && entry.evidenceDate === today
    );
    const completed =
      evidenceSatisfied ||
      normalizedExpectedViews.length > 0 &&
      normalizedExpectedViews.every((expectedView) =>
        completedCategoryIds.has(expectedView)
      );
    const state = getPriorityState(reminder.schedule?.timeOfDay, now);

    return {
      id: reminder.id,
      label: reminder.title,
      subtitle: state.label,
      metadata: evidenceSatisfied ? "1/1 complete" : formatProgressPhotoSetMetadata({
        completedViewCount,
        expectedViews,
      }),
      href: `/evidence/photos?session=${timeBlock}&view=${defaultView}`,
      icon: "camera",
      color: "evidence",
      completed,
      satisfiedByEvidence: evidenceSatisfied,
      session: timeBlock,
      state: state.name,
      priority: state.priorityOffset + 12,
    };
  });
}

function isProgressPhotoReminder(reminder = {}) {
  return (
    reminder.linkedEvidenceType === "progress_photo" &&
    (/progress photo/i.test(reminder.title ?? "") ||
      reminder.linkedEntityType === "progress_photo_set" ||
      (reminder.expectedViews ?? []).length > 0)
  );
}

function getDailySessionsFromItems(items) {
  const groups = items
    .filter((item) => item.session)
    .reduce((accumulator, item) => {
      const session = item.session;
      return {
        ...accumulator,
        [session]: [...(accumulator[session] ?? []), item],
      };
    }, {});

  return Object.entries(groups).map(([timeBlock, sessionItems]) => {
    const completedCount = sessionItems.filter((item) => item.completed).length;
    const pendingCount = sessionItems.length - completedCount;
    const pendingItems = sessionItems.filter((item) => !item.completed);
    const dedicatedWeight = pendingItems.length === 1 && ["verified-weight", MORNING_WEIGH_IN_REMINDER_ID].includes(pendingItems[0].id) ? pendingItems[0] : null;

    return {
      id: `${timeBlock}-check-in`,
      label: `${formatSessionLabel(timeBlock)} Check-in`,
      subtitle: `Complete today's scheduled ${formatSessionLabel(timeBlock).toLowerCase()} evidence.`,
      metadata: `${completedCount}/${sessionItems.length} complete`,
      href: dedicatedWeight?.href ?? `/log?session=${timeBlock}`,
      icon: "target",
      color: "primary",
      completed: pendingCount === 0,
      pendingCount,
      completedCount,
      totalCount: sessionItems.length,
      timeBlock,
      items: sessionItems,
      priority: Math.min(...sessionItems.map((item) => item.priority)),
    };
  });
}

function mapSessionToPriority(session) {
  return {
    id: session.id,
    label: session.label,
    subtitle: session.subtitle,
    metadata: session.metadata,
    href: session.href,
    icon: session.icon,
    color: session.color,
    completed: session.completed,
    sessionItems: session.items.map((item) => ({
      completed: item.completed,
      id: item.id,
      label: item.label,
      satisfiedByEvidence: item.satisfiedByEvidence,
    })),
    priority: session.priority,
  };
}

function getExecutionBackedProtocolItems({
  executionItems,
  now,
  protocols,
  reminders,
  timeZone,
  today,
}) {
  const executionBackedProtocols = protocols.filter((protocol) =>
    ["peptide", "recovery", "supplement"].includes(protocol.category)
  );
  const protocolById = new Map(
    executionBackedProtocols.map((protocol) => [protocol.id, protocol])
  );
  const remindersByProtocol = new Map();
  const reminderDisabledProtocolIds = new Set(
    reminders
      .filter(
        (reminder) =>
          isExecutionBackedReminder(reminder) &&
          reminder.active === false &&
          protocolById.has(reminder.linkedEntityId)
      )
      .map((reminder) => reminder.linkedEntityId)
  );

  reminders
    .filter(
      (reminder) =>
        isExecutionBackedReminder(reminder) &&
        reminder.active &&
        protocolById.has(reminder.linkedEntityId)
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((reminder) => {
      const anchors = remindersByProtocol.get(reminder.linkedEntityId) ?? [];
      anchors.push(reminder);
      remindersByProtocol.set(reminder.linkedEntityId, anchors);
    });

  const candidateProtocolIds = new Set(remindersByProtocol.keys());
  executionItems
    .filter(
      (item) =>
        item.type === "peptide" &&
        item.protocolRootId &&
        !reminderDisabledProtocolIds.has(item.protocolRootId) &&
        protocolById.has(item.protocolRootId)
    )
    .forEach((item) => candidateProtocolIds.add(item.protocolRootId));

  return [...candidateProtocolIds]
    .map((protocolId, index) => {
      const protocol = protocolById.get(protocolId);
      const reminder = remindersByProtocol.get(protocolId)?.[0] ?? null;
      const match = findExecutionForProtocol(executionItems, protocolId);
      if (match.executionItem?.reminderPreference === "none") return null;
      const projection = projectExecutionPriority({
        executionItem: match.executionItem,
        localDate: today,
        now,
        protocol,
        reminder,
        timeZone,
      });

      if (!projection.occurrenceEligible) return null;
      if (
        projection.operationalState ===
          ExecutionPriorityOperationalState.INACTIVE ||
        projection.operationalState ===
          ExecutionPriorityOperationalState.NOT_SCHEDULED_TODAY
      ) {
        return null;
      }
      if (
        reminder?.completedAt &&
        getLocalDateKey(reminder.completedAt, timeZone) === today
      ) {
        return null;
      }

      const setupRequired =
        projection.operationalState !==
        ExecutionPriorityOperationalState.ACTIONABLE;
      const doseText = formatExecutionDose({
        amount: projection.currentDose,
        unit: projection.doseUnit,
      });
      const state = getPriorityState(
        projection.exactLocalTime,
        now,
        timeZone
      );
      const transitionLabel = getCanonicalTransitionLabel(
        projection.activePhase,
        projection.transitionEffectiveToday
      );
      const setupCopy = getExecutionSetupCopy(projection.operationalReason);
      const recoverySupport = protocol.category === "recovery";
      const supplementSupport = protocol.category === "supplement";

      return {
        id: projection.priorityId,
        label: projection.title,
        subtitle:
          state.name === "overdue"
            ? "Overdue"
            : projection.timeOfDayLabel,
        metadata: setupRequired
          ? setupCopy.metadata
          : doseText
            ? formatDoseAction(doseText, projection.timeOfDayLabel)
            : (() => {
                const supportExecution = executionItems.find(
                  (item) => item.id === projection.executionId
                );
                return formatExecutionSchedule({
                  ...supportExecution?.preferredSchedule,
                  cadence: supportExecution?.cadence?.type,
                  interval: supportExecution?.cadence?.interval,
                });
              })(),
        href: setupRequired
          ? projection.executionHref
          : `/priorities/${projection.historyAnchorId}`,
        icon: recoverySupport ? "activity" : supplementSupport ? "utensils" : "syringe",
        color: setupRequired ? "warning" : recoverySupport ? "success" : "effort",
        completed: false,
        completable: projection.completable,
        completionId: projection.historyAnchorId,
        protocolId,
        executionId: projection.executionId,
        occurrenceDate: today,
        exactLocalTime: projection.exactLocalTime,
        executionProjection: projection,
        completionContext: projection.completable
          ? {
              occurrenceDate: today,
              dose: doseText,
              protocolId,
            }
          : null,
        state: state.name,
        priority: state.priorityOffset + (recoverySupport ? 18 : 22) + index,
        changeLabel: setupRequired
          ? setupCopy.label
          : transitionLabel,
        actionLabel: setupRequired
          ? recoverySupport || supplementSupport ? "Review Support" : "Review Execution"
          : null,
        alwaysShowMetadata: true,
      };
    })
    .filter(Boolean);
}

function isExecutionBackedReminder(reminder) {
  return ["protocol_reminder", "recovery_reminder", "supplement_reminder"].includes(reminder?.type);
}

function getExecutionSetupCopy(reason) {
  if (reason === ExecutionPriorityOperationalReason.MISSING_ACTIVE_PHASE) {
    return {
      metadata: "Dose schedule needs update",
      label: "No active phase",
    };
  }
  if (reason === ExecutionPriorityOperationalReason.MISSING_HISTORY_ANCHOR) {
    return {
      metadata: "Completion setup needs update",
      label: "No history anchor",
    };
  }

  return {
    metadata: "Execution setup required",
    label: "Missing Execution",
  };
}

function getCanonicalTransitionLabel(activePhase, effectiveToday) {
  if (!effectiveToday) return null;
  if (/\btaper\b/i.test(activePhase?.notes ?? "")) {
    return "Taper begins today";
  }

  return "New phase begins today";
}

function formatDoseAction(doseText, timeOfDayLabel) {
  if (!doseText) return null;
  if (timeOfDayLabel === "Tonight") return `${doseText} tonight`;
  if (timeOfDayLabel === "Morning") return `${doseText} this morning`;
  if (timeOfDayLabel === "Afternoon") return `${doseText} this afternoon`;

  return doseText;
}

// Canonical Execution-backed protocol IDs are excluded before this legacy
// reminder-only compatibility path can inspect protocol dose history.
function getLegacyReminderOnlyDoseChangeItem({
  excludedProtocolIds = new Set(),
  protocols,
  today,
  now,
}) {
  const doseChange = protocols
    .filter(
      (protocol) =>
        protocol.status === "active" &&
        !excludedProtocolIds.has(protocol.id)
    )
    .flatMap((protocol) =>
      (protocol.doseHistory ?? []).map((entry) => ({
        protocol,
        entry,
      }))
    )
    .find(({ entry }) => entry.status === "planned" && entry.startDate === today);

  if (!doseChange) return null;
  const state = getPriorityState("night", now);

  return {
    id: `dose-change-${doseChange.protocol.id}-${today}`,
    label: `${doseChange.protocol.name} ${doseChange.entry.dose} ${doseChange.entry.doseUnit}`,
    subtitle: "Dose change",
    metadata: state.label,
    href: `/priorities/dose-change-${doseChange.protocol.id}-${today}`,
    icon: "syringe",
    color: "effort",
    completed: false,
    state: state.name,
    priority: state.priorityOffset + 6,
    protocolId: doseChange.protocol.id,
    occurrenceDate: today,
    taperStepId: doseChange.entry.label ?? null,
  };
}

function getProteinItem({ todaysCheckIn }) {
  const completed = todaysCheckIn?.nutrition?.proteinTargetHit === true;

  return {
    id: "protein-goal",
    label: "Protein Goal",
    subtitle: "Today",
    metadata: null,
    href: "/priorities/protein-goal",
    icon: "utensils",
    color: "success",
    completed,
    priority: completed ? 80 : 65,
  };
}

function getActivityItem({ todaysCheckIn }) {
  const completed = todaysCheckIn?.activity?.activityRingClosed === true;

  return {
    id: "activity-ring",
    label: "Close Activity Ring",
    subtitle: "Today",
    metadata: null,
    href: "/priorities/activity-ring",
    icon: "activity",
    color: "warning",
    completed,
    priority: completed ? 85 : 70,
  };
}

function getSleepItem({ todaysCheckIn }) {
  const completed = todaysCheckIn?.recovery?.sleepTargetHit === true;

  return {
    id: "sleep-hours",
    label: "Sleep 8+ Hours",
    subtitle: "Tonight",
    metadata: null,
    href: "/priorities/sleep-hours",
    icon: "moon",
    color: "primary",
    completed,
    priority: completed ? 90 : 75,
  };
}

function shouldSurfaceFallbackHabits({ checkIns, latestWeight, weightEntries, today, now }) {
  const recentWeightDates = new Set(
    [
      ...checkIns.map((checkIn) => checkIn.date),
      ...weightEntries.map((entry) => entry.measuredAt?.slice(0, 10)),
      latestWeight?.measuredAt?.slice(0, 10),
    ].filter(Boolean)
  );
  let recentEvidenceDays = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const cursor = new Date(now);
    cursor.setDate(now.getDate() - offset);
    if (recentWeightDates.has(toDateKey(cursor))) recentEvidenceDays += 1;
  }

  const todaysCheckIn = checkIns.find((checkIn) => checkIn.date === today);
  const knownMissedHabit =
    todaysCheckIn?.nutrition?.proteinTargetHit === false ||
    todaysCheckIn?.activity?.activityRingClosed === false ||
    todaysCheckIn?.recovery?.sleepTargetHit === false;

  return recentEvidenceDays < 4 || knownMissedHabit;
}

function reminderAppliesToday(reminder, dayName, localDate = null) {
  if (reminder.schedule?.type === "daily" || reminder.schedule?.cadence === "daily") {
    return true;
  }

  const daysOfWeek = reminder.schedule?.daysOfWeek ?? [];

  if (daysOfWeek.length > 0 && !daysOfWeek.includes(dayName)) return false;

  if (Number(reminder.schedule?.interval ?? 1) > 1 && localDate) {
    try {
      const recurrence = normalizeProtocolRecurrence(reminder.schedule, {
        fallbackTimezone: reminder.schedule.timezone,
        fallbackAnchorDate: reminder.schedule.anchorDate,
      });
      return isProtocolDateOnCycle(recurrence, localDate);
    } catch {
      return false;
    }
  }

  if (daysOfWeek.length > 0) return true;

  return reminder.schedule?.dayOfWeek === dayName;
}

function getReminderIcon(reminder) {
  if (reminder.linkedEvidenceType === "recovery") return "activity";

  return "target";
}

function getReminderColor(reminder) {
  if (reminder.linkedEvidenceType === "recovery") return "effort";

  return "primary";
}

function formatReminderMetadata(reminder) {
  if (reminder.linkedEvidenceType === "recovery") return "Recovery";

  return null;
}

function formatTimeOfDay(value) {
  if (!value) return null;
  if (value === "morning" || value === "afternoon" || value === "evening" || value === "night") {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);

  if (!Number.isFinite(hour)) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatExpectedViews(expectedViews) {
  if (expectedViews.length === 0) return null;
  if (expectedViews.length === 1) return expectedViews[0].replaceAll("-", " ");

  return `${expectedViews.length} views`;
}

function formatProgressPhotoSetMetadata({ completedViewCount = 0, expectedViews = [] } = {}) {
  if (expectedViews.length === 0) return null;

  const expectedLabel = formatExpectedViews(expectedViews);

  if (expectedViews.length === 1) return expectedLabel;

  return `${completedViewCount}/${expectedViews.length} complete · ${expectedLabel}`;
}

function toDateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPriorityState(timeOfDay, now = new Date(), timeZone = null) {
  const hour = timeZone
    ? Number(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          hourCycle: "h23",
          timeZone,
        }).format(now)
      )
    : now.getHours();
  const preferredHour = getPreferredHour(timeOfDay);

  if (preferredHour == null) {
    return {
      name: "available",
      label: "Available",
      priorityOffset: 0,
    };
  }

  if (hour < preferredHour - 1) {
    return {
      name: "upcoming",
      label: formatTimeOfDay(timeOfDay) ?? "Upcoming",
      priorityOffset: 20,
    };
  }

  if (hour > preferredHour + 2) {
    return {
      name: "overdue",
      label: "Overdue",
      priorityOffset: -8,
    };
  }

  return {
    name: "available",
    label: "Available",
    priorityOffset: 0,
  };
}

function getPreferredHour(timeOfDay) {
  if (!timeOfDay) return null;
  if (timeOfDay === "morning") return 7;
  if (timeOfDay === "afternoon") return 14;
  if (timeOfDay === "evening") return 18;
  if (timeOfDay === "night") return 21;

  const [hourText] = String(timeOfDay).split(":");
  const hour = Number(hourText);

  return Number.isFinite(hour) ? hour : null;
}

function getSessionTimeBlock(timeOfDay) {
  if (timeOfDay === "afternoon") return "afternoon";
  if (timeOfDay === "evening" || timeOfDay === "night") return "evening";
  return "morning";
}

function formatSessionLabel(timeBlock) {
  if (!timeBlock) return "Check-in";
  return timeBlock.charAt(0).toUpperCase() + timeBlock.slice(1);
}

function isSameLocalDate(value, dateKey) {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value === dateKey;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) === dateKey;

  return toDateKey(date) === dateKey;
}

function getMostRecentUnknownOccurrence({
  checkIns,
  dexaScans,
  now,
  progressPhotos,
  reminder,
  weightEntries,
}) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const cursor = new Date(now);

    cursor.setDate(now.getDate() - offset);

    const date = toDateKey(cursor);
    const dayName = DAY_NAMES[cursor.getDay()];

    if (!reminderAppliesToday(reminder, dayName, date)) continue;

    const state = classifyReminderOccurrence({
      checkIns,
      date,
      dexaScans,
      progressPhotos,
      reminder,
      weightEntries,
    });

    if (state === "unknown") {
      return {
        date,
        label: offset === 1 ? "yesterday" : formatShortDate(cursor),
      };
    }

    return null;
  }

  return null;
}

function classifyReminderOccurrence({
  checkIns,
  date,
  dexaScans,
  progressPhotos,
  reminder,
  weightEntries,
}) {
  const reconciledState = getReconciliationState({ checkIns, date, reminderId: reminder.id });

  if (reconciledState) return reconciledState;
  if (isSameLocalDate(reminder.completedAt, date)) return "completed";
  if (
    hasEvidenceForReminderOccurrence({
      checkIns,
      date,
      dexaScans,
      progressPhotos,
      reminder,
      weightEntries,
    })
  ) {
    return "completed";
  }

  return "unknown";
}

function getReconciliationState({ checkIns, date, reminderId }) {
  const checkIn = checkIns.find((item) => item.date === date);
  const reconciliation = checkIn?.reconciliation?.find(
    (item) => item.reminderId === reminderId
  );

  if (!reconciliation) return null;
  if (reconciliation.status === "completed") return "completed";

  return "skipped";
}

function hasEvidenceForReminderOccurrence({
  checkIns,
  date,
  dexaScans,
  progressPhotos,
  reminder,
  timeZone = null,
  weightEntries,
}) {
  if (hasCheckInCompletionForReminder({ checkIns, date, reminder })) {
    return true;
  }

  if (
    reminder.linkedEvidenceType === "weight" ||
    reminder.linkedEntityType === "weight_entry" ||
    reminder.id === "reminder_morning_weight"
  ) {
    const hasWeight = weightEntries.some(
      (entry) => getOccurrenceDateKey(entry.measuredAt, timeZone) === date
    );
    const hasCheckInWeight = checkIns.some(
      (checkIn) => checkIn.date === date && Boolean(checkIn.weightEntryId)
    );

    return hasWeight || hasCheckInWeight;
  }

  if (
    reminder.linkedEvidenceType === "progress_photo" ||
    reminder.linkedEntityType === "progress_photo"
  ) {
    return hasProgressPhotoEvidenceForReminder({
      date,
      progressPhotos,
      reminder,
      timeZone,
    });
  }

  if (
    reminder.linkedEvidenceType === "dexa" ||
    reminder.linkedEntityType === "dexa"
  ) {
    return dexaScans.some(
      (scan) =>
        getOccurrenceDateKey(scan.measuredAt ?? scan.date, timeZone) === date
    );
  }

  return false;
}

function hasCheckInCompletionForReminder({ checkIns, date, reminder }) {
  const checkIn = checkIns.find((item) => item.date === date);

  if (!checkIn) return false;

  const completionKeys = [
    reminder.id,
    reminder.linkedEntityId,
    slugify(reminder.title),
  ].filter(Boolean);
  const completedFocusItems = checkIn.completedFocusItems ?? [];
  const completedProtocolIds = checkIn.protocols?.completedProtocolIds ?? [];

  return completionKeys.some(
    (key) =>
      completedFocusItems.includes(key) || completedProtocolIds.includes(key)
  );
}

function hasProgressPhotoEvidenceForReminder({
  date,
  progressPhotos,
  reminder,
  timeZone,
}) {
  const photosForDate = getProgressPhotoCompletionRecords(
    progressPhotos,
    timeZone
  ).filter((photo) => photo.date === date);

  if (photosForDate.length === 0) return false;

  const expectedViews = reminder.expectedViews ?? [];

  if (expectedViews.length === 0) return true;

  const photoKeys = new Set(
    photosForDate
      .map(getProgressPhotoCompletionCategoryId)
      .filter((categoryId) => categoryId !== "unknown")
  );

  return expectedViews.every((expectedView) =>
    photoKeys.has(normalizeExpectedProgressPhotoCategoryId(expectedView))
  );
}

function getOccurrenceDateKey(value, timeZone) {
  return timeZone ? getLocalDateKey(value, timeZone) : getDateKey(value);
}

function getProgressPhotoCompletionRecords(progressPhotos = [], timeZone = null) {
  return progressPhotos.flatMap((photo) => {
    const payload = photo.payload ?? photo;

    if (payload.evidence_type === "photo_session" || Array.isArray(payload.photos)) {
      const sessionDate = getOccurrenceDateKey(
        payload.observed_at ?? payload.date ?? payload.capturedAt,
        timeZone
      );

      return (payload.photos ?? []).map((sessionPhoto) => ({
        ...sessionPhoto,
        date: getOccurrenceDateKey(
          sessionPhoto.date ??
            sessionPhoto.captured_at ??
            sessionPhoto.capturedAt ??
            sessionDate,
          timeZone
        ),
      }));
    }

    return [
      {
        ...payload,
        date: getOccurrenceDateKey(
          payload.date ?? payload.capturedAt ?? payload.observed_at,
          timeZone
        ),
      },
    ];
  });
}

function getProgressPhotoCompletionCategoryId(photo) {
  const explicitCategoryId = photo.categoryId ?? photo.category_id;

  if (explicitCategoryId && explicitCategoryId !== "unknown") {
    return normalizeExpectedProgressPhotoCategoryId(explicitCategoryId);
  }

  return normalizeProgressPhotoCategory(photo).categoryId;
}

function normalizeExpectedProgressPhotoCategoryId(expectedView) {
  const text = String(expectedView ?? "").trim();
  const [view, ...poseParts] = text.split("-");
  const pose = poseParts.join("-");
  const normalized = normalizeProgressPhotoCategory({ pose, view });

  return normalized.categoryId === "unknown" ? text : normalized.categoryId;
}

function isRecurringReminder(reminder) {
  const schedule = reminder.schedule ?? {};

  return Boolean(
    schedule.type === "daily" ||
      schedule.cadence === "daily" ||
      schedule.daysOfWeek?.length ||
      schedule.dayOfWeek
  );
}

function formatShortDate(value) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
