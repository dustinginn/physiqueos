export function createYouProfileService({ repositories }) {
  return {
    async getYouProfile(userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) {
        return emptyProfile();
      }

      const [
        goals,
        protocols,
        reminders,
        nutritionContext,
        weights,
        dexaScans,
        progressPhotos,
      ] = await Promise.all([
        repositories.goals.listGoals(resolvedUserId),
        repositories.protocols.listProtocols(resolvedUserId),
        repositories.reminders.listReminders(resolvedUserId),
        repositories.nutritionContext.getNutritionContext(resolvedUserId),
        repositories.weights.listWeightEntries(resolvedUserId),
        repositories.dexaScans.listDEXAScans(resolvedUserId),
        repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
      ]);

      const activeProtocols = protocols.filter((protocol) => protocol.status === "active");
      const primaryGoal = goals.find((goal) => goal.primary);
      const supportingGoals = goals.filter((goal) => !goal.primary && goal.status === "active");
      const activeReminders = reminders.filter((reminder) => reminder.active);
      const connectedSources = [
        weights.length > 0 && "Weight",
        dexaScans.length > 0 && "DEXA",
        progressPhotos.length > 0 && "Progress Photos",
        nutritionContext && "Nutrition Context",
      ].filter(Boolean);

      return {
        user,
        operatingStatus: {
          title: "PhysiqueOS understands your operating system.",
          summary:
            "Your goals, evidence, protocols, integrations, and preferences are connected into one daily operating model.",
          goals: goals.filter((goal) => goal.status === "active").length,
          evidenceSources: connectedSources.length,
          activeProtocols: activeProtocols.length,
          connectedIntegrations: getConnectedIntegrationCount({ dexaScans }),
          confidenceLabel: getConfidenceLabel({ weights, dexaScans, progressPhotos }),
        },
        goals: {
          primary: primaryGoal,
          supporting: supportingGoals,
          href: "/goals",
        },
        operatingPlan: getOperatingPlanSummary({ reminders }),
        evidenceSources: getEvidenceSources({
          weights,
          dexaScans,
          progressPhotos,
          nutritionContext,
        }),
        protocols: {
          active: activeProtocols,
          groups: getProtocolGroups(protocols),
          href: "/profile/protocols",
        },
        integrations: getIntegrations({ dexaScans }),
        preferences: getPreferences({ user }),
        about: getAboutYou({ user }),
        privacy: getPrivacyItems(),
        reminders: activeReminders,
      };
    },
  };
}

function emptyProfile() {
  return {
    user: null,
    operatingStatus: {
      title: "PhysiqueOS is waiting to learn.",
      summary: "Add a user profile to begin personalizing the operating system.",
      currentGoal: "Pending",
      goals: 0,
      evidenceSources: 0,
      activeProtocols: 0,
      connectedIntegrations: 0,
      confidenceLabel: "Pending",
    },
    goals: { primary: null, supporting: [], href: "/goals" },
    operatingPlan: { href: "/profile/operating-plan", items: [], summary: "Not configured" },
    evidenceSources: [],
    protocols: { active: [], groups: [], href: "/profile/protocols" },
    integrations: [],
    preferences: [],
    about: [],
    privacy: [],
    reminders: [],
  };
}

function getEvidenceSources({
  weights,
  dexaScans,
  progressPhotos,
  nutritionContext,
}) {
  return [
    {
      label: "Weight",
      detail: `${weights.length} entries`,
      href: "/progress/weight",
      status: weights.length > 0 ? "Connected" : "Not started",
    },
    {
      label: "DEXA",
      detail: `${dexaScans.length} scans`,
      href: "/progress/dexa",
      status: dexaScans.length > 0 ? "Connected" : "Not started",
    },
    {
      label: "Progress Photos",
      detail: `${progressPhotos.length} photos`,
      href: "/progress/photos",
      status: progressPhotos.length > 0 ? "Connected" : "Not started",
    },
    {
      label: "Nutrition",
      detail: nutritionContext ? "Manual range configured" : "Context pending",
      href: "/progress/nutrition",
      status: nutritionContext ? "Configured" : "Suggested",
    },
    {
      label: "Training",
      detail: "Manual notes available",
      href: "/progress/training",
      status: "Manual",
    },
    {
      label: "Recovery",
      detail: "Recovery reminders configured",
      href: "/progress/recovery",
      status: "Manual",
    },
  ];
}

function getOperatingPlanSummary({ reminders }) {
  const activeReminders = reminders.filter((reminder) => reminder.active);

  return {
    href: "/profile/operating-plan",
    summary: `${activeReminders.length} scheduled expectations`,
    items: activeReminders.slice(0, 5).map((reminder) => ({
      label: reminder.title,
      detail: formatReminderSchedule(reminder),
      status: reminder.persistenceMode
        ? formatLabel(reminder.persistenceMode)
        : formatLabel(reminder.schedule?.cadence ?? reminder.schedule?.type ?? "Scheduled"),
    })),
  };
}

function getProtocolGroups(protocols) {
  const labels = {
    lifestyle: "Lifestyle",
    medication: "Medications",
    nutrition: "Nutrition",
    other: "Other",
    peptide: "Peptides",
    recovery: "Recovery",
    supplement: "Supplements",
    training: "Training",
  };
  const order = ["peptide", "supplement", "nutrition", "training", "recovery", "lifestyle", "medication", "other"];

  return order
    .map((category) => {
      const items = protocols.filter((protocol) => protocol.category === category);

      if (items.length === 0) return null;

      return {
        category,
        title: labels[category] ?? formatLabel(category),
        activeCount: items.filter((protocol) => protocol.status === "active").length,
        protocols: items,
      };
    })
    .filter(Boolean);
}

function formatReminderSchedule(reminder) {
  const schedule = reminder.schedule ?? {};
  const day =
    schedule.preferredDay ??
    schedule.dayOfWeek ??
    (schedule.daysOfWeek?.length ? schedule.daysOfWeek.map(formatLabel).join(", ") : null);
  const time = schedule.timeOfDay ? formatLabel(schedule.timeOfDay) : null;

  return [day && formatLabel(day), time].filter(Boolean).join(" / ") || "Scheduled";
}

function getIntegrations({ dexaScans }) {
  return [
    {
      label: "BodySpec",
      detail: dexaScans.length > 0 ? `${dexaScans.length} reports imported` : "Import ready",
      status: dexaScans.length > 0 ? "Connected" : "Suggested",
    },
    {
      label: "Apple Health",
      detail: "Planned for passive evidence",
      status: "Suggested",
    },
    {
      label: "Cronometer",
      detail: "Nutrition automation candidate",
      status: "Coming Soon",
    },
    {
      label: "Whoop / Oura / Garmin",
      detail: "Recovery ecosystem candidates",
      status: "Coming Soon",
    },
  ];
}

function getPreferences({ user }) {
  const preferences = user?.preferences ?? {};

  return [
    {
      label: "Theme",
      detail: "Light, dark, or system",
      href: null,
      status: "Available",
    },
    {
      label: "Units",
      detail: `Weight: ${preferences.weightUnit ?? "lb"}`,
      href: "/profile/operating-plan",
      status: "Configured",
    },
    {
      label: "Notifications",
      detail: "App-visible reminders for Founder Alpha",
      href: "/profile/operating-plan",
      status: "Configured",
    },
    {
      label: "Voice",
      detail: "Future evidence capture input",
      href: null,
      status: "Coming Soon",
    },
    {
      label: "Developer Options",
      detail: "Founder Alpha diagnostics",
      href: null,
      status: "Founder Alpha",
    },
  ];
}

function getAboutYou({ user }) {
  return [
    {
      label: "Height",
      detail: user?.height?.value ? `${user.height.value} ${user.height.unit}` : "Not set",
    },
    {
      label: "Body Composition Source",
      detail: formatLabel(user?.preferences?.primaryBodyCompositionSource ?? "dexa"),
    },
    {
      label: "Weigh-In Context",
      detail: "Morning, fasted, home scale",
    },
  ];
}

function getPrivacyItems() {
  return [
    {
      label: "Evidence Ownership",
      detail: "Founder data remains local in Founder Alpha",
    },
    {
      label: "Data Export",
      detail: "Planned",
    },
    {
      label: "Permissions",
      detail: "Future integrations will request explicit access",
    },
  ];
}

function getConnectedIntegrationCount({ dexaScans }) {
  return dexaScans.length > 0 ? 1 : 0;
}

function getConfidenceLabel({ weights, dexaScans, progressPhotos }) {
  if (weights.length > 0 && dexaScans.length > 0 && progressPhotos.length > 0) {
    return "High";
  }

  if (weights.length > 0 && dexaScans.length > 0) return "Moderate";

  return "Building";
}

function formatLabel(value) {
  return String(value ?? "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
