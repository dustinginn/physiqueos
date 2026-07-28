const DAY_MS = 86_400_000;

export function resolveProtocolOccurrence({
  recurrence,
  evaluationTimestamp = new Date(),
  lastQualifyingCompletion = null,
} = {}) {
  if (!recurrence?.anchorDate || recurrence.frequency !== "weekly") {
    return unresolved("A canonical weekly anchor is required.");
  }
  const evaluationDate = localDateKey(evaluationTimestamp, recurrence.timezone);
  const scheduledDates = occurrencesAround(recurrence, evaluationDate);
  const current = scheduledDates.find((date) => date === evaluationDate) ?? null;
  const prior = [...scheduledDates].filter((date) => date < evaluationDate).at(-1) ?? null;
  const next = scheduledDates.find((date) => date > evaluationDate) ?? null;
  const scheduled = current ?? prior;
  const completed = scheduled && completionMatches(lastQualifyingCompletion, scheduled);
  const onCycle = Boolean(current);
  return Object.freeze({
    occurrenceId: scheduled ? occurrenceId(recurrence, scheduled) : null,
    scheduledLocalDate: scheduled,
    scheduledDaypart: recurrence.timeOfDay,
    priorOccurrence: prior ? occurrence(recurrence, prior) : null,
    currentOccurrence: current ? occurrence(recurrence, current) : null,
    nextOccurrence: next ? occurrence(recurrence, next) : null,
    dueState: completed ? "completed" : onCycle ? "due" : prior ? "not_due" : "upcoming",
    onCycle,
    offWeek: weekday(evaluationDate) === recurrence.weekdays[0] && !onCycle,
    completionEligible: onCycle && !completed,
    completionWindow: current ? { startDate: current, endDate: current } : null,
    limitations: [],
  });
}

export function isProtocolDateOnCycle(recurrence, localDate) {
  if (recurrence.frequency !== "weekly" || !recurrence.anchorDate) return false;
  if (!recurrence.weekdays.includes(weekday(localDate))) return false;
  const weeks = Math.floor(
    (dateNumber(localDate) - dateNumber(recurrence.anchorDate)) / (7 * DAY_MS),
  );
  return weeks >= 0 && weeks % recurrence.interval === 0;
}

export function getNextProtocolOccurrence(recurrence, afterLocalDate) {
  for (let offset = 1; offset <= recurrence.interval * 7 + 7; offset += 1) {
    const candidate = addDays(afterLocalDate, offset);
    if (isProtocolDateOnCycle(recurrence, candidate)) return occurrence(recurrence, candidate);
  }
  return null;
}

export function formatNextProtocolOccurrence(next, locale = "en-US") {
  if (!next) return null;
  const date = new Date(`${next.scheduledLocalDate}T12:00:00Z`);
  const friendly = new Intl.DateTimeFormat(locale, {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  }).format(date);
  const daypart = next.scheduledDaypart
    ? next.scheduledDaypart[0].toUpperCase() + next.scheduledDaypart.slice(1)
    : null;
  return `Next: ${friendly}${daypart ? ` · ${daypart}` : ""}`;
}

function occurrencesAround(recurrence, evaluationDate) {
  const values = [];
  for (let offset = -recurrence.interval * 14; offset <= recurrence.interval * 14; offset += 1) {
    const candidate = addDays(evaluationDate, offset);
    if (isProtocolDateOnCycle(recurrence, candidate)) values.push(candidate);
  }
  return [...new Set(values)].sort();
}
function occurrence(recurrence, date) {
  return Object.freeze({
    id: occurrenceId(recurrence, date),
    scheduledLocalDate: date,
    scheduledDaypart: recurrence.timeOfDay,
    timezone: recurrence.timezone,
  });
}
function occurrenceId(recurrence, date) {
  return `protocol_occurrence|${recurrence.anchorDate}|${recurrence.interval}|${date}`;
}
function completionMatches(completion, scheduledDate) {
  const date = String(completion?.evidenceDate ?? completion?.date ?? completion ?? "").slice(0, 10);
  return date === scheduledDate;
}
function localDateKey(value, timezone) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((item) => item.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function weekday(date) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date(`${date}T12:00:00Z`).getUTCDay()];
}
function dateNumber(date) {
  return Date.parse(`${date}T00:00:00Z`);
}
function addDays(date, count) {
  return new Date(dateNumber(date) + count * DAY_MS).toISOString().slice(0, 10);
}
function unresolved(message) {
  return Object.freeze({
    occurrenceId: null, scheduledLocalDate: null, priorOccurrence: null,
    currentOccurrence: null, nextOccurrence: null, dueState: "unresolved",
    onCycle: false, offWeek: false, completionEligible: false,
    completionWindow: null, limitations: [message],
  });
}
