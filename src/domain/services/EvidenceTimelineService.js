export function createEvidenceTimelineService({ repositories }) {
  return {
    async getTimeline(userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) return [];

      const [weights, photos, dexaScans, protocols, checkIns, analyses, dailyBriefings] =
        await Promise.all([
          repositories.weights.listWeightEntries(resolvedUserId),
          repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
          repositories.dexaScans.listDEXAScans(resolvedUserId),
          repositories.protocols.listProtocols(resolvedUserId),
          repositories.dailyCheckIns.listCheckIns(resolvedUserId),
          repositories.analyses.listAnalyses(),
          repositories.dailyBriefings?.listDailyBriefings(resolvedUserId) ?? [],
        ]);

      return [
        ...weights.map((entry) => ({
          id: entry.id,
          type: "Weight",
          date: entry.measuredAt,
          title: `${entry.weight.value.toFixed(1)} ${entry.weight.unit}`,
          detail: entry.context?.isDefault === false
            ? "Manual weight with different conditions"
            : "Manual morning weight",
          tone: "evidence",
        })),
        ...photos.map((photo) => ({
          id: photo.id,
          type: "Progress Photo",
          date: photo.date ?? photo.capturedAt,
          title: `${formatLabel(photo.view)} ${formatLabel(photo.pose)}`,
          detail: photo.linkedWeightEntryId
            ? "Linked to same-day weight"
            : "Visual calibration evidence",
          tone: "evidence",
        })),
        ...dexaScans.map((scan) => ({
          id: scan.id,
          type: "DEXA",
          date: scan.measuredAt,
          title: scan.bodyFatPercentage
            ? `${scan.bodyFatPercentage.toFixed(1)}% body fat`
            : "Body composition scan",
          detail: scan.provider || "Calibration evidence",
          tone: "success",
        })),
        ...protocols.map((protocol) => ({
          id: protocol.id,
          type: "Protocol",
          date: protocol.startDate,
          title: protocol.name,
          detail: `${formatLabel(protocol.status)} ${formatLabel(protocol.category)}`,
          tone: "effort",
        })),
        ...checkIns.map((checkIn) => ({
          id: checkIn.id,
          type: "Daily Check-In",
          date: checkIn.date,
          title: "Morning check-in",
          detail: checkIn.weightEntryId
            ? "Weight evidence submitted"
            : "Context submitted",
          tone: "primary",
        })),
        ...analyses.map((analysis) => ({
          id: analysis.id,
          type: "Analysis",
          date: analysis.createdAt,
          title: analysis.title,
          detail: analysis.summary,
          tone: "primary",
        })),
        ...dailyBriefings.map((dailyBriefing) => ({
          id: dailyBriefing.id,
          type: "Daily Briefing",
          date: dailyBriefing.generatedAt,
          title: dailyBriefing.briefing?.hero?.title ?? "Daily Briefing",
          detail:
            dailyBriefing.trigger?.evidenceType
              ? `Generated from ${formatLabel(dailyBriefing.trigger.evidenceType)} evidence`
              : "Generated briefing artifact",
          tone: "primary",
        })),
      ]
        .filter((item) => item.date)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },
  };
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
