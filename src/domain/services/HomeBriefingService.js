import { bottomNavigation } from "../../fixtures/bottomNavigation";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { ActionEngineService } from "./ActionEngineService";
import { DailyFocusService } from "./DailyFocusService";
import { getDailyBriefingFreshness } from "./DailyBriefingFreshnessService";
import { getDailyEvent } from "./DailyEventService";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { resolveHomeBriefingSelection } from "./HomeBriefingRoutingService";
import {
  createPreviousDayEvidenceWindow,
  resolveScheduledBriefingExpectation,
} from "./BriefingEvidenceWindowService";
import {
  deriveHomeActiveChapterPresentation,
  filterHomeRemindersForActiveGoal,
} from "./HomeActiveChapterPresentationService";
import { resolveOverallGoalConfidenceReadModel } from "./OverallGoalConfidenceReadService";
import {
  resolveCoachingUpdatesReadModel,
  resolveNextEligibleCoachingUpdates,
} from "./CoachingUpdatesReadService";

const placeholderHeader = {
  greeting: "Good morning,",
  name: "Founder",
  avatar: null,
};

const placeholderNextBestAction = {
  title: "Import Founder Data",
  href: "/check-in/morning",
};

export function createHomeBriefingService({
  repositories = FounderRepositories,
  navigation = bottomNavigation,
  viewData = {},
  now = () => new Date(),
} = {}) {
  return {
    async getHomeBriefing(userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();

      const resolvedUserId = user?.id ?? userId ?? null;
      const [
        goals,
        activeGoal,
        checkIns,
        dexaScans,
        weightEntries,
        latestWeight,
        activeProtocols,
        reminders,
        operatingPlan,
        executionItems,
        nutritionContext,
        progressPhotos,
        latestAnalysis,
        analyses,
        latestDailyBriefing,
        latestMidweekBriefing,
        latestWeeklyBriefing,
        latestEventBriefing,
        canonicalEvidence,
      ] = resolvedUserId
          ? await Promise.all([
            repositories.goals.listGoals(resolvedUserId),
            repositories.goals.getActiveGoal(resolvedUserId),
            repositories.dailyCheckIns.listCheckIns(resolvedUserId),
            repositories.dexaScans.listDEXAScans(resolvedUserId),
            repositories.weights.listWeightEntries(resolvedUserId),
            repositories.weights.getLatestWeightEntry(resolvedUserId),
            repositories.protocols.listActiveProtocols(resolvedUserId),
            repositories.reminders?.listReminders?.(resolvedUserId) ?? repositories.reminders?.listActiveReminders?.(resolvedUserId) ?? [],
            repositories.operatingPlan?.getOperatingPlan?.(resolvedUserId) ?? null,
            repositories.executionItems?.listExecutionItems?.(resolvedUserId) ?? [],
            repositories.nutritionContext?.getNutritionContext(resolvedUserId) ?? null,
            repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
            repositories.analyses.getLatestAnalysis(),
            repositories.analyses.listAnalyses?.() ?? [],
            repositories.dailyBriefings?.getLatestScheduledDailyBriefing?.(resolvedUserId) ?? repositories.dailyBriefings?.getLatestDailyBriefing?.(resolvedUserId) ?? null,
            repositories.dailyBriefings?.getLatestMidweekBriefing?.(resolvedUserId) ?? null,
            repositories.dailyBriefings?.getLatestWeeklyBriefing?.(resolvedUserId) ?? null,
            repositories.dailyBriefings?.getLatestActiveEventBriefing?.(resolvedUserId) ?? null,
            repositories.canonicalEvidence?.listCanonicalEvidenceObjects(resolvedUserId) ?? [],
          ])
        : [
            [],
            null,
            [],
            [],
            [],
            null,
            [],
            [],
            null,
            [],
            null,
            [],
            await repositories.analyses.getLatestAnalysis(),
            await repositories.analyses.listAnalyses?.() ?? [],
            null,
            null,
            null,
            null,
            [],
          ];
      const trainingPerformance = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonicalEvidence });
      const coachingProtocol = activeProtocols.find((item) =>
        (item.protocolType ?? item.category) === "briefings");
      const coachingVersion = coachingProtocol?.currentVersionId
        ? await repositories.protocolVersions.getCurrentVersion(coachingProtocol.id)
        : null;
      const coachingUpdates = resolveCoachingUpdatesReadModel({
        protocol: coachingProtocol,
        version: coachingVersion,
        goal: activeGoal,
        timeZone: user?.timeZone ?? "America/Los_Angeles",
      });
      const homeCoachingUpdates = coachingUpdates ? {
        ...coachingUpdates,
        nextEligible: resolveNextEligibleCoachingUpdates(coachingUpdates, {
          now: now(),
          timeZone: user?.timeZone ?? "America/Los_Angeles",
        }),
      } : null;
      const expectation = resolveScheduledBriefingExpectation({
        now: now(),
        timeZone: user?.timeZone ?? "America/Los_Angeles",
        coachingUpdates: homeCoachingUpdates,
      });
      const expectedDailyWindow = createPreviousDayEvidenceWindow({
        now: now(),
        timeZone: user?.timeZone ?? "America/Los_Angeles",
      });
      const expectedDailyRecord = resolvedUserId
        ? await repositories.dailyBriefings?.getBriefingByEvidenceWindow?.(resolvedUserId, expectedDailyWindow.id)
        : null;
      const currentDailyBriefing = isReadableDailyArtifact(expectedDailyRecord, expectedDailyWindow)
        ? expectedDailyRecord
        : null;
      const goalEvaluations = GoalEvaluationService.getGoalEvaluations({
        goals,
        dexaScans,
        weightEntries,
        progressPhotos,
        protocols: activeProtocols,
        nutritionContext,
        photoAnalyses: analyses,
        trainingPerformance,
      });
      const goalIntelligence = GoalIntelligenceService.getGoalIntelligence({
        evaluations: goalEvaluations,
        activeGoal,
      });
      const primaryEvaluation = goalEvaluations.find((evaluation) => evaluation.goalId === activeGoal?.id) ?? goalEvaluations.find((evaluation) => evaluation.primary) ?? null;
      const homeReminders = activeGoal?.type === "build_lean_mass"
        ? filterHomeRemindersForActiveGoal(reminders, activeGoal.id)
        : reminders;
      const todaysFocus = DailyFocusService.getDailyFocus({
        checkIns,
        latestWeight,
        weightEntries,
        protocols: activeProtocols,
        progressPhotos,
        reminders: homeReminders,
      });
      const actionPlan = reconcileDailyBriefingAction(
        ActionEngineService.getActionPlan({
        latestWeight,
        priorities: todaysFocus,
        }),
        currentDailyBriefing
      );
      const dailyEvent = getDailyEvent({
        checkIns,
        dexaScans,
        progressPhotos,
        protocols: activeProtocols,
        weights: weightEntries,
      });
      const briefingFreshness = getDailyBriefingFreshness({
        analyses,
        checkIns,
        dailyBriefing: currentDailyBriefing,
        dexaScans,
        nutritionContext,
        progressPhotos,
        weightEntries,
        expectedWindow: expectedDailyWindow,
      });
      const briefingSelection = resolveHomeBriefingSelection({
        dailyArtifact: currentDailyBriefing,
        eventArtifact: latestEventBriefing,
        midweekArtifact: latestMidweekBriefing,
        now: now(),
        timeZone: user?.timeZone ?? "America/Los_Angeles",
        weeklyArtifact: latestWeeklyBriefing,
        coachingUpdates: homeCoachingUpdates,
      });
      const briefingCard = mapBriefingCard({
        dailyEvent,
        freshness: briefingFreshness,
        latestAnalysis,
        selection: briefingSelection,
        dexaScans,
        progressPhotos,
        weightEntries,
        expectation,
        generationArtifact: expectedDailyRecord,
        historicalDailyBriefing: latestDailyBriefing,
      });
      const overallGoalConfidence = activeGoal?.type === "build_lean_mass" ? resolveOverallGoalConfidenceReadModel({
        activeGoal, activeProtocols, canonicalEvidence, checkIns, currentDate: now(), dexaScans,
        nutritionContext, progressPhotos, timeZone: user?.timeZone ?? "America/Los_Angeles", trainingPerformance,
      }) : null;
      const activeChapter = deriveHomeActiveChapterPresentation({
        activeGoal,
        briefingCard,
        commitments: executionItems,
        goals,
        operatingPlan,
        reminders,
        currentDate: now(),
        timeZone: user?.timeZone ?? "America/Los_Angeles",
        evidenceSummary: {
          nutritionConsistent: Boolean(nutritionContext),
          trainingConsistent: Boolean(trainingPerformance?.sessions?.length ?? canonicalEvidence.some((item) => /training/i.test(item.type ?? item.evidenceType ?? ""))),
          activityConsistent: checkIns.length > 0,
          evidenceConsistent: progressPhotos.length > 0 || dexaScans.length > 0,
          protocolAdherence: activeProtocols.length > 0,
        },
        dexaScans,
        trajectory: overallGoalConfidence?.trajectory,
        overallGoalConfidence,
        coachingUpdates,
      });

      return {
        header: mapHeader(user),
        hero: activeChapter?.hero ?? mapHomeHero({ activeGoal, evaluation: primaryEvaluation, weightEntries }),
        trajectory: goalIntelligence.trajectory,
        nextBestAction: mapNextBestAction({ actionPlan, briefingCard, user }),
        actionPlan,
        goals: activeChapter?.goals ?? goalIntelligence.goals.map(mapGoal),
        todaysFocus,
        bottomNavigation: navigation,
        latestAnalysis: activeChapter?.briefingCard ?? briefingCard,
        ...viewData,
      };
    },
  };
}

export function reconcileDailyBriefingAction(actionPlan, dailyArtifact) {
  if (actionPlan?.currentAction?.label !== "Open Daily Briefing") return actionPlan;
  if (!dailyArtifact) {
    return {
      ...actionPlan,
      currentAction: null,
    };
  }
  return {
    ...actionPlan,
    currentAction: {
      ...actionPlan.currentAction,
      href: `/briefings/review/${dailyArtifact.id}`,
    },
  };
}

function isReadableDailyArtifact(artifact, expectedWindow) {
  if (!artifact?.briefing || artifact.cadence !== "daily") return false;
  if (artifact.evidenceWindow?.id !== expectedWindow?.id) return false;
  const invalid = new Set(["failed", "in_progress", "invalid", "retired", "superseded"]);
  return ![
    artifact.status,
    artifact.lifecycle?.status,
    artifact.lifecycle?.generationStatus,
  ].filter(Boolean).map((value) => String(value).toLowerCase()).some((value) => invalid.has(value));
}

export function mapHomeHero({ activeGoal, evaluation } = {}) {
  const terminal = evaluation?.lifecycleState && evaluation.lifecycleState !== "active";
  if (terminal) {
    const awaitingVisual = evaluation.lifecycleState === "awaiting_confirmation";
    return {
      confidence: evaluation?.goalConfidence?.value ?? null,
      goalLabel: activeGoal?.title ?? evaluation?.title ?? "Current Goal",
      headline: awaitingVisual ? "Looks complete. Confirm it visually." : "Goal achieved.",
      supportLine: awaitingVisual
        ? "Your DEXA shows the body-composition threshold is reached. A relaxed photo set is the final check before closing this goal."
        : evaluation.summary,
      mode: "terminal",
      actionLabel: evaluation.actionLabel ?? "Review goal",
      actionHref: evaluation.actionHref ?? getGoalHref(evaluation.goalId),
    };
  }
  const stage = evaluation?.projection?.currentCompletionStage;
  const projection = evaluation?.projection ?? null;
  const confirmationPending = !projection && /visual confirmation/i.test(evaluation?.metadata?.projectionUnavailableReason ?? "");
  const isVisibleAbs = activeGoal?.id === "goal_visible_abs_at_rest" || evaluation?.metricKey === "visualDefinition";
  const headline = confirmationPending
    ? "Awaiting confirmation."
    : stage === "goal_visually_confirmed"
    ? "Goal achieved."
    : stage === "visual_confirmation_developing"
      ? "Final stretch."
      : stage === "progressing_toward_numerical_target"
        ? "On track."
        : "Progress update.";

  return {
    confidence: evaluation?.goalConfidence?.value ?? null,
    daysRemaining: projection?.daysRemaining ?? (confirmationPending ? "Not time-based" : "Unavailable"),
    goalLabel: isVisibleAbs ? "Visible Abs at Rest" : activeGoal?.title ?? evaluation?.title ?? "Current Goal",
    headline,
    projectedFinish: projection?.projectedFinish ?? (confirmationPending ? "Visual confirmation" : "Unavailable"),
    projectionId: projection?.id ?? null,
    supportLine: confirmationPending
      ? evaluation.metadata.projectionUnavailableReason
      : stage === "goal_visually_confirmed"
      ? "Your progress is confirmed."
      : stage === "visual_confirmation_developing"
        ? "You're close—keep executing the plan."
        : evaluation
          ? "Keep executing the plan."
          : "More evidence is needed to update the outlook.",
    mode: "active",
  };
}

export const HomeBriefingService = createHomeBriefingService();

export function mapBriefingCard({
  dailyEvent,
  freshness,
  latestAnalysis,
  selection,
  dexaScans,
  progressPhotos,
  weightEntries,
  expectation,
  generationArtifact,
  historicalDailyBriefing,
}) {
  const hasBriefingEvidence =
    weightEntries.length > 0 || dexaScans.length > 0 || progressPhotos.length > 0;

  if (!hasBriefingEvidence) return null;

  if (selection.briefingType === "event") {
    const artifact = selection.artifact;
    const isPhoto = ["progress_photo", "photo_session"].includes(artifact.trigger?.evidenceType);
    return {
      id: artifact.id,
      sectionLabel: "Event Briefing",
      title: isPhoto ? "Progress Photo Analysis Ready" : "DEXA Analysis Ready",
      summary: artifact.briefing?.dexaEventNarrative?.hero?.body ?? artifact.briefing?.hero?.summary ?? artifact.briefing?.photoEventNarrative?.hero?.body ?? null,
      createdAt: artifact.generatedAt,
      tone: "insight",
      prompt: "Open the latest coaching conversation.",
      href: selection.href,
      freshnessState: "event",
    };
  }

  if (selection.briefingType === "weekly") {
    const artifact = selection.artifact;
    return {
      id: artifact?.id ?? "weekly-briefing-unavailable",
      sectionLabel: "Weekly Briefing",
      title: artifact ? "Weekly Briefing Ready" : "Weekly Briefing Unavailable",
      summary: artifact?.briefing?.weeklyNarrative?.cards?.hero?.body ?? artifact?.briefing?.hero?.summary ?? null,
      createdAt: artifact?.generatedAt ?? null,
      tone: "insight",
      prompt: artifact ? "Review the completed week." : "No persisted Weekly Briefing is available yet.",
      href: selection.href,
      freshnessState: artifact ? "current" : "missing",
    };
  }

  if (selection.briefingType === "midweek") {
    const artifact = selection.artifact;
    return {
      id: artifact?.id ?? "midweek-briefing-unavailable",
      sectionLabel: "Midweek Briefing",
      title: artifact ? "Midweek Briefing Ready" : "Midweek Briefing Unavailable",
      summary: artifact?.briefing?.hero?.summary ?? null,
      createdAt: artifact?.generatedAt ?? null,
      tone: "insight",
      prompt: artifact ? "Review the week so far." : "No persisted Midweek Briefing is available yet.",
      href: selection.href,
      freshnessState: artifact ? "current" : "missing",
    };
  }

  if (selection.briefingType === "none") return null;

  return null;
}

function mapHeader(user) {
  if (!user) return placeholderHeader;

  return {
    greeting: getTimeAwareGreeting(),
    name: user.firstName || placeholderHeader.name,
    avatar: user.avatarUrl
      ? {
          alt: `${user.firstName || "Founder"} profile photo`,
          initials: user.firstName?.charAt(0) ?? "F",
          size: "md",
          src: user.avatarUrl,
        }
      : null,
  };
}

function mapNextBestAction({ actionPlan, briefingCard, user }) {
  if (!user) return placeholderNextBestAction;
  const nextPriority = actionPlan?.currentAction;

  if (nextPriority) {
    return {
      title: getActionTitle(nextPriority),
      href: nextPriority.icon === "camera" ? "/evidence/photos" : nextPriority.href,
      icon: nextPriority.icon,
    };
  }

  return {
    title: briefingCard ? `Open ${briefingCard.sectionLabel}` : "View Briefing History",
    href: briefingCard?.href ?? "/briefings/review",
    icon: "analysis",
  };
}

function getActionTitle(priority) {
  const actionTitles = {
    "Front Progress Photos": "Upload Front Photos",
    "Rear Progress Photos": "Upload Rear Photos",
    "Front Progress Photo": "Upload Front Photo",
    "Rear Progress Photo": "Upload Rear Photo",
    "Weekly Progress Photo Set": "Upload Progress Photo Set",
    "Morning Check-in": "Complete Morning Check-in",
    "Afternoon Check-in": "Complete Afternoon Check-in",
    "Evening Check-in": "Complete Evening Check-in",
    Retatrutide: "Retatrutide Tonight",
    Tesamorelin: "Tesamorelin Tonight",
    "Foam Roll": "Foam Roll",
    "Morning Weight": "Log Morning Weight",
    "Open Daily Briefing": "Open Daily Briefing",
    "Today's Protocol Complete": "Today's Protocol Complete",
  };

  return actionTitles[priority.label] ?? priority.label;
}

function getTimeAwareGreeting(now = new Date()) {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) return "Good morning,";
  if (hour >= 12 && hour < 17) return "Good afternoon,";
  return "Good evening,";
}

function mapGoal(goal) {
  return {
    id: goal.id,
    title: goal.title,
    current: goal.current ?? "Pending",
    target: goal.target ?? "Pending",
    unit: goal.unit ?? "",
    progress: goal.progress ?? 0,
    primary: Boolean(goal.primary),
    icon: goal.icon ?? "target",
    color: goal.color ?? (goal.primary ? "primary" : "success"),
    progressColor: goal.progressColor ?? (goal.primary ? "#3BC35B" : "#4F46E5"),
    presentation: goal.presentation ?? {
      mode: goal.primary ? "primary_goal" : "supporting_objective",
    },
    lifecycleState: goal.lifecycleState,
    href: getGoalHref(goal.id),
  };
}

function getGoalHref(goalId) {
  if (goalId === "goal_visible_abs_at_rest") return "/goals/visible-abs";
  if (goalId === "goal_maintain_8_9_body_fat") return "/goals/maintenance";
  if (goalId === "goal_preserve_lean_mass") return "/goals/lean-mass";

  return undefined;
}
