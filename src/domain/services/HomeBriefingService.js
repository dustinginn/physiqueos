import { bottomNavigation } from "../../fixtures/bottomNavigation";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { ActionEngineService } from "./ActionEngineService";
import { DailyFocusService } from "./DailyFocusService";
import { getDailyBriefingFreshness } from "./DailyBriefingFreshnessService";
import { getDailyEvent } from "./DailyEventService";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";
import { formatLocalShortDate } from "../utils/localDate";

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
        latestEventBriefing,
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
            repositories.dailyBriefings?.getLatestBriefingArtifact?.(resolvedUserId) ?? repositories.dailyBriefings?.getLatestDailyBriefing?.(resolvedUserId) ?? null,
            repositories.dailyBriefings?.getLatestActiveEventBriefing?.(resolvedUserId) ?? null,
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
          ];
      const goalEvaluations = GoalEvaluationService.getGoalEvaluations({
        goals,
        dexaScans,
        weightEntries,
        progressPhotos,
        protocols: activeProtocols,
        nutritionContext,
      });
      const goalIntelligence = GoalIntelligenceService.getGoalIntelligence({
        evaluations: goalEvaluations,
        activeGoal,
      });
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
        dailyBriefing: latestDailyBriefing,
        dexaScans,
        nutritionContext,
        progressPhotos,
        weightEntries,
      });

      return {
        header: mapHeader(user),
        trajectory: goalIntelligence.trajectory,
        nextBestAction: mapNextBestAction({ actionPlan, user }),
        actionPlan,
        goals: goalIntelligence.goals.map(mapGoal),
        todaysFocus,
        bottomNavigation: navigation,
        latestAnalysis: mapDailyBriefingCard({
          dailyEvent,
          freshness: briefingFreshness,
          latestDailyBriefing,
          latestEventBriefing,
          latestAnalysis,
          dexaScans,
          progressPhotos,
          weightEntries,
        }),
        ...viewData,
      };
    },
  };
}

export const HomeBriefingService = createHomeBriefingService();

function mapDailyBriefingCard({
  dailyEvent,
  freshness,
  latestDailyBriefing,
  latestEventBriefing,
  latestAnalysis,
  dexaScans,
  progressPhotos,
  weightEntries,
}) {
  const hasBriefingEvidence =
    weightEntries.length > 0 || dexaScans.length > 0 || progressPhotos.length > 0;

  if (!hasBriefingEvidence) return null;

  if (latestEventBriefing) {
    const isPhoto = latestEventBriefing.trigger?.evidenceType === "progress_photo";
    return {
      id: latestEventBriefing.id,
      sectionLabel: "Event Briefing",
      title: isPhoto ? "Progress Photo Analysis Ready" : "DEXA Analysis Ready",
      summary: latestEventBriefing.briefing?.hero?.summary ?? null,
      createdAt: latestEventBriefing.generatedAt,
      tone: "insight",
      prompt: "Open the latest coaching conversation.",
      href: "/briefing/daily",
      freshnessState: "event",
    };
  }

  if (freshness?.status === "stale") {
    return {
      id: latestDailyBriefing?.id ?? "daily-briefing-stale",
      sectionLabel: "Daily Briefing",
      title: "Generate Today's Briefing",
      summary: null,
      createdAt: freshness.latestEvidence?.occurredAt ?? null,
      tone: null,
      prompt: getStaleBriefingPrompt(freshness),
      href: "/briefing/daily",
      freshnessState: "stale",
    };
  }

  if (freshness?.status === "missing") {
    return {
      id: "daily-briefing-missing",
      sectionLabel: "Daily Briefing",
      title: "Generate Today's Briefing",
      summary: null,
      createdAt: freshness.latestEvidence?.occurredAt ?? null,
      tone: null,
      prompt: "New evidence is ready to synthesize.",
      href: "/briefing/daily",
      freshnessState: "missing",
    };
  }

  return {
    id: latestDailyBriefing?.id ?? latestAnalysis?.id ?? "daily-briefing",
    sectionLabel: "Daily Briefing",
    title: "Daily Briefing Ready",
    summary: latestAnalysis?.summary ?? null,
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

function mapNextBestAction({ actionPlan, user }) {
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
    title: "Open Daily Briefing",
    href: "/briefing/daily",
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
