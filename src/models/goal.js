export const GoalType = {
  QUANTIFIABLE: "quantifiable",
  HABIT: "habit",
  STREAK: "streak",
  MILESTONE: "milestone",
};

export const GoalStatus = {
  ON_TRACK: "On Track",
  AHEAD: "Ahead",
  PLATEAU: "Plateau",
  OFF_TRACK: "Off Track",
  COMPLETED: "Completed",
};

export function createGoal(data = {}) {
  return {
    id: Date.now().toString(),

    title: "",

    primary: false,

    type: GoalType.QUANTIFIABLE,

    measurable: true,

    startValue: 0,

    currentValue: 0,

    targetValue: 0,

    unit: "",

    projectedCompletion: "",

    confidence: 0,

    trend: "Improving",

    velocity: null,

    status: GoalStatus.ON_TRACK,

    nextAction: "",

    supportingMetrics: [],

    ...data,
  };
}