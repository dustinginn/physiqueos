import { getLocalDateKey } from "../utils/localDate";
import { selectScheduledBriefingCadence } from "./BriefingEvidenceWindowService";

export function resolveHomeBriefingSelection({
  dailyArtifact = null,
  eventArtifact = null,
  now = new Date(),
  timeZone = "America/Los_Angeles",
  weeklyArtifact = null,
} = {}) {
  const localDate = getLocalDateKey(now, timeZone);
  const scheduledCadence = selectScheduledBriefingCadence({ now, timeZone });
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
  if (scheduledCadence === "weekly") {
    return {
      artifact: weeklyArtifact,
      briefingType: "weekly",
      href: "/briefings/weekly",
      label: "Weekly Briefing",
      localDate,
      reason: weeklyArtifact ? "scheduled_sunday_weekly" : "scheduled_sunday_weekly_unavailable",
    };
  }
  return {
    artifact: dailyArtifact,
    briefingType: "daily",
    href: "/briefing/daily",
    label: "Daily Briefing",
    localDate,
    reason: dailyArtifact ? "scheduled_weekday_daily" : "scheduled_weekday_daily_unavailable",
  };
}

function isEventActiveForHome({ artifact, localDate, timeZone }) {
  if (!artifact || artifact.lifecycle?.consumedAt) return false;
  if (!["progress_photo", "photo_session"].includes(artifact.trigger?.evidenceType)) return true;
  const eventDate = artifact.briefing?.photoEventNarrative?.eventDate ?? artifact.trigger?.occurredAt ?? artifact.generatedAt;
  return getLocalDateKey(eventDate, timeZone) === localDate;
}
