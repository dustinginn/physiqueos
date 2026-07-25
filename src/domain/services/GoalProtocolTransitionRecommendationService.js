export function recommendProtocolTransition({ goal, review, supportingObjectives = [], briefingCadence }) {
  const priorities = supportingObjectives.filter((item) => item.accepted).map((item) => item.title);
  const category = review.category ?? review.protocolType;
  const recommendations = {
    energy: ["update", "The previous approach sustained a deficit. Your next goal begins by learning maintenance with flexible intake and activity."],
    nutrition: ["update", "Protein still matters, while calories, carbohydrates, and fats now need to support stronger training and calibration."],
    training: priorities.length
      ? ["update", `Keep the current structure and add focused work for ${formatList(priorities)}.`]
      : ["keep", "Your current training structure can carry forward because no additional muscle-group emphasis was selected."],
    activity: ["update", "Activity should support health, conditioning, recovery, and calibration instead of acting as a rigid daily target."],
    recovery: ["keep", "The current recovery approach remains useful unless new evidence supports a change."],
    weight: ["keep", "Continue daily collection while judging progress through weekly trends."],
    photos: ["update", "A less frequent photo cadence is usually enough to assess shape and proportion during lean-mass progress."],
    dexa: ["keep", "DEXA remains the clearest body-composition measure for this goal."],
    briefings: ["update", `${cadenceLabel(briefingCadence)} coaching matches the rhythm selected for the new goal while daily evidence collection continues.`],
  };
  const [disposition, reason] = recommendations[category] ?? ["keep", `${review.displayName ?? "This protocol"} can carry forward unless you choose a different approach.`];
  return { disposition, reason, goalTitle: goal?.title ?? "your new goal" };
}

function cadenceLabel(cadence = {}) {
  return cadence.type === "twice_weekly" ? "Twice-weekly" : String(cadence.type ?? "Regular").replaceAll("_", " ");
}

function formatList(values) {
  if (values.length < 2) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}
