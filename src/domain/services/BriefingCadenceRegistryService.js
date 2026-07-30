import {
  createMidweekEvidenceWindow,
  createMonthlyEvidenceWindow,
  createWeeklyEvidenceWindow,
} from "./BriefingEvidenceWindowService";
import { createCoachingUpdatesReadService } from "./CoachingUpdatesReadService";
import { getMidweekArtifactId } from "./MidweekBriefingService";
import { getMonthlyArtifactId } from "./MonthlyBriefingService";
import { artifactIdForWeeklyWindow } from "./WeeklyClosedWindowContract";

export const BRIEFING_CADENCE_REGISTRY_VERSION = "briefing_cadence_registry_v1";
export const BRIEFING_CADENCE_CATCH_UP_POLICY = Object.freeze({
  horizon: "local_cadence_day",
  missingArtifactGraceMinutes: 15,
  transientFailureLimit: 3,
  transientRetryCooldownMinutes: 15,
  generatorTimeoutMs: 15_000,
});

const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const DEFAULT_SCHEDULE = Object.freeze({
  midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
  weekly: { enabled: true, day: "sunday", localTime: "00:00" },
  monthly: { enabled: true, dayOfMonth: 1, localTime: "00:00" },
  notificationPreference: "available_without_notification",
});

export async function resolveBriefingCadenceRegistry({
  repositories,
  generators,
  userId = null,
  now = new Date(),
} = {}) {
  const user = userId
    ? await repositories.users.getUserById(userId)
    : await repositories.users.getCurrentUser();
  const resolvedUserId = user?.id ?? userId ?? null;
  const configured = resolvedUserId
    ? await createCoachingUpdatesReadService({ repositories })
      .getCurrent({ userId: resolvedUserId })
    : null;
  const schedule = configured ?? DEFAULT_SCHEDULE;
  const timeZone = schedule.timeZone ?? user?.timeZone ?? DEFAULT_TIME_ZONE;
  const local = localParts(now, timeZone);

  return [
    createEntry({
      cadence: "midweek",
      surface: schedule.midweek ?? DEFAULT_SCHEDULE.midweek,
      generator: generators?.midweek,
      repositories,
      userId: resolvedUserId,
      timeZone,
      local,
      now,
      windowBuilder: (options) => createMidweekEvidenceWindow({
        ...options,
        coachingUpdates: schedule,
      }),
      artifactBuilder: (window) => getMidweekArtifactId({
        userId: resolvedUserId,
        window,
      }),
    }),
    createEntry({
      cadence: "weekly",
      surface: schedule.weekly ?? DEFAULT_SCHEDULE.weekly,
      generator: generators?.weekly,
      repositories,
      userId: resolvedUserId,
      timeZone,
      local,
      now,
      windowBuilder: createWeeklyEvidenceWindow,
      artifactBuilder: (window) =>
        artifactIdForWeeklyWindow(window.startDate, window.endDate),
    }),
    createEntry({
      cadence: "monthly",
      surface: schedule.monthly ?? DEFAULT_SCHEDULE.monthly,
      generator: generators?.monthly,
      repositories,
      userId: resolvedUserId,
      timeZone,
      local,
      now,
      windowBuilder: createMonthlyEvidenceWindow,
      artifactBuilder: (window) => getMonthlyArtifactId({
        userId: resolvedUserId,
        window,
      }),
      includeExpectedWindowWhenIneligible: true,
    }),
  ].map((entry) => Object.freeze({
    ...entry,
    registryVersion: BRIEFING_CADENCE_REGISTRY_VERSION,
    catchUpHorizon: BRIEFING_CADENCE_CATCH_UP_POLICY.horizon,
    notificationEnabled: false,
    artifactIdempotent: true,
  }));
}

function createEntry({
  cadence,
  surface,
  generator,
  repositories,
  userId,
  timeZone,
  local,
  now,
  windowBuilder,
  artifactBuilder,
  includeExpectedWindowWhenIneligible = false,
}) {
  const enabled = surface?.enabled === true;
  const validLocalWeekdays = surface?.day ? [surface.day.toLowerCase()] : [];
  const validLocalDayOfMonth = Number.isInteger(surface?.dayOfMonth)
    ? surface.dayOfMonth
    : null;
  const localEligibleTime = surface?.localTime ?? "00:00";
  const correctLocalDay = validLocalDayOfMonth
    ? local.day === validLocalDayOfMonth
    : validLocalWeekdays.includes(local.weekday);
  const eligible = Boolean(
    userId &&
    enabled &&
    correctLocalDay &&
    local.time >= localEligibleTime
  );
  const evidenceWindow = eligible || includeExpectedWindowWhenIneligible
    ? windowBuilder({ now, timeZone })
    : null;
  return {
    cadence,
    enabled,
    localEligibleTime,
    validLocalWeekdays,
    timeZone,
    userId,
    localDate: local.date,
    localTime: local.time,
    eligible,
    eligibilityReason: !userId
      ? "user_not_found"
      : !enabled
        ? "cadence_disabled"
        : !correctLocalDay
          ? validLocalDayOfMonth
            ? "wrong_local_month_day"
            : "wrong_local_weekday"
          : local.time < localEligibleTime
            ? "before_local_eligible_time"
            : "eligible",
    evidenceWindow,
    expectedArtifactId: evidenceWindow ? artifactBuilder(evidenceWindow) : null,
    eligibleAt: eligible
      ? `${local.date}T${localEligibleTime}:00[${timeZone}]`
      : null,
    nextEligibility: nextEligibility({
      localDate: local.date,
      localTime: local.time,
      localWeekday: local.weekday,
      day: surface?.day,
      dayOfMonth: validLocalDayOfMonth,
      time: localEligibleTime,
    }),
    generator,
    async findExpectedArtifact() {
      if (!userId || !evidenceWindow) return null;
      return repositories.dailyBriefings
        .getBriefingByEvidenceWindow(userId, evidenceWindow.id);
    },
  };
}

function nextEligibility({
  localDate,
  localTime,
  localWeekday,
  day,
  dayOfMonth,
  time,
}) {
  if (dayOfMonth) {
    const currentMonth = localDate.slice(0, 7);
    const useCurrentMonth =
      Number(localDate.slice(-2)) < dayOfMonth ||
      (Number(localDate.slice(-2)) === dayOfMonth && localTime < time);
    const date = new Date(`${currentMonth}-01T12:00:00Z`);
    if (!useCurrentMonth) date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(dayOfMonth);
    return {
      localDate: date.toISOString().slice(0, 10),
      localTime: time,
    };
  }
  if (!day) return null;
  const weekdays = [
    "sunday", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday",
  ];
  let offset =
    (weekdays.indexOf(day.toLowerCase()) - weekdays.indexOf(localWeekday) + 7) % 7;
  if (offset === 0 && localTime >= time) offset = 7;
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return {
    localDate: date.toISOString().slice(0, 10),
    localTime: time,
  };
}

function localParts(value, timeZone) {
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
    day: Number(parts.day),
    weekday: parts.weekday.toLowerCase(),
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}
