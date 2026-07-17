import { bottomNavigation } from "../../fixtures/bottomNavigation";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { ActionEngineService } from "./ActionEngineService";
import { DailyFocusService } from "./DailyFocusService";
import { getDailyBriefingFreshness } from "./DailyBriefingFreshnessService";
import { getDailyEvent } from "./DailyEventService";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";
import { formatLocalShortDate } from "../utils/localDate";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { resolveHomeBriefingSelection } from "./HomeBriefingRoutingService";
import { resolveScheduledBriefingExpectation } from "./BriefingEvidenceWindowService";

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
        nutritionContext,
        progressPhotos,
        latestAnalysis,
        analyses,
        latestDailyBriefing,
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
            repositories.reminders?.listActiveReminders(resolvedUserId) ?? [],
            repositories.nutritionContext?.getNutritionContext(resolvedUserId) ?? null,
            repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
            repositories.analyses.getLatestAnalysis(),
            repositories.analyses.listAnalyses?.() ?? [],
            repositories.dailyBriefings?.getLatestScheduledDailyBriefing?.(resolvedUserId) ?? repositories.dailyBriefings?.getLatestDailyBriefing?.(resolvedUserId) ?? null,
            repositories.dailyBriefings?.getLatestWeeklyBriefing?.(resolvedUserId) ?? null,
            repositories.dailyBriefings?.getLatestActiveEventBriefing?.(resolvedUserId) ?? null,
            repositories.canonicalEvidence?.listCanonicalEvidenceObjects(resolvedUserId) ?? [],
          ])
        : [
            [],
            null,
            null,
            [],
            [],
            [],
            null,
            [],
            [],
            null,
            await repositories.analyses.getLatestAnalysis(),
            await repositories.analyses.listAnalyses?.() ?? [],
            null,
            null,
            null,
            [],
          ];
      const trainingPerformance = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonicalEvidence });
      const expectation = resolveScheduledBriefingExpectation({
        now: now(),
        timeZone: user?.timeZone ?? "America/Los_Angeles",
      });
      const expectedDailyRecord = expectation.cadence === "daily" && resolvedUserId
        ? await repositories.dailyBriefings?.getBriefingByEvidenceWindow?.(resolvedUserId, expectation.windowId)
        : null;
      const currentDailyBriefing = expectedDailyRecord?.briefing ? expectedDailyRecord : null;
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
      const todaysFocus = DailyFocusService.getDailyFocus({
        checkIns,
        latestWeight,
        weightEntries,
        protocols: activeProtocols,
        progressPhotos,
        reminders,
      });
      const actionPlan = ActionEngineService.getActionPlan({
        latestWeight,
        priorities: todaysFocus,
      });
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
        expectedWindow: expectation.evidenceWindow,
      });
      const briefingSelection = resolveHomeBriefingSelection({
        dailyArtifact: currentDailyBriefing,
        eventArtifact: latestEventBriefing,
        now: now(),
        timeZone: user?.timeZone ?? "America/Los_Angeles",
        weeklyArtifact: latestWeeklyBriefing,
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

      return {
        header: mapHeader(user),
        hero: mapHomeHero({ activeGoal, evaluation: primaryEvaluation, weightEntries }),
        trajectory: goalIntelligence.trajectory,
        nextBestAction: mapNextBestAction({ actionPlan, briefingCard, user }),
        actionPlan,
        goals: goalIntelligence.goals.map(mapGoal),
        todaysFocus,
        bottomNavigation: navigation,
        latestAnalysis: briefingCard,
        ...viewData,
      };
    },
  };
}

export function mapHomeHero({ activeGoal, evaluation } = {}) {
  const stage = evaluation?.projection?.currentCompletionStage;
  const projection = evaluation?.projection ?? null;
  const isVisibleAbs = activeGoal?.id === "goal_visible_abs_at_rest" || evaluation?.metricKey === "visualDefinition";
  const headline = stage === "goal_visually_confirmed"
    ? "Goal achieved."
    : stage === "visual_confirmation_developing"
      ? "Final stretch."
      : stage === "progressing_toward_numerical_target"
        ? "On track."
        : "Progress update.";

  return {
    confidence: evaluation?.goalConfidence?.value ?? null,
    daysRemaining: projection?.daysRemaining ?? "Unavailable",
    goalLabel: isVisibleAbs ? "Visible Abs at Rest" : activeGoal?.title ?? evaluation?.title ?? "Current Goal",
    headline,
    projectedFinish: projection?.projectedFinish ?? "Unavailable",
    projectionId: projection?.id ?? null,
    supportLine: stage === "goal_visually_confirmed"
      ? "Your progress is confirmed."
      : stage === "visual_confirmation_developing"
        ? "You're close—keep executing the plan."
        : evaluation
          ? "Keep executing the plan."
          : "More evidence is needed to update the outlook.",
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

  const latestDailyBriefing = selection.artifact;

  if (!latestDailyBriefing && generationArtifact?.lifecycle?.generationStatus === "in_progress") {
    return {
      id: generationArtifact.id,
      sectionLabel: "Daily Briefing",
      title: "Preparing Daily Briefing",
      summary: null,
      createdAt: null,
      tone: null,
      prompt: `Synthesizing the completed ${formatLocalShortDate(expectation.evidenceThroughDate)} evidence window.`,
      href: null,
      freshnessState: "in_progress",
      actionKind: null,
    };
  }

  if (!latestDailyBriefing && generationArtifact?.lifecycle?.generationStatus === "failed") {
    return {
      id: generationArtifact.id,
      sectionLabel: "Daily Briefing",
      title: "Daily Briefing Needs a Retry",
      summary: null,
      createdAt: null,
      tone: null,
      prompt: generationArtifact.lifecycle.failureReason ?? "The briefing could not be prepared.",
      href: null,
      freshnessState: "failed",
      actionKind: "generate_daily",
      actionLabel: "Retry",
    };
  }

  if (!latestDailyBriefing && expectation?.dailyEligible) {
    return {
      id: expectation.artifactId,
      sectionLabel: "Daily Briefing",
      title: "Daily Briefing Ready to Prepare",
      summary: null,
      createdAt: null,
      tone: null,
      prompt: `Prepare today's coaching from the completed ${formatLocalShortDate(expectation.evidenceThroughDate)} evidence window.`,
      href: null,
      freshnessState: "eligible_missing",
      actionKind: "generate_daily",
      actionLabel: "Prepare Briefing",
      historicalFallback: historicalDailyBriefing ? {
        href: `/briefings/review/${historicalDailyBriefing.id}`,
        label: "View previous briefing",
      } : null,
    };
  }

  if (freshness?.status === "stale") {
    return {
      id: latestDailyBriefing?.id ?? "daily-briefing-stale",
      sectionLabel: "Daily Briefing",
      title: "Daily Briefing Needs an Update",
      summary: null,
      createdAt: latestDailyBriefing?.generatedAt ?? null,
      tone: null,
      prompt: getStaleBriefingPrompt(freshness),
      href: null,
      freshnessState: "stale",
      actionKind: "generate_daily",
      actionLabel: "Update Briefing",
    };
  }

  if (freshness?.status === "missing") {
    return {
      id: "daily-briefing-missing",
      sectionLabel: "Daily Briefing",
      title: "Daily Briefing Unavailable",
      summary: null,
      createdAt: null,
      tone: null,
      prompt: "No current Daily Briefing is available yet.",
      href: null,
      freshnessState: "missing",
    };
  }

  return {
    id: latestDailyBriefing?.id ?? latestAnalysis?.id ?? "daily-briefing",
    sectionLabel: "Daily Briefing",
    title: latestDailyBriefing?.briefing?.hero?.title ?? "Daily Briefing Ready",
    summary: latestDailyBriefing?.briefing?.hero?.summary ?? latestAnalysis?.summary ?? null,
    createdAt: latestDailyBriefing?.generatedAt ?? latestAnalysis?.createdAt ?? null,
    tone: latestAnalysis?.tone ?? null,
    prompt: freshness?.briefingDate
      ? `${dailyEvent?.homeSubtitle ?? "See what changed."} ${formatLocalShortDate(freshness.briefingDate)}`
      : dailyEvent?.homeSubtitle ?? "See what changed.",
    href: "/briefing/daily",
    freshnessState: "current",
  };
}

function getStaleBriefingPrompt(freshness) {
  const evidenceLabel = freshness?.latestEvidence?.label ?? "New evidence";
  const staleDate = freshness?.briefingDate
    ? formatLocalShortDate(freshness.briefingDate)
    : "the previous briefing";

  return `${evidenceLabel} arrived after ${staleDate}. Generate the latest coaching.`;
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
    title: briefingCard ? `Open ${briefingCard.sectionLabel}` : "Open Daily Briefing",
    href: briefingCard?.href ?? "/briefing/daily",
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
    href: getGoalHref(goal.id),
  };
}

function getGoalHref(goalId) {
  if (goalId === "goal_visible_abs_at_rest") return "/goals/visible-abs";
  if (goalId === "goal_maintain_8_9_body_fat") return "/goals/maintenance";
  if (goalId === "goal_preserve_lean_mass") return "/goals/lean-mass";

  return undefined;
}
