import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";

export const PHASE4_DOMAIN_TABLES = Object.freeze({
  user: "canonical_user_records",
  nutritionContext: "canonical_user_records",
  goals: "canonical_goal_records",
  goalTransitionDrafts: "canonical_goal_records",
  goalProtocolTransitionDrafts: "canonical_goal_records",
  phaseReviewDecisions: "canonical_goal_records",
  phaseReviewTransactions: "canonical_goal_records",
  phaseStrategies: "canonical_goal_records",
  phaseExpectedTrajectories: "canonical_goal_records",
  phaseLifecycleReadModels: "canonical_goal_records",
  operatingPlan: "canonical_plan_records",
  energyStrategyLinks: "canonical_plan_records",
  protocols: "canonical_protocol_records",
  protocolVersions: "canonical_protocol_records",
  executionItems: "canonical_execution_records",
  reminders: "canonical_execution_records",
  weightEntries: "canonical_checkin_records",
  dailyCheckIns: "canonical_checkin_records",
  dexaScans: "canonical_evidence_records",
  progressPhotos: "canonical_evidence_records",
  evidencePackages: "canonical_evidence_records",
  evidenceReviews: "canonical_evidence_records",
  canonicalEvidenceObjects: "canonical_evidence_records",
  trainingPerformanceEvents: "canonical_training_records",
  trainingPerformanceEventBatches: "canonical_training_records",
  canonicalExerciseLibrary: "canonical_training_records",
  dailyBriefings: "canonical_briefing_records",
  briefingReconciliationWorkItems: "canonical_briefing_records",
  confidenceInitializationArtifacts: "canonical_confidence_records",
  analyses: "canonical_confidence_records",
  piEnergyConfidenceWorkItems: "canonical_confidence_records",
  piEnergyFinalizationReceipts: "canonical_confidence_records",
  piTrainingConfidenceWorkItems: "canonical_confidence_records",
  piTrainingFinalizationReceipts: "canonical_confidence_records",
  piLowerLevelConfidenceWorkerRuns: "canonical_confidence_records",
  migrationMarkers: "canonical_confidence_records",
  goalConfidenceSnapshots: "canonical_confidence_records",
  goalConfidenceHistory: "canonical_confidence_records",
  goalConfidenceContinuitySeeds: "canonical_confidence_records",
});

const missing = FOUNDATION_SOURCE_COLLECTIONS.filter((name) => !PHASE4_DOMAIN_TABLES[name]);
const extra = Object.keys(PHASE4_DOMAIN_TABLES).filter((name) => !FOUNDATION_SOURCE_COLLECTIONS.includes(name));
if (missing.length || extra.length) {
  throw new Error(`Phase 4 collection map is incomplete (missing=${missing.join(",")}; extra=${extra.join(",")}).`);
}

export const PHASE4_TABLE_COLLECTIONS = Object.freeze(
  Object.entries(PHASE4_DOMAIN_TABLES).reduce((result, [collection, table]) => {
    result[table] ??= [];
    result[table].push(collection);
    return result;
  }, {})
);

export function assertKnownPhase4Collection(name) {
  const table = PHASE4_DOMAIN_TABLES[name];
  if (!table) throw new Error(`Unsupported required canonical collection: ${name}.`);
  return table;
}
