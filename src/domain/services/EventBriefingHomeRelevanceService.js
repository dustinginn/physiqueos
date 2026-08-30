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
    artifact.trigger?.occurredAt ?? artifact.generatedAt;
  const eventLocalDate = getLocalDateKey(eventDate, timeZone);
  if (eventLocalDate === localDate) return true;
  const publicationLocalDate = getLocalDateKey(artifact.generatedAt, timeZone);
  return eventLocalDate === shiftDate(localDate, -1) &&
    publicationLocalDate === localDate;
}

function isDexaEventRelevant({ artifact, localDate, timeZone }) {
  if (!artifact.generatedAt) return false;
  return getLocalDateKey(artifact.generatedAt, timeZone) === localDate;
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
