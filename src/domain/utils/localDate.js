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

export function getPreviousLocalDayWindow({
  now = new Date(),
  timeZone = DEFAULT_LOCAL_TIME_ZONE,
} = {}) {
  const resolvedTimeZone = resolveLocalTimeZone(timeZone);
  const currentLocalDate = getLocalDateKey(now, resolvedTimeZone);
  const previousLocalDate = shiftDateKey(currentLocalDate, -1);

  return Object.freeze({
    timeZone: resolvedTimeZone,
    currentLocalDate,
    previousLocalDate,
    startInclusive: localMidnightToUtc(previousLocalDate, resolvedTimeZone).toISOString(),
    endExclusive: localMidnightToUtc(currentLocalDate, resolvedTimeZone).toISOString(),
  });
}

export function getLocalDayWindow({
  dateKey,
  timeZone = DEFAULT_LOCAL_TIME_ZONE,
} = {}) {
  const resolvedTimeZone = resolveLocalTimeZone(timeZone);
  const resolvedDateKey = getLocalDateKey(dateKey, resolvedTimeZone);
  if (!isValidDateKey(resolvedDateKey)) {
    throw new Error("A valid local calendar date is required.");
  }
  const nextDateKey = shiftLocalDateKey(resolvedDateKey, 1);
  return Object.freeze({
    dateKey: resolvedDateKey,
    timeZone: resolvedTimeZone,
    startInclusive: localMidnightToUtc(resolvedDateKey, resolvedTimeZone).toISOString(),
    endExclusive: localMidnightToUtc(nextDateKey, resolvedTimeZone).toISOString(),
  });
}

export function shiftLocalDateKey(dateKey, days) {
  if (!isValidDateKey(dateKey) || !Number.isInteger(days)) {
    throw new Error("A valid local date and whole-day offset are required.");
  }
  return shiftDateKey(dateKey, days);
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const canonical = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return canonical === value;
}

export function resolveLocalTimeZone(value) {
  const candidate = String(value ?? "").trim() || DEFAULT_LOCAL_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_LOCAL_TIME_ZONE;
  }
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

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localMidnightToUtc(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = desired;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .formatToParts(new Date(guess))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
      0
    );
    const adjustment = desired - represented;
    guess += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(guess);
}
