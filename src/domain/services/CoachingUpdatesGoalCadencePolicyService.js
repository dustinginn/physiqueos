export function resolveCoachingUpdatesGoalCadencePolicy(goal) {
  if (goal?.coachingUpdatesPolicy) return structuredClone(goal.coachingUpdatesPolicy);
  if (goal?.type === "build_lean_mass") {
    return Object.freeze({
      midweekSupported: true,
      weeklySupported: true,
      dailyUserActivationPermitted: false,
      noRoutineSurfacePermitted: false,
    });
  }
  return Object.freeze({
    midweekSupported: true,
    weeklySupported: true,
    dailyUserActivationPermitted: false,
    noRoutineSurfacePermitted: false,
  });
}
