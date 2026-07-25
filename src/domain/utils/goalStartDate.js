export function formatGoalStartDate(
  value,
  { locale = "en-US", timeZone = "America/Los_Angeles" } = {},
) {
  const dateKey = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const instant = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    timeZone,
    year: "numeric",
  });
}
