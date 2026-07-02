import { interpretProgressPhotos } from "../interpreters";

export function createProgressReportingService({ repositories }) {
  return {
    async getProgressHub(userId) {
      const context = await getProgressContext({ repositories, userId });

      return buildProgressHub(context);
    },

    async getWeightReport(userId) {
      const context = await getProgressContext({ repositories, userId });

      return buildWeightReport(context);
    },

    async getDEXAReport(userId) {
      const context = await getProgressContext({ repositories, userId });

      return buildDEXAReport(context);
    },

    async getPlaceholderReport(streamId, userId) {
      const context = await getProgressContext({ repositories, userId });
      const stream = buildProgressHub(context).streams.find(
        (item) => item.id === streamId
      );

      if (!stream) return null;

      return {
        ...stream,
        dataSources: getDataSources(streamId),
        entries: getPlaceholderEntries(streamId, context),
        relatedGoals: getStreamRelatedGoals(streamId, context.goals),
        ...getStreamReportExtras(streamId, context),
      };
    },
  };
}

async function getProgressContext({ repositories, userId }) {
  const user = userId
    ? await repositories.users.getUserById(userId)
    : await repositories.users.getCurrentUser();
  const resolvedUserId = user?.id ?? userId;

  if (!resolvedUserId) {
    return {
      user: null,
      weights: [],
      dexaScans: [],
      progressPhotos: [],
      protocols: [],
      checkIns: [],
      nutritionContext: null,
      goals: [],
    };
  }

  const [
    goals,
    weights,
    dexaScans,
    progressPhotos,
    protocols,
    checkIns,
    nutritionContext,
  ] = await Promise.all([
    repositories.goals.listGoals(resolvedUserId),
    repositories.weights.listWeightEntries(resolvedUserId),
    repositories.dexaScans.listDEXAScans(resolvedUserId),
    repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
    repositories.protocols.listProtocols(resolvedUserId),
    repositories.dailyCheckIns.listCheckIns(resolvedUserId),
    repositories.nutritionContext.getNutritionContext(resolvedUserId),
  ]);

  return {
    user,
    goals,
    weights: sortByDate(weights, "measuredAt"),
    dexaScans: sortByDate(dexaScans, "measuredAt"),
    progressPhotos: sortByDate(progressPhotos, "date"),
    protocols: sortByDate(protocols, "startDate"),
    checkIns: sortByDate(checkIns, "date"),
    nutritionContext,
  };
}

function buildProgressHub(context) {
  const { weights, dexaScans, progressPhotos, protocols, nutritionContext } =
    context;
  const latestWeight = weights.at(-1);
  const firstWeight = weights.at(0);
  const latestDEXA = dexaScans.at(-1);
  const previousDEXA = dexaScans.at(-2);
  const verifiedPhotos = progressPhotos.filter(isVerifiedProgressPhoto);
  const latestPhoto = verifiedPhotos.at(-1) ?? progressPhotos.at(-1);
  const reportPhotos = verifiedPhotos.length > 0 ? verifiedPhotos : progressPhotos;
  const activeProtocols = protocols.filter((item) => item.status === "active");
  const photoSetCount = new Set(
    reportPhotos.map((photo) => getDateKey(photo.date ?? photo.capturedAt))
  ).size;

  return {
    title: "Evidence Hub",
    subtitle:
      "Everything PhysiqueOS knows about the evidence behind your goals.",
    streams: [
      {
        id: "weight",
        title: "Weight",
        metric: latestWeight
          ? formatWeight(latestWeight.weight)
          : "No entries",
        trend:
          latestWeight && firstWeight
            ? formatSignedWeight(latestWeight.weight.value - firstWeight.weight.value)
            : "Trend pending",
        trendLabel: "since cut start",
        lastUpdated: latestWeight?.measuredAt ?? null,
        history: `${weights.length} entries`,
        href: "/progress/weight",
        status: "available",
        tone: "evidence",
      },
      {
        id: "dexa",
        title: "DEXA",
        metric: latestDEXA?.bodyFatPercentage
          ? `${latestDEXA.bodyFatPercentage.toFixed(1)}%`
          : "No scans",
        trend:
          latestDEXA && previousDEXA
            ? formatSignedPercent(
                latestDEXA.bodyFatPercentage - previousDEXA.bodyFatPercentage
              )
            : "Trend pending",
        trendLabel: "since previous scan",
        lastUpdated: latestDEXA?.measuredAt ?? null,
        history: `${dexaScans.length} scans`,
        href: "/progress/dexa",
        status: "available",
        tone: "success",
      },
      {
        id: "photos",
        title: "Progress Photos",
        metric: latestPhoto ? "Latest Photo Set" : "No photos",
        trend: latestPhoto ? formatDate(latestPhoto.date ?? latestPhoto.capturedAt) : "Pending",
        trendLabel: `${reportPhotos.length} records`,
        lastUpdated: latestPhoto?.date ?? latestPhoto?.capturedAt ?? null,
        history: `${photoSetCount} evidence sets`,
        href: "/progress/photos",
        status: "available",
        tone: "primary",
      },
      {
        id: "nutrition",
        title: "Nutrition",
        metric: nutritionContext?.estimatedDailyCaloricIntake
          ? `${nutritionContext.estimatedDailyCaloricIntake.min}-${nutritionContext.estimatedDailyCaloricIntake.max} kcal`
          : "No intake context",
        trend: "Intake context only",
        trendLabel: "calories and protein",
        lastUpdated: nutritionContext?.updatedAt ?? nutritionContext?.createdAt ?? null,
        history: "Current plan",
        href: "/progress/nutrition",
        status: "placeholder",
        tone: "effort",
      },
      {
        id: "training",
        title: "Training",
        metric: nutritionContext?.estimatedDailyActiveCalorieBurn
          ? `${nutritionContext.estimatedDailyActiveCalorieBurn.value} kcal`
          : "Reporting pending",
        trend: nutritionContext?.estimatedDailyActiveCalorieBurn
          ? "Active calorie burn context"
          : "Workout app integration not connected",
        trendLabel: "expenditure",
        lastUpdated: null,
        history: "No structured entries",
        href: "/progress/training",
        status: "placeholder",
        tone: "muted",
      },
      {
        id: "protocols",
        title: "Protocols",
        metric:
          activeProtocols.length > 0
            ? `${activeProtocols.length} active`
            : "No active protocols",
        trend: activeProtocols.map((item) => item.name).join(", ") || "None",
        trendLabel: "current phase",
        lastUpdated: activeProtocols.at(-1)?.startDate ?? null,
        history: `${protocols.length} records`,
        href: "/progress/protocols",
        status: "placeholder",
        tone: "effort",
      },
      {
        id: "recovery",
        title: "Recovery",
        metric: "Placeholder",
        trend: "Recovery signals not connected",
        trendLabel: "future stream",
        lastUpdated: null,
        history: "No structured entries",
        href: "/progress/recovery",
        status: "placeholder",
        tone: "muted",
      },
      {
        id: "health-metrics",
        title: "Health Metrics",
        metric: "Placeholder",
        trend: "Wearable metrics not connected",
        trendLabel: "future stream",
        lastUpdated: null,
        history: "No structured entries",
        href: "/progress/health-metrics",
        status: "placeholder",
        tone: "evidence",
      },
    ],
  };
}

function buildWeightReport({ weights, dexaScans, goals }) {
  const first = weights.at(0);
  const latest = weights.at(-1);
  const previous = weights.at(-2);
  const values = weights.map((entry) => ({
    id: entry.id,
    date: entry.measuredAt,
    value: entry.weight.value,
    label: formatWeight(entry.weight),
    detail:
      entry.context?.isDefault === false
        ? "Different weigh-in conditions"
        : "Morning weight",
  }));
  const weeklyAverages = getWeeklyAverages(values);
  const lowest = values.reduce(
    (lowestValue, entry) =>
      !lowestValue || entry.value < lowestValue.value ? entry : lowestValue,
    null
  );

  return {
    title: "Weight",
    subtitle: "Weight evidence over time.",
    relatedGoals: getRelatedGoals(goals, [
      "goal_visible_abs_at_rest",
      "goal_maintain_8_9_body_fat",
    ]),
    dataSources: getDataSources("weight"),
    summary: [
      {
        label: "Latest",
        value: latest ? formatWeight(latest.weight) : "Pending",
      },
      {
        label: "Since Start",
        value:
          latest && first
            ? formatSignedWeight(latest.weight.value - first.weight.value)
            : "Pending",
      },
      {
        label: "Last Change",
        value:
          latest && previous
            ? formatSignedWeight(latest.weight.value - previous.weight.value)
            : "Pending",
      },
      {
        label: "Lowest",
        value: lowest ? `${lowest.value.toFixed(1)} lb` : "Pending",
      },
    ],
    chart: {
      points: values,
      markers: dexaScans.map((scan) => ({
        id: scan.id,
        date: scan.measuredAt,
        label: "DEXA",
      })),
    },
    weeklyAverages,
    history: values.slice().reverse(),
  };
}

function buildDEXAReport({ dexaScans, goals }) {
  const latest = dexaScans.at(-1);
  const previous = dexaScans.at(-2);
  const values = dexaScans.map((scan) => ({
    id: scan.id,
    date: scan.measuredAt,
    bodyFatPercentage: scan.bodyFatPercentage,
    totalMass: scan.totalMass?.value,
    fatMass: scan.fatMass?.value,
    leanMass: scan.leanMass?.value,
    rmr: scan.restingMetabolicRate?.value,
    vatMass: scan.visceralAdiposeTissue?.mass?.value,
    androidGynoidRatio: scan.androidGynoidRatio,
    sourceFileId: scan.sourceFileId,
  }));

  return {
    title: "DEXA",
    subtitle: "BodySpec body-composition scan history.",
    relatedGoals: getRelatedGoals(goals, [
      "goal_visible_abs_at_rest",
      "goal_maintain_8_9_body_fat",
      "goal_preserve_lean_mass",
    ]),
    dataSources: getDataSources("dexa"),
    latestScan: latest
      ? {
          date: latest.measuredAt,
          sourceFileId: latest.sourceFileId,
          sourceHref: getPrivateEvidenceHref(`private/founder/dexa/${latest.sourceFileId}`),
        }
      : null,
    summary: [
      {
        label: "Body Fat",
        value: latest?.bodyFatPercentage
          ? `${latest.bodyFatPercentage.toFixed(1)}%`
          : "Pending",
      },
      {
        label: "Fat Mass",
        value: latest?.fatMass?.value ? `${latest.fatMass.value.toFixed(1)} lb` : "Pending",
      },
      {
        label: "Lean Mass",
        value: latest?.leanMass?.value ? `${latest.leanMass.value.toFixed(1)} lb` : "Pending",
      },
      {
        label: "Weight",
        value: latest?.totalMass?.value ? `${latest.totalMass.value.toFixed(1)} lb` : "Pending",
      },
      {
        label: "RMR",
        value: latest?.restingMetabolicRate?.value
          ? `${latest.restingMetabolicRate.value} kcal`
          : "Pending",
      },
    ],
    delta:
      latest && previous
        ? {
            bodyFat: formatSignedPercent(
              latest.bodyFatPercentage - previous.bodyFatPercentage
            ),
            fatMass: formatSignedWeight(latest.fatMass.value - previous.fatMass.value),
            leanMass: formatSignedWeight(
              latest.leanMass.value - previous.leanMass.value
            ),
          }
        : null,
    chart: {
      points: values.map((scan) => ({
        id: scan.id,
        date: scan.date,
        value: scan.bodyFatPercentage,
      })),
    },
    charts: [
      createMetricChart(values, "totalMass", "Weight", " lb"),
      createMetricChart(values, "fatMass", "Fat Mass", " lb"),
      createMetricChart(values, "leanMass", "Lean Mass", " lb"),
      createMetricChart(values, "vatMass", "VAT Mass", " lb"),
      createMetricChart(values, "rmr", "RMR", " kcal"),
      createMetricChart(values, "androidGynoidRatio", "A/G Ratio", ""),
    ].filter((chart) => chart.points.length > 1),
    regionalMassCharts: getRegionalMassCharts(dexaScans),
    latestRegional: latest?.regionalAssessment ?? null,
    latestMuscleBalance: latest?.muscleBalance ?? null,
    latestDetails: latest
      ? [
          ["VAT Mass", latest.visceralAdiposeTissue?.mass?.value, "lb"],
          ["VAT Volume", latest.visceralAdiposeTissue?.volume?.value, "in3"],
          ["Android Fat", latest.androidFatPercentage, "%"],
          ["Gynoid Fat", latest.gynoidFatPercentage, "%"],
          ["A/G Ratio", latest.androidGynoidRatio, ""],
          ["Bone Mineral Content", latest.boneMineralContent?.value, "lb"],
          ["Total BMD", latest.boneDensity?.totalBMD, ""],
          ["T-score", latest.boneDensity?.tScore, ""],
          ["Z-score", latest.boneDensity?.zScore, ""],
        ]
      : [],
    history: values
      .map((scan) => ({
        ...scan,
        sourceHref: getPrivateEvidenceHref(`private/founder/dexa/${scan.sourceFileId}`),
      }))
      .slice()
      .reverse(),
  };
}

function getPlaceholderEntries(streamId, context) {
  if (streamId === "photos") {
    return getPhotoRecords(context).slice().reverse();
  }

  if (streamId === "protocols") {
    return context.protocols.map((protocol) => ({
      label: protocol.name,
      value: `${formatLabel(protocol.status)} ${formatLabel(protocol.category)}`,
    }));
  }

  if (streamId === "nutrition" && context.nutritionContext) {
    return [
      {
        label: "Calorie Range",
        value: `${context.nutritionContext.estimatedDailyCaloricIntake.min}-${context.nutritionContext.estimatedDailyCaloricIntake.max} kcal`,
      },
    ];
  }

  if (streamId === "training" && context.nutritionContext?.estimatedDailyActiveCalorieBurn) {
    return [
      {
        label: "Active Burn Estimate",
        value: `${context.nutritionContext.estimatedDailyActiveCalorieBurn.value} kcal`,
      },
    ];
  }

  if (streamId === "recovery") {
    const recoveryEntries = context.checkIns
      .filter((checkIn) => checkIn.recovery?.notes || checkIn.notes)
      .slice()
      .reverse()
      .slice(0, 6)
      .map((checkIn) => ({
        label: formatDate(checkIn.date),
        value: checkIn.recovery?.notes ?? checkIn.notes,
      }));

    if (recoveryEntries.length > 0) return recoveryEntries;
  }

  return [
    {
      label: "Status",
      value: "Structured reporting placeholder",
    },
  ];
}

function getStreamReportExtras(streamId, context) {
  if (streamId === "photos") return getPhotoReportExtras(context);
  if (streamId === "training") return getTrainingReportExtras(context);
  if (streamId === "protocols") return getProtocolReportExtras(context);
  if (streamId === "nutrition") return getNutritionReportExtras(context);

  return {
    reportPattern: "Summary -> reporting -> history -> source evidence -> related goals.",
  };
}

function getPhotoReportExtras(context) {
  const records = getPhotoRecords(context);
  const photoSets = getPhotoSets(records);
  const latestPhotoSet = photoSets[0] ?? null;

  return {
    entries: records,
    latestPhotoSet,
    photoSets,
    comparisonInsights: latestPhotoSet
      ? [
          {
            label: latestPhotoSet.date,
            detail: `Compare this set against ${latestPhotoSet.comparedAgainst}.`,
          },
        ]
      : [
          {
            label: "Comparison pending",
            detail: "Add another matching photo set to unlock same-view comparisons.",
          },
        ],
    reportPattern: "Summary -> latest set -> evidence sets -> original images.",
  };
}

function getTrainingReportExtras({ nutritionContext }) {
  const burn = nutritionContext?.estimatedDailyActiveCalorieBurn;

  return {
    educationalContext: burn
      ? `Estimated from Apple Watch context at ${burn.value} ${burn.unit}/day with an expected wearable margin of error near ${burn.marginOfErrorPercent}%.`
      : "Training reporting will combine workout history, strength progression, cardio, and wearable expenditure.",
    reportPattern: "Summary -> workload -> consistency -> expenditure context -> integrations.",
  };
}

function getProtocolReportExtras({ protocols }) {
  return {
    expandableRecords: protocols.map((protocol) => ({
      id: protocol.id,
      title: protocol.name,
      detail: `${formatLabel(protocol.category)} / ${formatLabel(protocol.status)}`,
      education:
        "Protocol pages will explain purpose, expected evidence influence, related goals, and source context without providing medical advice.",
    })),
    reportPattern: "Summary -> active protocols -> educational context -> history.",
  };
}

function getNutritionReportExtras({ nutritionContext }) {
  return {
    educationalContext: nutritionContext?.estimatedDailyCaloricIntake
      ? "Nutrition reporting is intake-only here. Expenditure belongs to Training."
      : "Connect or enter nutrition evidence to report calorie, protein, and macro trends.",
    reportPattern: "Summary -> intake trends -> adherence -> integrations.",
  };
}

function getWeeklyAverages(points) {
  const weeks = new Map();

  points.forEach((point) => {
    const key = getWeekKey(point.date);
    const existing = weeks.get(key) ?? [];

    existing.push(point.value);
    weeks.set(key, existing);
  });

  let previousAverage = null;

  return [...weeks.entries()]
    .map(([week, values]) => {
      const currentAverage = average(values);
      const weekOverWeek =
        previousAverage === null
          ? null
          : Number((currentAverage - previousAverage).toFixed(1));

      previousAverage = currentAverage;

      return {
        week,
        average: currentAverage,
        weekOverWeek,
        entries: values.length,
      };
    })
    .slice(-6)
    .reverse();
}

function getRelatedGoals(goals = [], goalIds = []) {
  const idSet = new Set(goalIds);

  return goals
    .filter((goal) => idSet.has(goal.id))
    .map((goal) => ({
      id: goal.id,
      title: formatGoalTitle(goal.title),
      href: getGoalHref(goal.id),
    }));
}

function createMetricChart(values, field, label, suffix) {
  return {
    id: field,
    label,
    suffix,
    points: values
      .filter((scan) => Number.isFinite(scan[field]))
      .map((scan) => ({
        id: `${scan.id}-${field}`,
        date: scan.date,
        value: scan[field],
      })),
  };
}

function getRegionalMassCharts(scans = []) {
  const regions = [
    ["arms", "Arms"],
    ["legs", "Legs"],
    ["trunk", "Trunk"],
    ["android", "Android"],
    ["gynoid", "Gynoid"],
  ];
  const tissueTypes = [
    ["leanMass", "Lean", " lb"],
    ["fatMass", "Fat", " lb"],
  ];

  return regions.flatMap(([regionKey, regionLabel]) =>
    tissueTypes
      .map(([field, tissueLabel, suffix]) => ({
        id: `${regionKey}-${field}`,
        label: `${regionLabel} ${tissueLabel}`,
        suffix,
        points: scans
          .map((scan) => ({
            id: `${scan.id}-${regionKey}-${field}`,
            date: scan.measuredAt,
            value: scan.regionalAssessment?.[regionKey]?.[field]?.value,
          }))
          .filter((point) => Number.isFinite(point.value)),
      }))
      .filter((chart) => chart.points.length > 1)
  );
}

function getDataSources(streamId) {
  const sources = {
    dexa: [
      { name: "BodySpec PDF Import", status: "Connected" },
      { name: "Future BodySpec Integration", status: "Suggested" },
    ],
    weight: [
      { name: "Founder Weigh-ins", status: "Connected" },
      { name: "Apple Health", status: "Suggested" },
      { name: "Withings", status: "Suggested" },
      { name: "Garmin", status: "Suggested" },
    ],
    nutrition: [
      { name: "Founder Estimates", status: "Connected" },
      { name: "Cronometer", status: "Suggested" },
      { name: "MyFitnessPal", status: "Suggested" },
      { name: "MacroFactor", status: "Suggested" },
    ],
    photos: [
      { name: "Founder Photo Uploads", status: "Connected" },
      { name: "Camera Roll", status: "Suggested" },
    ],
    protocols: [
      { name: "Founder Operating Plan", status: "Connected" },
      { name: "Medication/Supplement Integrations", status: "Future" },
    ],
    recovery: [
      { name: "Founder Notes", status: "Connected" },
      { name: "Oura", status: "Suggested" },
      { name: "Whoop", status: "Suggested" },
      { name: "Apple Health", status: "Suggested" },
    ],
    training: [
      { name: "Founder Estimates", status: "Connected" },
      { name: "Apple Health", status: "Suggested" },
      { name: "Strava", status: "Suggested" },
      { name: "Garmin", status: "Suggested" },
    ],
    "health-metrics": [
      { name: "Apple Health", status: "Suggested" },
      { name: "Oura", status: "Suggested" },
      { name: "Whoop", status: "Suggested" },
    ],
  };

  return sources[streamId] ?? [];
}

function getStreamRelatedGoals(streamId, goals) {
  const goalIdsByStream = {
    nutrition: ["goal_visible_abs_at_rest", "goal_preserve_lean_mass"],
    photos: [
      "goal_visible_abs_at_rest",
      "goal_maintain_8_9_body_fat",
      "goal_preserve_lean_mass",
    ],
    protocols: [
      "goal_visible_abs_at_rest",
      "goal_maintain_8_9_body_fat",
      "goal_preserve_lean_mass",
    ],
    "health-metrics": ["goal_visible_abs_at_rest"],
    recovery: ["goal_visible_abs_at_rest", "goal_preserve_lean_mass"],
    training: ["goal_visible_abs_at_rest", "goal_preserve_lean_mass"],
  };

  return getRelatedGoals(goals, goalIdsByStream[streamId] ?? []);
}

function getPhotoRecords(context) {
  const verifiedPhotos = context.progressPhotos.filter(isVerifiedProgressPhoto);
  const reportPhotos = verifiedPhotos.length > 0 ? verifiedPhotos : context.progressPhotos;
  const interpretedEvidence = interpretProgressPhotos({
    photos: reportPhotos,
    weights: context.weights,
  });

  return interpretedEvidence.map(buildPhotoRecordFromVisualEvidence);
}

function buildPhotoRecordFromVisualEvidence(evidence) {
  return {
    id: evidence.sourceId,
    visualEvidenceId: evidence.id,
    label: evidence.metadata.label,
    value: formatDate(evidence.capturedAt),
    dateKey: evidence.metadata.dateKey,
    detail: evidence.metadata.detail,
    imageHref: getPrivateEvidenceHref(evidence.imagePath),
    previousImageHref: evidence.comparisonTarget?.imagePath
      ? getPrivateEvidenceHref(evidence.comparisonTarget.imagePath)
      : null,
    previousLabel: evidence.comparisonTarget?.label ?? null,
    comparedAgainst: evidence.comparisonTarget?.capturedAt
      ? formatDate(evidence.comparisonTarget.capturedAt)
      : "Prior matching photo pending",
    observedChanges: evidence.observations.map(formatVisualObservation),
    strengths: evidence.biggestImprovements,
    remainingFocus: evidence.remainingFocus,
    confidenceContribution: evidence.confidenceImpact.summary,
    tags: evidence.tags,
    timelinePlacement: evidence.timelinePlacement,
    weight: evidence.metadata.weightLabel,
  };
}

function formatVisualObservation(observation) {
  if (typeof observation === "string") return observation;

  return observation?.description ?? "";
}

function getPhotoSets(records = []) {
  const setsByDate = records.reduce((sets, record) => {
    const dateKey = record.dateKey;
    if (!dateKey) return sets;

    if (!sets.has(dateKey)) {
      sets.set(dateKey, {
        id: `photo-set-${dateKey}`,
        dateKey,
        date: formatDate(dateKey),
        weight: record.weight ?? "No same-day weight",
        views: [],
        thumbnailHref: record.imageHref,
        primaryRecordId: record.id,
        comparedAgainst: record.comparedAgainst,
      });
    }

    const set = sets.get(dateKey);
    set.views.push(record.label);
    if (!set.thumbnailHref && record.imageHref) set.thumbnailHref = record.imageHref;
    if (set.comparedAgainst === "Prior matching photo pending" && record.comparedAgainst) {
      set.comparedAgainst = record.comparedAgainst;
    }

    return sets;
  }, new Map());

  return [...setsByDate.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function getGoalHref(goalId) {
  if (goalId === "goal_visible_abs_at_rest") return "/goals/visible-abs";
  if (goalId === "goal_maintain_8_9_body_fat") return "/goals/maintenance";
  if (goalId === "goal_preserve_lean_mass") return "/goals/lean-mass";

  return "/goals";
}

function formatGoalTitle(title) {
  if (title === "Visible abs at rest") return "Visible Abs";
  if (title === "Maintain 8-9% body fat") return "Maintain 8-9%";
  if (title === "Preserve lean mass") return "Preserve Lean Mass";

  return title;
}

function getWeekKey(value) {
  const date = createLocalDate(value);
  const start = new Date(date);
  const day = start.getDay();

  start.setDate(start.getDate() - day);

  return start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sortByDate(items, field) {
  return [...items].sort((a, b) =>
    String(a[field] ?? "").localeCompare(String(b[field] ?? ""))
  );
}

function formatWeight(weight) {
  if (!weight?.value) return "Pending";

  return `${weight.value.toFixed(1)} ${weight.unit ?? "lb"}`;
}

function formatSignedWeight(value) {
  if (!Number.isFinite(value)) return "Pending";

  const prefix = value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(1)} lb`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "Pending";

  const prefix = value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(1)} pts`;
}

function formatDate(value) {
  if (!value) return "Pending";

  const date = createLocalDate(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function createLocalDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);

  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function getPrivateEvidenceHref(relativePath) {
  if (!relativePath) return null;

  return `/api/private-evidence/${String(relativePath).replace(/^private\//, "")}`;
}

function isVerifiedProgressPhoto(photo) {
  return photo.source?.name === "Founder Historical Progress Photos";
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
