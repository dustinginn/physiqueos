import { getLocalDateKey } from "../utils/localDate";

export const EVENT_BRIEFING_HOME_RELEVANCE_VERSION =
  "event_briefing_home_relevance_v2";

// A Photo Briefing keeps its ordinary event-day-and-following-day Home relevance
// AND receives a full additional 24 hours of Home visibility after it is
// generated and published, whichever ends later. A Photo Event confirmed late
// (a delayed confirmation, or a recovered one) would otherwise lose most or all of
// its Home window before the Founder could see it. DEXA keeps the event-date rule
// alone.
export const PHOTO_EVENT_HOME_PUBLICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

const PHOTO_EVIDENCE_TYPES = new Set(["progress_photo", "photo_session"]);
const DEXA_EVIDENCE_TYPES = new Set(["dexa", "dexa_scan"]);

// `now` is the instant of the Home read. Without it only the calendar-day rule can
// be evaluated, which is what callers that only know a local date get.
export function isEventBriefingRelevantForHome({
  artifact,
  localDate,
  timeZone = "America/Los_Angeles",
  now = null,
} = {}) {
  const evidenceType = artifact?.trigger?.evidenceType;
  if (PHOTO_EVIDENCE_TYPES.has(evidenceType)) {
    return isPhotoEventRelevant({ artifact, localDate, timeZone, now });
  }
  if (DEXA_EVIDENCE_TYPES.has(evidenceType)) {
    return isDexaEventRelevant({ artifact, localDate, timeZone });
  }
  return true;
}

function isPhotoEventRelevant({ artifact, localDate, timeZone, now }) {
  const eventDate = artifact.briefing?.photoEventNarrative?.eventDate ??
    artifact.trigger?.occurredAt ?? null;
  return isEventDayOrFollowingDay({ eventDate, localDate, timeZone }) ||
    isWithinPhotoPublicationWindow({ artifact, now });
}

// The publication window is anchored to the artifact's own persisted `generatedAt`
// (the authoritative generation/publication instant in the briefing contract),
// never to a client clock. It applies only to a Photo Briefing that actually
// carries published narrative content.
function isWithinPhotoPublicationWindow({ artifact, now }) {
  if (!artifact?.briefing?.photoEventNarrative) return false;
  const generatedAt = instantMs(artifact.generatedAt);
  const current = instantMs(now);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(current)) return false;
  return current >= generatedAt &&
    current < generatedAt + PHOTO_EVENT_HOME_PUBLICATION_WINDOW_MS;
}

// The exact instant a Photo Briefing stops being Home-relevant: the later of the
// end of its following local day and generatedAt plus 24 hours. Null when the
// artifact is not a published Photo Briefing.
export function resolvePhotoEventHomeRelevanceEnd({
  artifact,
  timeZone = "America/Los_Angeles",
} = {}) {
  if (!PHOTO_EVIDENCE_TYPES.has(artifact?.trigger?.evidenceType) ||
      !artifact?.briefing?.photoEventNarrative) return null;
  const eventDate = artifact.briefing.photoEventNarrative.eventDate ??
    artifact.trigger?.occurredAt ?? null;
  const eventLocalDate = eventDate ? getLocalDateKey(eventDate, timeZone) : null;
  const dayEnd = eventLocalDate
    ? startOfLocalDate(shiftDate(eventLocalDate, 2), timeZone)
    : null;
  const generatedAt = instantMs(artifact.generatedAt);
  const publicationEnd = Number.isFinite(generatedAt)
    ? generatedAt + PHOTO_EVENT_HOME_PUBLICATION_WINDOW_MS
    : null;
  const end = Math.max(dayEnd ?? -Infinity, publicationEnd ?? -Infinity);
  return Number.isFinite(end)
    ? Object.freeze({
        eventDayWindowEnd: dayEnd == null ? null : new Date(dayEnd).toISOString(),
        publicationWindowEnd: publicationEnd == null ? null : new Date(publicationEnd).toISOString(),
        effectiveEnd: new Date(end).toISOString(),
      })
    : null;
}

// An instant given as a Date, an ISO string, or epoch milliseconds.
function instantMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value ?? "");
}

// Earliest instant whose local calendar date in `timeZone` is `localDate`.
function startOfLocalDate(localDate, timeZone) {
  const noon = Date.parse(`${localDate}T12:00:00Z`);
  let low = noon - 36 * 3600 * 1000;
  let high = noon + 36 * 3600 * 1000;
  // getLocalDateKey is monotonic in time: bisect for the first instant whose key
  // is >= localDate.
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (getLocalDateKey(new Date(mid), timeZone) >= localDate) high = mid;
    else low = mid;
  }
  return high;
}

function isDexaEventRelevant({ artifact, localDate, timeZone }) {
  const eventDate = artifact.briefing?.dexaEventNarrative?.snapshot?.scanDate ??
    artifact.briefing?.dexaEventNarrative?.scanDate ??
    artifact.briefing?.dexaEventNarrative?.eventDate ??
    artifact.trigger?.occurredAt ?? null;
  return isEventDayOrFollowingDay({ eventDate, localDate, timeZone });
}

function isEventDayOrFollowingDay({ eventDate, localDate, timeZone }) {
  if (!eventDate || !localDate) return false;
  const eventLocalDate = getLocalDateKey(eventDate, timeZone);
  return localDate === eventLocalDate || localDate === shiftDate(eventLocalDate, 1);
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
