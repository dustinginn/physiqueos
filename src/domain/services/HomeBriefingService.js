import { bottomNavigation } from "../../fixtures/bottomNavigation";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { ActionEngineService } from "./ActionEngineService";
import { DailyFocusService } from "./DailyFocusService";
import { getDailyEvent } from "./DailyEventService";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";

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
            await repositories.analyses.getLatestAnalysis(),
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
  latestAnalysis,
  dexaScans,
  progressPhotos,
  weightEntries,
}) {
  const hasBriefingEvidence =
    weightEntries.length > 0 || dexaScans.length > 0 || progressPhotos.length > 0;

  if (!hasBriefingEvidence) return null;

  return {
    id: latestAnalysis?.id ?? "daily-briefing",
    sectionLabel: "Daily Briefing",
    title: "Daily Briefing Ready",
    summary: latestAnalysis?.summary ?? null,
    createdAt: latestAnalysis?.createdAt ?? null,
    tone: latestAnalysis?.tone ?? null,
    prompt: dailyEvent?.homeSubtitle ?? "See what changed.",
    href: "/briefing/daily",
  };
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
