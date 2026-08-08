import { ConfidencePublisherRegistry } from
  "../confidence/ConfidencePublisherRegistry";
import { resolveActiveGoalConfidencePresentation } from
  "./ActiveGoalConfidencePresentationReadService";

export const CONFIDENCE_NON_PUBLISHERS = Object.freeze([
  "daily", "energy", "training", "nutrition", "activity", "weight",
  "recovery", "raw_evidence_upload",
]);

export function diagnoseGoalConfidenceArchitecture(store, {
  dailyBriefing = null,
  homeConfidence = null,
} = {}) {
  const activeGoal = (store.goals ?? []).find(
    (goal) => goal.primary && goal.status === "active"
  ) ?? (store.goals ?? []).find((goal) => goal.status === "active") ?? null;
  const canonical = resolveActiveGoalConfidencePresentation({
    activeGoal,
    store,
  });
  const daily = dailyOwnership({ canonical, dailyBriefing, homeConfidence });

  return Object.freeze({
    canonical,
    storage: Object.freeze({
      persisted: true,
      snapshotCount: (store.goalConfidenceSnapshots ?? []).length,
      historyCount: (store.goalConfidenceHistory ?? []).length,
      currentAssessmentId: canonical.assessmentId,
    }),
    ownership: Object.freeze({
      readOwner: "ActiveGoalConfidencePresentationReadService",
      calculationOwner: "BriefingForecastFinalizer",
      persistenceOwner: "CanonicalBriefingConfidencePublicationService",
      legacyFallback: false,
      daily,
    }),
    publishers: Object.freeze({
      authorized: ConfidencePublisherRegistry.listAuthorizedPublishers(),
      nonPublishers: CONFIDENCE_NON_PUBLISHERS,
    }),
  });
}

function dailyOwnership({ canonical, dailyBriefing, homeConfidence }) {
  const dailyConfidence = dailyBriefing?.goalConfidence ?? null;
  const inspected = dailyBriefing != null;
  const sameAsCanonical = !inspected || Boolean(
    dailyConfidence?.assessmentId === canonical.assessmentId &&
    dailyConfidence?.value === canonical.value &&
    dailyBriefing?.hero?.confidence === canonical.value
  );
  const sameAsHome = !homeConfidence || Boolean(
    homeConfidence.assessmentId === canonical.assessmentId &&
    homeConfidence.value === canonical.value &&
    homeConfidence.movement === canonical.movement
  );
  return Object.freeze({
    readOwner: "ActiveGoalConfidencePresentationReadService",
    publisher: false,
    localGoalEvaluationDisplay: false,
    overallGoalConfidenceFallback: false,
    inspected,
    sameAssessmentAsCanonical: sameAsCanonical,
    sameAssessmentAsHome: sameAsHome,
    sameMovementAsHome: sameAsHome,
    assessmentId: dailyConfidence?.assessmentId ?? canonical.assessmentId,
    percentage: dailyBriefing?.hero?.confidence ?? canonical.value,
  });
}
