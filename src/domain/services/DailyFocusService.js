import { normalizeProgressPhotoCategory } from "../models/progressPhotoPoseVocabulary";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function createDailyFocusService() {
  return {
    getDailyFocus({
      checkIns = [],
      latestWeight = null,
      weightEntries = [],
      protocols = [],
      progressPhotos = [],
      reminders = [],
      now = new Date(),
    } = {}) {
      const today = toDateKey(now);
      const dayName = DAY_NAMES[now.getDay()];
      const todaysCheckIn = checkIns.find((checkIn) => checkIn.date === today);
      const protocolItems = [
        getProtocolItem({
          reminders,
          protocols,
          title: "Retatrutide",
          today,
          dayName,
          now,
        }),
        getProtocolItem({
          reminders,
          protocols,
          title: "Tesamorelin",
          today,
          dayName,
          now,
        }),
      ].filter(Boolean);
      const highPriorityItems = [
        getMorningWeightItem({ latestWeight, todaysCheckIn, today, now }),
        ...getProgressPhotoItems({ progressPhotos, reminders, today, dayName, now }),
        getDoseChangeItem({ protocols, today, now }),
        ...protocolItems,
        ...getPersistentReminderItems({ reminders, today, dayName }),
      ].filter(Boolean);
      const sessions = getDailySessionsFromItems(highPriorityItems);
      const sessionItemIds = new Set(
        sessions.flatMap((session) => session.items.map((item) => item.id))
      );
      const sessionPriorities = sessions
        .filter((session) => session.pendingCount > 0)
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
      latestWeight = null,
      now = new Date(),
      progressPhotos = [],
      reminders = [],
    } = {}) {
      const today = toDateKey(now);
      const dayName = DAY_NAMES[now.getDay()];
      const todaysCheckIn = checkIns.find((checkIn) => checkIn.date === today);
      const items = [
        getMorningWeightItem({ latestWeight, todaysCheckIn, today, now }),
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
  };
}

export const DailyFocusService = createDailyFocusService();

function getPersistentReminderItems({ reminders, today, dayName }) {
  return reminders
    .filter(
      (reminder) =>
        reminder.persistenceMode === "always_visible" &&
        reminder.active &&
        reminderAppliesToday(reminder, dayName)
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

function getMorningWeightItem({ latestWeight, todaysCheckIn, today, now }) {
  const completed =
    Boolean(todaysCheckIn?.weightEntryId) ||
    isSameLocalDate(latestWeight?.measuredAt, today);

  const state = getPriorityState("morning", now);

  return {
    id: "verified-weight",
    label: "Morning Weight",
    subtitle: state.label,
    metadata: "Fasted",
    href: "/check-in/morning?session=morning",
    icon: "scale",
    color: "evidence",
    completed,
    session: "morning",
    state: state.name,
    priority: state.priorityOffset + 10,
  };
}

function getProgressPhotoItems({ progressPhotos, reminders, today, dayName, now }) {
  const photoReminders = reminders.filter(
    (item) =>
      item.linkedEvidenceType === "progress_photo" &&
      item.active &&
      isProgressPhotoReminder(item) &&
      reminderAppliesToday(item, dayName)
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
    const completed =
      normalizedExpectedViews.length > 0 &&
      normalizedExpectedViews.every((expectedView) =>
        completedCategoryIds.has(expectedView)
      );
    const state = getPriorityState(reminder.schedule?.timeOfDay, now);

    return {
      id: reminder.id,
      label: reminder.title,
      subtitle: state.label,
      metadata: formatProgressPhotoSetMetadata({
        completedViewCount,
        expectedViews,
      }),
      href: `/evidence/photos?session=${timeBlock}&view=${defaultView}`,
      icon: "camera",
      color: "evidence",
      completed,
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

    return {
      id: `${timeBlock}-check-in`,
      label: `${formatSessionLabel(timeBlock)} Check-in`,
      subtitle: `Complete today's scheduled ${formatSessionLabel(timeBlock).toLowerCase()} evidence.`,
      metadata: `${completedCount}/${sessionItems.length} complete`,
      href: `/log?session=${timeBlock}`,
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
    })),
    priority: session.priority,
  };
}

function getProtocolItem({ reminders, protocols, title, today, dayName, now }) {
  const reminder = reminders.find(
    (item) =>
      item.title === title &&
      item.type === "protocol_reminder" &&
      item.active &&
      reminderAppliesToday(item, dayName)
  );

  if (!reminder) return null;

  const completed = Boolean(isSameLocalDate(reminder.completedAt, today));

  if (completed) return null;

  const protocol = protocols.find((item) => item.id === reminder.linkedEntityId);
  const doseText = formatDose(protocol?.dose);
  const state = getPriorityState(reminder.schedule?.timeOfDay, now);

  return {
    id: reminder.id,
    label: title,
    subtitle: state.name === "overdue" ? "Overdue" : "Tonight",
    metadata: doseText,
    href: `/priorities/${reminder.id}`,
    icon: "syringe",
    color: "effort",
    completed,
    completable: true,
    completionId: reminder.id,
    state: state.name,
    priority: state.priorityOffset + (title === "Retatrutide" ? 22 : 26),
  };
}

function getDoseChangeItem({ protocols, today, now }) {
  const doseChange = protocols
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

function reminderAppliesToday(reminder, dayName) {
  if (reminder.schedule?.type === "daily" || reminder.schedule?.cadence === "daily") {
    return true;
  }

  const daysOfWeek = reminder.schedule?.daysOfWeek ?? [];

  if (daysOfWeek.length > 0) return daysOfWeek.includes(dayName);

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

function formatDose(dose) {
  if (!dose?.value || !dose?.unit) return null;

  return `${dose.value} ${dose.unit}`;
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

function getPriorityState(timeOfDay, now = new Date()) {
  const hour = now.getHours();
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

    if (!reminderAppliesToday(reminder, dayName)) continue;

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
      (entry) => getDateKey(entry.measuredAt) === date
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
    });
  }

  if (
    reminder.linkedEvidenceType === "dexa" ||
    reminder.linkedEntityType === "dexa"
  ) {
    return dexaScans.some((scan) => getDateKey(scan.measuredAt ?? scan.date) === date);
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

function hasProgressPhotoEvidenceForReminder({ date, progressPhotos, reminder }) {
  const photosForDate = getProgressPhotoCompletionRecords(progressPhotos).filter(
    (photo) => photo.date === date
  );

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

function getProgressPhotoCompletionRecords(progressPhotos = []) {
  return progressPhotos.flatMap((photo) => {
    const payload = photo.payload ?? photo;

    if (payload.evidence_type === "photo_session" || Array.isArray(payload.photos)) {
      const sessionDate = getDateKey(
        payload.observed_at ?? payload.date ?? payload.capturedAt
      );

      return (payload.photos ?? []).map((sessionPhoto) => ({
        ...sessionPhoto,
        date: getDateKey(
          sessionPhoto.date ??
            sessionPhoto.captured_at ??
            sessionPhoto.capturedAt ??
            sessionDate
        ),
      }));
    }

    return [
      {
        ...payload,
        date: getDateKey(payload.date ?? payload.capturedAt ?? payload.observed_at),
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
