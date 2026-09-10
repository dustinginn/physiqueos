import { resolveBriefingReviewArtifact } from "../../domain/services/BriefingReviewArtifactResolver.js";

export function createBriefingNavigationReadService({ store } = {}) {
  if (!store?.getAnalysis || !store?.getArtifact || !store?.listHistory) throw new Error("Briefing navigation requires a read store.");
  return Object.freeze({
    listHistory() {
      return store.listHistory();
    },
    async listNativeHistory({ limit = 20, cursor = null } = {}) {
      if (store.listNativeHistory) return store.listNativeHistory({ limit, cursor });
      const history = await store.listHistory();
      const artifacts = [...(history.artifacts ?? [])]
        .sort((left, right) => String(right.generatedAt ?? right.createdAt ?? "").localeCompare(String(left.generatedAt ?? left.createdAt ?? "")));
      const start = cursor ? Math.max(artifacts.findIndex((item) => item.id === cursor) + 1, 0) : 0;
      const selected = artifacts.slice(start, start + limit);
      return Object.freeze({
        items: Object.freeze(selected.map(repositoryNativeSummary)),
        page: Object.freeze({
          limit,
          hasMore: start + limit < artifacts.length,
          nextCursor: start + limit < artifacts.length ? selected.at(-1)?.id ?? null : null,
        }),
      });
    },
    async getArtifact({ artifactId, version = null } = {}) {
      const context = await store.getArtifact({ artifactId });
      const artifact = resolveBriefingReviewArtifact(context.artifact ? [context.artifact] : [], { artifactId, version });
      return Object.freeze({ ...context, artifact });
    },
    getDexaArtifact({ scanId } = {}) {
      return store.getDexaArtifact({ scanId });
    },
    getAnalysis({ analysisId } = {}) {
      return store.getAnalysis({ analysisId });
    },
    getConfidenceAssessment({ assessmentId } = {}) {
      return store.getConfidenceAssessment?.({ assessmentId }) ?? null;
    },
  });
}

function repositoryNativeSummary(artifact) {
  const cadence = artifact.cadence ?? null;
  const artifactType = artifact.artifactType ?? (cadence ? "scheduled" : null);
  return Object.freeze({
    artifactId: artifact.id,
    artifactType,
    cadence,
    label: artifact.title ?? (cadence === "weekly" ? "Weekly Briefing" : cadence === "midweek" ? "Midweek Briefing" : cadence === "monthly" ? "Monthly Briefing" : ["dexa_event", "dexa-event"].includes(artifactType) ? "DEXA Event" : ["photo_event", "photo-event"].includes(artifactType) ? "Photo Event" : "Briefing"),
    publicationDate: artifact.deliveryDate ?? artifact.generatedAt ?? artifact.createdAt ?? null,
    evidenceCutoff: artifact.evidenceCutoff ?? null,
    evidenceWindow: artifact.evidenceWindow ? Object.freeze(Object.fromEntries([
      "id", "startDate", "endDate", "briefingMonth", "deliveryDate", "timeZone", "cutoff",
    ].filter((key) => artifact.evidenceWindow[key] != null).map((key) => [key, artifact.evidenceWindow[key]]))) : null,
    goalContext: artifact.goalContext ?? null,
    confidence: artifact.confidencePublication ? Object.freeze({
      assessmentId: artifact.confidencePublication.assessmentId ?? null,
      publisherType: artifact.confidencePublication.publisherType ?? null,
      publicationCutoff: artifact.confidencePublication.publicationCutoff ?? null,
    }) : null,
    status: artifact.lifecycle?.status ?? artifact.lifecycle?.generationStatus ?? null,
    detail: Object.freeze({ resource: "briefing", artifactId: artifact.id }),
    version: Number(artifact.version ?? 1),
  });
}
