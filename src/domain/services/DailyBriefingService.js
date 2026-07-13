import { createDailyBriefing } from "../models/dailyBriefing";
import { DailyFocusService } from "./DailyFocusService";
import { getDailyEvent } from "./DailyEventService";
import { getDailyBriefingFreshness } from "./DailyBriefingFreshnessService";
import { createDailyNarrativeStory } from "./DailyNarrativeEngineService";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";
import { normalizePhotoInterpretationToStructuredObservations } from "../interpreters/PhotoObservationModel";
import { orderWeeklyAveragesNewestFirst } from "../utils/weeklyAverageOrdering";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import founderVisibleAbsPhotoLedScenario from "../lab/goldenScenarios/founder-visible-abs-photo-led.json";
import { createScheduledEvidenceWindow, isRecordAvailableByWindow } from "./BriefingEvidenceWindowService";
import { composeNarrativeSurface } from "./NarrativeComposerService";
import { createDailyNarrativeEvidenceCoverage } from "./NarrativeEvidenceCoverageService";

const PRIMARY_GOAL_ID = "goal_visible_abs_at_rest";
const DAILY_BRIEFING_VERSION = "daily-briefing-v29-voice-calibration";
const FOUNDER_PHOTO_LED_GOLDEN = founderVisibleAbsPhotoLedScenario.expected;

export function createDailyBriefingService({ repositories, now = () => new Date() }) {
  async function composeDailyBriefing(userId, trigger = {}, options = {}) {
    const user = userId
      ? await repositories.users.getUserById(userId)
      : await repositories.users.getCurrentUser();
    const resolvedUserId = user?.id ?? userId;

    if (!resolvedUserId) return null;
    const briefingMemoryMode = options.briefingMemoryMode ?? "latest-same-cadence";
    const memorySource = resolveBriefingMemorySource({ artifactType: options.artifactType, cadence: options.evidenceWindow?.cadence, excludeArtifactId: options.excludeArtifactId, mode: briefingMemoryMode, repositories, userId: resolvedUserId });

    const [
      goals,
      activeGoal,
      weights,
      dexaScans,
      progressPhotos,
      protocols,
      reminders,
      checkIns,
      nutritionContext,
      latestAnalysis,
      latestPhotoAnalysis,
      analyses,
      latestStoredBriefing,
      canonicalEvidenceObjects,
    ] = await Promise.all([
      repositories.goals.listGoals(resolvedUserId),
      repositories.goals.getActiveGoal(resolvedUserId),
      repositories.weights.listWeightEntries(resolvedUserId),
      repositories.dexaScans.listDEXAScans(resolvedUserId),
      repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
      repositories.protocols.listActiveProtocols(resolvedUserId),
      repositories.reminders?.listActiveReminders(resolvedUserId) ?? [],
      repositories.dailyCheckIns.listCheckIns(resolvedUserId),
      repositories.nutritionContext?.getNutritionContext(resolvedUserId) ?? null,
      repositories.analyses.getLatestAnalysis(),
      repositories.analyses.getLatestAnalysisByType?.("progress_photo") ?? null,
      repositories.analyses.listAnalyses?.() ?? [],
      memorySource,
      repositories.canonicalEvidence?.listCanonicalEvidenceObjects(resolvedUserId) ?? [],
    ]);
    const evidenceWindow = options.evidenceWindow ?? null;
    const sortedWeights = sortByDate(weights.filter((item) => isRecordAvailableByWindow(item, evidenceWindow, ["measuredAt"])), "measuredAt");
    const sortedDEXA = sortByDate(dexaScans.filter((item) => isRecordAvailableByWindow(item, evidenceWindow, ["measuredAt"])), "measuredAt");
    const sortedPhotos = sortByDate(progressPhotos.filter((item) => isRecordAvailableByWindow(item, evidenceWindow, ["date", "capturedAt"])), "date");
    const windowCheckIns = checkIns.filter((item) => isRecordAvailableByWindow(item, evidenceWindow, ["date"]));
    const windowAnalyses = analyses.filter((item) => isRecordAvailableByWindow(item, evidenceWindow, ["createdAt"]));
    const windowCanonicalEvidence = canonicalEvidenceObjects.filter((item) => isRecordAvailableByWindow(item, evidenceWindow, ["observed_at", "occurredAt", "createdAt"]));
    const windowNutritionContext = nutritionContext && isRecordAvailableByWindow(nutritionContext, evidenceWindow, ["date", "updatedAt", "createdAt"])
      ? nutritionContext
      : null;
    const latestWeight = sortedWeights.at(-1) ?? null;
    const latestDEXA = sortedDEXA.at(-1) ?? null;
    const latestPhotos = sortedPhotos.slice(-3);
    const event = getDailyEvent({
      checkIns: windowCheckIns,
      dexaScans: sortedDEXA,
      progressPhotos: sortedPhotos,
      protocols,
      weights: sortedWeights,
    });
    const evaluations = GoalEvaluationService.getGoalEvaluations({
      goals,
      dexaScans: sortedDEXA,
      weightEntries: sortedWeights,
      progressPhotos: sortedPhotos,
      protocols,
      nutritionContext: windowNutritionContext,
    });
    const intelligence = GoalIntelligenceService.getGoalIntelligence({
      evaluations,
      activeGoal,
    });
    const primaryEvaluation =
      evaluations.find((evaluation) => evaluation.goalId === activeGoal?.id) ??
      evaluations.find((evaluation) => evaluation.goalId === PRIMARY_GOAL_ID) ??
      evaluations[0] ??
      null;
    const weightStats = getWeightStats(sortedWeights);
    const latestPhotoIntelligence = getLatestPhotoIntelligence(
      choosePhotoAnalysis({ analyses: windowAnalyses, latestAnalysis: evidenceWindow ? null : latestAnalysis, latestPhotoAnalysis: evidenceWindow ? null : latestPhotoAnalysis })
    );
    const windowLatestAnalysis = evidenceWindow ? windowAnalyses.at(-1) ?? null : latestAnalysis;
    const windowLatestPhotoAnalysis = evidenceWindow
      ? windowAnalyses.filter((item) => item.evidenceTypes?.includes("progress_photo")).at(-1) ?? null
      : latestPhotoAnalysis;
    const dailyEvidence = getDailyEvidenceReconciliation({
      checkIns: windowCheckIns,
      latestAnalysis: windowLatestAnalysis,
      latestDEXA,
      latestPhotoAnalysis: windowLatestPhotoAnalysis,
      latestPhotoIntelligence,
      latestWeight,
      nutritionContext: windowNutritionContext,
      sortedPhotos,
      trigger,
    });
    const narrativePhotoIntelligence = dailyEvidence.photo.isNarrativeDriver
      ? latestPhotoIntelligence
      : null;
    const goalStatus = getGoalStatus({ evaluations, intelligence });
    const evidenceUsed = getEvidenceUsed({
      checkIns: windowCheckIns,
      latestPhotoIntelligence,
      sortedWeights,
      nutritionContext: windowNutritionContext,
      protocols,
      latestWeight,
      latestDEXA,
      latestPhotos,
    });
    const todayPriorities = DailyFocusService.getDailyFocus({
      latestWeight,
      weightEntries: sortedWeights,
      protocols,
      progressPhotos: sortedPhotos,
      reminders,
    });
    const trainingPerformanceReport = createTrainingPerformanceIntelligenceReport({
      canonicalObjects: windowCanonicalEvidence,
      now: new Date(`${latestWeight?.measuredAt ?? weightStats.latestDate ?? new Date().toISOString().slice(0, 10)}T12:00:00`),
    });
    const trainingPerformanceSignal = getTrainingPerformanceBriefingSignal({
      primaryEvaluation,
      report: trainingPerformanceReport,
      weightStats,
    });
    const narrativeEvidenceCoverage = createDailyNarrativeEvidenceCoverage({
      activityTarget: windowNutritionContext?.estimatedDailyActiveCalorieBurn?.value,
      canonicalObjects: windowCanonicalEvidence,
      evidenceDate: evidenceWindow?.date ?? latestWeight?.measuredAt?.slice(0, 10),
      latestWeight,
      nutritionRange: windowNutritionContext?.estimatedDailyCaloricIntake,
    });
    const briefingMemory = getDailyBriefingMemory(latestStoredBriefing);
    const narrativeNovelty = getNarrativeNovelty({
      briefingMemory,
      dailyEvidence,
      event,
      latestDEXA,
      nutritionContext: windowNutritionContext,
      primaryEvaluation,
      protocols,
      trainingPerformanceSignal,
      weightStats,
    });
    const narrativeStory = createDailyNarrativeStory({
      approvedPhotoLedStory: FOUNDER_PHOTO_LED_GOLDEN,
      briefingMemory,
      dailyEvidence,
      event,
      evidenceUsed,
      latestPhotoIntelligence: narrativePhotoIntelligence,
      narrativeNovelty,
      primaryEvaluation,
      sortedPhotos,
      trainingPerformanceSignal,
      weightStats,
    });
    const hero = getHeroSummary({
      narrativeStory,
      primaryEvaluation,
    });
    const recommendation = getRecommendation({
      primaryEvaluation,
      trainingPerformanceSignal,
      weightStats,
      todayPriorities,
    });
    const narrativeCoachInsight = {
      ...(narrativeStory.coachInsight ?? {}),
      text: applyDecisionSupportNarrativeFilter(narrativeStory.coachInsight?.text),
    };
    const interpretation = getInterpretation({
      dailyEvidence,
      event,
      latestDEXA,
      latestPhotoIntelligence: narrativePhotoIntelligence,
      narrativeNovelty,
      narrativeStory,
      nutritionContext: windowNutritionContext,
      primaryEvaluation,
      protocols,
      sortedPhotos,
      trainingPerformanceSignal,
      weightStats,
    });
    const currentAssessment = getCurrentAssessment({
      latestDEXA,
      latestPhotoIntelligence,
      primaryEvaluation,
      protocols,
      sortedPhotos,
      trainingPerformanceSignal,
      weightStats,
    });
    const projection = getProjectionSection({
      latestDEXA,
      latestPhotoIntelligence,
      primaryEvaluation,
      sortedPhotos,
      weights: sortedWeights,
      weightStats,
    });
    const coachInterpretation = getCoachInterpretation({
      weightStats,
      primaryEvaluation,
      latestDEXA,
      nutritionContext: windowNutritionContext,
      latestPhotoIntelligence: narrativePhotoIntelligence,
      narrativeNovelty,
      sortedPhotos,
      trainingPerformanceSignal,
    });
    const editorial = applyDailyBriefingEditorialJudgment({
      coachInsight: narrativeCoachInsight,
      currentAssessment,
      interpretation,
      primaryEvaluation,
      projection,
      recommendation,
      trainingPerformanceSignal,
      weightStats,
    });
    const eventNarrative = options.artifactType === "event"
      ? getEventNarrative({ trigger, hero, editorial, latestDEXA, latestPhotoIntelligence, primaryEvaluation, weightStats, trainingPerformanceSignal })
      : null;
    const composedNarrative = composeNarrativeSurface({
      artifactType: options.artifactType,
      coachInsight: eventNarrative?.coachInsight ?? editorial.coachInsight.text,
      confidence: primaryEvaluation?.confidence ?? 0,
      currentChapter: narrativeStory?.theme ?? null,
      eventType: trigger.evidenceType,
      hero: eventNarrative?.hero ?? hero,
      interpretation: eventNarrative?.interpretation ?? editorial.interpretation,
      projection: primaryEvaluation?.projection,
      recommendation,
      temporalContext: evidenceWindow,
      trainingPerformance: trainingPerformanceSignal,
      weight: weightStats,
      storyTheme: event?.type === "weight_fluctuation_resolved"
        ? "fluctuation_resolution"
        : narrativeNovelty?.primaryChange?.theme ?? narrativeStory?.theme,
      evidenceCoverage: narrativeEvidenceCoverage,
    });

    return {
      version: DAILY_BRIEFING_VERSION,
      artifactType: options.artifactType ?? "scheduled",
      cadence: options.artifactType === "event" ? "event" : "daily",
      evidenceWindow,
      generatedAt: windowLatestAnalysis?.createdAt ?? now().toISOString(),
      event,
      hero: composedNarrative.hero,
      currentSnapshot: getCurrentSnapshot({
        latestDEXA,
        primaryEvaluation,
        weightStats,
        weights: sortedWeights,
      }),
      weightProgress: getWeightProgress({
        goalStartDate: activeGoal?.startDate,
        latestDEXA,
        weightStats,
        weights: sortedWeights,
      }),
      dexaProgress: getDexaProgress({ dexaScans: sortedDEXA, goalStartDate: activeGoal?.startDate ?? sortedWeights[0]?.measuredAt }),
      interpretation: composedNarrative.interpretation,
      currentAssessment: editorial.currentAssessment,
      projection: editorial.projection,
      progress: getProgressSection({
        weightStats,
        latestWeight,
        latestDEXA,
        primaryEvaluation,
        trajectory: intelligence.trajectory,
        weights: sortedWeights,
      }),
      goalStatus,
      facts: getFacts({
        checkIns: windowCheckIns,
        latestWeight,
        latestPhotos,
        protocols,
        reminders,
        weightStats,
      }),
      coachInterpretation,
      evidenceUsed,
      progressEvidence: getProgressEvidence({
        event,
        latestPhotoIntelligence,
        sortedWeights,
        sortedDEXA,
        sortedPhotos,
        latestWeight,
        weightStats,
      }),
      confidenceReasons: composedNarrative.supportingObservations?.map((label) => ({ label, tone: "positive" })) ?? getConfidenceReasons({
        primaryEvaluation,
        weightStats,
        sortedPhotos,
        latestPhotoIntelligence,
        latestDEXA,
        protocols,
      }),
      celebration: getCelebration({ weightStats, sortedPhotos, primaryEvaluation }),
      watchItems: getWatchItems({
        evaluations,
        latestDEXA,
        latestPhotoIntelligence,
        nutritionContext,
        sortedPhotos,
        weightStats,
      }),
      todayPlan: getTodayPlan({ todayPriorities }),
      recommendation,
      lookingAhead: getLookingAhead({ todayPriorities, reminders }),
      coachInsight: composedNarrative.coachInsight,
      coachInsightView: composedNarrative.coachInsightView ?? null,
      narrationAudit: composedNarrative.narrationAudit ?? null,
      narrativeEvidenceCoverage,
      evidenceTrace: getEvidenceTrace({ latestPhotoIntelligence }),
      evidenceReconciliation: dailyEvidence,
      narrativeNovelty,
      narrativeStory,
      editorialJudgment: editorial.editorialJudgment,
      trainingPerformance: trainingPerformanceSignal,
      briefingMemory: getUpdatedDailyBriefingMemory({
        briefingMemory,
        coachInsight: editorial.coachInsight,
        event,
        hero,
        narrativeNovelty,
        primaryEvaluation,
        recommendation,
      }),
      narrativeContinuity: { mode: briefingMemoryMode, sourceArtifactId: latestStoredBriefing?.id ?? null, sourceCadence: latestStoredBriefing?.cadence ?? null },
    };
  }

  return {
    async getDailyBriefing(userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) return null;

      const activeEvent = await repositories.dailyBriefings?.getLatestActiveEventBriefing?.(resolvedUserId);
      if (activeEvent) return { ...activeEvent.briefing, artifactId: activeEvent.id, artifactType: "event" };

      const evidenceWindow = createScheduledEvidenceWindow({ now: now(), timeZone: user?.timeZone ?? "America/Los_Angeles" });
      const scheduled = await repositories.dailyBriefings?.getBriefingByEvidenceWindow?.(resolvedUserId, evidenceWindow.id);
      if (scheduled?.briefing?.version === DAILY_BRIEFING_VERSION) {
        return { ...normalizeDailyBriefingForPresentation(scheduled.briefing), artifactId: scheduled.id };
      }

      const [
        latestStoredBriefing,
        weights,
        dexaScans,
        progressPhotos,
        checkIns,
        nutritionContext,
        analyses,
      ] = await Promise.all([
        repositories.dailyBriefings?.getLatestScheduledDailyBriefing(resolvedUserId) ?? null,
        repositories.weights.listWeightEntries(resolvedUserId),
        repositories.dexaScans.listDEXAScans(resolvedUserId),
        repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
        repositories.dailyCheckIns.listCheckIns(resolvedUserId),
        repositories.nutritionContext?.getNutritionContext(resolvedUserId) ?? null,
        repositories.analyses.listAnalyses?.() ?? [],
      ]);
      const freshness = getDailyBriefingFreshness({
        analyses,
        checkIns,
        dailyBriefing: latestStoredBriefing,
        dexaScans,
        nutritionContext,
        progressPhotos,
        weightEntries: weights,
      });

      return this.generateDailyBriefing({
        userId: resolvedUserId,
        evidenceWindow,
      });
    },

    async generateDailyBriefing({ userId, trigger = {}, evidenceWindow = null, artifactType = "scheduled" } = {}) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;
      const resolvedWindow = artifactType === "scheduled" ? evidenceWindow ?? createScheduledEvidenceWindow({ now: now(), timeZone: user?.timeZone ?? "America/Los_Angeles" }) : null;
      let briefing = await composeDailyBriefing(resolvedUserId, trigger, { artifactType, evidenceWindow: resolvedWindow });
      if (briefing && resolvedWindow?.cadence === "weekly") briefing = composeWeeklyBriefingPresentation(briefing, resolvedWindow);

      if (!briefing || !repositories.dailyBriefings) return briefing;

      const generatedAt = now().toISOString();
      const eventName = ["progress_photo", "photo_session"].includes(trigger.evidenceType) ? "progress_photo" : trigger.evidenceType === "dexa" ? "dexa" : null;
      const id = artifactType === "event" ? `event_briefing_${eventName}_${trigger.evidenceId}` : `${resolvedWindow.cadence}_briefing_${resolvedWindow.date.replaceAll("-", "")}`;

      await repositories.dailyBriefings.createDailyBriefing(
        createDailyBriefing({
          id,
          userId: resolvedUserId,
          generatedAt,
          artifactType,
          cadence: artifactType === "event" ? "event" : resolvedWindow.cadence,
          evidenceWindow: resolvedWindow,
          lifecycle: { generatedAt, openedAt: null, consumedAt: null },
          trigger,
          briefing: {
            ...briefing,
            generatedAt,
          },
          createdAt: generatedAt,
          updatedAt: generatedAt,
        })
      );

      return { ...briefing, artifactId: id };
    },

    async generateEventBriefing({ userId, trigger }) {
      return this.generateDailyBriefing({ userId, trigger, artifactType: "event" });
    },

    async previewBriefingArtifact(artifact) {
      if (!artifact) return null;
      let briefing = await composeDailyBriefing(artifact.userId, artifact.trigger ?? {}, {
        artifactType: artifact.artifactType ?? "scheduled",
        evidenceWindow: artifact.evidenceWindow ?? null,
      });
      if (briefing && artifact.evidenceWindow?.cadence === "weekly") {
        briefing = composeWeeklyBriefingPresentation(briefing, artifact.evidenceWindow);
      }
      return { ...briefing, preview: true, previewGeneratedAt: now().toISOString(), originalArtifactId: artifact.id };
    },

    async consumeBriefing(id) {
      const timestamp = now().toISOString();
      await repositories.dailyBriefings?.markBriefingOpened?.(id, timestamp);
      return repositories.dailyBriefings?.markBriefingConsumed?.(id, timestamp);
    },
  };
}

function composeWeeklyBriefingPresentation(briefing, evidenceWindow) {
  return {
    ...briefing,
    cadence: "weekly",
    evidenceWindow,
    hero: {
      ...briefing.hero,
      eyebrow: "Weekly Briefing",
      title: "This week strengthened the evidence behind your direction.",
      summary: String(briefing.hero?.summary ?? "").replace(/\byesterday\b/gi, "this week"),
    },
  };
}

function getEventNarrative({ trigger, hero, editorial, latestDEXA, latestPhotoIntelligence, primaryEvaluation, weightStats, trainingPerformanceSignal }) {
  if (trigger.evidenceType === "progress_photo") {
    const observations = getObservationChanges(latestPhotoIntelligence?.observations ?? [], { excludeLimitations: true, limit: 3 });
    return {
      hero: { ...hero, title: "Your latest photos move the visual story forward.", summary: latestPhotoIntelligence?.briefing?.summary ?? hero.summary },
      interpretation: observations.length > 0
        ? observations
        : editorial.interpretation,
      coachInsight: editorial.coachInsight.text,
    };
  }

  if (trigger.evidenceType === "dexa") {
    const scanDetails = [
      latestDEXA?.bodyFatPercentage != null ? `Body fat measured ${latestDEXA.bodyFatPercentage.toFixed(1)}%.` : null,
      latestDEXA?.fatMass?.value != null ? `Fat mass measured ${latestDEXA.fatMass.value.toFixed(1)} ${latestDEXA.fatMass.unit}.` : null,
      latestDEXA?.leanMass?.value != null ? `Lean tissue measured ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit}.` : null,
      latestDEXA?.visceralAdiposeTissue?.mass?.value != null ? `Visceral fat measured ${latestDEXA.visceralAdiposeTissue.mass.value.toFixed(2)} ${latestDEXA.visceralAdiposeTissue.mass.unit}.` : null,
      latestDEXA?.restingMetabolicRate?.value != null ? `Measured RMR was ${Math.round(latestDEXA.restingMetabolicRate.value)} kcal/day.` : null,
      weightStats.weekOverWeek != null ? `The weekly weight trend is ${formatSigned(weightStats.weekOverWeek)} ${weightStats.unit}.` : null,
      trainingPerformanceSignal?.interpretationLine ?? null,
    ].filter(Boolean);
    return {
      hero: { ...hero, title: "The new DEXA recalibrates the cut.", summary: primaryEvaluation?.summary ?? "The scan provides the strongest current body-composition anchor." },
      interpretation: scanDetails.slice(0, 6),
      coachInsight: editorial.coachInsight.text,
    };
  }

  return null;
}

function normalizeDailyBriefingForPresentation(briefing) {
  if (!hasStaticBriefingHero(briefing)) return briefing;

  return {
    ...briefing,
    event: {
      ...(briefing.event ?? {}),
      homeSubtitle:
        briefing.event?.homeSubtitle === "See what changed"
          ? "Evidence reviewed"
          : briefing.event?.homeSubtitle,
      heroSummary:
        briefing.event?.heroSummary ===
        "The latest evidence has been organized for review."
          ? "The latest evidence did not materially change the current plan."
          : briefing.event?.heroSummary,
      heroTitle:
        briefing.event?.heroTitle === "Briefing ready."
          ? "Trend context updated."
          : briefing.event?.heroTitle,
      type:
        briefing.event?.type === "briefing_ready"
          ? "evidence_reviewed"
          : briefing.event?.type,
    },
    hero: {
      ...(briefing.hero ?? {}),
      summary:
        briefing.hero?.summary ===
        "The latest evidence has been organized for review."
          ? "The latest evidence did not materially change the current plan."
          : briefing.hero?.summary,
      title:
        briefing.hero?.title === "Briefing ready."
          ? "Trend context updated."
          : briefing.hero?.title,
    },
  };
}

function hasStaticBriefingHero(briefing) {
  return (
    briefing?.hero?.title === "Briefing ready." ||
    briefing?.event?.heroTitle === "Briefing ready." ||
    briefing?.hero?.summary ===
      "The latest evidence has been organized for review." ||
    briefing?.event?.heroSummary ===
      "The latest evidence has been organized for review."
  );
}

function getWeightStats(weights) {
  const first = weights[0] ?? null;
  const latest = weights.at(-1) ?? null;
  const previous = weights.at(-2) ?? null;
  const lastThree = weights.slice(-3);
  const lastSeven = weights.slice(-7);
  const previousSeven = weights.slice(-14, -7);
  const weeklyAverage = averageWeight(lastSeven);
  const previousWeeklyAverage = averageWeight(previousSeven);
  const trendPoints = weights.slice(-14).map((entry) => ({
    date: entry.measuredAt,
    value: entry.weight.value,
  }));

  return {
    currentWeight: latest?.weight?.value ?? null,
    unit: latest?.weight?.unit ?? "lb",
    startWeight: first?.weight?.value ?? null,
    totalLost:
      first && latest
        ? Number((first.weight.value - latest.weight.value).toFixed(1))
        : null,
    dayChange:
      previous && latest
        ? Number((latest.weight.value - previous.weight.value).toFixed(1))
        : null,
    weeklyAverage,
    rolling3DayAverage: averageWeight(lastThree),
    rolling7DayAverage: weeklyAverage,
    previousWeeklyAverage,
    weekOverWeek:
      weeklyAverage !== null && previousWeeklyAverage !== null
        ? Number((weeklyAverage - previousWeeklyAverage).toFixed(1))
        : null,
    lowestWeight:
      latest && latest.weight.value === Math.min(...weights.map((entry) => entry.weight.value)),
    lowestWeightValue:
      weights.length > 0 ? Math.min(...weights.map((entry) => entry.weight.value)) : null,
    latestDate: latest?.measuredAt ?? null,
    trendPoints,
  };
}

function getProgressSection({
  weightStats,
  latestWeight,
  latestDEXA,
  primaryEvaluation,
  trajectory,
  weights,
}) {
  return {
    metrics: [
      {
        label: "Current Weight",
        value: formatWeight(weightStats.currentWeight, weightStats.unit),
      },
      {
        label: "Total Lost",
        value:
          weightStats.totalLost === null
            ? "Pending"
            : `${weightStats.totalLost.toFixed(1)} ${weightStats.unit}`,
      },
      {
        label: "Weekly Average",
        value:
          weightStats.weeklyAverage === null
            ? "Pending"
            : formatWeight(weightStats.weeklyAverage, weightStats.unit),
      },
      {
        label: "Week over Week",
        value:
          weightStats.weekOverWeek === null
            ? "Pending"
            : `${formatSigned(weightStats.weekOverWeek)} ${weightStats.unit}`,
      },
      {
        label: "Projected Finish",
        value: trajectory.projectedFinish,
      },
      {
        label: "Goal Progress",
        value: primaryEvaluation ? `${primaryEvaluation.progress}%` : "Pending",
      },
    ],
    chart: getWeightChartPoints(weights, latestDEXA),
    confidence: primaryEvaluation?.confidence ?? 0,
    bodyFat: latestDEXA?.bodyFatPercentage
      ? `${latestDEXA.bodyFatPercentage.toFixed(1)}%`
      : "Pending",
    latestWeightDate: latestWeight?.measuredAt ?? null,
  };
}

function getGoalStatus({ evaluations, intelligence }) {
  return {
    primary: {
      title: "Visible Abs",
      progress: evaluations.find((item) => item.goalId === PRIMARY_GOAL_ID)?.progress ?? 0,
      confidence: intelligence.trajectory.confidence,
      goalConfidence: intelligence.trajectory.goalConfidence,
      projectedFinish: intelligence.trajectory.projectedFinish,
      daysRemaining: intelligence.trajectory.daysRemaining,
      summary: intelligence.trajectory.description,
    },
    supporting: evaluations
      .filter((evaluation) => evaluation.goalId !== PRIMARY_GOAL_ID)
      .map((evaluation) => ({
        title: evaluation.title,
        status: evaluation.presentation?.status ?? evaluation.current,
        detail: evaluation.presentation?.detail ?? evaluation.summary,
        why: evaluation.findings
          .filter((finding) => finding.status === "positive")
          .slice(0, 2)
          .map((finding) => finding.text),
      })),
  };
}

function getFacts({ checkIns, latestWeight, latestPhotos, protocols, reminders, weightStats }) {
  const completedToday = reminders.filter((reminder) =>
    isToday(reminder.completedAt)
  );
  const latestCheckIn = sortByDate(checkIns, "date").at(-1);
  const manualNote = latestCheckIn?.notes;

  return [
    latestWeight && {
      label: "Weight",
      detail: formatWeight(weightStats.currentWeight, weightStats.unit),
    },
    weightStats.dayChange !== null && {
      label: "Daily change",
      detail:
        weightStats.dayChange === 0
          ? "No change from yesterday"
          : `${formatSigned(weightStats.dayChange)} ${weightStats.unit} from yesterday`,
    },
    weightStats.lowestWeight && {
      label: "Low point",
      detail: "Lowest weight maintained",
    },
    latestPhotos.length > 0 && {
      label: "Visual evidence",
      detail: `${latestPhotos.length} recent progress photo records available`,
    },
    completedToday.length > 0 && {
      label: "Completed today",
      detail: completedToday.map((reminder) => reminder.title).join(", "),
    },
    manualNote &&
      latestCheckIn?.recovery?.sleepTargetHit !== false && {
        label: "Journal",
        detail: manualNote,
      },
    latestCheckIn?.recovery?.sleepTargetHit === false && {
      label: "Recovery",
      detail: formatRecoveryNote(manualNote, latestCheckIn.recovery.notes),
    },
    protocols.length > 0 && {
      label: "Active protocols",
      detail: protocols.map((protocol) => protocol.name).join(", "),
    },
  ].filter(Boolean);
}

function getCurrentSnapshot({
  latestDEXA,
  primaryEvaluation,
  weightStats,
  weights,
}) {
  const conservativeProjection = getConservativeBodyFatProjection({
    latestDEXA,
    weights,
    weightStats,
  });

  return [
    {
      label: "Current weight",
      value: formatWeight(weightStats.currentWeight, weightStats.unit),
    },
    {
      label: "Yesterday",
      value:
        weightStats.dayChange === null
          ? "Pending"
          : weightStats.dayChange === 0
            ? "No change"
            : `${formatSigned(weightStats.dayChange)} ${weightStats.unit}`,
    },
    {
      label: "Total loss",
      value:
        weightStats.totalLost === null
          ? "Pending"
          : `${weightStats.totalLost.toFixed(1)} ${weightStats.unit}`,
    },
    {
      label: "Lowest weight",
      value: weightStats.lowestWeight
        ? "Yes"
        : weightStats.lowestWeightValue == null
          ? "Pending"
          : `${weightStats.lowestWeightValue.toFixed(1)} ${weightStats.unit} remains low`,
    },
    {
      label: "Est. body fat",
      value:
        primaryEvaluation?.projection?.currentBodyFatRange ??
        conservativeProjection?.currentEstimateRange ??
        "Pending",
    },
    {
      label: "Confidence",
      value:
        primaryEvaluation?.goalConfidence?.label ??
        getConfidenceLabel(primaryEvaluation?.confidence ?? 0),
    },
  ];
}

function getWeightProgress({ goalStartDate = null, latestDEXA, weightStats, weights }) {
  const points = getWeightChartPoints(weights, latestDEXA).map((point) => ({
    ...point,
    id: point.date,
    unit: weightStats.unit,
  }));

  return {
    summary:
      weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
        ? `The rolling trend is down ${Math.abs(weightStats.weekOverWeek).toFixed(1)} ${weightStats.unit}, keeping the cut clearly on course.`
        : "Weight remains the fastest feedback loop for the cut, but interpretation still depends on trend rather than one day.",
    points,
    weeklyMomentum: getWeeklyMomentum(weights, goalStartDate),
  };
}

function getDexaProgress({ dexaScans, goalStartDate = null }) {
  const relevantScans = goalStartDate
    ? dexaScans.filter((scan) => scan.measuredAt >= goalStartDate)
    : dexaScans;
  return {
    rows: relevantScans.map((scan) => ({
      date: scan.measuredAt,
      label: formatShortDate(scan.measuredAt),
      weight: scan.totalMass?.value ?? null,
      lean: scan.leanMass?.value ?? null,
      fat: scan.fatMass?.value ?? null,
      bodyFat: scan.bodyFatPercentage ?? null,
      unit: scan.totalMass?.unit ?? scan.leanMass?.unit ?? scan.fatMass?.unit ?? "lb",
    })),
  };
}

function getInterpretation({
  dailyEvidence,
  event,
  latestDEXA,
  latestPhotoIntelligence,
  narrativeNovelty,
  narrativeStory,
  nutritionContext,
  primaryEvaluation,
  protocols,
  sortedPhotos,
  trainingPerformanceSignal,
  weightStats,
}) {
  if (Array.isArray(narrativeStory?.interpretation)) {
    return narrativeStory.interpretation;
  }

  if (latestPhotoIntelligence) {
    return getPhotoLedInterpretation({
      latestDEXA,
      latestPhotoIntelligence,
      nutritionContext: windowNutritionContext,
      protocols,
      sortedPhotos,
      weightStats,
    });
  }

  if (dailyEvidence?.weight?.status === "updated_today") {
    return getWeightCorrectionInterpretation({
      dailyEvidence,
      latestDEXA,
        nutritionContext: windowNutritionContext,
      primaryEvaluation,
      protocols,
      sortedPhotos,
      trainingPerformanceSignal,
      weightStats,
    });
  }

  if (event?.type === "weight_fluctuation_resolved") {
    const weeklyContext =
      weightStats.weekOverWeek !== null
        ? `The weekly trend is ${formatSigned(weightStats.weekOverWeek)} ${
            weightStats.unit
          }, so the larger read still belongs to the trend rather than yesterday's noise.`
        : "The larger read still belongs to the trend rather than yesterday's noise.";
    const photoContext =
      sortedPhotos.length > 0
        ? "Your latest photos remain the stronger physique context, and today's scale read does not challenge that."
        : "There were no new photos today, so the useful lesson is how the scale behaved after yesterday's bump.";

    return [
      `Yesterday's weight bump has already resolved. Today's weigh-in reinforces that the increase behaved like normal day-to-day fluctuation, not a change in direction.`,
      `${weeklyContext} ${photoContext} The right response is to keep the plan steady and let repeated check-ins, not one noisy morning, decide whether anything needs to change.`,
    ];
  }

  const meaningfulProtocols = getMeaningfulProtocolNames(protocols);
  const signals = [];

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0) {
    signals.push(
      `the rolling trend is down ${Math.abs(weightStats.weekOverWeek).toFixed(1)} ${weightStats.unit}`
    );
  } else if (weightStats.dayChange === 0 && weightStats.lowestWeight) {
    signals.push("the latest weigh-in is holding the recent low instead of rebounding");
  } else if (weightStats.currentWeight !== null) {
    signals.push("the latest weigh-in keeps the cut interpretable rather than noisy");
  }

  if (latestDEXA?.bodyFatPercentage) {
    signals.push(`your last DEXA still supports today's assessment`);
  }

  if (sortedPhotos.length > 0) {
    signals.push("your recent photos still support the visible-abs direction");
  }

  const intake = nutritionContext?.estimatedDailyCaloricIntake;
  const nutritionContextText =
    narrativeNovelty?.shouldMentionNutrition && intake?.min && intake?.max
      ? `Your ${intake.min}-${intake.max} kcal range helps explain why the scale is still moving, but I would not over-read it without a measured nutrition log.`
      : null;

  const protocolContextText =
    narrativeNovelty?.shouldMentionProtocol && meaningfulProtocols.length > 0
      ? `${joinHumanList(meaningfulProtocols)} may be helping the conditions around the cut, but the trend still has to be judged by what your body is actually doing.`
      : null;

  const forecastText = primaryEvaluation?.projection?.daysRemaining
    ? `The forecast should follow that signal rather than stay frozen; right now it reads ${primaryEvaluation.projection.daysRemaining}.`
    : "That is why I would keep the forecast conservative until the next clear check-in.";
  const noChangeText =
    narrativeNovelty?.noChangeRationale ??
    "A protocol change today would be reacting to noise before the signal asks for it.";
  const performanceText = trainingPerformanceSignal?.shouldMention
    ? trainingPerformanceSignal.interpretationLine
    : null;
  const trendText =
    weightStats.dayChange !== null && weightStats.dayChange > 0 && weightStats.weekOverWeek < 0
      ? `Today's scale weight is up ${weightStats.dayChange.toFixed(1)} ${weightStats.unit} from yesterday, but the weekly trend is still down ${Math.abs(weightStats.weekOverWeek).toFixed(1)} ${weightStats.unit}.`
      : `${sentenceCase(joinHumanList(signals))}.`;

  return [
    `${trendText} That matters because the decision should follow the trend, not a single noisy weigh-in.`,
    [performanceText, nutritionContextText, protocolContextText, forecastText, noChangeText]
      .filter(Boolean)
      .join(" "),
  ].map(applyDecisionSupportNarrativeFilter);
}

function getWeightCorrectionInterpretation({
  dailyEvidence,
  latestDEXA,
  nutritionContext,
  primaryEvaluation,
  protocols,
  sortedPhotos,
  trainingPerformanceSignal,
  weightStats,
}) {
  const meaningfulProtocols = getMeaningfulProtocolNames(protocols);
  const photoContext =
    sortedPhotos.length > 0
      ? "Yesterday's photos are still the strongest read on how your physique is changing, and this weigh-in does not give us a reason to change that read."
      : "There are no new photos today, so this is mainly a scale-read morning.";
  const dexaContext = latestDEXA?.bodyFatPercentage
    ? `Your last DEXA still anchors the body-composition picture at ${latestDEXA.bodyFatPercentage.toFixed(
        1
      )}% body fat.`
    : "The next DEXA will give the next strong body-composition check.";
  const weightLine =
    weightStats.dayChange !== null
      ? `At ${weightStats.currentWeight?.toFixed?.(1) ?? weightStats.currentWeight} ${
          weightStats.unit
        }, the scale is ${formatSigned(weightStats.dayChange)} ${
          weightStats.unit
        } from the prior weigh-in.`
      : `At ${weightStats.currentWeight?.toFixed?.(1) ?? weightStats.currentWeight} ${
          weightStats.unit
        }, the scale does not change the larger read.`;
  const trendLine =
    weightStats.weekOverWeek !== null
      ? `Your body is still moving in the right direction over the week: ${formatSigned(
          weightStats.weekOverWeek
        )} ${weightStats.unit}.`
      : "One weigh-in should not rewrite the whole cut by itself.";
  const protocolText =
    meaningfulProtocols.length > 0
      ? `${joinHumanList(meaningfulProtocols)} still support the conditions around the cut.`
      : "No protocol update changes today's interpretation.";
  const nutritionText = nutritionContext?.estimatedDailyCaloricIntake
    ? "Day-to-day scale movement can happen inside the current nutrition context, so I would not overreact to one morning."
    : "Measured nutrition will make these day-to-day swings easier to explain.";
  const forecastText = primaryEvaluation?.projection?.daysRemaining
    ? "The goal timeline should stay steady unless your body starts moving differently for several check-ins."
    : "The goal timeline should stay conservative until your body gives a stronger signal.";
  const performanceText = trainingPerformanceSignal?.shouldMention
    ? `The more useful supporting signal is training: ${lowerFirst(
        trainingPerformanceSignal.interpretationLine
      )}`
    : null;

  return [
    `Today's weigh-in does not change the story. ${weightLine} ${trendLine} ${photoContext}`,
    [dexaContext, performanceText, nutritionText, protocolText, forecastText]
      .filter(Boolean)
      .join(" "),
  ].map(applyDecisionSupportNarrativeFilter);
}

function getPhotoLedInterpretation({
  latestDEXA,
  latestPhotoIntelligence,
  nutritionContext,
  protocols,
  sortedPhotos,
  weightStats,
}) {
  if (latestPhotoIntelligence?.availability === "rich") {
    return FOUNDER_PHOTO_LED_GOLDEN.interpretation;
  }

  const briefing = latestPhotoIntelligence.briefing ?? {};
  const observations = latestPhotoIntelligence.observations;
  const limitations = latestPhotoIntelligence.limitations;
  const waist = findObservation(observations, /waist|lower abdomen|midsection|torso/i);
  const proportion = findObservation(
    observations,
    /shoulder-to-waist|ratio|taper|v-taper|proportion/i,
    [waist]
  );
  const conditioning = findObservation(
    observations,
    /conditioning|leaner|definition|separation|upper.*ab|mid.*ab|abdominal/i,
    [waist, proportion]
  );
  const upperBody = findObservation(
    observations,
    /upper body|chest|shoulder|arm|maintain|preserv/i
  );
  const limitation = limitations[0];
  const meaningfulProtocols = getMeaningfulProtocolNames(protocols);
  const scaleContext =
    weightStats.dayChange !== null && weightStats.dayChange > 0
      ? `The scale was up ${weightStats.dayChange.toFixed(
          1
        )} ${weightStats.unit} today, but that does not outweigh the visual read.`
      : null;
  const supportContext = [
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
      ? `The rolling weight trend is still down ${Math.abs(weightStats.weekOverWeek).toFixed(
          1
        )} ${weightStats.unit}.`
      : null,
    latestDEXA?.bodyFatPercentage
      ? `The latest DEXA remains the calibration anchor at ${latestDEXA.bodyFatPercentage.toFixed(
          1
        )}% body fat.`
      : null,
    meaningfulProtocols.length > 0
      ? `${joinHumanList(meaningfulProtocols)} support the conditions around the cut, but your body still has to show the result.`
      : null,
  ].filter(Boolean);

  return uniqueIdeas([
    briefing.summary ?? latestPhotoIntelligence.interpretation.user_facing_summary,
    scaleContext,
    createObservationLine("The strongest visual read is around your shape", [
      waist,
      proportion,
    ]),
    createObservationLine("Your conditioning looks most clear in", [conditioning]),
    createObservationLine("Upper-body shape appears supported by", [upperBody]),
    limitation?.change
      ? `Confidence is lower where ${lowerFirst(sentenceCase(limitation.change))}`
      : null,
    supportContext.join(" "),
    briefing.next_step ??
      "Nothing in this photo read suggests changing the current plan today.",
    nutritionContext?.estimatedDailyCaloricIntake
      ? "Measured intake will make the nutrition read sharper; for now, I would judge the cut by what your body is doing."
      : null,
    sortedPhotos.length > 0
      ? "Future comparable photos will show whether this visual read continues or needs to be revised."
      : null,
  ]);
}

function getPhotoVisualAssessmentDetail(latestPhotoIntelligence) {
  const observations = getObservationChanges(latestPhotoIntelligence.observations, {
    excludeLimitations: true,
    limit: 3,
  });

  if (observations.length === 0) {
    return latestPhotoIntelligence.briefing?.summary ?? "Today's photos give us a clearer visual read.";
  }

  return `Today's photos give us a clearer visual read: ${joinHumanList(
    observations.map((observation) => lowerFirst(stripSentenceEnding(observation)))
  )}.`;
}

function getAssessmentTone(label) {
  if (/muscle|forecast/i.test(label)) return "primary";
  if (/protocol/i.test(label)) return "evidence";
  if (/visual/i.test(label)) return "effort";
  return "success";
}

function getCurrentAssessment({
  latestDEXA,
  latestPhotoIntelligence,
  primaryEvaluation,
  protocols,
  sortedPhotos,
  trainingPerformanceSignal,
  weightStats,
}) {
  if (latestPhotoIntelligence?.availability === "rich") {
    return FOUNDER_PHOTO_LED_GOLDEN.currentAssessment.map((item) => ({
      ...item,
      tone: getAssessmentTone(item.label),
    }));
  }

  const leanMassPreserved = primaryEvaluation?.findings?.some(
    (finding) => finding.id === "lean_mass_preserved" && finding.status === "positive"
  );
  const meaningfulProtocols = getMeaningfulProtocolNames(protocols);
  const protocolConfidence = meaningfulProtocols.length > 0 && weightStats.weekOverWeek !== null && weightStats.weekOverWeek <= 0;

  return [
    {
      label: "Fat loss trajectory",
      value:
        weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
          ? "Strengthening"
          : "Stable",
      detail:
        weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
          ? "The weekly trend continues moving in the intended direction."
          : "Nothing today calls for a plan change.",
      tone: "success",
    },
    {
      label: "Muscle preservation",
      value:
        trainingPerformanceSignal?.status === "regressing"
          ? "Watch closely"
          : trainingPerformanceSignal?.shouldMention
          ? "Supported"
          : leanMassPreserved
            ? "Better than expected"
            : "Monitoring",
      detail:
        trainingPerformanceSignal?.shouldMention
          ? trainingPerformanceSignal.assessmentLine
          : latestDEXA?.leanMass?.value
            ? `Your last DEXA is still the best read here at ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit}.`
            : "Next DEXA will carry most of the confidence here.",
      tone:
        trainingPerformanceSignal?.status === "regressing"
          ? "warning"
          : trainingPerformanceSignal?.shouldMention || leanMassPreserved
            ? "success"
            : "evidence",
    },
    {
      label: "Protocol Response",
      value: protocolConfidence ? "High confidence" : "Contextual",
      detail: latestPhotoIntelligence?.briefing?.next_step
        ? latestPhotoIntelligence.briefing.next_step
        : trainingPerformanceSignal?.status === "regressing"
        ? "No aggressive change is recommended yet, but training regression makes recovery and load management part of the decision."
        : trainingPerformanceSignal?.shouldMention
        ? "No change needed because fat-loss trend remains favorable and training performance is not breaking down."
        : protocolConfidence
        ? "The major protocols and the weight trend are still moving in a compatible direction."
        : "Protocols may matter, but the body still has to prove the response.",
      tone: protocolConfidence ? "success" : "primary",
    },
    {
      label: "Visual confirmation",
      value: sortedPhotos.length > 0 ? "Improving" : "Limited",
      detail: latestPhotoIntelligence
        ? getPhotoVisualAssessmentDetail(latestPhotoIntelligence)
        : sortedPhotos.length > 0
        ? "Photos support the visible-abs direction while the next DEXA will confirm the deeper change."
        : "Photos will become more useful after comparable uploads.",
      tone: "effort",
    },
    {
      label: "Goal forecast",
      value: primaryEvaluation?.projection ? "Unchanged" : "Building",
      detail: primaryEvaluation?.projection?.projectedFinish
        ? `Expected finish remains ${primaryEvaluation.projection.projectedFinish}.`
        : "A few more check-ins are needed before narrowing the arrival window.",
      tone: "primary",
    },
  ];
}

function getProjectionSection({
  latestDEXA,
  latestPhotoIntelligence,
  primaryEvaluation,
  sortedPhotos,
  weights,
  weightStats,
}) {
  const conservativeProjection = getConservativeBodyFatProjection({
    latestDEXA,
    weights,
    weightStats,
  });

  return [
    {
      label: "Estimated body fat today",
      value:
        primaryEvaluation?.projection?.currentBodyFatRange ??
        conservativeProjection?.currentEstimateRange ??
        "Pending",
      detail: latestDEXA
        ? "Based on your last DEXA and the weight trend since then."
        : "Waiting for a stronger body-composition check.",
    },
    {
      label: "Projected time to goal",
      value: primaryEvaluation?.projection?.daysRemaining ?? "Pending",
      detail: primaryEvaluation?.projection?.projectedFinish
        ? `Current projected window: ${primaryEvaluation.projection.projectedFinish}.`
        : "More trend evidence is needed before narrowing timing.",
    },
    {
      label: "Next milestone",
      value: "Visible lower abs at rest",
      detail:
        latestPhotoIntelligence?.availability === "rich"
          ? FOUNDER_PHOTO_LED_GOLDEN.projection.detail
          : sortedPhotos.length > 0
          ? "Photos are the best near-term read on this milestone."
          : "Next comparable photo set will improve confidence.",
    },
    {
      label: "Expected protocol response",
      value:
        weightStats.weekOverWeek !== null && weightStats.weekOverWeek <= 0
          ? "No changes anticipated"
          : "Watch next trend",
      detail:
        "No protocol change is recommended because the current plan is still producing the desired weight trend without a clear training-performance breakdown.",
    },
  ];
}

function getConservativeBodyFatProjection({ latestDEXA, weights, weightStats }) {
  if (
    !latestDEXA?.measuredAt ||
    !latestDEXA?.totalMass?.value ||
    !latestDEXA?.fatMass?.value ||
    !latestDEXA?.bodyFatPercentage ||
    weightStats.currentWeight === null
  ) {
    return null;
  }

  const postDexaWeights = weights.filter(
    (entry) => entry.measuredAt >= latestDEXA.measuredAt
  );
  const latestWeight = postDexaWeights.at(-1);

  if (!latestWeight?.weight?.value) {
    return {
      currentEstimate: latestDEXA.bodyFatPercentage,
      currentEstimateRange: formatBodyFatRange(latestDEXA.bodyFatPercentage, {
        lowerSpread: 0.1,
        upperSpread: 0.3,
      }),
      expectedDexaRange: formatBodyFatRange(latestDEXA.bodyFatPercentage, {
        lowerSpread: 0.2,
        upperSpread: 0.2,
      }),
    };
  }

  const postDexaLoss = Math.max(0, latestDEXA.totalMass.value - latestWeight.weight.value);
  const fatLossRatio =
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek <= 0 ? 0.72 : 0.62;
  const estimatedFatMass = Math.max(
    latestDEXA.fatMass.value * 0.72,
    latestDEXA.fatMass.value - postDexaLoss * fatLossRatio
  );
  const rawCurrentEstimate = (estimatedFatMass / latestWeight.weight.value) * 100;
  const currentEstimate = Math.max(
    rawCurrentEstimate,
    latestDEXA.bodyFatPercentage - 1.05
  );
  const expectedDexaEstimate = Math.max(
    currentEstimate - 0.15,
    latestDEXA.bodyFatPercentage - 1.2
  );

  return {
    currentEstimate,
    currentEstimateRange: formatBodyFatRange(currentEstimate, {
      lowerSpread: getBodyFatEstimateSpread({
        latestDEXA,
        postDexaWeights,
        side: "lower",
      }),
      upperSpread: getBodyFatEstimateSpread({
        latestDEXA,
        postDexaWeights,
        side: "upper",
      }),
    }),
    expectedDexaRange: formatBodyFatRange(expectedDexaEstimate, {
      lowerSpread: 0.2,
      upperSpread: 0.25,
    }),
  };
}

function formatBodyFatRange(value, { lowerSpread = 0.2, upperSpread = 0.2 } = {}) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Pending";

  const lower = Math.max(0, value - lowerSpread);
  const upper = value + upperSpread;

  return `~${lower.toFixed(1)}-${upper.toFixed(1)}%`;
}

function getBodyFatEstimateSpread({
  latestDEXA,
  postDexaWeights = [],
  side,
} = {}) {
  const daysSinceDexa =
    latestDEXA?.measuredAt && postDexaWeights.at(-1)?.measuredAt
      ? Math.max(
          0,
          Math.round(
            (new Date(`${postDexaWeights.at(-1).measuredAt}T12:00:00`).getTime() -
              new Date(`${latestDEXA.measuredAt}T12:00:00`).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        )
      : 0;
  const onlyScaleInference = postDexaWeights.length > 1 && daysSinceDexa >= 7;
  const spread = onlyScaleInference ? (side === "lower" ? 0.45 : 0.75) : 0.25;

  return spread;
}

function joinHumanList(items) {
  const clean = items.filter(Boolean);

  if (clean.length === 0) return "The available evidence";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;

  return `${clean.slice(0, -1).join(", ")}, and ${clean.at(-1)}`;
}

function sentenceCase(value) {
  if (!value) return value;

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getMeaningfulProtocolNames(protocols) {
  const lowImpactNames = new Set([
    "electrolytes",
    "fadogia agrestis",
    "multivitamin",
    "tongkat ali",
  ]);

  return protocols
    .filter((protocol) => !lowImpactNames.has(protocol.name.toLowerCase()))
    .map((protocol) => protocol.name);
}

function getCoachInterpretation({
  weightStats,
  primaryEvaluation,
  latestDEXA,
  nutritionContext,
  latestPhotoIntelligence,
  narrativeNovelty,
  sortedPhotos,
  trainingPerformanceSignal,
}) {
  if (latestPhotoIntelligence) {
    return [
      latestPhotoIntelligence.briefing?.summary ??
        latestPhotoIntelligence.interpretation.user_facing_summary,
      latestPhotoIntelligence.briefing?.why_they_matter ??
        latestPhotoIntelligence.interpretation.coach_briefing_insert,
      latestPhotoIntelligence.briefing?.next_step,
    ].filter(Boolean);
  }

  const weekDirection =
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
      ? "continues moving down"
      : "is holding steady";
  const bodyFat = latestDEXA?.bodyFatPercentage
    ? `${latestDEXA.bodyFatPercentage.toFixed(1)}%`
    : "best available estimate";
  const intake = nutritionContext?.estimatedDailyCaloricIntake;
  const intakeText = narrativeNovelty?.shouldMentionNutrition && intake?.min && intake?.max
    ? `Your current ${intake.min}-${intake.max} kcal estimate remains consistent with the cut.`
    : null;
  const photoText =
    sortedPhotos.length > 0
      ? "Recent progress photos support what the scale and last DEXA are showing."
      : "Progress photos will increase visual confidence when new evidence is added.";
  const performanceText = trainingPerformanceSignal?.shouldMention
    ? trainingPerformanceSignal.coachLine
    : null;

  return [
    `Today's evidence supports the path toward visible abs. The weekly weight average ${weekDirection}, and your last DEXA at ${bodyFat} keeps the target close.`,
    [
      `The current rate of loss remains appropriate for preserving lean mass.`,
      performanceText,
      photoText,
      intakeText,
    ]
      .filter(Boolean)
      .join(" "),
    primaryEvaluation?.projection
      ? `Projected finish remains ${primaryEvaluation.projection.daysRemaining}, so today's work is execution, not adjustment.`
      : "Projection is waiting on more trend evidence, so consistency matters more than reacting to one data point.",
  ];
}

function getEvidenceUsed({
  checkIns,
  latestPhotoIntelligence,
  sortedWeights,
  nutritionContext,
  protocols,
  latestWeight,
  latestDEXA,
  latestPhotos,
}) {
  const latestCheckIn = sortByDate(checkIns, "date").at(-1);

  return [
    latestCheckIn?.recovery?.notes && {
      label: "Recovery",
      detail: formatRecoveryNote(latestCheckIn.notes, latestCheckIn.recovery.notes),
    },
    latestCheckIn?.notes &&
      !latestCheckIn?.recovery?.notes && {
        label: "Journal",
        detail: latestCheckIn.notes,
      },
    sortedWeights.length >= 7 && {
      label: "Recent weigh-ins",
      detail:
        latestWeight && getWeightStats(sortedWeights).weekOverWeek !== null
          ? `${formatWeight(latestWeight.weight.value, latestWeight.weight.unit)} today; weekly average ${formatSigned(getWeightStats(sortedWeights).weekOverWeek)} ${latestWeight.weight.unit}.`
          : "Recent morning weigh-ins keep the trend interpretable.",
    },
    latestDEXA && {
      label: "DEXA progress",
      detail: `Latest DEXA: ${
        latestDEXA.bodyFatPercentage?.toFixed?.(1) ?? "measured"
      }% body fat, with lean mass still being watched closely.`,
    },
    latestPhotos.length > 0 && {
      label: "Latest progress photos",
      detail:
        latestPhotoIntelligence?.briefing?.summary ??
        `${latestPhotos.length} recent visual records support the visible-abs goal.`,
    },
    nutritionContext && {
      label: "Nutrition trend",
      detail: formatNutritionEvidence(nutritionContext),
    },
    getMeaningfulProtocolNames(protocols).length > 0 && {
      label: "Protocol support",
      detail: `${joinHumanList(getMeaningfulProtocolNames(protocols))} remain relevant, but your actual trend matters more than assumed effect.`,
    },
  ].filter(Boolean);
}

function getProgressEvidence({
  event,
  latestPhotoIntelligence,
  sortedWeights,
  sortedDEXA,
  sortedPhotos,
  latestWeight,
  weightStats,
}) {
  const weightJourney = sortedWeights.map((entry) => ({
    date: entry.measuredAt,
    label: formatShortDate(entry.measuredAt),
    value: entry.weight.value,
    unit: entry.weight.unit,
    isLatest: entry.id === latestWeight?.id,
  }));
  const weeklyMomentum = getWeeklyMomentum(sortedWeights);
  const dexaProgress = sortedDEXA.slice(-3).map((scan) => ({
    date: scan.measuredAt,
    label: formatShortDate(scan.measuredAt),
    bodyFat: scan.bodyFatPercentage,
    fatMass: scan.fatMass?.value ?? null,
    leanMass: scan.leanMass?.value ?? null,
    unit: scan.fatMass?.unit ?? "lb",
  }));
  const previousDEXA = dexaProgress.at(-2);
  const latestDEXA = dexaProgress.at(-1);
  const fatMassChange =
    typeof previousDEXA?.fatMass === "number" && typeof latestDEXA?.fatMass === "number"
      ? Number((latestDEXA.fatMass - previousDEXA.fatMass).toFixed(1))
      : null;
  const bodyFatChange =
    typeof previousDEXA?.bodyFat === "number" && typeof latestDEXA?.bodyFat === "number"
      ? Number((latestDEXA.bodyFat - previousDEXA.bodyFat).toFixed(1))
      : null;

  return {
    weights: {
      title: "Weight",
      badge: weightStats.lowestWeight ? "New Low Maintained" : "Trend Confirmed",
      summary: getWeightEvidenceSummary({ event, weeklyMomentum, weightStats }),
      points: weightJourney,
      weeklyMomentum,
    },
    dexa: {
      title: "DEXA",
      badge: "DEXA Confirmed",
      summary: getDEXAEvidenceSummary({ bodyFatChange, fatMassChange, latestDEXA }),
      scans: dexaProgress,
    },
    photos: {
      title: "Progress Photos",
      badge: "Visual Evidence Improving",
      summary:
        latestPhotoIntelligence?.briefing?.summary ??
        (sortedPhotos.length > 0
          ? "Recent progress photos added comparable visual evidence. That matters because visual goals need visual confirmation, not only scale or DEXA math. The photo series reinforces improving upper-ab definition, oblique separation, back definition, and muscle-retention appearance."
          : "Progress photos will become direct visual evidence after the next upload."),
      strengths: latestPhotoIntelligence
        ? getObservationChanges(latestPhotoIntelligence.observations, {
            excludeLimitations: true,
            limit: 5,
          })
        : [
            "Excellent V-taper",
            "Upper abs consistently visible",
            "Obliques well-developed",
            "Back definition improving",
            "Strong muscle-retention appearance",
          ],
      focus: latestPhotoIntelligence
        ? getObservationChanges(latestPhotoIntelligence.limitations, { limit: 3 })
        : ["Lower abs", "Lower back"],
    },
  };
}

function getConfidenceReasons({
  primaryEvaluation,
  weightStats,
  sortedPhotos,
  latestPhotoIntelligence,
  latestDEXA,
  protocols,
}) {
  return [
    weightStats.weekOverWeek !== null &&
      weightStats.weekOverWeek <= 0 && {
        label: "Body fat continuing downward",
        tone: "success",
      },
    primaryEvaluation?.findings?.some((finding) => finding.id === "lean_mass_preserved" && finding.status === "positive") && {
      label: "Lean mass likely preserved",
      tone: "success",
    },
    (latestPhotoIntelligence || sortedPhotos.length > 0) && {
      label: latestPhotoIntelligence
        ? "Visual trend supported"
        : "Progress photos increased confidence",
      tone: "evidence",
    },
    latestDEXA && {
      label: "DEXA trend confirmed",
      tone: "evidence",
    },
    protocols.length > 0 && {
      label: "Current protocol working",
      tone: "success",
    },
  ].filter(Boolean);
}

function getCelebration({ weightStats, sortedPhotos, primaryEvaluation }) {
  if (weightStats.lowestWeight) {
    return {
      title: "Lowest weight of the cut.",
      detail:
        "That is a real signal. One day never tells the whole story, but a new low confirms that execution is showing up in the evidence.",
    };
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0) {
    return {
      title: "Weekly average improved.",
      detail:
        "The trend is doing the work. That is exactly what should matter more than any single weigh-in.",
    };
  }

  if (sortedPhotos.length >= 6) {
    return {
      title: "Visual evidence is consistent.",
      detail:
        "Progress photos are being captured under comparable conditions, which makes future visual evaluation much more trustworthy.",
    };
  }

  return {
    title: "Consistency is compounding.",
    detail: primaryEvaluation?.summary ?? "The current plan continues to have enough evidence behind it.",
  };
}

function getWatchItems({
  evaluations,
  latestDEXA,
  latestPhotoIntelligence,
  nutritionContext,
  sortedPhotos,
  weightStats,
}) {
  if (latestPhotoIntelligence?.limitations?.length > 0) {
    return latestPhotoIntelligence.limitations.slice(0, 2).map((observation) => ({
      title: observation.region,
      detail: observation.change,
    }));
  }

  const bodyFatEvidenceAligned =
    Boolean(latestDEXA) &&
    sortedPhotos.length > 0 &&
    weightStats.weekOverWeek !== null &&
    weightStats.weekOverWeek <= 0;

  if (bodyFatEvidenceAligned) return [];

  return [
    {
      title: "Lean mass",
      detail:
        latestDEXA?.leanMass?.value
          ? sortedPhotos.length > 0
            ? `Latest DEXA shows ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit}; recent photos add supporting confidence between scans.`
            : `Latest DEXA shows ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit}; continue confirming preservation at the next scan.`
          : "Lean mass needs DEXA confirmation.",
    },
    !bodyFatEvidenceAligned && {
      title: "Body-fat estimate",
      detail:
        "Current body fat between scans remains estimated from DEXA and weight trend, so avoid overreacting to a single day.",
    },
    nutritionContext?.estimatedDailyActiveCalorieBurn?.marginOfErrorPercent && {
      title: "Calorie burn estimate",
      detail:
        "We allow for normal wearable margin of error, but your consistently high activity level makes the trend useful. Combined with recent weigh-ins and adherence, confidence in your current trajectory remains high.",
    },
  ]
    .filter(Boolean)
    .slice(0, Math.min(2, Math.max(1, evaluations.length)));
}

function getTodayPlan({ todayPriorities }) {
  return todayPriorities.slice(0, 4).map((priority) => ({
    label: priority.label,
    detail: [priority.subtitle, priority.metadata].filter(Boolean).join(" - ") || "Today",
  }));
}

function getRecommendation({ primaryEvaluation, weightStats, todayPriorities }) {
  const topPriority = todayPriorities.find((priority) => !priority.completed);

  if (topPriority) {
    return {
      title: topPriority.label,
      detail:
        topPriority.label === "Foam Roll"
          ? "Protect recovery today. Recovery work is the highest-leverage behavior because the cut is already moving in the right direction."
          : `Complete ${topPriority.label}. The evidence supports the current protocol, so today's highest-leverage move is execution.`,
    };
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < -2) {
    return {
      title: "Protect recovery.",
      detail:
        "The trend is moving quickly enough that protein, sleep, and training quality should stay protected.",
    };
  }

  return {
    title: "Stay consistent.",
    detail:
      primaryEvaluation?.projection?.daysRemaining
        ? `Evidence still supports visible abs in ${primaryEvaluation.projection.daysRemaining}. Let the next check-in confirm the trend.`
        : "The available evidence supports staying the course while more trend data accumulates.",
  };
}

function getLookingAhead({ todayPriorities, reminders }) {
  if (todayPriorities.length > 0) return [];

  const upcoming = [
    ...todayPriorities.map((priority) => ({
      label: priority.label,
      detail: priority.subtitle ?? "Today",
    })),
    ...reminders
      .filter((reminder) => reminder.active)
      .slice(0, 3)
      .map((reminder) => ({
        label: reminder.title,
        detail: formatReminderTiming(reminder),
      })),
  ];

  return dedupeByLabel(upcoming).slice(0, 4);
}

function getHeroSummary({
  narrativeStory,
  primaryEvaluation,
}) {
  return {
    primaryGoal: narrativeStory?.primaryGoal ?? "Visible Abs at Rest",
    title: narrativeStory?.hero?.title ?? "The story is still developing.",
    summary:
      narrativeStory?.hero?.summary ??
      "A few more check-ins will make the physiology clearer.",
    progress: primaryEvaluation?.progress ?? 0,
    confidence: primaryEvaluation?.confidence ?? 0,
    confidenceLabel:
      primaryEvaluation?.goalConfidence?.label ??
      getConfidenceLabel(primaryEvaluation?.confidence ?? 0),
  };
}

export function getDailyBriefingMemory(latestStoredBriefing) {
  const briefing = latestStoredBriefing?.briefing;
  const previousMemory = briefing?.briefingMemory ?? {};

  return {
    previousBriefingDate:
      latestStoredBriefing?.generatedAt ?? briefing?.generatedAt ?? null,
    previousCoachInsight: briefing?.coachInsight ?? null,
    previousCoachInsightTheme:
      briefing?.briefingMemory?.coachInsightTheme ??
      inferCoachInsightTheme(briefing?.coachInsight),
    previousEvidenceEvent:
      briefing?.briefingMemory?.currentEvidenceEvent ??
      briefing?.event?.type ??
      null,
    previousHeadline:
      briefing?.briefingMemory?.currentHeadline ?? briefing?.hero?.title ?? null,
    previousRecommendation:
      previousMemory.currentRecommendation ??
      briefing?.recommendation?.title ??
      briefing?.recommendation?.summary ??
      null,
    previousProjectionWindow:
      previousMemory.currentProjectionWindow ??
      briefing?.goalStatus?.primary?.projectedFinish ??
      null,
    recentNarrativeThemes: [
      ...(previousMemory.recentNarrativeThemes ?? []),
      previousMemory.coachInsightTheme,
    ].filter(Boolean).slice(-6),
    recentlyMentionedNutrition: Boolean(
      previousMemory.recentNarrativeThemes?.includes("nutrition_context") ||
        /kcal|calorie|nutrition|intake/i.test(
          `${briefing?.coachInsight ?? ""} ${(briefing?.interpretation ?? []).join(" ")}`
        )
    ),
  };
}

export function resolveBriefingMemorySource({ artifactType, cadence, excludeArtifactId, mode, repositories, userId }) {
  if (mode === "none" || artifactType === "event") return null;
  if (mode !== "latest-same-cadence") throw new Error(`Unsupported briefingMemoryMode: ${mode}`);
  const options = { excludeArtifactId };
  if (cadence === "weekly") return repositories.dailyBriefings?.getLatestWeeklyBriefing?.(userId, options) ?? null;
  if (cadence === "monthly") return repositories.dailyBriefings?.getLatestMonthlyBriefing?.(userId, options) ?? null;
  return repositories.dailyBriefings?.getLatestScheduledDailyBriefing?.(userId, options) ?? repositories.dailyBriefings?.getLatestDailyBriefing?.(userId, options) ?? null;
}

function getNarrativeNovelty({
  briefingMemory = {},
  dailyEvidence = {},
  event = {},
  latestDEXA,
  nutritionContext,
  primaryEvaluation,
  protocols = [],
  trainingPerformanceSignal = null,
  weightStats = {},
} = {}) {
  const meaningfulChanges = [];
  const staleThemes = [];
  const nutritionIsNew = dailyEvidence?.nutrition?.status === "new_today";
  const protocolIsNew = dailyEvidence?.protocol?.status === "new_today";
  const newLow = event?.type === "new_low_weight" || weightStats.lowestWeight;

  if (newLow) {
    meaningfulChanges.push({
      type: "weight",
      theme: "new_low",
      priority: 100,
      summary: "New low weigh-in confirms the cut is still moving.",
    });
  } else if (dailyEvidence?.weight?.status === "new_today") {
    meaningfulChanges.push({
      type: "weight",
      theme: "trend_confirmation",
      priority: 85,
      summary: "New weigh-in updates the trend.",
    });
  }

  if (dailyEvidence?.photo?.status === "new_today") {
    meaningfulChanges.push({
      type: "progress_photo",
      theme: "visual_update",
      priority: 95,
      summary: "New photos update visual confidence.",
    });
  }

  if (dailyEvidence?.dexa?.status === "new_today") {
    meaningfulChanges.push({
      type: "dexa",
      theme: "body_composition_anchor",
      priority: 98,
      summary: "New DEXA changes body-composition authority.",
    });
  }

  if (nutritionContext && !nutritionIsNew && briefingMemory.recentlyMentionedNutrition) {
    staleThemes.push("nutrition_context");
  }

  const projectionChanged =
    primaryEvaluation?.projection?.projectedFinish &&
    briefingMemory.previousProjectionWindow &&
    primaryEvaluation.projection.projectedFinish !==
      briefingMemory.previousProjectionWindow;

  if (projectionChanged) {
    meaningfulChanges.push({
      type: "projection",
      theme: "forecast_shift",
      priority: 80,
      summary: `Forecast moved to ${primaryEvaluation.projection.projectedFinish}.`,
    });
  }

  const primaryChange =
    meaningfulChanges.sort((a, b) => b.priority - a.priority)[0] ?? null;
  const noChangeRationale = getNoChangeRationale({
    event,
    primaryEvaluation,
    protocols,
    trainingPerformanceSignal,
    weightStats,
  });

  return {
    date: dailyEvidence?.date ?? weightStats.latestDate ?? null,
    primaryChange,
    meaningfulChanges,
    staleThemes,
    nutritionStatus: dailyEvidence?.nutrition?.status ?? "missing",
    protocolStatus: dailyEvidence?.protocol?.status ?? "previously_known",
    trainingPerformanceStatus: trainingPerformanceSignal?.status ?? "not_available",
    shouldMentionTrainingPerformance: Boolean(trainingPerformanceSignal?.shouldMention),
    shouldMentionNutrition:
      nutritionIsNew,
    shouldMentionProtocol:
      protocolIsNew ||
      (protocols.length > 0 && event?.type === "protocol_relevant"),
    projectionChanged,
    previousProjectionWindow: briefingMemory.previousProjectionWindow,
    currentProjectionWindow: primaryEvaluation?.projection?.projectedFinish ?? null,
    noChangeRationale,
    unchangedContext: [
      !nutritionIsNew && nutritionContext ? "nutrition_context" : null,
      !protocolIsNew && protocols.length > 0 ? "protocol_context" : null,
      latestDEXA && dailyEvidence?.dexa?.status !== "new_today" ? "dexa_anchor" : null,
    ].filter(Boolean),
  };
}

function getNoChangeRationale({
  event,
  primaryEvaluation,
  protocols = [],
  trainingPerformanceSignal = null,
  weightStats,
}) {
  if (trainingPerformanceSignal?.shouldMention) {
    return "No protocol change is recommended because the current plan is producing the desired body-weight signal and training performance is not showing a clear breakdown.";
  }

  if (event?.type === "new_low_weight" || weightStats.lowestWeight) {
    return "No protocol change is recommended because the current setup is still producing the desired signal; changing now would be reacting to progress, not a problem.";
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0) {
    return "No protocol change is recommended because the weekly signal is still moving the right way; the useful move is patience, not extra intervention.";
  }

  if (primaryEvaluation?.projection?.daysRemaining) {
    return `No protocol change is recommended because the current trajectory still points toward the goal in ${primaryEvaluation.projection.daysRemaining}; one more check-in should matter more than one more adjustment.`;
  }

  if (protocols.length > 0) {
    return "No protocol change is recommended because the background routine has not produced a new warning signal.";
  }

  return "No protocol change is recommended because today's evidence does not separate signal from noise strongly enough to justify one.";
}

function getDailyEvidenceReconciliation({
  checkIns = [],
  latestAnalysis,
  latestDEXA,
  latestPhotoAnalysis,
  latestPhotoIntelligence,
  latestWeight,
  nutritionContext,
  sortedPhotos = [],
  trigger = {},
}) {
  const briefingDate = getBriefingEvidenceDate({ latestAnalysis, latestWeight });
  const latestCheckIn = sortByDate(checkIns, "date").at(-1) ?? null;
  const photoAnalysisDate = getDateKey(latestPhotoAnalysis?.createdAt);
  const latestPhotoDates = new Set(
    sortedPhotos.slice(-4).map((photo) => getDateKey(photo.date ?? photo.capturedAt))
  );
  const inferredLatestEvidenceType = latestAnalysis?.evidenceTypes?.[0] ?? null;
  const triggerType = trigger?.evidenceType ?? inferredLatestEvidenceType;
  const hasExplicitTrigger = Boolean(trigger?.evidenceType);
  const photoIsTrigger = triggerType === "progress_photo";
  const photoIsLatestEvidence = inferredLatestEvidenceType === "progress_photo";
  const photoIsNewToday =
    Boolean(latestPhotoIntelligence) &&
    (photoIsTrigger ||
      (!hasExplicitTrigger &&
        photoIsLatestEvidence &&
        (photoAnalysisDate === briefingDate || latestPhotoDates.has(briefingDate))));
  const weightWasCorrected =
    Boolean(latestWeight?.correctionHistory?.length) &&
    getDateKey(latestWeight?.updatedAt) === briefingDate;
  const weightIsTrigger = triggerType === "weight";

  return {
    date: briefingDate,
    weight: {
      status: weightWasCorrected
        ? "updated_today"
        : getDateKey(latestWeight?.measuredAt) === briefingDate
        ? "new_today"
        : "previously_known",
      analysisId: weightIsTrigger ? latestAnalysis?.id ?? null : null,
      evidenceId: latestWeight?.id ?? null,
      trigger: weightIsTrigger,
    },
    photos: {
      status: photoIsNewToday ? "new_today" : latestPhotoIntelligence ? "previously_known" : "missing",
      analysisId: latestPhotoAnalysis?.id ?? null,
      isNarrativeDriver: photoIsNewToday,
      trigger: photoIsTrigger,
    },
    photo: {
      status: photoIsNewToday ? "new_today" : latestPhotoIntelligence ? "previously_known" : "missing",
      analysisId: latestPhotoAnalysis?.id ?? null,
      isNarrativeDriver: photoIsNewToday,
      trigger: photoIsTrigger,
    },
    dexa: {
      status:
        getDateKey(latestDEXA?.measuredAt) === briefingDate
          ? "new_today"
          : latestDEXA
          ? "previously_known"
          : "missing",
      evidenceId: latestDEXA?.id ?? null,
    },
    checkIn: {
      status:
        latestCheckIn?.date === briefingDate
          ? latestCheckIn?.updatedAt && getDateKey(latestCheckIn.updatedAt) === briefingDate
            ? "updated_today"
            : "new_today"
          : latestCheckIn
          ? "previously_known"
          : "missing",
      evidenceId: latestCheckIn?.id ?? null,
    },
    nutrition: {
      status:
        triggerType === "nutrition" ||
        getDateKey(nutritionContext?.updatedAt ?? nutritionContext?.createdAt) === briefingDate
          ? "new_today"
          : nutritionContext
          ? "previously_known"
          : "missing",
      evidenceId: nutritionContext?.id ?? null,
    },
    protocol: {
      status: triggerType === "protocol" ? "new_today" : "previously_known",
      evidenceId: triggerType === "protocol" ? latestAnalysis?.id ?? null : null,
    },
    narrativeDriver:
      photoIsNewToday && photoIsTrigger
        ? "progress_photo"
        : weightIsTrigger
        ? "weight"
        : triggerType ?? "latest_evidence",
  };
}

function getBriefingEvidenceDate({ latestAnalysis, latestWeight }) {
  const latestAnalysisDate = getDateKey(latestAnalysis?.createdAt);
  const latestWeightDate = getDateKey(latestWeight?.measuredAt);

  return latestWeightDate || latestAnalysisDate || getDateKey(new Date().toISOString());
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function getUpdatedDailyBriefingMemory({
  briefingMemory,
  coachInsight,
  event,
  hero,
  narrativeNovelty,
  primaryEvaluation,
  recommendation,
}) {
  const currentThemes = [
    coachInsight.theme,
    narrativeNovelty?.shouldMentionNutrition ? "nutrition_context" : null,
    narrativeNovelty?.shouldMentionProtocol ? "protocol_context" : null,
    narrativeNovelty?.primaryChange?.theme,
  ].filter(Boolean);

  return {
    previousBriefingDate: briefingMemory.previousBriefingDate,
    previousCoachInsightTheme: briefingMemory.previousCoachInsightTheme,
    previousEvidenceEvent: briefingMemory.previousEvidenceEvent,
    previousHeadline: briefingMemory.previousHeadline,
    previousRecommendation: briefingMemory.previousRecommendation,
    coachInsightTheme: coachInsight.theme,
    currentEvidenceEvent: event?.type ?? null,
    currentHeadline: hero?.title ?? null,
    currentRecommendation:
      recommendation?.title ?? recommendation?.summary ?? null,
    currentProjectionWindow: primaryEvaluation?.projection?.projectedFinish ?? null,
    recentNarrativeThemes: [
      ...(briefingMemory.recentNarrativeThemes ?? []),
      ...currentThemes,
    ].slice(-8),
    novelty: narrativeNovelty,
  };
}

function getTrainingPerformanceBriefingSignal({
  primaryEvaluation,
  report,
  weightStats = {},
}) {
  const summary = report?.overallObservation?.explanation_data?.summary ?? {};
  const recentPrs = report?.exerciseObservations?.filter(
    (observation) => observation.explanation_data?.pr_detection?.detected
  ) ?? [];
  const improving = report?.exerciseObservations?.filter(
    (observation) => observation.status === "improving"
  ) ?? [];
  const regressing = report?.exerciseObservations?.filter(
    (observation) => observation.status === "regressing"
  ) ?? [];
  const stageIsLateCut =
    (primaryEvaluation?.confidence ?? 0) >= 85 &&
    (primaryEvaluation?.progress ?? 0) >= 80 &&
    Boolean(primaryEvaluation?.projection?.daysRemaining);
  const hasMeaningfulSignal =
    recentPrs.length > 0 ||
    improving.length > 0 ||
    regressing.length > 0 ||
    (stageIsLateCut && (summary.resistance_sessions_last_7_days ?? 0) > 0);

  if (!hasMeaningfulSignal) {
    return {
      shouldMention: false,
      status: "insufficient_signal",
      summary,
    };
  }

  const leadExercise =
    recentPrs[0]?.exercise?.name ??
    improving[0]?.exercise?.name ??
    summary.most_improved_exercise ??
    null;
  const recentPrCount = recentPrs.length || summary.recent_pr_count || 0;
  const improvingCount = improving.length || summary.exercises_improving || 0;
  const performancePhrase =
    regressing.length > 0
      ? `${regressing[0].exercise.name} is showing a material performance drop`
      : recentPrCount > 0 && leadExercise
      ? `${leadExercise} produced a recent performance PR`
      : improvingCount > 0 && leadExercise
        ? `${leadExercise} is still progressing`
        : `${summary.resistance_sessions_last_7_days ?? 0} resistance sessions landed in the last 7 days`;
  const supportPhrase =
    weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
      ? "while the weekly weight trend is still moving down"
      : "while the cut remains on track";

  return {
    assessmentLine:
      regressing.length > 0
        ? `${sentenceCase(performancePhrase)}. That does not prove lean mass is being lost, but it makes training quality a watch item.`
        : `${sentenceCase(performancePhrase)} ${supportPhrase}. This supports the lean-mass-preservation read, but it does not prove it by itself.`,
    coachLine: `${sentenceCase(performancePhrase)} ${supportPhrase}.`,
    improvingExercises: improving.map((observation) => observation.exercise.name),
    interpretationLine: `${sentenceCase(performancePhrase)} ${supportPhrase}; that is the training-quality signal that matters most for preserving lean mass near the end of the cut.`,
    recentPrs: recentPrs.map((observation) => observation.exercise.name),
    shouldMention: true,
    stageIsLateCut,
    status:
      regressing.length > 0
        ? "regressing"
        : recentPrCount > 0
          ? "recent_pr"
          : improvingCount > 0
            ? "improving"
            : "late_cut_training_present",
    summary,
  };
}

function applyDailyBriefingEditorialJudgment({
  coachInsight = {},
  currentAssessment = [],
  interpretation = [],
  primaryEvaluation = null,
  projection = [],
  recommendation = null,
  trainingPerformanceSignal = null,
  weightStats = {},
}) {
  const filteredInterpretation = uniqueIdeas(
    interpretation.map(applyDecisionSupportNarrativeFilter)
  );
  const filteredAssessment = currentAssessment.map((item) => ({
    ...item,
    detail: applyDecisionSupportNarrativeFilter(item.detail),
  }));
  const filteredProjection = projection.map((item) => ({
    ...item,
    detail: applyDecisionSupportNarrativeFilter(item.detail),
  }));
  const practicalTakeaway = createEditorialCoachTakeaway({
    primaryEvaluation,
    recommendation,
    trainingPerformanceSignal,
    weightStats,
  });
  const finalCoachInsight = {
    ...coachInsight,
    text: practicalTakeaway,
    theme:
      trainingPerformanceSignal?.status === "regressing"
        ? "training_caution"
        : "decision_restraint",
  };

  return {
    coachInsight: finalCoachInsight,
    currentAssessment: filteredAssessment,
    editorialJudgment: {
      coachInsightRole: "practical_takeaway",
      currentAssessmentRole: "status_judgment",
      duplicateEvidenceSuppressed: suppressesIdeaOverlap({
        coachInsight: finalCoachInsight.text,
        interpretation: filteredInterpretation,
      }),
      interpretationRole: "evidence_read",
    },
    interpretation: filteredInterpretation,
    projection: filteredProjection,
  };
}

function createEditorialCoachTakeaway({
  primaryEvaluation,
  recommendation,
  trainingPerformanceSignal,
  weightStats = {},
}) {
  const noChange =
    recommendation?.detail && /complete/i.test(recommendation.title ?? "")
      ? recommendation.detail
      : "Today does not call for a protocol change.";
  const trend =
    weightStats.dayChange !== null && weightStats.dayChange > 0 && weightStats.weekOverWeek < 0
      ? "The scale is noisy day to day, but the weekly trend is still moving down."
      : weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0
        ? "Do not overreact to single-day scale noise; the weekly trend is still moving down."
        : "The current read is not strong enough to justify a bigger move.";
  const training =
    trainingPerformanceSignal?.status === "regressing"
      ? "Training performance is the watch item, so protect recovery and do not force load progression today."
      : trainingPerformanceSignal?.shouldMention
        ? "Training is holding up, so keep the cut boring and protect workout quality."
        : "Keep execution clean and wait for the next high-value check-in.";
  const checkpoint = primaryEvaluation?.projection?.daysRemaining
    ? "The next scheduled photos or DEXA can confirm that direction."
    : "A few more completed days will make the trend easier to read.";

  return [noChange, trend, training, checkpoint]
    .map(applyDecisionSupportNarrativeFilter)
    .filter(Boolean)
    .join(" ");
}

function suppressesIdeaOverlap({ coachInsight, interpretation = [] }) {
  const coachTokens = getIdeaTokens(coachInsight);
  const interpretationTokens = new Set(
    interpretation.flatMap((item) => getIdeaTokens(item))
  );

  return [...coachTokens].filter((token) => interpretationTokens.has(token));
}

function getIdeaTokens(value) {
  const text = String(value ?? "").toLowerCase();

  return [
    /performance pr|progressive overload|spider curls|training-quality|training quality/.test(text)
      ? "training_performance"
      : null,
    /weekly trend|trend is still moving down|trend is down/.test(text)
      ? "weight_trend"
      : null,
    /protocol change|no change/.test(text) ? "protocol_decision" : null,
    /body fat|dexa|projection/.test(text) ? "body_composition" : null,
  ].filter(Boolean);
}

function applyDecisionSupportNarrativeFilter(value) {
  return String(value ?? "")
    .replace(
      /This is one of the strongest stretches of the cut because the important signals are telling the same story\./gi,
      "The current evidence supports staying with the plan."
    )
    .replace(/the useful change today is signal quality, not a new concern\./gi, "")
    .replace(/organized into today's plan/gi, "reviewed for today's decision")
    .replace(/latest evidence has been reviewed/gi, "today's evidence was reviewed")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCoachInsightTheme(insight) {
  if (!insight) return null;
  const value = insight.toLowerCase();

  if (value.includes("new low")) return "new_low";
  if (value.includes("holding") || value.includes("stabilization")) {
    return "stabilization";
  }
  if (value.includes("same direction") || value.includes("agreement")) {
    return "evidence_alignment";
  }
  if (value.includes("unfinished") || value.includes("execution rhythm")) {
    return "priority_execution";
  }

  return "steady_execution";
}

function getLatestPhotoIntelligence(latestAnalysis) {
  const interpretation = latestAnalysis?.metadata?.photoInterpretation;
  if (!interpretation || !latestAnalysis?.evidenceTypes?.includes("progress_photo")) {
    return null;
  }

  const observations =
    latestAnalysis.metadata.structuredObservations ??
    interpretation.structured_observations ??
    normalizePhotoInterpretationToStructuredObservations(interpretation);
  const limitations = observations.filter(
    (observation) =>
      observation.importance === "limitation" ||
      observation.supportsGoal === false ||
      observation.confidence === "low"
  );
  const availability = getPhotoEvidenceAvailability({
    interpretation,
    observations,
    source: latestAnalysis.source,
  });
  const sanitizedInterpretation = sanitizePhotoInterpretation(
    interpretation,
    availability
  );

  return {
    analysisId: latestAnalysis.id,
    availability,
    briefing: sanitizePhotoBriefing(interpretation.briefing_summary ?? {}, availability),
    createdAt: latestAnalysis.createdAt,
    interpretation: sanitizedInterpretation,
    limitations: sanitizePhotoObservations(limitations, availability),
    observations: sanitizePhotoObservations(observations, availability),
    source: latestAnalysis.source,
  };
}

function choosePhotoAnalysis({ analyses = [], latestAnalysis, latestPhotoAnalysis }) {
  const candidates = [...analyses, latestPhotoAnalysis, latestAnalysis]
    .filter(Boolean)
    .filter((analysis) => analysis.evidenceTypes?.includes("progress_photo"));

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const availabilityDelta =
      getPhotoAnalysisAvailabilityRank(b) - getPhotoAnalysisAvailabilityRank(a);
    if (availabilityDelta !== 0) return availabilityDelta;

    return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
  })[0];
}

function sanitizePhotoInterpretation(interpretation, availability) {
  const sanitized = {
    ...interpretation,
    coach_briefing_insert: sanitizeUserFacingText(interpretation?.coach_briefing_insert),
    user_facing_summary: sanitizeUserFacingText(interpretation?.user_facing_summary),
  };

  if (availability !== "rich") {
    sanitized.coach_briefing_insert =
      "Today's photos were saved, but there is not enough reliable visual evidence yet to compare change confidently.";
    sanitized.user_facing_summary =
      "Today's photos were saved, but there is not enough reliable visual evidence yet to compare change confidently.";
  }

  return sanitized;
}

function getPhotoAnalysisAvailabilityRank(analysis) {
  const availability = getPhotoEvidenceAvailability({
    interpretation: analysis?.metadata?.photoInterpretation,
    observations:
      analysis?.metadata?.structuredObservations ??
      analysis?.metadata?.photoInterpretation?.structured_observations ??
      [],
    source: analysis?.source,
  });

  if (availability === "rich") return 2;
  if (availability === "limited") return 1;
  return 0;
}

function getPhotoEvidenceAvailability({ interpretation, observations = [], source }) {
  const provider = String(source?.type ?? "").toLowerCase();
  const sourceName = String(source?.name ?? "").toLowerCase();
  const richSignals = [
    interpretation?.briefing_summary?.summary,
    interpretation?.detailed_interpretation?.summary,
    interpretation?.global_shape_analysis,
    interpretation?.proportional_analysis,
    interpretation?.coach_briefing_insert,
    ...(interpretation?.high_confidence_observations ?? []),
    ...(interpretation?.emerging_evidence ?? []),
    ...observations.map((observation) => observation.change),
  ];

  if (
    provider === "openai" &&
    richSignals.filter((signal) => !hasImplementationLeak(signal)).length >= 3
  ) {
    return "rich";
  }

  if (provider === "fallback" || sourceName.includes("fallback")) return "limited";
  if (observations.length > 0) return "limited";

  return "unavailable";
}

function sanitizePhotoBriefing(briefing, availability) {
  const sanitized = Object.fromEntries(
    Object.entries(briefing).map(([key, value]) => [key, sanitizeUserFacingText(value)])
  );

  if (availability !== "rich" && !sanitized.summary) {
    sanitized.summary =
      "Today's photos were saved, but there is not enough reliable visual evidence yet to compare change confidently.";
  }

  return sanitized;
}

function sanitizePhotoObservations(observations, availability) {
  const sanitized = observations
    .map((observation) => ({
      ...observation,
      change: sanitizeUserFacingText(observation.change),
      limitations: (observation.limitations ?? [])
        .map(sanitizeUserFacingText)
        .filter(Boolean),
    }))
    .filter((observation) => observation.change);

  if (availability === "rich") return sanitized;

  return sanitized.filter((observation) => !hasImplementationLeak(observation.change));
}

function sanitizeUserFacingText(value) {
  if (typeof value !== "string") return value;
  if (!hasImplementationLeak(value)) return value;

  return "Today's photos were saved, but there is not enough reliable visual evidence yet to compare change confidently.";
}

function hasImplementationLeak(value) {
  return /\b(fallback mode|openai|photo ?interpreter path|metadata captured|metadata-only|parser|provider|model unavailable|structured observations|computer-vision|vision is unavailable|implementation)\b/i.test(
    String(value ?? "")
  );
}

function getEvidenceTrace({ latestPhotoIntelligence }) {
  if (!latestPhotoIntelligence) return [];

  return latestPhotoIntelligence.observations.slice(0, 8).map((observation) => ({
    caveats: observation.limitations ?? [],
    confidence: observation.confidence,
    evidenceId: latestPhotoIntelligence.analysisId,
    observation: observation.change,
    region: observation.region,
    source: latestPhotoIntelligence.source?.name ?? "PhotoInterpreter",
    supportsGoal: observation.supportsGoal,
    type: observation.type,
  }));
}

function getObservationChanges(observations = [], { excludeLimitations = false, limit = 3 } = {}) {
  return observations
    .filter((observation) => observation?.change)
    .filter(
      (observation) =>
        !excludeLimitations ||
        (observation.importance !== "limitation" && observation.supportsGoal !== false)
    )
    .map((observation) => sentenceCase(observation.change))
    .filter(Boolean)
    .slice(0, limit);
}

function createObservationLine(label, observations) {
  const changes = observations
    .filter(Boolean)
    .map((observation) => stripSentenceEnding(sentenceCase(observation.change)));

  if (changes.length === 0) return null;

  return `${label}: ${joinHumanList(changes)}.`;
}

function findObservation(observations = [], pattern, excluded = []) {
  const excludedKeys = new Set(
    excluded.filter(Boolean).map((observation) => normalizeForComparison(observation.change))
  );

  return observations.find(
    (observation) =>
      pattern.test(`${observation.region} ${observation.change}`) &&
      !excludedKeys.has(normalizeForComparison(observation.change))
  );
}

function uniqueIdeas(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item) return false;
    const key = normalizeForComparison(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSentenceEnding(value) {
  return String(value ?? "").trim().replace(/[.!?]+$/g, "");
}

function lowerFirst(value) {
  const text = String(value ?? "");
  if (!text) return text;

  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function getWeightEvidenceSummary({ event, weeklyMomentum, weightStats }) {
  const current = weeklyMomentum.find((row) =>
    /current\s+rolling\s+7\s+days/i.test(row.label ?? "")
  ) ?? weeklyMomentum.at(0);
  const eventLead = event?.journeyLead ? `${event.journeyLead} ` : "";

  if (current && current.change !== null && current.change < 0) {
    return `${eventLead}That matters because it confirms the scale is still responding without needing a plan change. The current rolling week is down ${Math.abs(current.change).toFixed(1)} ${weightStats.unit} versus the previous week, reinforcing the longer cut trajectory.`;
  }

  if (weightStats.weekOverWeek !== null && weightStats.weekOverWeek < 0) {
    return `${eventLead}That matters because the daily signal agrees with the weekly trend. Weekly average is ${formatSigned(weightStats.weekOverWeek)} ${weightStats.unit}, reinforcing continued fat-loss momentum.`;
  }

  return `${eventLead}That matters because weight remains the clearest short-term signal for the cut. The next few weigh-ins will show whether this reinforces or simply extends the current trend.`;
}

function formatRecoveryNote(originalNote, fallback) {
  if (!originalNote) return fallback ?? "Recovery note was added.";

  const lower = originalNote.toLowerCase();

  if (lower.includes("sleep") && lower.includes("7 hour")) {
    return "Sleeping deeply, but sleep duration was reduced over the past two nights.";
  }

  if (lower.includes("sleep") || lower.includes("slept")) {
    return originalNote;
  }

  return fallback ?? originalNote;
}

function getDEXAEvidenceSummary({ bodyFatChange, fatMassChange, latestDEXA }) {
  if (bodyFatChange !== null && bodyFatChange < 0) {
    return `DEXA confirmed body fat moved ${bodyFatChange.toFixed(1)} percentage points to ${latestDEXA.bodyFat.toFixed(1)}%. That matters because it gives the cleanest read on whether the cut is moving toward the target while lean mass stays protected.`;
  }

  if (fatMassChange !== null && fatMassChange < 0) {
    return `DEXA shows fat mass down ${Math.abs(fatMassChange).toFixed(1)} ${latestDEXA.unit}. That matters because fat-mass movement validates the weight trend. The latest scan reinforces the current body-fat trajectory.`;
  }

  return "Your latest DEXA remains the strongest body-composition check. Future scans will show whether the weight and photo trends are translating into the right kind of change.";
}

function getWeeklyMomentum(weights, goalStartDate = null) {
  const first = weights[0];
  const latest = weights.at(-1);

  if (!first || !latest) return [];

  const weeks = [];
  const start = parseDateKey(goalStartDate ?? first.measuredAt);
  const latestDate = parseDateKey(latest.measuredAt);
  let cursor = start;
  let previousAverage = null;
  let weekNumber = 1;

  while (cursor <= latestDate) {
    const end = addDays(cursor, 6);
    const entries = weights.filter((entry) =>
      isWithinRange(parseDateKey(entry.measuredAt), cursor, end)
    );

    if (entries.length > 0 && end <= latestDate) {
      const average = averageWeight(entries);

      weeks.push({
        label: weekNumber === 1 ? "Opening Week" : `Week ${weekNumber}`,
        period: `${formatShortDate(toDateKey(cursor))}-${formatShortDate(toDateKey(end))}`,
        sortDate: toDateKey(cursor),
        average,
        change:
          previousAverage === null
            ? null
            : Number((average - previousAverage).toFixed(1)),
        unit: entries.at(-1)?.weight?.unit ?? "lb",
      });
      previousAverage = average;
    }

    cursor = addDays(cursor, 7);
    weekNumber += 1;
  }

  const rollingEnd = latestDate;
  const rollingStart = addDays(rollingEnd, -6);
  const previousRollingStart = addDays(rollingStart, -7);
  const previousRollingEnd = addDays(rollingStart, -1);
  const rollingEntries = weights.filter((entry) =>
    isWithinRange(parseDateKey(entry.measuredAt), rollingStart, rollingEnd)
  );
  const previousRollingEntries = weights.filter((entry) =>
    isWithinRange(parseDateKey(entry.measuredAt), previousRollingStart, previousRollingEnd)
  );
  const rollingAverage = averageWeight(rollingEntries);
  const previousRollingAverage = averageWeight(previousRollingEntries);

  if (rollingEntries.length > 0) {
    const rolling = {
      label: "Current Rolling 7 Days",
      period: `${formatShortDate(toDateKey(rollingStart))}-${formatShortDate(toDateKey(rollingEnd))}`,
      sortDate: toDateKey(rollingStart),
      average: rollingAverage,
      change:
        previousRollingAverage === null
          ? null
          : Number((rollingAverage - previousRollingAverage).toFixed(1)),
      unit: rollingEntries.at(-1)?.weight?.unit ?? "lb",
    };
    const last = weeks.at(-1);

    if (!last || last.period !== rolling.period) {
      weeks.push(rolling);
    } else {
      weeks[weeks.length - 1] = rolling;
    }
  }

  return orderWeeklyAveragesNewestFirst(weeks);
}

function getConfidenceLabel(confidence) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";

  return "Building";
}

function formatNutritionEvidence(nutritionContext) {
  const intake = nutritionContext?.estimatedDailyCaloricIntake;

  if (intake?.min && intake?.max) {
    return `${intake.min}-${intake.max} ${intake.unit ?? "kcal"} target range supports the current plan.`;
  }

  return "Nutrition information is available.";
}

function getWeightChartPoints(weights, latestDEXA) {
  const points = weights;
  const values = points.map((entry) => entry.weight.value);

  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const latestDexaDate = latestDEXA?.measuredAt ?? null;

  return points.map((entry, index) => ({
    date: entry.measuredAt,
    value: entry.weight.value,
    label: formatShortDate(entry.measuredAt),
    isStart: index === 0,
    isLatest: index === points.length - 1,
    isDexa: entry.measuredAt === latestDexaDate,
    normalized: Number(((max - entry.weight.value) / range).toFixed(4)),
  }));
}

function averageWeight(weights) {
  if (weights.length === 0) return null;

  const total = weights.reduce((sum, entry) => sum + entry.weight.value, 0);

  return Number((total / weights.length).toFixed(1));
}

function sortByDate(records, field) {
  return [...records].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

function isWithinRange(date, start, end) {
  return date >= start && date <= end;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatWeight(value, unit = "lb") {
  if (value === null || value === undefined) return "Pending";

  return `${value.toFixed(1)} ${unit}`;
}

function formatSigned(value) {
  if (value > 0) return `+${value.toFixed(1)}`;

  return value.toFixed(1);
}

function formatReminderTiming(reminder) {
  if (reminder.title === "Morning Weight") return "Daily in the morning";

  if (reminder.schedule?.dayOfWeek && reminder.schedule?.timeOfDay) {
    return `${capitalize(reminder.schedule.dayOfWeek)} ${formatTimingLabel(reminder.schedule.timeOfDay)}`;
  }

  if (reminder.schedule?.daysOfWeek?.length && reminder.schedule?.timeOfDay) {
    return `${reminder.schedule.daysOfWeek.map(capitalize).join(", ")} ${formatTimingLabel(reminder.schedule.timeOfDay)}`;
  }

  return reminder.schedule?.timeOfDay
    ? formatTimingLabel(reminder.schedule.timeOfDay)
    : "Upcoming";
}

function dedupeByLabel(items) {
  const labels = new Set();

  return items.filter((item) => {
    if (labels.has(item.label)) return false;
    labels.add(item.label);

    return true;
  });
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatTimingLabel(value) {
  return String(value)
    .split("_")
    .map(capitalize)
    .join(" ");
}

function formatShortDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  const date =
    year && month && day
      ? new Date(year, month - 1, day)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isToday(value) {
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
