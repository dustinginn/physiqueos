import { localDateTimeToUtc } from "./IntelligenceLifecycleIdentityService";

// One authority for WHEN recurring (Midweek / Weekly / Monthly) briefings are
// generated. Generation time and evidence cutoff are deliberately separate:
//
// - Generation time: 03:00 in the briefing timezone, on the cadence's own
//   local date. The buffer past midnight lets the whole preceding local day
//   finish and lets late manual uploads and device (HealthKit) delivery
//   canonicalize before the briefing reads the canonical store.
// - Evidence cutoff: still the end of the last completed local evidence day
//   (see BriefingEvidenceWindowService). Eligibility is by the evidence's own
//   observed/effective local date, never by when it was ingested, so prior-day
//   evidence that lands inside the buffer participates and new-day evidence
//   that lands inside the buffer does not.
//
// Evidence that arrives after generation follows the existing late-evidence
// reconciliation contract (changedAt versus the artifact's generatedAt).
//
// Event briefings (DEXA, Photo) are triggered by the evidence itself and are
// not scheduled; nothing here applies to them.
export const BRIEFING_SCHEDULE_AUTHORITY_VERSION =
  "briefing_schedule_authority_v1";
export const BRIEFING_GENERATION_LOCAL_TIME = "03:00";
export const BRIEFING_DEFAULT_TIME_ZONE = "America/Los_Angeles";

const WEEKDAYS = Object.freeze([
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);
const MINUTE_MS = 60_000;

// The briefing timezone: the configured Coaching Updates timezone, then the
// user's profile timezone, then the product default. Never the server's.
export function resolveBriefingTimeZone({
  coachingUpdates = null,
  user = null,
} = {}) {
  return coachingUpdates?.timeZone ?? user?.timeZone ?? user?.timezone ??
    BRIEFING_DEFAULT_TIME_ZONE;
}

// `localTime` is a zero-padded 24-hour "HH:MM" already expressed in the
// briefing timezone.
export function hasReachedBriefingGenerationTime(localTime) {
  return String(localTime ?? "") >= BRIEFING_GENERATION_LOCAL_TIME;
}

// The exact instant generation becomes due on a local date: the first instant
// at or after 03:00 local. On a spring-forward day 03:00 exists (the skipped
// hour is 02:00-02:59); on a fall-back day 03:00 occurs once (the repeated
// hour is 01:00-01:59). Zones whose gap swallows 03:00 resolve to the end of
// the gap.
export function resolveBriefingDueInstant({ localDate, timeZone } = {}) {
  const nominal = localDateTimeToUtc({
    date: localDate,
    time: `${BRIEFING_GENERATION_LOCAL_TIME}:00`,
    timeZone,
  });
  const start = nominal.valueOf() - 3 * 60 * MINUTE_MS;
  for (let offset = 0; offset <= 6 * 60; offset += 1) {
    const candidate = new Date(start + offset * MINUTE_MS);
    const local = localClock(candidate, timeZone);
    if (local.date === localDate && local.time >= BRIEFING_GENERATION_LOCAL_TIME) {
      return candidate;
    }
  }
  return nominal;
}

// Next due instants at or after `now`, for the configured cadences. A cadence
// whose local date is today but whose due instant has passed rolls forward a
// full period, matching the registry's `nextEligibility`.
export function resolveNextBriefingDueTimes({
  now = new Date(),
  timeZone = BRIEFING_DEFAULT_TIME_ZONE,
  coachingUpdates = null,
} = {}) {
  const local = localClock(now, timeZone);
  const schedule = coachingUpdates ?? {
    midweek: { enabled: true, day: "wednesday" },
    weekly: { enabled: true, day: "sunday" },
    monthly: { enabled: true, dayOfMonth: 1 },
  };
  const resolve = (localDate) => Object.freeze({
    localDate,
    localTime: BRIEFING_GENERATION_LOCAL_TIME,
    timeZone,
    dueAt: resolveBriefingDueInstant({ localDate, timeZone }).toISOString(),
  });
  const weekly = (surface) => {
    if (surface?.enabled !== true || !surface.day) return null;
    let localDate = shiftDate(local.date, (
      WEEKDAYS.indexOf(String(surface.day).toLowerCase()) -
      WEEKDAYS.indexOf(local.weekday) + 7
    ) % 7);
    if (resolveBriefingDueInstant({ localDate, timeZone }) <= now) {
      localDate = shiftDate(localDate, 7);
    }
    return resolve(localDate);
  };
  const monthly = (surface) => {
    if (surface?.enabled !== true || !Number.isInteger(surface.dayOfMonth)) {
      return null;
    }
    let month = local.date.slice(0, 7);
    let localDate = `${month}-${String(surface.dayOfMonth).padStart(2, "0")}`;
    if (resolveBriefingDueInstant({ localDate, timeZone }) <= now) {
      const following = new Date(`${month}-01T12:00:00Z`);
      following.setUTCMonth(following.getUTCMonth() + 1);
      month = following.toISOString().slice(0, 7);
      localDate = `${month}-${String(surface.dayOfMonth).padStart(2, "0")}`;
    }
    return resolve(localDate);
  };
  return Object.freeze({
    midweek: weekly(schedule.midweek),
    weekly: weekly(schedule.weekly),
    monthly: monthly(schedule.monthly),
  });
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localClock(value, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday.toLowerCase(),
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}
