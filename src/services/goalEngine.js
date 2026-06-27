export function getDailyChecklist(user) {
  switch (user.goal.type) {

    case "fatLoss":
      return [
        {
          id: "weight",
          label: "Morning Weight",
          completed: user.today.weightLogged,
        },
        {
          id: "calorieDeficit",
          label: "Caloric Deficit",
          completed: user.today.calorieGoalMet,
        },
        {
          id: "activeCalories",
          label: "Active Calories Burned",
          completed: user.today.activeCaloriesMet,
        },
        {
          id: "sleep",
          label: "Sleep Goal",
          completed: user.today.sleepGoalMet,
        },
      ];

    case "muscleGain":
      return [
        {
          id: "weight",
          label: "Morning Weight",
          completed: user.today.weightLogged,
        },
        {
          id: "protein",
          label: "Protein Goal",
          completed: user.today.proteinGoalMet,
        },
        {
          id: "workout",
          label: "Workout Completed",
          completed: user.today.workoutCompleted,
        },
        {
          id: "sleep",
          label: "Sleep Goal",
          completed: user.today.sleepGoalMet,
        },
      ];

    default:
      return [];
  }
}