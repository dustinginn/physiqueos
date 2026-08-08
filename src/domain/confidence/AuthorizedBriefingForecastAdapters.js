import { createBriefingForecastFinalizer } from "./BriefingForecastFinalizer";
import { ConfidencePublisherType } from "./ConfidencePublisherRegistry";

export function createAuthorizedBriefingForecastAdapters({ finalizer } = {}) {
  const shared = finalizer ?? createBriefingForecastFinalizer();
  return Object.freeze({
    finalizeGoalInitialization(request) {
      return run(shared, request, {
        publisherType: ConfidencePublisherType.GOAL_INITIALIZATION,
        cadenceOrEventType: "goal_initialization",
      });
    },
    finalizeMidweek(request) {
      return run(shared, request, {
        publisherType: ConfidencePublisherType.MIDWEEK_BRIEFING,
        cadenceOrEventType: "midweek",
      });
    },
    finalizeWeekly(request) {
      return run(shared, request, {
        publisherType: ConfidencePublisherType.WEEKLY_BRIEFING,
        cadenceOrEventType: "weekly",
      });
    },
    finalizeMonthly(request) {
      return run(shared, request, {
        publisherType: ConfidencePublisherType.MONTHLY_BRIEFING,
        cadenceOrEventType: "monthly",
      });
    },
    finalizeDEXAEvent(request) {
      return run(shared, request, {
        publisherType: ConfidencePublisherType.DEXA_EVENT_BRIEFING,
        cadenceOrEventType: "dexa",
      });
    },
    finalizePhotoEvent(request) {
      return run(shared, request, {
        publisherType: ConfidencePublisherType.PHOTO_EVENT_BRIEFING,
        cadenceOrEventType: "photo",
        qualifyingPhotoEvent: request?.meaningfulVisualInterpretation === true &&
          request?.canonicalPhotoEventBriefing === true,
      });
    },
  });
}

function run(finalizer, request = {}, identity) {
  const artifact = structuredClone(request.artifact ?? {});
  const compose = request.composeArtifact ?? ((outputs) => ({
    ...artifact,
    confidenceAssessment: outputs.confidenceAssessment,
  }));
  return finalizer.finalize({
    ...request,
    ...identity,
    artifactId: request.artifactId ?? artifact.id,
    occurrenceId: request.occurrenceId ?? artifact.id,
    evidenceWindow: normalizeEvidenceWindow(request, identity),
    composeArtifact: compose,
  });
}

function normalizeEvidenceWindow(request, identity) {
  if (request.evidenceWindow?.id) return request.evidenceWindow;
  if (identity.publisherType !== ConfidencePublisherType.GOAL_INITIALIZATION) {
    return request.evidenceWindow;
  }
  return {
    id: `goal_initialization|${request.occurrenceId ?? request.artifactId}`,
    start: request.publicationCutoff,
    cutoff: request.publicationCutoff,
    closed: true,
  };
}

export const AuthorizedBriefingForecastAdapters =
  createAuthorizedBriefingForecastAdapters();
