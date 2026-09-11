const WEIGHT_HISTORY_DEFAULT = 90;
const WEIGHT_HISTORY_MAX = 365;
const PHOTO_SESSION_DEFAULT = 12;
const PHOTO_SESSION_MAX = 50;

export function projectNativeWeightRead({ timeline, report, limit = WEIGHT_HISTORY_DEFAULT } = {}) {
  const boundedLimit = bounded(limit, WEIGHT_HISTORY_DEFAULT, WEIGHT_HISTORY_MAX, "weight history");
  const history = (report?.history ?? []).slice(0, boundedLimit);
  const dexaMarkers = [...(report?.chart?.markers ?? [])]
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")))
    .slice(0, Math.min(50, boundedLimit));
  return Object.freeze({
    schemaVersion: "1",
    context: projectGoalPhaseContext(timeline),
    current: report?.current ?? history[0] ?? null,
    recentWeighIns: Object.freeze((report?.recentWeighIns ?? history).slice(0, 7)),
    rollingAverages: report?.rollingAverages ?? null,
    weeklyAverages: Object.freeze((report?.weeklyAverages ?? []).slice(0, 6)),
    extrema: report?.extrema ?? null,
    dexaContext: Object.freeze({
      latest: dexaMarkers[0] ?? null,
      markers: Object.freeze(dexaMarkers),
    }),
    history: Object.freeze(history),
    page: Object.freeze({
      limit: boundedLimit,
      count: history.length,
      hasMore: (report?.history?.length ?? 0) > history.length,
    }),
  });
}

export function projectNativePhotosRead({ timeline, photoSessions = [], limit = PHOTO_SESSION_DEFAULT } = {}) {
  const boundedLimit = bounded(limit, PHOTO_SESSION_DEFAULT, PHOTO_SESSION_MAX, "photo session");
  const sessions = photoSessions.slice(0, boundedLimit).map(projectPhotoSession);
  return Object.freeze({
    schemaVersion: "1",
    context: projectGoalPhaseContext(timeline),
    sessions: Object.freeze(sessions),
    page: Object.freeze({
      limit: boundedLimit,
      count: sessions.length,
      hasMore: photoSessions.length > sessions.length,
    }),
  });
}

export function projectNativeTrainingReportingRead({ timeline, presentation } = {}) {
  return Object.freeze({
    schemaVersion: "1",
    context: projectGoalPhaseContext(timeline),
    reporting: presentation ?? null,
  });
}

function projectPhotoSession(session) {
  return Object.freeze({
    sessionId: session.id,
    revision: session.revision == null ? null : Number(session.revision),
    intendedCaptureDate: session.captureDate,
    goalId: session.goalId ?? session.goalPhaseAttribution?.goalId ?? null,
    phaseId: session.phaseId ?? session.goalPhaseAttribution?.phaseId ?? null,
    goalPhaseAttribution: boundedAttribution(session.goalPhaseAttribution),
    completionStatus: session.completionStatus ?? null,
    comparisonStatus: session.comparisonAvailability ?? null,
    photos: Object.freeze((session.views ?? []).slice(0, 20).map((view) => Object.freeze({
      photoId: view.canonicalPhotoId ?? view.canonicalViewId ?? view.id,
      poseId: view.poseId,
      pose: Object.freeze({
        id: view.pose?.id ?? view.poseId,
        label: view.pose?.label ?? view.label ?? null,
        view: view.pose?.view ?? null,
        pose: view.pose?.pose ?? null,
      }),
      intendedCaptureDate: view.captureDate ?? session.captureDate,
      comparisonStatus: view.comparisonStatus ?? "no_prior_matching_pose",
      mediaReference: view.imageHref ?? view.imageUrl ?? null,
      prior: view.comparison ? Object.freeze({
        sessionId: view.comparison.previousSessionId ?? null,
        photoId: view.comparison.previousCanonicalViewId ?? null,
        poseId: view.comparison.previousPose?.id ?? view.poseId,
        intendedCaptureDate: view.comparison.previousDate ?? null,
        mediaReference: view.comparison.previousImageHref ?? view.comparison.previousImageUrl ?? null,
      }) : null,
    }))),
  });
}

function projectGoalPhaseContext(timeline = {}) {
  return Object.freeze({
    contextId: timeline?.contextId ?? "all",
    type: timeline?.type ?? "all_history",
    goalId: timeline?.goalId ?? null,
    goalRevision: timeline?.goalRevision ?? null,
    phaseId: timeline?.phaseId ?? null,
    phaseRevision: timeline?.phaseRevision ?? null,
    startDate: timeline?.startDate ?? null,
    endDate: timeline?.endDate ?? null,
  });
}

function boundedAttribution(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze(Object.fromEntries([
    "goalId", "phaseId", "goalRevision", "phaseRevision", "attributedAt", "source",
  ].filter((key) => value[key] != null).map((key) => [key, value[key]])));
}

function bounded(value, fallback, maximum, label) {
  const limit = Number(value ?? fallback);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new RangeError(`Native ${label} limit must be from 1 through ${maximum}.`);
  }
  return limit;
}
