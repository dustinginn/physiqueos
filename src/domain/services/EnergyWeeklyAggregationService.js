export function aggregateEnergyWeeks({
  days = [],
  endDate = null,
  startDate = null,
} = {}) {
  const buckets = new Map();

  days.forEach((day) => {
    const weekStart = getCanonicalWeekStart(day.date);
    const values = buckets.get(weekStart) ?? [];
    values.push(day);
    buckets.set(weekStart, values);
  });

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, values]) => {
      const weekEnd = addDays(weekStart, 6);
      const intake = values.filter((day) => day.calorieIntake != null);
      const expenditure = values.filter(
        (day) => day.estimatedExpenditure != null
      );
      const complete = values.filter((day) => day.energyBalance != null);
      const effectiveStart =
        startDate && startDate > weekStart ? startDate : weekStart;
      const effectiveEnd = endDate && endDate < weekEnd ? endDate : weekEnd;
      const expectedDays =
        effectiveStart <= effectiveEnd
          ? differenceInDays(effectiveStart, effectiveEnd) + 1
          : 0;

      return Object.freeze({
        id: `energy-week-${weekStart}`,
        weekStart,
        weekEnd,
        averageIntake: average(intake.map((day) => day.calorieIntake)),
        intakeDayCount: intake.length,
        averageExpenditure: average(
          expenditure.map((day) => day.estimatedExpenditure)
        ),
        expenditureDayCount: expenditure.length,
        averageBalance: average(complete.map((day) => day.energyBalance)),
        completeDayCount: complete.length,
        evidenceDayCount: values.length,
        expectedDayCount: expectedDays,
        partial: values.length < expectedDays || complete.length < expectedDays,
      });
    });
}

export function getCanonicalWeekStart(value) {
  const date = createLocalDate(value);
  date.setDate(date.getDate() - date.getDay());
  return toDateKey(date);
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function addDays(value, amount) {
  const date = createLocalDate(value);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function differenceInDays(start, end) {
  return Math.round((createLocalDate(end) - createLocalDate(start)) / 86400000);
}

function createLocalDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
