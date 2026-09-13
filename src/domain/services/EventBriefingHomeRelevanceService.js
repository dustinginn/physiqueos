import { getLocalDateKey } from "../utils/localDate";

export const EVENT_BRIEFING_HOME_RELEVANCE_VERSION =
  "event_briefing_home_relevance_v1";

const PHOTO_EVIDENCE_TYPES = new Set(["progress_photo", "photo_session"]);
const DEXA_EVIDENCE_TYPES = new Set(["dexa", "dexa_scan"]);

export function isEventBriefingRelevantForHome({
  artifact,
  localDate,
  timeZone = "America/Los_Angeles",
} = {}) {
  const evidenceType = artifact?.trigger?.evidenceType;
  if (PHOTO_EVIDENCE_TYPES.has(evidenceType)) {
    return isPhotoEventRelevant({ artifact, localDate, timeZone });
  }
  if (DEXA_EVIDENCE_TYPES.has(evidenceType)) {
    return isDexaEventRelevant({ artifact, localDate, timeZone });
  }
  return true;
}

function isPhotoEventRelevant({ artifact, localDate, timeZone }) {
  const eventDate = artifact.briefing?.photoEventNarrative?.eventDate ??
    artifact.trigger?.occurredAt ?? null;
  return isEventDayOrFollowingDay({ eventDate, localDate, timeZone });
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
