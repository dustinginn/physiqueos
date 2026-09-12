import { resolveBriefingReviewArtifact } from "../../domain/services/BriefingReviewArtifactResolver.js";
import { prepareWeeklyBriefingReviewPresentation } from "../../domain/services/WeeklyBriefingReviewPresentationService.js";
import { prepareMidweekBriefingReviewPresentation } from "../../domain/services/MidweekBriefingPresentationService.js";
import { createWeeklyBriefingScreenPresentation } from "../../domain/services/WeeklyBriefingScreenPresentationService.js";
import { resolveWeeklyBriefingPhaseBoundary } from "../../domain/services/WeeklyBriefingPhaseBoundaryReadService.js";
import { projectConfidenceExplanationForSurface } from "../../domain/presentation/confidenceExplanationPresentation.js";

export function createBriefingNavigationReadService({ store } = {}) {
  if (!store?.getAnalysis || !store?.getArtifact || !store?.listHistory) throw new Error("Briefing navigation requires a read store.");
  async function loadArtifact({ artifactId, version = null } = {}) {
    const context = await store.getArtifact({ artifactId });
    const artifact = resolveBriefingReviewArtifact(context.artifact ? [context.artifact] : [], { artifactId, version });
    return Object.freeze({ ...context, artifact });
  }
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
    getArtifact: loadArtifact,
    async getNativeArtifact(input = {}) {
      const context = await loadArtifact(input);
      const artifact = context.artifact;
      if (!artifact) return null;
      if (artifact.briefing?.weeklyNarrative) {
        const sourceNarrative = artifact.briefing.weeklyNarrative;
        const goalId = sourceNarrative.context?.activeGoal?.id ??
          sourceNarrative.context?.activeGoalSummary?.id ?? null;
        const goal = context.goals?.find((item) => item.id === goalId) ?? null;
        const phaseBoundary = resolveWeeklyBriefingPhaseBoundary({ artifact, goal });
        const narrative = await prepareWeeklyBriefingReviewPresentation({
          artifact,
          timeZone: context.user?.timeZone,
          phaseBoundary,
        });
        const finished = {
          ...narrative,
          goalConfidence: projectConfidenceExplanationForSurface(
            narrative.goalConfidence,
            { assessment: context.confidenceAssessment, surface: "weekly" }
          ),
        };
        return nativeBriefingDetail({
          artifact,
          cadence: "weekly",
          attribution: weeklyAttribution(artifact, finished),
          presentation: createWeeklyBriefingScreenPresentation(finished),
        });
      }
      if (artifact.cadence === "midweek" && artifact.briefing) {
        const briefing = prepareMidweekBriefingReviewPresentation({ artifact });
        const finished = {
          ...briefing,
          goalConfidence: projectConfidenceExplanationForSurface(
            briefing.goalConfidence,
            { assessment: context.confidenceAssessment, surface: "midweek" }
          ),
        };
        return nativeBriefingDetail({
          artifact,
          cadence: "midweek",
          attribution: midweekAttribution(artifact, finished),
          presentation: finished,
        });
      }
      return context;
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

function nativeBriefingDetail({ artifact, cadence, attribution, presentation }) {
  return Object.freeze({
    schemaVersion: "1",
    artifact: Object.freeze({
      artifactId: artifact.id,
      artifactType: artifact.artifactType ?? "scheduled",
      cadence,
      version: Number(artifact.version ?? 1),
      evidenceCutoff: artifact.evidenceCutoff ?? null,
      evidenceWindow: boundedEvidenceWindow(artifact.evidenceWindow),
      publicationDate: artifact.deliveryDate ?? artifact.generatedAt ?? artifact.createdAt ?? null,
    }),
    goalPhaseAttribution: attribution,
    historical: Object.freeze({ frozen: true, artifactBound: true }),
    presentation,
  });
}

function weeklyAttribution(artifact, narrative) {
  return boundedAttribution(artifact.goalContext ?? {
    goalId: narrative.context?.activeGoal?.id ?? narrative.context?.activeGoalSummary?.id,
    phaseId: narrative.context?.activePhase?.id,
  });
}

function midweekAttribution(artifact, briefing) {
  return boundedAttribution(artifact.goalContext ?? {
    goalId: briefing.activeGoal?.id,
    phaseId: briefing.activePhase?.id,
  });
}

function boundedAttribution(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze(Object.fromEntries([
    "goalId", "phaseId", "goalRevision", "phaseRevision", "source", "attributedAt",
  ].filter((key) => value[key] != null).map((key) => [key, value[key]])));
}

function boundedEvidenceWindow(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze(Object.fromEntries([
    "id", "startDate", "endDate", "briefingMonth", "deliveryDate", "timeZone", "cutoff",
  ].filter((key) => value[key] != null).map((key) => [key, value[key]])));
}

function repositoryNativeSummary(artifact) {
  const cadence = artifact.cadence ?? null;
  const artifactType = nativeArtifactType(artifact);
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

function nativeArtifactType(artifact) {
  if (artifact.cadence !== "event") return artifact.artifactType ?? (artifact.cadence ? "scheduled" : null);
  const evidenceType = artifact.trigger?.evidenceType ?? artifact.trigger?.type ?? null;
  if (["dexa", "dexa_scan", "body_composition"].includes(evidenceType) || artifact.briefing?.dexaEventNarrative) return "dexa_event";
  if (["photo", "photo_session", "progress_photo"].includes(evidenceType) || artifact.briefing?.photoEventNarrative) return "photo_event";
  return artifact.artifactType ?? "event";
}
