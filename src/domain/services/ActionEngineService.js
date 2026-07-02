export function createActionEngineService() {
  return {
    getActionPlan({ priorities = [], latestWeight = null, now = new Date() } = {}) {
      const outstanding = priorities.filter((priority) => !priority.completed);
      const currentAction = getCurrentAction({ latestWeight, now, outstanding });
      const remaining = outstanding.filter((priority) => priority.id !== currentAction?.id);

      return {
        currentAction,
        upcomingActions: remaining.filter((priority) => priority.state === "upcoming"),
        deferredActions: remaining.filter((priority) => priority.state !== "upcoming"),
        expiredActions: [],
      };
    },
  };
}

export const ActionEngineService = createActionEngineService();

function getCurrentAction({ latestWeight, now, outstanding }) {
  if (outstanding.length > 0) return outstanding[0];

  if (!latestWeight) {
    return {
      id: "verified-weight",
      label: "Morning Weight",
      href: "/check-in/morning",
      icon: "scale",
      color: "evidence",
    };
  }

  return getCompletionAction(now);
}

function getCompletionAction(now) {
  const hour = now.getHours();

  if (hour >= 20 || hour < 5) {
    return {
      id: "daily-complete",
      label: "Today's Protocol Complete",
      href: "/briefing/daily",
      icon: "check",
      color: "success",
    };
  }

  return {
    id: "daily-briefing",
    label: "Open Daily Briefing",
    href: "/briefing/daily",
    icon: "analysis",
    color: "primary",
  };
}
