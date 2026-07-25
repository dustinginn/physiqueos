import {
  arePhotoPoseIdentitiesCompatible,
  getProgressPhotoCategoryId,
  normalizePhotoViewIdentity,
} from "../models/progressPhotoPoseVocabulary";

const INACTIVE = new Set(["duplicate", "superseded", "inactive", "hidden"]);

export function selectPoseAwareComparisons({ currentView, sessions = [], currentSessionId, goalId = null } = {}) {
  const candidates = sessions
    .filter((session) => session.id !== currentSessionId)
    .flatMap((session) => (session.views ?? []).map((view) => ({ ...view, photoSessionId: session.id, captureDate: view.captureDate ?? session.captureDate })))
    .filter((view) => isQualifiedView(view) && arePhotoPoseIdentitiesCompatible(currentView.poseIdentity ?? currentView.pose ?? currentView, view.poseIdentity ?? view.pose ?? view))
    .sort((left, right) => String(left.captureDate).localeCompare(String(right.captureDate)));
  const earliest = candidates[0] ?? null;
  const prior = candidates.at(-1) ?? null;
  const identity = normalizePhotoViewIdentity(currentView.poseIdentity ?? currentView.pose ?? currentView);
  return {
    currentViewId: currentView.canonicalViewId ?? currentView.id,
    poseIdentity: identity,
    currentPhotoSessionId: currentSessionId,
    priorMatchFound: Boolean(prior),
    priorViewId: prior?.canonicalViewId ?? prior?.id ?? null,
    priorPhotoSessionId: prior?.photoSessionId ?? null,
    earliestMatchFound: Boolean(earliest),
    earliestViewId: earliest?.canonicalViewId ?? earliest?.id ?? null,
    earliestPhotoSessionId: earliest?.photoSessionId ?? null,
    comparisonMode: prior ? (earliest && earliest.id !== prior.id ? "journey_comparison" : "recent_comparison") : "new_pose_baseline",
    goalId,
    goalRelevance: identity.poseId === "front-relaxed" ? "primary" : "supporting",
    contributesToGoalValidation: identity.poseId === "front-relaxed",
    establishesBaseline: !prior,
    observations: [],
    limitingFactors: [],
    confidence: prior ? "moderate" : "baseline",
  };
}

export function buildPoseInterpretationModes({ session, sessions = [], goalId = null } = {}) {
  return (session?.views ?? []).filter(isQualifiedView).map((view) =>
    selectPoseAwareComparisons({ currentView: view, sessions, currentSessionId: session.id, goalId })
  );
}

export function isQualifiedView(view = {}) {
  return view.active !== false && !INACTIVE.has(view.status) && Boolean(view.imageHref ?? view.imageReference ?? view.storage_path);
}

export function photoPoseKey(view = {}) {
  return getProgressPhotoCategoryId(view.poseIdentity ?? view.pose ?? view);
}
