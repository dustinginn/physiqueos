export const userProfile = {
  profile: {
    firstName: "Dustin",
  },

  goal: {
    type: "fatLoss",
    targetBodyFat: 10,
  },

  body: {
    weight: 171.5,
    bodyFat: 12.4,
  },

  today: {
    weightLogged: false,
    calorieGoalMet: false,
    activeCaloriesMet: false,
    sleepGoalMet: false,
    proteinGoalMet: false,
    workoutCompleted: false,
  },

  tracking: {
    weight: "manual",
    calories: "manual",
    activity: "manual",
    sleep: "manual",
    bodyFat: "manual",
  },

  integrations: {
    appleHealth: false,
    oura: false,
    whoop: false,
    garmin: false,
    macroFactor: false,
    myFitnessPal: false,
    cronometer: false,
  },
};