const PRIMARY_GOAL_ID = "goal_visible_abs_at_rest";

export function createPriorityDetailService({ repositories }) {
  return {
    async getPriorityDetail(priorityId, userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) return null;

      const [goals, reminder, protocols, operatingPlan, operatingRhythm] =
        await Promise.all([
          repositories.goals.listGoals(resolvedUserId),
          repositories.reminders?.getReminderById(priorityId) ?? null,
          repositories.protocols.listProtocols(resolvedUserId),
          repositories.operatingPlan?.getOperatingPlan(resolvedUserId) ?? null,
          repositories.operatingRhythm?.getOperatingRhythm(resolvedUserId) ?? null,
        ]);

      if (reminder?.type === "protocol_reminder") {
        const protocol = protocols.find(
          (item) => item.id === reminder.linkedEntityId
        );

        return createProtocolPriorityDetail({
          reminder,
          protocol,
          goals,
          operatingPlan,
          operatingRhythm,
        });
      }

      if (reminder?.linkedEvidenceType === "progress_photo") {
        return createProgressPhotoPriorityDetail({
          reminder,
          goals,
          operatingPlan,
        });
      }

      if (reminder) {
        return createReminderPriorityDetail({
          reminder,
          goals,
          operatingPlan,
        });
      }

      return createFallbackPriorityDetail(priorityId, goals);
    },
  };
}

function createProtocolPriorityDetail({
  reminder,
  protocol,
  goals,
  operatingPlan,
  operatingRhythm,
}) {
  if (!protocol) return null;

  const currentDose = formatDose(protocol.dose);
  const currentWeek = getCurrentProtocolWeek(protocol);
  const nextDoseChange = getNextDoseChange(protocol);

  return {
    id: reminder.id,
    title: protocol.name,
    eyebrow: "Priority Detail",
    subtitle: reminder.schedule?.timeOfDay === "night" ? "Tonight" : "Today",
    status: "Open",
    completable: true,
    action: {
      label: "Continue",
      href: "/",
    },
    sections: [
      {
        title: "What",
        items: [
          {
            label: protocol.name,
            detail: "Complete the scheduled protocol action.",
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatSchedule(reminder.schedule),
            detail: formatRhythmContext(protocol, operatingRhythm),
          },
        ],
      },
      {
        title: "Dose",
        items: [
          {
            label: currentDose ?? "Dose pending",
            detail: currentWeek ? `Current protocol week: ${currentWeek}` : "Week pending",
          },
        ],
      },
      {
        title: "Preparation",
        items: getPreparationItems(protocol),
      },
      {
        title: "Why it matters",
        items: [
          {
            label: "Supports the current operating plan",
            detail:
              "Protocol context helps PhysiqueOS interpret weight, body composition, appetite, recovery, and trajectory changes.",
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol, goals, operatingPlan }),
      },
      {
        title: "Next Protocol Change",
        items: [
          {
            label: nextDoseChange?.label ?? "Continue current dose",
            detail: nextDoseChange?.detail ?? "No upcoming dose change is due today.",
          },
        ],
      },
      {
        title: "Completion",
        items: [
          {
            label: "Mark Complete",
            detail:
              "Completion tracking will be saved through the reminder repository in the next interaction pass.",
          },
        ],
      },
    ],
  };
}

function createProgressPhotoPriorityDetail({ reminder, goals, operatingPlan }) {
  return {
    id: reminder.id,
    title: reminder.title,
    eyebrow: "Priority Detail",
    subtitle: "Morning evidence",
    status: "Open",
    completable: false,
    action: {
      label: "Upload Photos",
      href: "/evidence/photos",
    },
    sections: [
      {
        title: "What",
        items: [
          {
            label: reminder.title,
            detail: `Capture ${formatExpectedViews(reminder.expectedViews)} under standard conditions.`,
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatSchedule(reminder.schedule),
            detail: "Use the founder default photo conditions for consistent comparisons.",
          },
        ],
      },
      {
        title: "How",
        items: [
          {
            label: "Standard conditions",
            detail:
              "Morning, fasted, same lighting, same mirror, no pump, and not post-workout.",
          },
        ],
      },
      {
        title: "Why it matters",
        items: [
          {
            label: "Visual calibration",
            detail:
              "Progress photos support qualitative goals like Visible Abs at Rest without replacing DEXA or weight evidence.",
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol: reminder, goals, operatingPlan }),
      },
      {
        title: "Completion",
        items: [
          {
            label: "Upload photos",
            detail:
              "Photo upload completion will be connected in the progress-photo workflow.",
          },
        ],
      },
    ],
  };
}

function createReminderPriorityDetail({ reminder, goals, operatingPlan }) {
  return {
    id: reminder.id,
    title: reminder.title,
    eyebrow: "Priority Detail",
    subtitle: formatSchedule(reminder.schedule),
    status: "Open",
    completable: true,
    action: {
      label: "Continue",
      href: "/",
    },
    sections: [
      {
        title: "What",
        items: [
          {
            label: reminder.title,
            detail: reminder.notes || "Complete this scheduled priority.",
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatSchedule(reminder.schedule),
            detail:
              reminder.persistenceMode === "always_visible"
                ? "Always visible until completed by founder preference."
                : "Scheduled by the operating plan.",
          },
        ],
      },
      {
        title: "Adaptive Assistance",
        items: [
          {
            label: formatPersistenceMode(reminder.persistenceMode),
            detail: getAdaptiveAssistanceDetail(reminder),
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol: reminder, goals, operatingPlan }),
      },
    ],
  };
}

function createFallbackPriorityDetail(priorityId, goals) {
  const primaryGoal = goals.find((goal) => goal.id === PRIMARY_GOAL_ID);

  return {
    id: priorityId,
    title: "Priority",
    eyebrow: "Priority Detail",
    subtitle: "Operational context",
    status: "Open",
    action: {
      label: "Continue",
      href: "/",
    },
    sections: [
      {
        title: "Why it matters",
        items: [
          {
            label: "Supports the current goal",
            detail: primaryGoal
              ? `This priority supports ${primaryGoal.title}.`
              : "This priority supports the active operating plan.",
          },
        ],
      },
    ],
  };
}

function getPreparationItems(protocol) {
  if (protocol.schedule?.timingContext === "fasted_before_bed") {
    return [
      {
        label: "Finish eating before 7 PM",
        detail: "Preserve the normal fasted-before-bed timing window.",
      },
      {
        label: "Take fasted before bed",
        detail: "Use the founder's default nighttime protocol conditions.",
      },
    ];
  }

  return [
    {
      label: "Use normal protocol conditions",
      detail: protocol.notes,
    },
  ];
}

function getRelatedGoalItems({ protocol, goals, operatingPlan }) {
  const primaryGoal = goals.find(
    (goal) => goal.id === operatingPlan?.primaryGoalId || goal.id === PRIMARY_GOAL_ID
  );
  const relatedGoals = goals.filter((goal) =>
    protocol.relatedGoalIds?.includes(goal.id)
  );
  const supportingGoals = relatedGoals.filter((goal) => goal.id !== primaryGoal?.id);
  const items = [];

  if (primaryGoal) {
    items.push({
      label: "Primary Goal",
      detail: formatGoalTitle(primaryGoal.title),
    });
  }

  if (supportingGoals.length > 0) {
    items.push({
      label: "Supporting Objective",
      detail: supportingGoals.map((goal) => formatGoalTitle(goal.title)).join(", "),
    });
  }

  return items;
}

function getCurrentProtocolWeek(protocol, now = new Date()) {
  if (!protocol.startDate) return null;

  const start = new Date(`${protocol.startDate}T12:00:00`);
  const elapsedDays = Math.max(0, Math.floor((now - start) / 86400000));

  return Math.floor(elapsedDays / 7) + 1;
}

function getNextDoseChange(protocol, now = new Date()) {
  const today = dateKey(now);
  const next = (protocol.doseHistory ?? [])
    .filter((entry) => entry.status === "planned" && entry.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  if (!next) return null;

  return {
    label: `${next.dose} ${next.doseUnit}`,
    detail: `Planned for ${formatDate(next.startDate)}.`,
  };
}

function formatDose(dose) {
  if (!dose?.value || !dose?.unit) return null;

  return `${dose.value} ${dose.unit}`;
}

function formatSchedule(schedule) {
  const time = schedule?.timeOfDay ? formatTimeOfDay(schedule.timeOfDay) : "Today";
  const day = schedule?.dayOfWeek
    ? capitalize(schedule.dayOfWeek)
    : schedule?.daysOfWeek?.length
      ? schedule.daysOfWeek.map(capitalize).join(", ")
      : null;

  return day ? `${day} ${time}` : time;
}

function formatPersistenceMode(value) {
  if (!value) return "Scheduled";

  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

function getAdaptiveAssistanceDetail(reminder) {
  if (reminder.persistenceMode === "always_visible") {
    return "PhysiqueOS will not recommend removing this priority unless the founder changes preference.";
  }

  if (reminder.adaptiveAssistance?.eligible) {
    return "PhysiqueOS may recommend reducing reminder friction after consistent completion, but the founder decides.";
  }

  return "No adaptive reduction is currently enabled.";
}

function formatTimeOfDay(value) {
  if (value === "morning" || value === "night") return capitalize(value);

  const [hourText, minuteText] = String(value).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);

  if (!Number.isFinite(hour)) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatRhythmContext(protocol, operatingRhythm) {
  const rhythm = operatingRhythm?.protocolTiming?.find(
    (item) => item.protocolId === protocol.id
  );

  return rhythm
    ? rhythm.timing.replaceAll("_", " ")
    : protocol.schedule?.timingContext?.replaceAll("_", " ") ?? protocol.notes;
}

function formatExpectedViews(expectedViews = []) {
  if (expectedViews.length === 0) return "the expected views";
  if (expectedViews.length === 1) return expectedViews[0].replaceAll("-", " ");

  return expectedViews.map((view) => view.replaceAll("-", " ")).join(", ");
}

function formatGoalTitle(title) {
  return title
    .replace("Visible abs at rest", "Visible Abs")
    .replace("Preserve lean mass", "Lean Mass Preservation")
    .replace("Maintain 8-9% body fat", "8-9% Body Fat");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function dateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
