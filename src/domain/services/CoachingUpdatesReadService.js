import { scopeRepositoryReadService } from "../../application/read-models/RepositoryReadScope";

export const COACHING_UPDATES_SCHEMA_VERSION = "coaching_updates_schedule_v1";
export const COACHING_NOTIFICATION_PREFERENCES = Object.freeze([
  "notify_when_ready",
  "available_without_notification",
]);
export const WEEKDAYS = Object.freeze([
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);

const LEGACY_TIME = "00:00";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function createCoachingUpdatesReadService({ repositories }) {
  return scopeRepositoryReadService({ repositories, namespace: "coaching-updates", service: {
    async getCurrent({ protocolId = null, userId } = {}) {
      const [protocols, goal, user] = await Promise.all([
        repositories.protocols?.listActiveProtocols?.(userId) ??
          repositories.protocols?.listProtocols?.(userId) ?? [],
        repositories.goals?.getActiveGoal?.(userId) ?? null,
        repositories.users?.getUserById?.(userId) ??
          repositories.users?.getCurrentUser?.() ?? null,
      ]);
      const protocol = protocols.find((item) =>
        (protocolId ? item.id === protocolId : true) &&
        (item.protocolType ?? item.category) === "briefings");
      if (!protocol?.currentVersionId) return null;
      const version = await repositories.protocolVersions?.getCurrentVersion?.(protocol.id);
      if (!version || version.id !== protocol.currentVersionId) return null;
      return resolveCoachingUpdatesReadModel({
        protocol, version, goal, timeZone: user?.timeZone ?? DEFAULT_TIME_ZONE,
      });
    },
  }});
}

export function resolveCoachingUpdatesReadModel({
  protocol,
  version,
  goal = null,
  timeZone = DEFAULT_TIME_ZONE,
} = {}) {
  if (!protocol || !version || version.protocolId !== protocol.id) return null;
  const canonical = version.coachingUpdates;
  const configuration = canonical?.schemaVersion === COACHING_UPDATES_SCHEMA_VERSION
    ? normalizeCanonicalCoachingUpdates(canonical, timeZone)
    : mapLegacyCoachingUpdates({ protocol, version, timeZone });
  if (!configuration) return null;
  return Object.freeze({
    protocolId: protocol.id,
    versionId: version.id,
    goalId: goal?.id ?? version.goalLinks?.[0]?.goalId ?? protocol.currentGoalIds?.[0] ?? null,
    effectiveDate: String(version.effectiveAt).slice(0, 10),
    ...configuration,
  });
}

export function mapLegacyCoachingUpdates({ protocol, version, timeZone = DEFAULT_TIME_ZONE }) {
  const legacy = version.change?.reviewedChanges ?? protocol.effectiveStrategy;
  const days = (legacy?.days ?? []).map((day) => String(day).toLowerCase());
  if (!/twice weekly/i.test(legacy?.cadence ?? "") ||
      !days.includes("wednesday") || !days.includes("sunday")) return null;
  return {
    schemaVersion: COACHING_UPDATES_SCHEMA_VERSION,
    timeZone,
    midweek: { enabled: true, day: "wednesday", localTime: LEGACY_TIME },
    weekly: { enabled: true, day: "sunday", localTime: LEGACY_TIME },
    monthly: { enabled: true, dayOfMonth: 1, localTime: LEGACY_TIME },
    daily: { enabled: false },
    eventBriefings: { photo: true, dexa: true },
    notificationPreference: "available_without_notification",
    scheduleApplication: { status: "active", appliesTo: "future_eligible_runs" },
    compatibility: { source: "legacy_twice_weekly_v1", dailyEvidenceCollection: legacy.dailyEvidenceCollection === true },
  };
}

export function validateCoachingUpdatesConfiguration(configuration = {}) {
  if (!validSurface(configuration.midweek)) return "invalid_midweek_schedule";
  if (!validSurface(configuration.weekly)) return "invalid_weekly_schedule";
  if (!validMonthlySurface(configuration.monthly)) return "invalid_monthly_schedule";
  if (typeof configuration.daily?.enabled !== "boolean") return "daily_not_permitted";
  if (typeof configuration.eventBriefings?.photo !== "boolean" ||
      typeof configuration.eventBriefings?.dexa !== "boolean") {
    return "invalid_event_briefing_preference";
  }
  if (!COACHING_NOTIFICATION_PREFERENCES.includes(configuration.notificationPreference)) {
    return "invalid_notification_preference";
  }
  if (!configuration.timeZone || !validTimeZone(configuration.timeZone)) return "verification_failure";
  return null;
}

export function resolveEventBriefingPreferencesFromStore(store = {}) {
  const protocol = store.protocols?.find((item) =>
    item.status === "active" && (item.protocolType ?? item.category) === "briefings");
  const version = store.protocolVersions?.find((item) => item.id === protocol?.currentVersionId);
  const model = resolveCoachingUpdatesReadModel({ protocol, version });
  return Object.freeze({
    photo: model?.eventBriefings?.photo !== false,
    dexa: model?.eventBriefings?.dexa !== false,
  });
}

export function filterEligibleEventBriefingTypes(types = [], preferences = {}) {
  return types.filter((type) => type === "photo_session"
    ? preferences.photo !== false
    : ["dexa", "dexa_scan", "body_composition"].includes(type)
      ? preferences.dexa !== false
      : true);
}

function normalizeCanonicalCoachingUpdates(canonical, timeZone) {
  return {
    ...structuredClone(canonical),
    timeZone: canonical.timeZone ?? timeZone,
    monthly: structuredClone(canonical.monthly ?? {
      enabled: true, dayOfMonth: 1, localTime: LEGACY_TIME,
    }),
    daily: structuredClone(canonical.daily ?? { enabled: false }),
    eventBriefings: structuredClone(canonical.eventBriefings ?? {
      photo: true, dexa: true,
    }),
  };
}

export function resolveNextEligibleCoachingUpdates(configuration, {
  now = new Date(),
  timeZone = configuration?.timeZone ?? DEFAULT_TIME_ZONE,
} = {}) {
  if (!configuration) return null;
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
    .format(now).toLowerCase();
  return Object.freeze({
    midweek: nextSurface(configuration.midweek, localDate, weekday),
    weekly: nextSurface(configuration.weekly, localDate, weekday),
    dailyAvailable: configuration.daily?.enabled === true,
  });
}

function validSurface(surface) {
  return surface && typeof surface.enabled === "boolean" &&
    WEEKDAYS.includes(surface.day) && /^\d{2}:\d{2}$/.test(surface.localTime) &&
    Number(surface.localTime.slice(0, 2)) < 24 && Number(surface.localTime.slice(3)) < 60;
}
function validMonthlySurface(surface) {
  return surface && typeof surface.enabled === "boolean" &&
    surface.dayOfMonth === 1 && /^\d{2}:\d{2}$/.test(surface.localTime) &&
    Number(surface.localTime.slice(0, 2)) < 24 && Number(surface.localTime.slice(3)) < 60;
}
function nextSurface(surface, localDate, weekday) {
  if (!surface?.enabled) return null;
  const offset = (WEEKDAYS.indexOf(surface.day) - WEEKDAYS.indexOf(weekday) + 7) % 7;
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return Object.freeze({
    localDate: date.toISOString().slice(0, 10),
    localTime: surface.localTime,
    day: surface.day,
  });
}
function validTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
