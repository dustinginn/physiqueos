export function getTodaysRecommendation(user) {
  // Highest priority: morning weigh-in
  if (!user.today.weightLogged) {
    return {
      type: "weight",
      title: "Reveal Today's Progress",
      description:
        "Log your morning weight to update today's prediction.",
      priority: "high",
    };
  }

  // Nutrition
  if (!user.today.caloriesLogged) {
    return {
      type: "nutrition",
      title: "Log Your Nutrition",
      description:
        "Even an estimated calorie intake improves your prediction accuracy.",
      priority: "medium",
    };
  }

  // Workout
  if (!user.today.workoutLogged) {
    return {
      type: "workout",
      title: "Complete Today's Workout",
      description:
        "Today's workout keeps you on pace toward your goal.",
      priority: "medium",
    };
  }

  return {
    type: "complete",
    title: "Excellent Work",
    description:
      "Everything for today is complete. Recovery is now your highest priority.",
    priority: "low",
  };
}