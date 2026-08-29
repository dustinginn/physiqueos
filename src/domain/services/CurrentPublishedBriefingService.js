import { classifyBriefingCadence } from
  "../../data/repositories/DailyBriefingHistory";
import { resolveHomeBriefingSelection } from "./HomeBriefingRoutingService";

const CADENCES = ["weekly", "midweek", "monthly"];

export function resolveCurrentPublishedBriefing({
  publications = [],
  at = new Date(),
  timeZone = "America/Los_Angeles",
  coachingUpdates = null,
} = {}) {
  const latest = Object.fromEntries(CADENCES.map((cadence) => [
    cadence,
    latestPublished(publications, cadence),
  ]));
  return resolveHomeBriefingSelection({
    eventArtifact: null,
    midweekArtifact: latest.midweek,
    monthlyArtifact: latest.monthly,
    now: at,
    timeZone,
    weeklyArtifact: latest.weekly,
    coachingUpdates,
  }).artifact ?? null;
}

function latestPublished(publications, cadence) {
  return publications
    .filter((publication) =>
      classifyBriefingCadence(publication) === cadence &&
      publication?.briefing && publication.preview !== true &&
      !["failed", "in_progress", "invalid", "retired", "superseded"]
        .includes(String(
          publication.lifecycle?.generationStatus ??
          publication.lifecycle?.status ?? publication.status ?? ""
        ).toLowerCase())
    )
    .sort(compareRecency)
    .at(-1) ?? null;
}

function compareRecency(left, right) {
  const window = String(
    left.evidenceWindow?.endDate ?? left.evidenceWindow?.date ?? ""
  ).localeCompare(String(
    right.evidenceWindow?.endDate ?? right.evidenceWindow?.date ?? ""
  ));
  return window || String(left.generatedAt ?? "")
    .localeCompare(String(right.generatedAt ?? ""));
}
