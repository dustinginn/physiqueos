export const DEFAULT_LOCAL_TIME_ZONE = "America/Los_Angeles";

// Constructing an Intl.DateTimeFormat costs far more than formatting with one,
// and these helpers run per record on every read (a Home read made thousands of
// calls). Formatters are immutable and their output depends only on the fixed
// options below plus the time zone, so one instance per zone is equivalent.
// A zone that fails to construct is never cached, so it keeps throwing exactly
// as before. Maps are bounded so arbitrary zone strings cannot grow memory.
const MAX_CACHED_TIME_ZONES = 64;
const DATE_KEY_FORMATTERS = new Map();
const DATE_TIME_FORMATTERS = new Map();
const RESOLVED_TIME_ZONES = new Map();

const SHORT_MONTH_DAY_FORMATTERS = new Map();

// Identical to date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
// (which builds a new formatter per call) — including "Invalid Date" for an
// invalid date. Keyed by the host zone because that is the zone
// toLocaleDateString uses; Node re-reads TZ when process.env.TZ changes.
export function formatShortMonthDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return new Date(Number.NaN).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const hostZone = String(globalThis.process?.env?.TZ ?? "");
  let formatter = SHORT_MONTH_DAY_FORMATTERS.get(hostZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    remember(SHORT_MONTH_DAY_FORMATTERS, hostZone, formatter);
  }
  return formatter.format(date);
}

function cachedFormatter(cache, timeZone, options) {
  const key = String(timeZone);
  const cached = cache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", options);
  remember(cache, key, formatter);
  return formatter;
}

function remember(cache, key, value) {
  if (cache.size >= MAX_CACHED_TIME_ZONES) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

export function getLocalDateKey(value, timeZone = DEFAULT_LOCAL_TIME_ZONE) {
  const resolvedValue = arguments.length === 0 ? new Date() : value;
  if (!resolvedValue) return null;

  const text = String(resolvedValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = resolvedValue instanceof Date ? resolvedValue : new Date(resolvedValue);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10) || null;

  const parts = cachedFormatter(DATE_KEY_FORMATTERS, timeZone, {
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
  const known = RESOLVED_TIME_ZONES.get(candidate);
  if (known) return known;

  let resolved;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    resolved = candidate;
  } catch {
    resolved = DEFAULT_LOCAL_TIME_ZONE;
  }
  remember(RESOLVED_TIME_ZONES, candidate, resolved);
  return resolved;
}

// A client-requested IANA zone (e.g. the device's current zone for daily-driver
// "Today" reads), or null when absent/malformed/unknown so the caller falls back
// to its own canonical zone. Never persisted: it only selects which local
// calendar day a read or a write guard treats as "today".
export function resolveRequestedTimeZone(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate || candidate.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(candidate)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: candidate }).resolvedOptions().timeZone ? candidate : null;
  } catch {
    return null;
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
      cachedFormatter(DATE_TIME_FORMATTERS, timeZone, {
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
