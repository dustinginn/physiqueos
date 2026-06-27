export const GoalTypes = {
  FAT_LOSS: "fat_loss",
  MUSCLE_GAIN: "muscle_gain",
  BODY_FAT: "body_fat",
  WEIGHT: "weight",
  PERFORMANCE: "performance",
};

export function createGoal() {
  return {
    id: "",

    title: "",

    type: GoalTypes.BODY_FAT,

    targetValue: null,

    currentValue: null,

    targetDate: null,

    createdAt: new Date(),

    status: "active",
  };
}