import { getLocalDateKey } from "../utils/localDate";
import {
  createMidweekEvidenceWindow,
  selectScheduledBriefingCadence,
} from "./BriefingEvidenceWindowService";

export function resolveHomeBriefingSelection({
  dailyArtifact = null,
  eventArtifact = null,
  midweekArtifact = null,
  now = new Date(),
  timeZone = "America/Los_Angeles",
  weeklyArtifact = null,
  coachingUpdates = null,
} = {}) {
  const localDate = getLocalDateKey(now, timeZone);
  const scheduledCadence = selectScheduledBriefingCadence({ now, timeZone, coachingUpdates });
  const activeEvent = isEventActiveForHome({ artifact: eventArtifact, localDate, timeZone });
  if (activeEvent) {
    const isPhoto = ["progress_photo", "photo_session"].includes(eventArtifact.trigger?.evidenceType);
    const isDEXA = ["dexa", "dexa_scan"].includes(eventArtifact.trigger?.evidenceType);
    return {
      artifact: eventArtifact,
      briefingType: "event",
      href: isPhoto && eventArtifact.trigger?.evidenceId
        ? `/briefings/photo/${eventArtifact.trigger.evidenceId}`
        : isDEXA && eventArtifact.trigger?.evidenceId
          ? `/briefings/dexa/${eventArtifact.trigger.evidenceId}`
          : `/briefings/review/${eventArtifact.id}`,
      label: "Event Briefing",
      localDate,
      reason: "active_same_day_event",
    };
  }
  const validMidweek = isCadenceArtifactReady(midweekArtifact, "midweek") &&
    isMidweekInPromotionWindow(midweekArtifact, { localDate, now, scheduledCadence, timeZone, coachingUpdates })
    ? midweekArtifact
    : null;
  const validWeekly = isCadenceArtifactReady(weeklyArtifact, "weekly") &&
    isWeeklyInPromotionWindow(weeklyArtifact, localDate)
    ? weeklyArtifact
    : null;
  if (scheduledCadence === "weekly") {
    if (!validWeekly && validMidweek) {
      return cadenceSelection(validMidweek, "midweek", localDate, "sunday_weekly_pending_keep_midweek");
    }
    return {
      artifact: validWeekly,
      briefingType: validWeekly ? "weekly" : "none",
      href: validWeekly ? `/briefings/review/${validWeekly.id}` : null,
      label: validWeekly ? "Weekly Briefing" : "Coaching Briefing",
      localDate,
      reason: validWeekly ? "scheduled_sunday_weekly" : "scheduled_sunday_weekly_unavailable",
    };
  }
  if (scheduledCadence === "midweek") {
    return validMidweek
      ? cadenceSelection(validMidweek, "midweek", localDate, "scheduled_wednesday_midweek")
      : emptySelection(localDate, "scheduled_wednesday_midweek_unavailable");
  }
  if (validMidweek) return cadenceSelection(validMidweek, "midweek", localDate, "no_routine_briefing_keep_current");
  if (validWeekly) return cadenceSelection(validWeekly, "weekly", localDate, "no_routine_briefing_keep_current");
  return emptySelection(localDate, "no_routine_briefing_available");
}

export function isCadenceArtifactReady(artifact, cadence) {
  if (!artifact || artifact.cadence !== cadence || artifact.artifactType === "event") return false;
  if (!artifact.briefing || artifact.evidenceWindow?.cadence !== cadence) return false;
  if (artifact.evidenceWindow?.closed !== true || !artifact.generatedAt) return false;
  if (hasInvalidLifecycleStatus(artifact)) return false;
  if (cadence === "midweek" && !artifact.briefing.hero) return false;
  if (cadence === "weekly" && !artifact.briefing.weeklyNarrative && !artifact.briefing.hero) return false;
  return true;
}

function isEventActiveForHome({ artifact, localDate, timeZone }) {
  if (!artifact || artifact.lifecycle?.consumedAt) return false;
  if (!artifact.briefing || artifact.artifactType !== "event") return false;
  if (hasInvalidLifecycleStatus(artifact)) return false;
  if (!["progress_photo", "photo_session"].includes(artifact.trigger?.evidenceType)) return true;
  const eventDate = artifact.briefing?.photoEventNarrative?.eventDate ?? artifact.trigger?.occurredAt ?? artifact.generatedAt;
  return getLocalDateKey(eventDate, timeZone) === localDate;
}

function cadenceSelection(artifact, cadence, localDate, reason) {
  return {
    artifact,
    briefingType: cadence,
    href: `/briefings/review/${artifact.id}`,
    label: cadence === "midweek" ? "Midweek Briefing" : "Weekly Briefing",
    localDate,
    reason,
  };
}

function emptySelection(localDate, reason) {
  return {
    artifact: null,
    briefingType: "none",
    href: null,
    label: "Coaching Briefing",
    localDate,
    reason,
  };
}

function isMidweekInPromotionWindow(artifact, { localDate, now, scheduledCadence, timeZone, coachingUpdates }) {
  const expected = createMidweekEvidenceWindow({ now, timeZone, coachingUpdates });
  if (artifact.evidenceWindow?.id === expected.id) return true;
  if (scheduledCadence !== "weekly") return false;
  return artifact.evidenceWindow?.briefingDate === shiftDate(localDate, -4);
}

function isWeeklyInPromotionWindow(artifact, localDate) {
  const recentSunday = shiftDate(localDate, -new Date(`${localDate}T12:00:00Z`).getUTCDay());
  return artifact.evidenceWindow?.startDate === shiftDate(recentSunday, -7) &&
    artifact.evidenceWindow?.endDate === shiftDate(recentSunday, -1);
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function hasInvalidLifecycleStatus(artifact) {
  const invalid = new Set(["failed", "in_progress", "invalid", "retired", "superseded"]);
  return [
    artifact?.status,
    artifact?.lifecycle?.status,
    artifact?.lifecycle?.generationStatus,
  ].filter(Boolean).map((value) => String(value).toLowerCase()).some((value) => invalid.has(value));
}
