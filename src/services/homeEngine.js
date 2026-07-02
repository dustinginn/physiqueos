export function getHomeCards(user) {
  const cards = [];

  if (!user.today.weightLogged) {
    cards.push({
      id: "weight",
      title: "Morning Weight",
      description:
        "Logging today's weight unlocks today's prediction.",
      action: "Log Weight",
    });
  }

  if (user.tracking.calories === "manual") {
    cards.push({
      id: "calories",
      title: "Calories",
      description:
        "Did you stay within yesterday's calorie goal?",
      action: "Log Calories",
    });
  }

  if (user.tracking.activity === "manual") {
    cards.push({
      id: "activity",
      title: "Activity",
      description:
        "Did you reach your activity goal yesterday?",
      action: "Log Activity",
    });
  }

  if (user.tracking.sleep === "manual") {
    cards.push({
      id: "sleep",
      title: "Sleep",
      description:
        "How well did you sleep last night?",
      action: "Log Sleep",
    });
  }

  return cards;
}