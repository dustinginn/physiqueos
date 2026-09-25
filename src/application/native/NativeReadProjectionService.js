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

// Training landing and library responses are the shared Progress reports, which
// also carry the full session history (`entries`, and every session inside
// `trainingDays`) and `trainingBreakdowns`. Native decodes none of that: a
// production landing read was 1.65 MB, of which ~0.9 MB were never decoded, and
// Evidence Hub plus every Training visit download it. These allowlists are
// exactly the keys Native (Build 60, `ProductionDailyDriverAPI` LandingPayload /
// LibraryPayload / TrainingSessionPreview) decodes, plus `href`, which the
// envelope turns into `destination`. Values are passed through unchanged.
const NATIVE_TRAINING_LANDING_REPORT_KEYS = new Set([
  "title", "subtitle", "tone", "latestTrainingDay", "reportingLinks", "trainingDays",
  "currentProtocol", "relatedGoals", "sourceEvidence",
]);
const NATIVE_TRAINING_DAY_KEYS = new Set(["date", "label", "summary", "href", "destination", "sessions"]);
const NATIVE_TRAINING_SESSION_PREVIEW_KEYS = new Set([
  "id", "label", "value", "detail", "date", "sourceEvidence", "href", "destination",
]);
const NATIVE_TRAINING_LIBRARY_REPORT_KEYS = new Set(["canonicalExercises"]);
// Nutrition carries every day twice: `nutritionDays` (decoded) and `entries`
// (632 KB of a 1.27 MB production read, never decoded by Native).
const NATIVE_NUTRITION_REPORT_KEYS = new Set([
  "title", "subtitle", "tone", "nutritionDays", "nutritionLibrary", "nutritionReportingLinks", "dataSources",
]);

export function projectNativeNutritionRead(value) {
  if (value == null) return value;
  const { report, ...rest } = value;
  return Object.freeze({ ...rest, report: Object.freeze(pick(report, NATIVE_NUTRITION_REPORT_KEYS)) });
}

export function projectNativeTrainingLandingRead(value) {
  // A missing read stays missing, so the route still answers 404.
  if (value == null) return value;
  const { timeline, report, ...rest } = value;
  const projectedReport = pick(report, NATIVE_TRAINING_LANDING_REPORT_KEYS);
  if (Array.isArray(projectedReport.trainingDays)) {
    projectedReport.trainingDays = Object.freeze(projectedReport.trainingDays.map(projectTrainingDay));
  }
  if (projectedReport.latestTrainingDay && typeof projectedReport.latestTrainingDay === "object") {
    projectedReport.latestTrainingDay = projectTrainingDay(projectedReport.latestTrainingDay);
  }
  return Object.freeze({ ...rest, timeline, report: Object.freeze(projectedReport) });
}

export function projectNativeTrainingLibraryRead(value) {
  if (value == null) return value;
  const { report, ...rest } = value;
  return Object.freeze({ ...rest, report: Object.freeze(pick(report, NATIVE_TRAINING_LIBRARY_REPORT_KEYS)) });
}

function projectTrainingDay(day) {
  if (!day || typeof day !== "object") return day;
  const projected = pick(day, NATIVE_TRAINING_DAY_KEYS);
  if (Array.isArray(projected.sessions)) {
    projected.sessions = Object.freeze(projected.sessions.map((session) =>
      session && typeof session === "object" ? Object.freeze(pick(session, NATIVE_TRAINING_SESSION_PREVIEW_KEYS)) : session));
  }
  return Object.freeze(projected);
}

// Keeps the source key order, so href/destination resolve exactly as before.
function pick(value, keys) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => keys.has(key)));
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
      galleryInterpretation: projectGalleryInterpretation(view.galleryInterpretation),
      sourceHistory: typeof view.sourceHistory === "string" ? view.sourceHistory : null,
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

function projectGalleryInterpretation(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    summary: typeof value.summary === "string" ? value.summary : null,
    comparisonBullets: Object.freeze(Array.isArray(value.comparisonBullets)
      ? value.comparisonBullets.filter((item) => typeof item === "string").slice(0, 20)
      : []),
    conditionSummary: typeof value.conditionSummary === "string" ? value.conditionSummary : null,
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
