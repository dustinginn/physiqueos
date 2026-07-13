import fs from "node:fs";
import path from "node:path";
import { createProgressPhoto } from "../models/progressPhoto";
import {
  normalizeProgressPhotoPose,
  normalizeProgressPhotoView,
} from "../models/progressPhotoPoseVocabulary";
import {
  getCanonicalTrainingExerciseLabel,
  getCanonicalTrainingExerciseSlug,
} from "../models/trainingExerciseIdentity";
import { interpretProgressPhotos } from "../interpreters";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import {
  decorateCanonicalPayloadForReadModel,
  isActiveCanonicalEvidenceObject,
} from "./CanonicalReadModel";
import { orderWeeklyAveragesNewestFirst } from "../utils/weeklyAverageOrdering";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

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

    async getActivityReport(userId) {
      const context = await getProgressContext({ repositories, userId });

      return buildActivityReport(context);
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
      evidencePackages: [],
      canonicalEvidenceObjects: [],
      nutritionContext: null,
      goals: [],
      nutritionDays: [],
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
    evidencePackages,
    canonicalEvidenceObjects,
    analyses,
  ] = await Promise.all([
    repositories.goals.listGoals(resolvedUserId),
    repositories.weights.listWeightEntries(resolvedUserId),
    repositories.dexaScans.listDEXAScans(resolvedUserId),
    repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
    repositories.protocols.listProtocols(resolvedUserId),
    repositories.dailyCheckIns.listCheckIns(resolvedUserId),
    repositories.nutritionContext.getNutritionContext(resolvedUserId),
    repositories.evidencePackages?.listEvidencePackages(resolvedUserId) ?? [],
    repositories.canonicalEvidence?.listCanonicalEvidenceObjects(resolvedUserId) ?? [],
    repositories.analyses?.listAnalyses(resolvedUserId) ?? [],
  ]);
  const canonicalPayloads = getCanonicalPayloads({
    canonicalEvidenceObjects,
    evidencePackages,
  });
  const trainingSessions = sortByDate(
    canonicalPayloads.filter(isTrainingSession),
    "observed_at"
  );
  const activityDays = getActivityDaysWithTrainingAggregates({
    explicitActivityDays: sortByDate(
      canonicalPayloads.filter(isActivityDay),
      "observed_at"
    ),
    trainingSessions,
  });
  const derivedProgressPhotos = deriveProgressPhotosFromEvidencePackages({
    evidencePackages,
    existingProgressPhotos: progressPhotos,
    userId: resolvedUserId,
  });
  const usableProgressPhotos = [...progressPhotos, ...derivedProgressPhotos].filter(
    isUsableProgressPhoto
  );
  const photoSessions = createPhotoSessionReadModels({ canonicalObjects: canonicalEvidenceObjects, legacyPhotos: usableProgressPhotos, weights, analyses });

  return {
    user,
    goals,
    weights: sortByDate(weights, "measuredAt"),
    dexaScans: sortByDate(dexaScans, "measuredAt"),
    progressPhotos: sortByDate(usableProgressPhotos, "date"),
    protocols: sortByDate(protocols, "startDate"),
    checkIns: sortByDate(checkIns, "date"),
    evidencePackages,
    canonicalEvidenceObjects,
    analyses,
    photoSessions,
    canonicalPayloads,
    activityDays,
    nutritionDays: sortByDate(
      canonicalPayloads.filter(isNutritionDay),
      "observed_at"
    ),
    trainingSessions,
    nutritionContext,
  };
}

function buildProgressHub(context) {
  const {
    weights,
    dexaScans,
    progressPhotos,
    protocols,
    nutritionContext,
    nutritionDays,
    trainingSessions,
    activityDays,
  } =
    context;
  const latestWeight = weights.at(-1);
  const firstWeight = weights.at(0);
  const latestDEXA = dexaScans.at(-1);
  const latestPhoto = context.photoSessions?.[0] ?? progressPhotos.at(-1);
  const reportPhotos = context.photoSessions ?? [];
  const activeProtocols = protocols.filter((item) => item.status === "active");
  const photoSetCount = reportPhotos.length;
  const latestTrainingSession = trainingSessions.at(-1);
  const latestActivityDay = activityDays.at(-1);
  const trainingUnderstanding = getTrainingUnderstanding({
    activityDays,
    trainingSessions,
  });
  const activityUnderstanding = getActivityUnderstanding({
    activityDays,
    trainingSessions,
  });

  return {
    title: "Evidence Hub",
    subtitle:
      "PhysiqueOS organizes what it knows about your body, progress, and routines.",
    streams: [
      {
        id: "weight",
        title: "Weight",
        metric: latestWeight
          ? formatWeight(latestWeight.weight)
          : "No entries",
        trend:
          latestWeight && firstWeight
            ? `${formatWeightDirection(
                latestWeight.weight.value - firstWeight.weight.value
              )} since the cut began.`
            : "Trend pending",
        trendLabel: "",
        lastUpdated: latestWeight?.measuredAt ?? null,
        history: "",
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
          dexaScans.length > 0
            ? `${dexaScans.length} scans during this cut.`
            : "Body composition scan pending.",
        trendLabel: "",
        lastUpdated: latestDEXA?.measuredAt ?? null,
        history: "",
        href: "/progress/dexa",
        status: "available",
        tone: "success",
      },
      {
        id: "photos",
        title: "Progress Photos",
        metric: latestPhoto ? "Latest Photo Set" : "No photos yet",
        trend: latestPhoto
          ? "View photo progress"
          : "Add matching photos to unlock visual comparisons.",
        trendLabel: "",
        lastUpdated: latestPhoto?.captureDate ?? latestPhoto?.date ?? latestPhoto?.capturedAt ?? null,
        history: "",
        href: "/progress/photos",
        status: "available",
        tone: "primary",
      },
      {
        id: "nutrition",
        title: "Nutrition",
        metric: nutritionDays.length
          ? `${nutritionDays.length} day${nutritionDays.length === 1 ? "" : "s"}`
          : nutritionContext?.estimatedDailyCaloricIntake
            ? `${nutritionContext.estimatedDailyCaloricIntake.min}-${nutritionContext.estimatedDailyCaloricIntake.max} kcal`
            : "Coming soon",
        trend: nutritionDays.length
          ? "Nutrition history available."
          : nutritionContext?.estimatedDailyCaloricIntake
            ? "Current target."
            : "Nutrition evidence will show intake, macros, meals, and adherence.",
        trendLabel: "",
        lastUpdated:
          nutritionDays.at(-1)?.observed_at ??
          nutritionContext?.updatedAt ??
          nutritionContext?.createdAt ??
          null,
        history: "",
        href: "/progress/nutrition",
        status: nutritionDays.length || nutritionContext ? "available" : "placeholder",
        tone: nutritionDays.length ? "primary" : "effort",
      },
      {
        id: "activity",
        title: "Activity",
        metric: latestActivityDay
          ? formatActivityHubMetric(latestActivityDay)
          : "No activity days",
        trend: latestActivityDay
          ? formatActivityProtocolSupport(latestActivityDay)
          : "Daily activity will show active calories, exercise minutes, and movement outside workouts.",
        trendLabel: "",
        lastUpdated: latestActivityDay?.observed_at ?? null,
        history: "",
        href: "/progress/activity",
        status: activityDays.length ? "available" : "placeholder",
        tone: activityUnderstanding.supportsCutProtocol ? "success" : "effort",
      },
      {
        id: "training",
        title: "Training",
        metric: trainingSessions.length
          ? `${trainingSessions.length} sessions`
          : nutritionContext?.estimatedDailyActiveCalorieBurn
            ? `${nutritionContext.estimatedDailyActiveCalorieBurn.value} kcal`
            : "Coming soon",
        trend: trainingSessions.length
          ? `${trainingUnderstanding.resistanceCount} resistance / ${trainingUnderstanding.cardioCount} cardio.`
          : nutritionContext?.estimatedDailyActiveCalorieBurn
            ? "Active burn estimate available."
            : "Training evidence will show workouts, cardio, lifting patterns, and source evidence.",
        trendLabel: "",
        lastUpdated: latestTrainingSession?.observed_at ?? latestActivityDay?.observed_at ?? null,
        history: "",
        href: "/progress/training",
        status: trainingSessions.length ? "available" : "placeholder",
        tone: trainingSessions.length ? "primary" : "muted",
      },
      {
        id: "protocols",
        title: "Protocols",
        metric:
          activeProtocols.length > 0
            ? `${activeProtocols.length} active`
          : "No active protocols",
        trend:
          activeProtocols.length > 0
            ? "Current protocol on track."
            : "Protocol history will appear as you define active routines.",
        trendLabel: "",
        lastUpdated: activeProtocols.at(-1)?.startDate ?? null,
        history: "",
        href: "/progress/protocols",
        status: "placeholder",
        tone: "effort",
      },
      {
        id: "recovery",
        title: "Recovery",
        metric: "Coming soon",
        trend: "Sleep, HRV, readiness, and recovery.",
        trendLabel: "",
        lastUpdated: null,
        history: "",
        href: "/progress/recovery",
        status: "placeholder",
        tone: "muted",
      },
      {
        id: "health-metrics",
        title: "Health Metrics",
        metric: "Coming soon",
        trend: "Vitals, labs, and wearable health signals.",
        trendLabel: "",
        lastUpdated: null,
        history: "",
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

function buildActivityReport(context) {
  const { activityDays = [], goals = [], trainingSessions = [] } = context;
  const latestActivityDay = activityDays.at(-1) ?? null;
  const latestActivityDate = getDateKey(latestActivityDay?.observed_at);
  const latestActivityIsToday =
    Boolean(latestActivityDate) && latestActivityDate === getTodayDateKey();
  const history = getActivityDayRecords(context);
  const understanding = getActivityUnderstanding({
    activityDays,
    trainingSessions,
  });

  return {
    id: "activity",
    title: "Activity",
    subtitle: "Whole-day movement, energy output, and daily activity context.",
    metric: latestActivityDay ? formatActivityDayValue(latestActivityDay) : "Pending",
    trend: latestActivityDay
      ? formatActivityProtocolSupport(latestActivityDay)
      : "Activity evidence will show how the full day supports the current cut.",
    tone: latestActivityDay ? "success" : "effort",
    lastUpdated: latestActivityDay?.observed_at ?? null,
    relatedGoals: getStreamRelatedGoals("activity", goals),
    dataSources: getDataSources("activity"),
    latestActivityDay: latestActivityDay
      ? createActivityDayRecord(latestActivityDay)
      : null,
    latestActivityLabel: latestActivityIsToday ? "Today" : "Latest Recorded",
    latestActivitySectionTitle: latestActivityIsToday
      ? "Today's Activity"
      : "Latest Activity Day",
    currentActivityProtocol: {
      sourceOfTruth: "User-defined",
      dailyActivityTarget: "~1000 active calories/day",
      goal: "Visible abs while preserving lean mass",
      interpretation:
        "Daily activity is evaluated as whole-day movement. Workouts contribute to the day, but do not replace the daily total.",
    },
    activityAreas: getActivityAreas(understanding),
    activityHistory: history,
    linkedTrainingContext: getLinkedActivityTrainingContext({
      activityDay: latestActivityDay,
      trainingSessions,
    }),
    reportPattern:
      "Latest activity day -> current activity protocol -> activity areas -> recent activity history.",
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

  if (streamId === "training" && context.trainingSessions?.length > 0) {
    return getTrainingRecords(context);
  }

  if (streamId === "activity" && context.activityDays?.length > 0) {
    return getActivityDayRecords(context);
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
  if (streamId === "activity") return buildActivityReport(context);
  if (streamId === "training") return getTrainingReportExtras(context);
  if (streamId === "protocols") return getProtocolReportExtras(context);
  if (streamId === "nutrition") return getNutritionReportExtras(context);

  return {
    reportPattern: "Summary -> reporting -> history -> source evidence -> related goals.",
  };
}

function getPhotoReportExtras(context) {
  const records = getPhotoRecords(context).map(toGalleryEvidenceRecord);
  const photoSets = context.photoSessions?.length
    ? context.photoSessions.map((session) => ({ ...session, views: session.views.map((view) => view.label) }))
    : getPhotoSets(records);
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

function toGalleryEvidenceRecord(view) {
  return {
    id: view.id,
    photoSessionId: view.photoSessionId,
    label: view.label,
    value: view.value,
    captureDate: view.captureDate,
    imageHref: view.imageHref,
    previousImageHref: view.previousImageHref,
    comparison: view.comparison ? { previousDate: view.comparison.previousDate, previousImageHref: view.comparison.previousImageHref } : null,
    galleryInterpretation: view.galleryInterpretation,
    sourceHistory: view.sourceHistory,
  };
}

function getTrainingReportExtras(context) {
  const { nutritionContext, trainingSessions = [], activityDays = [] } = context;
  const burn = nutritionContext?.estimatedDailyActiveCalorieBurn;
  const records = getTrainingRecords(context);
  const activityRecords = getActivityDayRecords(context);
  const latestActivityDay = activityDays.at(-1);
  const trainingDays = getTrainingDays(records);
  const understanding = getTrainingUnderstanding({
    activityDays,
    trainingSessions,
  });
  const trainingBreakdowns = getTrainingBreakdowns(trainingSessions);
  const resistancePerformance = createTrainingPerformanceIntelligenceReport({
    trainingSessions,
  });

  return {
    entries: records.length > 0 ? records : activityRecords,
    latestTrainingDay: trainingDays[0] ?? null,
    currentProtocol: {
      sourceOfTruth: "User-defined",
      dailyActivityTarget: "~1000 active calories/day",
      resistanceTraining: "Maintain lean mass while cutting",
      goal: "Visible abs while preserving lean mass",
    },
    reportingLinks: getTrainingReportingLinks(),
    trainingLibrary: getTrainingLibrary({
      breakdowns: trainingBreakdowns,
      understanding,
    }),
    trainingPatterns: getTrainingPatterns({
      breakdowns: trainingBreakdowns,
      understanding,
    }),
    trainingDays,
    trainingOverview: [
      {
        label: "Sessions",
        value: trainingSessions.length ? String(trainingSessions.length) : "Pending",
      },
      {
        label: "Active Calories",
        value: Number.isFinite(understanding.activeCalories)
          ? `${understanding.activeCalories}`
          : "Pending",
      },
      {
        label: "Exercise Minutes",
        value: Number.isFinite(understanding.exerciseMinutes)
          ? `${understanding.exerciseMinutes}`
          : "Pending",
      },
    ],
    trainingUnderstanding: [
      {
        label: "Resistance training",
        value: `${understanding.resistanceCount} workout${
          understanding.resistanceCount === 1 ? "" : "s"
        }`,
      },
      {
        label: "Cardio",
        value: `${understanding.cardioCount} session${
          understanding.cardioCount === 1 ? "" : "s"
        }`,
      },
    ],
    trainingBreakdowns,
    resistancePerformance,
    sourceEvidence: getTrainingSourceEvidence(trainingSessions),
    educationalContext: burn
      ? `Estimated from Apple Watch context at ${burn.value} ${burn.unit}/day with an expected wearable margin of error near ${burn.marginOfErrorPercent}%.`
      : trainingSessions.length > 0
        ? "PhysiqueOS understands this as one resistance workout and four cardio sessions from the uploaded activity evidence."
        : "Training reporting will combine workout history, strength progression, cardio, and wearable expenditure.",
    activitySummary: latestActivityDay
      ? {
          label: formatDate(latestActivityDay.observed_at),
          value: formatActivityDayValue(latestActivityDay),
        }
      : null,
    reportPattern: "Latest training day -> current protocol -> reporting -> training areas -> recent training history.",
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

function getNutritionReportExtras({ nutritionContext, nutritionDays = [] }) {
  const latestNutritionDay = nutritionDays.at(-1) ?? null;
  const nutritionDayEntries = getNutritionDayEntries(nutritionDays);
  const latestContextEntry = nutritionContext ? getNutritionContextEntry(nutritionContext) : null;
  const latestNutrition = latestNutritionDay
    ? nutritionDayEntries[0]
    : latestContextEntry;

  return {
    currentNutritionProtocol: getCurrentNutritionProtocol(nutritionContext),
    entries: latestContextEntry
      ? [latestContextEntry, ...nutritionDayEntries]
      : nutritionDayEntries,
    latestNutrition,
    nutritionDays: nutritionDayEntries,
    nutritionLibrary: getNutritionLibrary({ nutritionContext, nutritionDays }),
    nutritionReportingLinks: getNutritionReportingLinks(),
    reportPattern: "Latest nutrition day -> current protocol -> reporting -> nutrition areas -> recent nutrition history.",
  };
}

function getCanonicalPayloads({ canonicalEvidenceObjects = [], evidencePackages = [] } = {}) {
  const objectMap = new Map();
  const canonicalPayloads = canonicalEvidenceObjects
    .filter(isActiveCanonicalObject)
    .map((canonicalObject) =>
      decorateCanonicalPayload(canonicalObject.payload ?? canonicalObject, canonicalObject)
    );

  canonicalPayloads.forEach((payload) => {
    objectMap.set(getEvidenceObjectIdentity(payload), payload);
  });

  evidencePackages.forEach((evidencePackage) => {
    (evidencePackage.evidence_objects ?? []).forEach((evidenceObject) => {
      if (
        isTrainingSession(evidenceObject) &&
        canonicalPayloads.some(isTrainingSession)
      ) {
        return;
      }

      if (
        isActivityDay(evidenceObject) &&
        canonicalPayloads.some(isActivityDay)
      ) {
        return;
      }

      if (hasEquivalentCanonicalPayload([...objectMap.values()], evidenceObject)) {
        return;
      }

      objectMap.set(getEvidenceObjectIdentity(evidenceObject), evidenceObject);
    });
  });

  return [...objectMap.values()];
}

function decorateCanonicalPayload(payload = {}, canonicalObject = {}) {
  return decorateCanonicalPayloadForReadModel(payload, canonicalObject);
}

function isActiveCanonicalObject(canonicalObject = {}) {
  return isActiveCanonicalEvidenceObject(canonicalObject);
}

function getTrainingRecords(context = {}) {
  return (context.trainingSessions ?? [])
    .map((session) => {
      const id = session._canonicalId ?? session.id;

      return {
        aliases: uniqueStrings([
          id,
          session.id,
          ...(session._canonicalProvenance?.contributing_evidence_object_ids ?? []),
        ]),
        canonicalId: session._canonicalId ?? null,
        exercises: session.exercises ?? [],
        href: `/progress/training/session/${encodeURIComponent(id)}`,
        id,
        label: session.metadata?.activity_type ?? "Workout",
        value: formatTrainingRecordValue(session),
        detail: formatTrainingRecordDetail(session),
        date: session.observed_at,
        sourceEvidence: getSessionSourceLabels(session),
      };
    })
    .slice()
    .reverse();
}

function getTrainingDays(records = []) {
  const days = new Map();

  records.forEach((record) => {
    const dateKey = getDateKey(record.date);
    if (!dateKey) return;

    if (!days.has(dateKey)) {
      days.set(dateKey, {
        date: dateKey,
        id: `training-day-${dateKey}`,
        sessions: [],
      });
    }

    days.get(dateKey).sessions.push(record);
  });

  return [...days.values()]
    .map((day) => ({
      ...day,
      label: formatDate(day.date),
      summary: `${day.sessions.length} session${day.sessions.length === 1 ? "" : "s"}`,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function getActivityDayRecords(context = {}) {
  return (context.activityDays ?? [])
    .map(createActivityDayRecord)
    .slice()
    .reverse();
}

function getActivityDaysWithTrainingAggregates({
  explicitActivityDays = [],
  trainingSessions = [],
} = {}) {
  const activityByDate = new Map(
    explicitActivityDays
      .filter(isActivityDay)
      .map((activityDay) => [getDateKey(activityDay.observed_at), activityDay])
      .filter(([date]) => Boolean(date))
  );
  const trainingByDate = groupTrainingSessionsByDate(trainingSessions);

  trainingByDate.forEach((sameDayTrainingSessions, date) => {
    const existingActivityDay = activityByDate.get(date);
    const aggregate = createTrainingBackedActivityDay({
      date,
      trainingSessions: sameDayTrainingSessions,
    });

    activityByDate.set(
      date,
      existingActivityDay
        ? mergeActivityDayWithTrainingAggregate(existingActivityDay, aggregate)
        : aggregate
    );
  });

  return sortByDate([...activityByDate.values()], "observed_at");
}

function groupTrainingSessionsByDate(trainingSessions = []) {
  return trainingSessions.reduce((groups, session) => {
    const date = getDateKey(session.observed_at);
    if (!date) return groups;

    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(session);

    return groups;
  }, new Map());
}

function createTrainingBackedActivityDay({ date, trainingSessions = [] } = {}) {
  const workoutActiveCalories = sumTrainingActiveCalories(trainingSessions);
  const trainingSessionIds = trainingSessions
    .map((session) => session._canonicalId ?? session.id)
    .filter(Boolean);

  return {
    id: `activity_training_partial_${date}`,
    evidence_type: "activity_day",
    observed_at: date,
    source: {
      modality: "training",
      application: "Training history",
      source_artifact_refs: [],
    },
    metadata: {
      date,
      source: "Training history",
      confidence: "moderate",
      provenance: [],
    },
    daily_activity: {
      move_calories: null,
      move_goal: null,
      exercise_minutes: null,
      exercise_goal: null,
      stand_hours: null,
      stand_goal: null,
      total_calories_burned: null,
      ring_completion: {
        move: null,
        exercise: null,
        stand: null,
      },
    },
    derived_metrics: {
      workout_active_calories: workoutActiveCalories,
      non_workout_active_calories: null,
      training_sessions_referenced: trainingSessionIds.length,
    },
    references: {
      training_session_ids: trainingSessionIds,
    },
    confidence: {
      extraction: "moderate",
      interpretation: "moderate",
    },
    quality: {
      status: "partial",
      limitations: ["Full-day activity summary has not been added yet."],
    },
    provenance: {
      source_artifact_refs: [],
    },
    _activityAggregateKind: "training_partial",
  };
}

function mergeActivityDayWithTrainingAggregate(activityDay = {}, aggregate = {}) {
  const dailyActivity = activityDay.daily_activity ?? {};
  const moveCalories = Number(dailyActivity.move_calories);
  const aggregateWorkoutActiveCalories = aggregate.derived_metrics?.workout_active_calories;
  const existingWorkoutActiveCalories = activityDay.derived_metrics?.workout_active_calories;
  const workoutActiveCalories =
    Number.isFinite(Number(aggregateWorkoutActiveCalories)) &&
    Number(aggregateWorkoutActiveCalories) > 0
      ? aggregateWorkoutActiveCalories
      : existingWorkoutActiveCalories ?? aggregateWorkoutActiveCalories ?? null;
  const nonWorkoutActiveCalories =
    Number.isFinite(moveCalories) && Number.isFinite(Number(workoutActiveCalories))
      ? Math.max(0, moveCalories - Number(workoutActiveCalories))
      : activityDay.derived_metrics?.non_workout_active_calories ?? null;
  const trainingSessionIds = uniqueStrings([
    ...(activityDay.references?.training_session_ids ?? []),
    ...(aggregate.references?.training_session_ids ?? []),
  ]);

  return {
    ...aggregate,
    ...activityDay,
    daily_activity: {
      ...aggregate.daily_activity,
      ...dailyActivity,
      ring_completion: {
        ...(aggregate.daily_activity?.ring_completion ?? {}),
        ...(dailyActivity.ring_completion ?? {}),
      },
    },
    derived_metrics: {
      ...(activityDay.derived_metrics ?? {}),
      workout_active_calories: workoutActiveCalories,
      non_workout_active_calories: nonWorkoutActiveCalories,
      training_sessions_referenced: trainingSessionIds.length,
    },
    references: {
      ...(activityDay.references ?? {}),
      training_session_ids: trainingSessionIds,
    },
  };
}

function createActivityDayRecord(activityDay = {}) {
  const dateKey = getDateKey(activityDay.observed_at);

  return {
      id: activityDay.id,
      label: "Daily Activity",
      value: formatActivityDayValue(activityDay),
      detail: formatActivityDayDetail(activityDay),
      date: activityDay.observed_at,
      isToday: Boolean(dateKey) && dateKey === getTodayDateKey(),
      activeCalories: activityDay.daily_activity?.move_calories ?? null,
      totalCalories: activityDay.daily_activity?.total_calories_burned ?? null,
      exerciseMinutes: activityDay.daily_activity?.exercise_minutes ?? null,
      standHours: activityDay.daily_activity?.stand_hours ?? null,
      moveGoal: activityDay.daily_activity?.move_goal ?? null,
      exerciseGoal: activityDay.daily_activity?.exercise_goal ?? null,
      standGoal: activityDay.daily_activity?.stand_goal ?? null,
      ringCompletion: activityDay.daily_activity?.ring_completion ?? {},
      workoutActiveCalories:
        activityDay.derived_metrics?.workout_active_calories ?? null,
      nonWorkoutActiveCalories:
        activityDay.derived_metrics?.non_workout_active_calories ?? null,
      linkedTrainingSessionCount:
        activityDay.derived_metrics?.training_sessions_referenced ??
        activityDay.references?.training_session_ids?.length ??
        0,
      protocolStatus: formatActivityProtocolSupport(activityDay),
    };
}

function isActivityDay(evidenceObject) {
  return evidenceObject?.evidence_type === "activity_day";
}

function isTrainingSession(evidenceObject) {
  return evidenceObject?.evidence_type === "training";
}

function isNutritionDay(evidenceObject) {
  return evidenceObject?.evidence_type === "nutrition";
}

function getEvidenceObjectIdentity(evidenceObject) {
  if (isNutritionDay(evidenceObject)) {
    return ["nutrition", getDateKey(evidenceObject.observed_at)].join("|");
  }

  if (isActivityDay(evidenceObject)) {
    return ["activity_day", getDateKey(evidenceObject.observed_at)].join("|");
  }

  if (isTrainingSession(evidenceObject)) {
    const metadata = evidenceObject.metadata ?? {};

    return [
      "training",
      getDateKey(evidenceObject.observed_at),
      metadata.activity_type,
      metadata.active_calories,
      metadata.distance,
      metadata.start_time ?? metadata.started_at ?? metadata.start,
      metadata.duration_seconds,
    ].join("|");
  }

  return [evidenceObject.evidence_type, evidenceObject.id].join("|");
}

function hasEquivalentCanonicalPayload(canonicalPayloads = [], evidenceObject = {}) {
  const identity = getEvidenceObjectIdentity(evidenceObject);

  return canonicalPayloads.some(
    (payload) =>
      getEvidenceObjectIdentity(payload) === identity ||
      isCompatibleActivityDayPayload(payload, evidenceObject) ||
      isCompatibleTrainingPayload(payload, evidenceObject)
  );
}

function isCompatibleActivityDayPayload(left = {}, right = {}) {
  if (!isActivityDay(left) || !isActivityDay(right)) return false;

  const leftSourceRefs = getSourceArtifactRefs(left);
  const rightSourceRefs = getSourceArtifactRefs(right);
  if (!intersects(leftSourceRefs, rightSourceRefs)) return false;

  return haveSameActivityDayTotals(left.daily_activity, right.daily_activity);
}

function haveSameActivityDayTotals(left = {}, right = {}) {
  return (
    comparableActivityMetric(left.move_calories, right.move_calories) &&
    comparableActivityMetric(left.exercise_minutes, right.exercise_minutes) &&
    comparableActivityMetric(left.stand_hours, right.stand_hours)
  );
}

function comparableActivityMetric(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return true;
  }

  return Number(left) === Number(right);
}

function isCompatibleTrainingPayload(left = {}, right = {}) {
  if (!isTrainingSession(left) || !isTrainingSession(right)) return false;

  const leftMetadata = left.metadata ?? {};
  const rightMetadata = right.metadata ?? {};

  if (getDateKey(left.observed_at) !== getDateKey(right.observed_at)) return false;
  if (normalizeIdentityPart(leftMetadata.activity_type) !== normalizeIdentityPart(rightMetadata.activity_type)) {
    return false;
  }

  if (isTrainingExerciseEnrichmentPair(left, right)) return true;

  return (
    hasSufficientSharedTrainingIdentity(leftMetadata, rightMetadata) &&
    areTrainingIdentityPartsCompatible(leftMetadata, rightMetadata)
  );
}

function areTrainingIdentityPartsCompatible(leftMetadata = {}, rightMetadata = {}) {
  return (
    compatibleOptionalIdentityPart(
      leftMetadata.active_calories,
      rightMetadata.active_calories
    ) &&
    compatibleOptionalIdentityPart(leftMetadata.distance, rightMetadata.distance) &&
    compatibleOptionalNumber(
      leftMetadata.duration_seconds,
      rightMetadata.duration_seconds,
      120
    ) &&
    compatibleOptionalIdentityPart(leftMetadata.start_time, rightMetadata.start_time) &&
    compatibleOptionalIdentityPart(leftMetadata.end_time, rightMetadata.end_time)
  );
}

function isTrainingExerciseEnrichmentPair(left = {}, right = {}) {
  const leftMetadata = left.metadata ?? {};
  const rightMetadata = right.metadata ?? {};

  if (!isResistanceActivityType(leftMetadata.activity_type)) return false;
  if (!isResistanceActivityType(rightMetadata.activity_type)) return false;

  const leftExerciseOnly = isExerciseOnlyTrainingPayload(left);
  const rightExerciseOnly = isExerciseOnlyTrainingPayload(right);
  if (leftExerciseOnly === rightExerciseOnly) return false;

  const exerciseOnlyPayload = leftExerciseOnly ? left : right;
  const workoutPayload = leftExerciseOnly ? right : left;
  const exerciseOnlyMetadata = exerciseOnlyPayload.metadata ?? {};

  const exerciseOnlyHasNoWorkoutMetrics = ![
    exerciseOnlyMetadata.active_calories,
    exerciseOnlyMetadata.distance,
    exerciseOnlyMetadata.duration_seconds,
    exerciseOnlyMetadata.start_time,
    exerciseOnlyMetadata.end_time,
  ].some((value) => value !== null && value !== undefined && value !== "");

  return (
    exerciseOnlyHasNoWorkoutMetrics &&
    hasOverlappingExerciseNames(exerciseOnlyPayload.exercises, workoutPayload.exercises)
  );
}

function isExerciseOnlyTrainingPayload(payload = {}) {
  const metadata = payload.metadata ?? {};

  return (
    (payload.exercises ?? []).length > 0 &&
    ![
      metadata.active_calories,
      metadata.distance,
      metadata.duration_seconds,
      metadata.start_time,
      metadata.end_time,
    ].some((value) => value !== null && value !== undefined && value !== "")
  );
}

function hasOverlappingExerciseNames(left = [], right = []) {
  if ((left ?? []).length === 0 || (right ?? []).length === 0) return false;

  const rightNames = new Set(
    right.map((exercise) => normalizeIdentityPart(exercise?.name)).filter(Boolean)
  );

  return left.some((exercise) =>
    rightNames.has(normalizeIdentityPart(exercise?.name))
  );
}

function isResistanceActivityType(activityType) {
  return /strength|traditional strength|resistance|weight/i.test(
    String(activityType ?? "")
  );
}

function hasSufficientSharedTrainingIdentity(leftMetadata = {}, rightMetadata = {}) {
  if (bothPresent(leftMetadata.start_time, rightMetadata.start_time)) return true;
  if (bothPresent(leftMetadata.end_time, rightMetadata.end_time)) return true;

  const compatibleMetricCount = [
    ["active_calories", 0],
    ["distance", 0],
    ["duration_seconds", 120],
    ["average_heart_rate", 3],
  ].filter(([key, tolerance]) => {
    if (!bothPresent(leftMetadata[key], rightMetadata[key])) return false;
    return compatibleOptionalNumber(leftMetadata[key], rightMetadata[key], tolerance);
  }).length;

  return compatibleMetricCount >= 2;
}

function compatibleOptionalNumber(left, right, tolerance = 0) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return normalizeIdentityPart(left) === normalizeIdentityPart(right);
  }

  return Math.abs(leftNumber - rightNumber) <= tolerance;
}

function bothPresent(left, right) {
  return (
    left !== null &&
    left !== undefined &&
    left !== "" &&
    right !== null &&
    right !== undefined &&
    right !== ""
  );
}

function compatibleOptionalIdentityPart(left, right) {
  if (left === null || left === undefined || left === "") return true;
  if (right === null || right === undefined || right === "") return true;

  return normalizeIdentityPart(left) === normalizeIdentityPart(right);
}

function normalizeIdentityPart(value) {
  if (value === null || value === undefined || value === "") return "";

  return String(value).trim().toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function getSourceArtifactRefs(evidenceObject = {}) {
  return uniqueStrings([
    ...(evidenceObject.provenance?.source_artifact_refs ?? []),
    ...(evidenceObject.source?.source_artifact_refs ?? []),
  ]);
}

function intersects(left = [], right = []) {
  const rightSet = new Set(right.map(String));

  return left.some((value) => rightSet.has(String(value)));
}

function getCurrentNutritionProtocol(nutritionContext) {
  const calories = nutritionContext?.estimatedDailyCaloricIntake;
  const protein = nutritionContext?.proteinTarget;

  return {
    calorieTarget: calories
      ? `${calories.min}-${calories.max} ${calories.unit ?? "kcal"}/day`
      : "Not set",
    goal: "Visible abs while preserving lean mass",
    mealStrategy: "Not set",
    proteinTarget: protein
      ? `${protein.value ?? protein.min ?? protein.target} ${protein.unit ?? "g"}/day`
      : "Not set",
    sourceOfTruth: "User-defined",
  };
}

function getNutritionReportingLinks() {
  return [
    {
      detail: "Calorie targets, logged totals, weekly averages, and deficit context.",
      href: "/progress/nutrition/reporting/calories",
      id: "calories",
      label: "Calories",
    },
    {
      detail: "Protein, carbohydrate, fat, and macro distribution over time.",
      href: "/progress/nutrition/reporting/macros",
      id: "macros",
      label: "Macros",
    },
    {
      detail: "Meal timing, meal composition, and food-level records.",
      href: "/progress/nutrition/reporting/meals",
      id: "meals",
      label: "Meals",
    },
    {
      detail: "How intake compares with the current target range.",
      href: "/progress/nutrition/reporting/adherence",
      id: "adherence",
      label: "Adherence",
    },
    {
      detail: "Logging cadence and nutrition evidence coverage.",
      href: "/progress/nutrition/reporting/consistency",
      id: "consistency",
      label: "Consistency",
    },
  ];
}

function getNutritionLibrary({ nutritionContext, nutritionDays }) {
  const hasLoggedNutrition = nutritionDays.length > 0;
  const hasTarget = Boolean(nutritionContext?.estimatedDailyCaloricIntake);

  return [
    {
      detail: hasLoggedNutrition ? "Logged daily totals" : hasTarget ? "Current target" : "Coming soon",
      href: "/progress/nutrition/library/calories",
      id: "calories",
      label: "Calories",
    },
    {
      detail: hasLoggedNutrition ? "Protein, carbohydrates, and fat" : "Coming soon",
      href: "/progress/nutrition/library/macros",
      id: "macros",
      label: "Macros",
    },
    {
      detail: hasLoggedNutrition ? "Meals and foods" : "Coming soon",
      href: "/progress/nutrition/library/meals",
      id: "meals",
      label: "Meals",
    },
    {
      detail: "Coming soon",
      href: "/progress/nutrition/library/micronutrients",
      id: "micronutrients",
      label: "Micronutrients",
    },
    {
      detail: "Coming soon",
      href: "/progress/nutrition/library/supplements",
      id: "supplements",
      label: "Supplements",
    },
    {
      detail: "Coming soon",
      href: "/progress/nutrition/library/hydration",
      id: "hydration",
      label: "Hydration",
    },
  ];
}

function getNutritionDayEntries(nutritionDays = []) {
  return nutritionDays
    .map((nutritionDay) => ({
      date: nutritionDay.observed_at,
      detail: formatNutritionDayDetail(nutritionDay),
      href: `/progress/nutrition/day/${encodeURIComponent(nutritionDay.id)}`,
      id: nutritionDay.id,
      label: "Nutrition day",
      meals: nutritionDay.meals ?? [],
      sourceEvidence: getNutritionSourceLabels(nutritionDay),
      totals: nutritionDay.daily_totals ?? {},
      value: formatNutritionDayValue(nutritionDay),
    }))
    .slice()
    .reverse();
}

function getNutritionContextEntry(nutritionContext) {
  return {
    date: nutritionContext.updatedAt ?? nutritionContext.createdAt ?? "2026-06-29",
    detail: "Current nutrition target context. No complete logged intake for this day.",
    href: "/progress/nutrition/day/context",
    id: nutritionContext.id ?? "nutrition-context",
    label: "Nutrition context",
    sourceEvidence: ["Manual context"],
    value: formatNutritionContextValue(nutritionContext),
  };
}

function formatNutritionContextValue(nutritionContext) {
  const calories = nutritionContext?.estimatedDailyCaloricIntake;

  if (!calories) return "Current target";

  return `${calories.min}-${calories.max} ${calories.unit ?? "kcal"} target`;
}

function formatNutritionDayValue(nutritionDay) {
  const totals = nutritionDay.daily_totals ?? {};

  if (Number.isFinite(totals.calories)) return `${totals.calories} calories`;
  if (Number.isFinite(totals.protein_g)) return `${totals.protein_g}g protein`;

  return "Logged intake";
}

function formatNutritionDayDetail(nutritionDay) {
  const totals = nutritionDay.daily_totals ?? {};
  const meals = nutritionDay.meals ?? [];
  const parts = [
    Number.isFinite(totals.protein_g) ? `${totals.protein_g}g protein` : null,
    Number.isFinite(totals.carbs_g) ? `${totals.carbs_g}g carbs` : null,
    Number.isFinite(totals.fat_g) ? `${totals.fat_g}g fat` : null,
    meals.length > 0 ? `${meals.length} meals` : null,
  ].filter(Boolean);

  return parts.join(" · ") || "Nutrition evidence saved";
}

function getNutritionSourceLabels(nutritionDay = {}) {
  const refs = [
    ...(nutritionDay.provenance?.source_artifact_refs ?? []),
    ...(nutritionDay.source?.source_artifact_refs ?? []),
  ];

  if (nutritionDay.source?.application) return [nutritionDay.source.application];

  return [...new Set(refs.map(formatSourceArtifactLabel).filter(Boolean))];
}

function sumTrainingActiveCalories(trainingSessions = []) {
  return trainingSessions.reduce((sum, session) => {
    const value = Number(session.metadata?.active_calories);

    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function getTrainingUnderstanding({ activityDays = [], trainingSessions = [] } = {}) {
  const latestActivityDay = activityDays.at(-1);
  const resistanceCount = trainingSessions.filter(isResistanceTrainingSession).length;
  const cardioCount = Math.max(trainingSessions.length - resistanceCount, 0);
  const activeCalories =
    latestActivityDay?.derived_metrics?.workout_active_calories ??
    sumTrainingActiveCalories(trainingSessions);
  const exerciseMinutes = latestActivityDay?.daily_activity?.exercise_minutes ?? null;

  return {
    activeCalories,
    cardioCount,
    exerciseMinutes,
    resistanceCount,
  };
}

function getActivityUnderstanding({ activityDays = [], trainingSessions = [] } = {}) {
  const latestActivityDay = activityDays.at(-1);
  const activeCalories = latestActivityDay?.daily_activity?.move_calories ?? null;
  const totalCalories =
    latestActivityDay?.daily_activity?.total_calories_burned ?? null;
  const exerciseMinutes =
    latestActivityDay?.daily_activity?.exercise_minutes ?? null;
  const workoutActiveCalories =
    latestActivityDay?.derived_metrics?.workout_active_calories ??
    sumTrainingActiveCalories(
      trainingSessions.filter(
        (session) =>
          getDateKey(session.observed_at) === getDateKey(latestActivityDay?.observed_at)
      )
    );
  const nonWorkoutActiveCalories =
    latestActivityDay?.derived_metrics?.non_workout_active_calories ?? null;

  return {
    activeCalories,
    exerciseMinutes,
    nonWorkoutActiveCalories,
    supportsCutProtocol:
      Number.isFinite(activeCalories) && activeCalories >= ACTIVITY_TARGET_CALORIES,
    totalCalories,
    workoutActiveCalories,
  };
}

const ACTIVITY_TARGET_CALORIES = 1000;

function formatActivityHubMetric(activityDay = {}) {
  const moveCalories = activityDay.daily_activity?.move_calories;
  const exerciseMinutes = activityDay.daily_activity?.exercise_minutes;

  if (Number.isFinite(moveCalories)) return `${moveCalories} active cal`;
  if (Number.isFinite(exerciseMinutes)) return `${exerciseMinutes} exercise min`;

  return "Activity day";
}

function formatActivityProtocolSupport(activityDay = {}) {
  const moveCalories = activityDay.daily_activity?.move_calories;

  if (!Number.isFinite(moveCalories)) return "Activity context available.";

  const difference = moveCalories - ACTIVITY_TARGET_CALORIES;

  if (difference >= 0) {
    return `${difference} active calories above the current daily target.`;
  }

  return `${Math.abs(difference)} active calories below the current daily target.`;
}

function getActivityAreas(understanding = {}) {
  return [
    {
      detail: "Whole-day movement and active energy.",
      href: "/progress/activity/reporting/active-calories",
      id: "active-calories",
      label: "Active Calories",
      value: Number.isFinite(understanding.activeCalories)
        ? `${understanding.activeCalories} cal`
        : "Pending",
    },
    {
      detail: "Exercise minutes from workouts and daily movement.",
      href: "/progress/activity/reporting/exercise-minutes",
      id: "exercise-minutes",
      label: "Exercise Minutes",
      value: Number.isFinite(understanding.exerciseMinutes)
        ? `${understanding.exerciseMinutes} min`
        : "Pending",
    },
    {
      detail: "Energy from logged workouts within the day.",
      href: "/progress/activity/reporting/workout-activity",
      id: "workout-activity",
      label: "Workout Activity",
      value: Number.isFinite(understanding.workoutActiveCalories)
        ? `${understanding.workoutActiveCalories} cal`
        : "Pending",
    },
    {
      detail: "Movement outside logged workouts.",
      href: "/progress/activity/reporting/non-workout-activity",
      id: "non-workout-activity",
      label: "Non-Workout Activity",
      value: Number.isFinite(understanding.nonWorkoutActiveCalories)
        ? `${understanding.nonWorkoutActiveCalories} cal`
        : "Pending",
    },
  ];
}

function getLinkedActivityTrainingContext({ activityDay, trainingSessions = [] } = {}) {
  if (!activityDay) return [];

  const activityDate = getDateKey(activityDay.observed_at);
  const linkedIds = new Set(activityDay.references?.training_session_ids ?? []);

  return trainingSessions
    .filter(
      (session) =>
        getDateKey(session.observed_at) === activityDate &&
        (linkedIds.size === 0 ||
          linkedIds.has(session.id) ||
          linkedIds.has(session._canonicalId))
    )
    .map((session) => ({
      id: session._canonicalId ?? session.id,
      label: session.metadata?.activity_type ?? "Workout",
      value: formatTrainingRecordValue(session),
      detail: formatTrainingRecordDetail(session),
    }));
}

function getTrainingBreakdowns(trainingSessions = []) {
  const cardioSessions = trainingSessions.filter(
    (session) => !isResistanceTrainingSession(session)
  );
  const resistanceSessions = trainingSessions.filter(isResistanceTrainingSession);

  return {
    cardio: getCardioBreakdown(cardioSessions),
    resistance: getResistanceBreakdown(resistanceSessions),
  };
}

function getTrainingPatterns({ breakdowns = {}, understanding = {} } = {}) {
  const latestArea = getFirstResistanceArea(breakdowns.resistance);
  const latestMuscle = getFirstResistanceMuscleGroup(breakdowns.resistance);

  return [
    {
      label: "Cardio",
      value: `${understanding.cardioCount ?? 0} session${
        understanding.cardioCount === 1 ? "" : "s"
      }`,
    },
    {
      label: "Resistance",
      value: `${understanding.resistanceCount ?? 0} workout${
        understanding.resistanceCount === 1 ? "" : "s"
      }`,
    },
    {
      label: "Latest trained area",
      value: latestArea ?? "Pending",
    },
    {
      label: "Most recent muscle",
      value: latestMuscle ?? "Pending",
    },
  ];
}

function getTrainingReportingLinks() {
  return [
    {
      href: "/progress/training/reporting/resistance",
      id: "resistance",
      label: "Resistance Training",
      detail: "Strength progression, body-part distribution, and lean mass support.",
    },
    {
      href: "/progress/training/reporting/cardio",
      id: "cardio",
      label: "Cardio",
      detail: "Calories, exercise minutes, distance, pace, and heart-rate trends.",
    },
    {
      href: "/progress/training/reporting/volume",
      id: "volume",
      label: "Volume",
      detail: "Sets, reps, loads, and weekly work by exercise or muscle group.",
    },
    {
      href: "/progress/training/reporting/frequency",
      id: "frequency",
      label: "Frequency",
      detail: "How often each area, modality, and exercise appears.",
    },
    {
      href: "/progress/training/reporting/consistency",
      id: "consistency",
      label: "Consistency",
      detail: "Training cadence across days, weeks, cuts, and protocol phases.",
    },
    {
      href: "/progress/training/reporting/history",
      id: "history",
      label: "History",
      detail: "Chronological training days and sessions.",
    },
  ];
}

function getTrainingLibrary({ breakdowns = {}, understanding = {} } = {}) {
  return [
    {
      detail: `${understanding.cardioCount ?? 0} session${
        understanding.cardioCount === 1 ? "" : "s"
      }`,
      href: "/progress/training/library/cardio",
      id: "cardio",
      label: "Cardio",
    },
    {
      detail: `${understanding.resistanceCount ?? 0} workout${
        understanding.resistanceCount === 1 ? "" : "s"
      }`,
      href: "/progress/training/library/resistance",
      id: "resistance",
      label: "Resistance Training",
    },
    ...(breakdowns.resistance ?? []).map((region) => ({
      detail: "Body region",
      href: `/progress/training/library/resistance/${slugify(region.label)}`,
      id: `region-${slugify(region.label)}`,
      label: region.label,
      parent: "Resistance Training",
    })),
  ];
}

function getFirstResistanceArea(resistanceBreakdown = []) {
  return resistanceBreakdown.find((region) => region.label)?.label ?? null;
}

function getFirstResistanceMuscleGroup(resistanceBreakdown = []) {
  return (
    resistanceBreakdown
      .flatMap((region) => region.muscleGroups ?? [])
      .find((muscleGroup) => muscleGroup.label)?.label ?? null
  );
}

function getCardioBreakdown(cardioSessions = []) {
  const sessionsByActivity = new Map();

  cardioSessions.forEach((session) => {
    const activityType = session.metadata?.activity_type ?? "Cardio";
    const current = sessionsByActivity.get(activityType) ?? {
      count: 0,
      label: activityType,
    };

    current.count += 1;
    sessionsByActivity.set(activityType, current);
  });

  return [...sessionsByActivity.values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

function getResistanceBreakdown(resistanceSessions = []) {
  const regions = new Map();

  resistanceSessions.forEach((session) => {
    (session.exercises ?? []).forEach((exercise) => {
      const regionName = exercise.body_region ?? "Arms";
      const movementFamily = inferMovementFamily(exercise);

      if (!regions.has(regionName)) {
        regions.set(regionName, { label: regionName, movementFamilies: new Map() });
      }

      const region = regions.get(regionName);
      const familyKey = slugify(movementFamily);

      if (!region.movementFamilies.has(familyKey)) {
        region.movementFamilies.set(familyKey, {
          exercises: new Map(),
          label: movementFamily,
        });
      }

      const exerciseLabel = getCanonicalTrainingExerciseLabel(
        exercise.name ?? exercise.id
      );
      const exerciseKey = getCanonicalTrainingExerciseSlug(
        exercise.name ?? exercise.id
      );
      const family = region.movementFamilies.get(familyKey);
      const groupedSets = groupExerciseSets(exercise.sets ?? []);

      if (!family.exercises.has(exerciseKey)) {
        family.exercises.set(exerciseKey, {
          id: exercise.id ?? exerciseLabel,
          label: exerciseLabel,
          sets: groupedSets,
        });
        return;
      }

      const existingExercise = family.exercises.get(exerciseKey);

      family.exercises.set(exerciseKey, {
        ...existingExercise,
        sets: [...(existingExercise.sets ?? []), ...groupedSets],
      });
    });
  });

  return [...regions.values()].map((region) => {
    const movementFamilies = [...region.movementFamilies.values()].map((family) => ({
      ...family,
      exercises: [...family.exercises.values()],
    }));

    return {
      label: region.label,
      movementFamilies,
      muscleGroups: movementFamilies,
    };
  });
}

function inferMovementFamily(exercise = {}) {
  const name = String(exercise.name ?? "").toLowerCase();
  const pattern = String(exercise.movement_pattern ?? "").toLowerCase();

  if (/shoulder\s+press|overhead\s+press|arnold\s+press/.test(name)) {
    return "Shoulder Press";
  }
  if (/lateral\s+raises?/.test(name)) return "Lateral Raises";
  if (/front\s+raises?/.test(name)) return "Front Raises";
  if (/spider\s+curl|ez\s+bar\s+curl|hammer\s+curl|cable\s+curl|curl/.test(name)) {
    return "Curl";
  }
  if (/pull-?up|pulldown|vertical\s+pull/.test(name) || /vertical pull/.test(pattern)) {
    return "Vertical Pull";
  }
  if (/row/.test(name) || /horizontal pull/.test(pattern)) return "Horizontal Row";
  if (/incline\s+press/.test(name)) return "Incline Press";
  if (/decline\s+press/.test(name)) return "Decline Press";
  if (/bench|flat\s+press|chest\s+press/.test(name)) return "Flat Press";
  if (/fly|flye/.test(name)) return "Flyes";
  if (/leg\s+raise|hanging/.test(name)) return "Core Raise";
  if (/squat|lunge/.test(name)) return "Squat";
  if (/deadlift|hinge/.test(name)) return "Hip Hinge";
  if (/lateral raise/.test(pattern)) return "Lateral Raises";
  if (/vertical push/.test(pattern)) return "Shoulder Press";
  if (/shoulder isolation/.test(pattern)) return "Shoulder Isolation";
  if (/elbow flexion/.test(pattern)) return "Curl";

  return exercise.movement_pattern ?? exercise.primary_muscle_groups?.[0] ?? "Other";
}

function getTrainingSourceEvidence(trainingSessions = []) {
  return trainingSessions
    .map((session) => ({
      id: session.id,
      label: session.metadata?.activity_type ?? "Workout",
      date: session.observed_at,
      sources: getSessionSourceLabels(session),
    }))
    .filter((item) => item.sources.length > 0);
}

function getSessionSourceLabels(session = {}) {
  const sourceRefs = [
    ...(session.provenance?.source_artifact_refs ?? []),
    ...(session.source?.source_artifact_refs ?? []),
  ];
  const labels = sourceRefs.map(formatSourceArtifactLabel);

  if (/manual[_\s-]?correction/i.test(String(session.source?.modality ?? ""))) {
    labels.push("Correction");
  }

  return [...new Set(labels.filter(Boolean))];
}

function formatSourceArtifactLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/typed_evidence/i.test(text)) return "Typed evidence";
  if (/\.(png|jpe?g|webp)$/i.test(text)) return "Screenshot";
  if (/screenshot|img_/i.test(text)) return "Screenshot";

  return formatLabel(text);
}

function isResistanceTrainingSession(session = {}) {
  const activityType = session.metadata?.activity_type ?? "";

  return (
    /strength|resistance|lifting|weights?/i.test(activityType) ||
    (session.exercises ?? []).length > 0
  );
}

function formatActivityDayValue(activityDay) {
  const dailyActivity = activityDay.daily_activity ?? {};
  const move = dailyActivity.move_calories;
  const exercise = dailyActivity.exercise_minutes;

  if (Number.isFinite(move) && Number.isFinite(exercise)) {
    return `${move} active cal / ${exercise} min`;
  }

  if (Number.isFinite(move)) return `${move} active cal`;
  if (Number.isFinite(exercise)) return `${exercise} exercise min`;

  return formatDate(activityDay.observed_at);
}

function formatActivityDayDetail(activityDay) {
  const dailyActivity = activityDay.daily_activity ?? {};
  const derived = activityDay.derived_metrics ?? {};
  const parts = [
    Number.isFinite(dailyActivity.total_calories_burned)
      ? `${dailyActivity.total_calories_burned} total calories`
      : null,
    Number.isFinite(derived.training_sessions_referenced)
      ? `${derived.training_sessions_referenced} workouts linked`
      : null,
    Number.isFinite(derived.non_workout_active_calories)
      ? `${derived.non_workout_active_calories} non-workout active cal`
      : null,
  ].filter(Boolean);

  return parts.join(" · ") || "Daily activity summary";
}

function formatTrainingRecordValue(session) {
  const metadata = session.metadata ?? {};

  if (Number.isFinite(metadata.active_calories)) {
    return `${metadata.active_calories} active cal`;
  }

  if (Number.isFinite(metadata.distance)) {
    return `${metadata.distance} ${metadata.distance_unit ?? "mi"}`;
  }

  return "";
}

function formatTrainingRecordDetail(session) {
  const metadata = session.metadata ?? {};
  const parts = [
    formatTimeRange(metadata),
    formatDuration(metadata.duration_seconds),
    Number.isFinite(metadata.distance)
      ? `${metadata.distance} ${metadata.distance_unit ?? "mi"}`
      : null,
    Number.isFinite(metadata.average_heart_rate)
      ? `${metadata.average_heart_rate} bpm avg HR`
      : null,
    formatExerciseSummary(session.exercises),
  ].filter(Boolean);

  return parts.join(" · ") || "Workout history updated";
}

function formatTimeRange(metadata = {}) {
  const start = metadata.start_time ?? metadata.started_at ?? metadata.start;
  const end = metadata.end_time ?? metadata.ended_at ?? metadata.end;

  if (start && end) return `${start}-${end}`;
  return start ?? null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatExerciseSummary(exercises = []) {
  if (!exercises.length) return null;

  return exercises
    .map(formatExerciseLine)
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
}

function formatExerciseLine(exercise) {
  const groupedSets = groupExerciseSets(exercise.sets ?? []);

  if (groupedSets.length === 0) return exercise.name;

  return `${exercise.name}: ${groupedSets.join(", ")}`;
}

function groupExerciseSets(sets = []) {
  const grouped = new Map();

  sets.forEach((set) => {
    const key = getExerciseSetGroupKey(set);
    const existing = grouped.get(key) ?? {
      count: 0,
      duration_seconds: set.duration_seconds,
      load_type: set.load_type,
      reps: set.reps,
      weight: set.weight,
      unit: set.weight_unit ?? "lb",
    };

    existing.count += 1;
    grouped.set(key, existing);
  });

  return [...grouped.values()].map(formatGroupedExerciseSet);
}

function getExerciseSetGroupKey(set = {}) {
  if (hasDurationSeconds(set)) {
    return `duration-${set.duration_seconds}`;
  }

  if (set.weight_unit === "bodyweight" || set.load_type === "bodyweight") {
    return `${set.reps}-bodyweight`;
  }

  return `${set.reps}-${set.weight}-${set.weight_unit ?? "lb"}`;
}

function formatGroupedExerciseSet(set = {}) {
  if (hasDurationSeconds(set)) {
    return `${set.count} x ${formatDurationSet(Number(set.duration_seconds))}`;
  }

  if (set.unit === "bodyweight" || set.load_type === "bodyweight") {
    return `${set.count} x ${set.reps} @ Bodyweight`;
  }

  return `${set.count} x ${set.reps} @ ${set.weight} ${set.unit}`;
}

function hasDurationSeconds(set = {}) {
  return (
    set.duration_seconds !== null &&
    set.duration_seconds !== undefined &&
    set.duration_seconds !== "" &&
    Number.isFinite(Number(set.duration_seconds))
  );
}

function formatDurationSet(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes <= 0) return `${seconds}s`;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getWeeklyAverages(points) {
  const weeks = new Map();

  points.forEach((point) => {
    const weekStart = getWeekStartKey(point.date);
    const existing = weeks.get(weekStart) ?? [];

    existing.push(point.value);
    weeks.set(weekStart, existing);
  });

  let previousAverage = null;

  const chronologicalWeeks = [...weeks.entries()]
    .map(([weekStart, values]) => {
      const currentAverage = average(values);
      const weekOverWeek =
        previousAverage === null
          ? null
          : Number((currentAverage - previousAverage).toFixed(1));

      previousAverage = currentAverage;

      return {
        week: getWeekKey(weekStart),
        sortDate: weekStart,
        average: currentAverage,
        weekOverWeek,
        entries: values.length,
      };
    })
    .slice(-6);

  return orderWeeklyAveragesNewestFirst(chronologicalWeeks);
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
    activity: [
      { name: "Upload Anything", status: "Connected" },
      { name: "Apple Fitness", status: "Connected" },
      { name: "Apple Health", status: "Suggested" },
      { name: "Manual Corrections", status: "Future" },
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
      { name: "Upload Anything", status: "Connected" },
      { name: "Founder Estimates", status: "Context" },
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
    activity: ["goal_visible_abs_at_rest", "goal_preserve_lean_mass"],
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
  if (context.photoSessions?.length) return context.photoSessions.flatMap((session) => session.views.map((view) => ({ ...view, weight: session.weight, photoSessionId: session.id, completionLabel: session.completionLabel })));
  const interpretedEvidence = interpretProgressPhotos({
    photos: context.progressPhotos,
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
  const start = createLocalDate(getWeekStartKey(value));

  return start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getWeekStartKey(value) {
  const date = createLocalDate(value);
  const start = new Date(date);
  const day = start.getDay();

  start.setDate(start.getDate() - day);

  return [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
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

function formatWeightDirection(value) {
  if (!Number.isFinite(value)) return "Trend pending";

  const magnitude = `${Math.abs(value).toFixed(1)} lb`;
  if (value < 0) return `Down ${magnitude}`;
  if (value > 0) return `Up ${magnitude}`;

  return "Stable";
}

function createLocalDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);

  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function getTodayDateKey() {
  return getLocalDateKey(new Date());
}

function getLocalDateKey(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return getDateKey(value);

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : date.toISOString().slice(0, 10);
}

function getPrivateEvidenceHref(relativePath) {
  if (!relativePath) return null;

  return `/api/private-evidence/${String(relativePath).replace(/^private\//, "")}`;
}

function deriveProgressPhotosFromEvidencePackages({
  evidencePackages = [],
  existingProgressPhotos = [],
  userId,
} = {}) {
  if (!userId) return [];

  const existingPaths = new Set(existingProgressPhotos.map((photo) => photo.imagePath));
  const backfilledPhotos = [];

  for (const evidencePackage of evidencePackages) {
    const packageId = evidencePackage.package_id ?? evidencePackage.id;
    const packageBackfilledPhotos = existingProgressPhotos.filter((photo) =>
      (photo.fieldProvenance?.evidencePackageIds ?? []).includes(packageId)
    );

    for (const artifact of getProgressPhotoArtifactCandidates(evidencePackage)) {
      if (!artifact.storage_path || existingPaths.has(artifact.storage_path)) continue;
      if (!isUsableProgressPhoto({ imagePath: artifact.storage_path })) continue;

      const capturedAt = getEvidencePackageObservedDate(evidencePackage);
      const createdAt =
        artifact.uploaded_at ??
        evidencePackage.captured_at ??
        `${capturedAt}T00:00:00.000Z`;
      const photo = createProgressPhoto({
        id: `progress_photo_backfill_${capturedAt.replaceAll("-", "_")}_${artifact.id}`,
        userId,
        date: capturedAt,
        capturedAt,
        uploadedAt: artifact.uploaded_at ?? evidencePackage.captured_at ?? createdAt,
        imagePath: artifact.storage_path,
        relatedGoalIds: ["goal_visible_abs_at_rest"],
        view: inferProgressPhotoView(artifact.file_name),
        pose: inferProgressPhotoPose(artifact.file_name),
        conditions: {
          morning: null,
          fasted: null,
          sameLighting: null,
          sameMirror: null,
          postWorkout: null,
          pump: null,
          notes: "Recovered from Upload Anything evidence.",
        },
        source: {
          type: "photo",
          name: "Upload Anything Progress Photos",
          externalId: evidencePackage.package_id ?? evidencePackage.id,
          importedAt: createdAt,
          confidence: "medium",
          notes: "Backfilled from stored Upload Anything photo evidence.",
        },
        fieldProvenance: {
          imported: [
            "date",
            "capturedAt",
            "uploadedAt",
            "imagePath",
            "view",
            "pose",
            "conditions",
            "relatedGoalIds",
          ],
          computed: [],
          sourceArtifactRefs: [artifact.id].filter(Boolean),
          evidencePackageIds: [evidencePackage.package_id ?? evidencePackage.id].filter(Boolean),
        },
        createdAt,
        updatedAt: createdAt,
      });

      existingPaths.add(photo.imagePath);
      backfilledPhotos.push(photo);
      packageBackfilledPhotos.push(photo);
    }
  }

  return backfilledPhotos;
}

function getProgressPhotoArtifactCandidates(evidencePackage = {}) {
  return (evidencePackage.provenance?.source_artifacts ?? []).filter(
    (artifact) =>
      artifact?.storage_path &&
      isLikelyProgressPhotoArtifact(artifact) &&
      !isArtifactAlreadyRepresentedByPhotoSession(evidencePackage, artifact.id)
  );
}

function isArtifactAlreadyRepresentedByPhotoSession(evidencePackage = {}, artifactId) {
  return (evidencePackage.evidence_objects ?? []).some(
    (object) =>
      object.evidence_type === "photo_session" &&
      [
        ...(object.provenance?.source_artifact_refs ?? []),
        ...(object.source?.source_artifact_refs ?? []),
      ].includes(artifactId)
  );
}

function getEvidencePackageObservedDate(evidencePackage = {}) {
  const observedAt = (evidencePackage.evidence_objects ?? [])
    .map((object) => object.observed_at)
    .find(Boolean);

  return getDateKey(observedAt ?? evidencePackage.captured_at ?? new Date().toISOString());
}

function isLikelyProgressPhotoArtifact(artifact = {}) {
  const fileName = String(artifact.file_name ?? artifact.fileName ?? "");
  const mimeType = String(artifact.mime_type ?? artifact.mimeType ?? "").toLowerCase();
  const absolutePath = getSafePrivatePath(artifact.storage_path);
  const byteLength = absolutePath && fs.existsSync(absolutePath)
    ? fs.statSync(absolutePath).size
    : 0;

  if (/progress|physique|front|rear|back|side|pose|check[-_ ]?in/i.test(fileName)) {
    return true;
  }

  if (/\.(heic|heif)$/i.test(fileName)) return true;
  if (mimeType === "image/heic" || mimeType === "image/heif") return true;

  return (
    (mimeType === "image/jpeg" || /\.jpe?g$/i.test(fileName)) &&
    byteLength >= 1_000_000
  );
}

function inferProgressPhotoView(fileName = "") {
  const text = String(fileName).toLowerCase();

  if (/\b(front|abs)\b/.test(text)) return normalizeProgressPhotoView("front");
  if (/\b(rear|back)\b/.test(text)) return normalizeProgressPhotoView("back");

  return "unknown";
}

function inferProgressPhotoPose(fileName = "") {
  const view = inferProgressPhotoView(fileName);
  const text = String(fileName).toLowerCase();

  if (/\b(flex|flexed|double[-_ ]?biceps)\b/.test(text)) {
    return normalizeProgressPhotoPose("flexed", view);
  }

  return normalizeProgressPhotoPose("relaxed", view);
}

function isUsableProgressPhoto(photo = {}) {
  if (!photo.imagePath) return false;

  try {
    const absolutePath = getSafePrivatePath(photo.imagePath);
    if (!absolutePath) return false;

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size < 128) return false;

    const buffer = Buffer.alloc(12);
    const file = fs.openSync(absolutePath, "r");

    try {
      fs.readSync(file, buffer, 0, buffer.length, 0);
    } finally {
      fs.closeSync(file);
    }

    return hasSupportedImageSignature(buffer);
  } catch {
    return false;
  }
}

function getSafePrivatePath(relativePath = "") {
  const normalized = path.normalize(relativePath);
  const privateRoot = path.join(process.cwd(), "private");
  const relativePrivatePath = normalized.replace(/^private[\\/]+/i, "");
  const absolutePath = path.join(privateRoot, relativePrivatePath);

  return absolutePath.startsWith(privateRoot) ? absolutePath : null;
}

function getMimeType(filePath = "") {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";

  return "image/jpeg";
}

function hasSupportedImageSignature(buffer) {
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP";

  return isJpeg || isPng || isWebp;
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
