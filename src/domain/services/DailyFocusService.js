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
        getProgressPhotoItem({ progressPhotos, reminders, today, dayName, now }),
        getDoseChangeItem({ protocols, today, now }),
        ...protocolItems,
        ...getPersistentReminderItems({ reminders, today, dayName }),
      ].filter(Boolean);
      const primaryItems = highPriorityItems.filter((item) => !item.completed);
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
      const candidates = [...primaryItems, ...fallbackItems].filter(Boolean);

      return candidates
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 4)
        .map(({ priority, ...item }) => item);
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

  if (completed) return null;
  const state = getPriorityState("morning", now);

  return {
    id: "verified-weight",
    label: "Morning Weight",
    subtitle: state.label,
    metadata: "Fasted",
    href: "/check-in/morning",
    icon: "scale",
    color: "evidence",
    completed,
    state: state.name,
    priority: state.priorityOffset + 10,
  };
}

function getProgressPhotoItem({ progressPhotos, reminders, today, dayName, now }) {
  const reminder = reminders.find(
    (item) =>
      item.linkedEvidenceType === "progress_photo" &&
      item.active &&
      ["Front Progress Photos", "Rear Progress Photos"].includes(item.title) &&
      reminderAppliesToday(item, dayName)
  );

  if (!reminder) return null;

  const todaysPhotos = progressPhotos.filter((photo) => photo.date === today);
  const expectedViews = reminder.expectedViews ?? [];
  const completed = expectedViews.every((expectedView) =>
    todaysPhotos.some((photo) => `${photo.view}-${formatPose(photo.pose)}` === expectedView)
  );
  const state = getPriorityState(reminder.schedule?.timeOfDay, now);

  if (completed) return null;

  return {
    id: reminder.id,
    label: reminder.title,
    subtitle: state.label,
    metadata: formatExpectedViews(expectedViews),
    href: `/priorities/${reminder.id}`,
    icon: "camera",
    color: "evidence",
    completed,
    state: state.name,
    priority: state.priorityOffset + 12,
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
  if (value === "morning" || value === "night") {
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

function formatPose(pose) {
  return String(pose).replaceAll("_", "-");
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
  if (timeOfDay === "night") return 21;

  const [hourText] = String(timeOfDay).split(":");
  const hour = Number(hourText);

  return Number.isFinite(hour) ? hour : null;
}

function isSameLocalDate(value, dateKey) {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value === dateKey;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) === dateKey;

  return toDateKey(date) === dateKey;
}
