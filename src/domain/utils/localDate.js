export const DEFAULT_LOCAL_TIME_ZONE = "America/Los_Angeles";

export function getLocalDateKey(value, timeZone = DEFAULT_LOCAL_TIME_ZONE) {
  const resolvedValue = arguments.length === 0 ? new Date() : value;
  if (!resolvedValue) return null;

  const text = String(resolvedValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = resolvedValue instanceof Date ? resolvedValue : new Date(resolvedValue);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10) || null;

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

export function formatLocalShortDate(value, timeZone = DEFAULT_LOCAL_TIME_ZONE) {
  const dateKey = getLocalDateKey(value, timeZone);
  if (!dateKey) return "Pending";

  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
