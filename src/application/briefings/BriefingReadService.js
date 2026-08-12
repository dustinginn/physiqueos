import { classifyBriefingCadence } from "../../data/repositories/DailyBriefingHistory.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export function createBriefingReadService({ repositories } = {}) {
  return Object.freeze({
    async listBriefings({ principal, limit = 25 } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 25));
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(actor.userId);
      return artifacts.filter(isPublished).sort(byRecency).slice(0, boundedLimit).map(projectBriefingSummary);
    },
    async getBriefing({ principal, briefingId } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(actor.userId);
      const artifact = artifacts.find((item) => item.id === briefingId && isPublished(item));
      return artifact ? projectBriefingDetail(artifact) : null;
    },
  });
}

export function getGenericBriefingType(artifact) {
  if (artifact?.artifactType === "event") {
    if (artifact.briefing?.photoEventNarrative) return "photo_event";
    if (artifact.briefing?.dexaEventNarrative) return "dexa_event";
    return String(artifact.trigger?.type ?? "event");
  }
  const classified = classifyBriefingCadence(artifact);
  return classified && classified !== "unknown"
    ? classified
    : String(artifact?.cadence ?? artifact?.artifactType ?? "unknown");
}

function projectBriefingSummary(artifact) {
  return Object.freeze({
    id: artifact.id,
    type: getGenericBriefingType(artifact),
    generatedAt: artifact.generatedAt ?? artifact.createdAt ?? null,
    publicationState: "published",
    openedAt: artifact.lifecycle?.openedAt ?? null,
    acknowledgedAt: artifact.lifecycle?.consumedAt ?? null,
    href: briefingHref(artifact),
    title: artifact.briefing?.title ?? artifact.briefing?.hero?.title ?? artifact.briefing?.headline ?? "Briefing",
  });
}

function projectBriefingDetail(artifact) {
  return Object.freeze({
    ...projectBriefingSummary(artifact),
    evidenceWindow: artifact.evidenceWindow ? structuredClone(artifact.evidenceWindow) : null,
    presentation: structuredClone(artifact.briefing),
  });
}

function briefingHref(artifact) {
  const type = getGenericBriefingType(artifact);
  if (type === "weekly") return "/briefings/weekly";
  if (type === "midweek") return "/briefings/midweek/preview";
  if (type === "monthly") return `/briefings/monthly/${encodeURIComponent(artifact.id)}`;
  if (type === "dexa_event") return `/briefings/dexa/${encodeURIComponent(artifact.trigger?.scanId ?? artifact.id)}`;
  if (type === "photo_event") return `/briefings/photo/${encodeURIComponent(artifact.trigger?.sessionId ?? artifact.id)}`;
  return `/briefings/review/${encodeURIComponent(artifact.id)}`;
}

function isPublished(artifact) { return Boolean(artifact?.briefing) && artifact.preview !== true && artifact.lifecycle?.preview !== true && !["in_progress", "failed"].includes(artifact.lifecycle?.generationStatus); }
function byRecency(left, right) { return String(right.generatedAt ?? right.createdAt ?? "").localeCompare(String(left.generatedAt ?? left.createdAt ?? "")) || String(right.id).localeCompare(String(left.id)); }
