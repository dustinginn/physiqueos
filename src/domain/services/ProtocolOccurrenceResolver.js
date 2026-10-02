const DAY_MS = 86_400_000;
const CYCLIC_FREQUENCIES = new Set(["weekly", "monthly"]);
const ORDINALS = Object.freeze({ first: 1, second: 2, third: 3, fourth: 4 });

export function resolveProtocolOccurrence({
  recurrence,
  evaluationTimestamp = new Date(),
  lastQualifyingCompletion = null,
} = {}) {
  if (!recurrence?.anchorDate || !CYCLIC_FREQUENCIES.has(recurrence.frequency)) {
    return unresolved("A canonical weekly or monthly anchor is required.");
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
  if (!recurrence.anchorDate) return false;
  if (recurrence.frequency === "monthly") {
    if (!matchesProtocolDayRule(recurrence, localDate)) return false;
    if (localDate < recurrence.anchorDate) return false;
    const months = monthIndex(localDate) - monthIndex(recurrence.anchorDate);
    return months >= 0 && months % recurrence.interval === 0;
  }
  if (recurrence.frequency !== "weekly") return false;
  if (!recurrence.weekdays.includes(weekday(localDate))) return false;
  const weeks = Math.floor(
    (dateNumber(localDate) - dateNumber(recurrence.anchorDate)) / (7 * DAY_MS),
  );
  return weeks >= 0 && weeks % recurrence.interval === 0;
}

/// The interval-free day rule: the weekday for a weekly recurrence, the
/// ordinal weekday of the month (first..fourth, or last) for a monthly one.
export function matchesProtocolDayRule(recurrence, localDate) {
  if (!recurrence.weekdays.includes(weekday(localDate))) return false;
  if (recurrence.frequency !== "monthly") return recurrence.frequency === "weekly";
  const day = Number(localDate.slice(8, 10));
  if (recurrence.weekOfMonth === "last") return day + 7 > daysInMonth(localDate);
  const ordinal = ORDINALS[recurrence.weekOfMonth];
  return Boolean(ordinal) && Math.ceil(day / 7) === ordinal;
}

export function getNextProtocolOccurrence(recurrence, afterLocalDate) {
  for (let offset = 1; offset <= searchWindowDays(recurrence); offset += 1) {
    const candidate = addDays(afterLocalDate, offset);
    if (isProtocolDateOnCycle(recurrence, candidate)) return occurrence(recurrence, candidate);
  }
  return null;
}

/// Whether a stored schedule is an anchored cycle (interval > 1, or any
/// monthly schedule) rather than a plain every-matching-weekday schedule.
export function requiresProtocolCycleEvaluation(schedule = {}) {
  const frequency = String(schedule?.frequency ?? schedule?.type ?? schedule?.cadence ?? "").toLowerCase();
  return Number(schedule?.interval ?? 1) > 1 || frequency === "monthly";
}

export function getProtocolOccurrenceOnOrAfter(recurrence, localDate) {
  return getNextProtocolOccurrence(recurrence, addDays(localDate, -1));
}

/// The anchor a cadence change starts from, so a change only affects the
/// future and the next occurrence is predictable:
/// 1. the previous schedule's current-or-next occurrence (today when today
///    is on cycle) is kept when it still satisfies the new day rule — an
///    interval change never moves or drops the upcoming occurrence;
/// 2. otherwise the new schedule starts on the first date strictly after
///    today that satisfies its day rule — a change never makes today newly
///    due (no immediate reminder) and never re-dates history.
export function resolveCadenceChangeAnchor(previous, next, todayLocalDate) {
  let kept = null;
  try {
    kept = previous && isProtocolDateOnCycle(previous, todayLocalDate)
      ? todayLocalDate
      : previous ? getNextProtocolOccurrence(previous, todayLocalDate)?.scheduledLocalDate ?? null
        : null;
  } catch {
    kept = null;
  }
  if (kept && matchesProtocolDayRule(next, kept)) return kept;
  for (let offset = 1; offset <= 62; offset += 1) {
    const candidate = addDays(todayLocalDate, offset);
    if (matchesProtocolDayRule(next, candidate)) return candidate;
  }
  return null;
}

export function protocolLocalDateKey(value, timezone) {
  return localDateKey(value, timezone);
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
  const span = searchWindowDays(recurrence) * 2;
  for (let offset = -span; offset <= span; offset += 1) {
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
  // Weekly ids are unchanged; monthly ids carry the unit so they can never
  // collide with a weekly occurrence sharing an anchor and interval.
  const unit = recurrence.frequency === "monthly" ? "month|" : "";
  return `protocol_occurrence|${unit}${recurrence.anchorDate}|${recurrence.interval}|${date}`;
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
function monthIndex(date) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}
function daysInMonth(date) {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
}
function searchWindowDays(recurrence) {
  return recurrence.frequency === "monthly"
    ? recurrence.interval * 31 + 62
    : recurrence.interval * 7 + 7;
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
