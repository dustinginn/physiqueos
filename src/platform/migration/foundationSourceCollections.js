export const FOUNDATION_COLLECTION_CONTRACT_VERSION = "founder-canonical-collections-v2";

export const FOUNDATION_REQUIRED_SOURCE_COLLECTIONS = Object.freeze([
  "user",
  "goals",
  "goalTransitionDrafts",
  "goalProtocolTransitionDrafts",
  "weightEntries",
  "dexaScans",
  "protocols",
  "protocolVersions",
  "energyStrategyLinks",
  "executionItems",
  "reminders",
  "nutritionContext",
  "operatingPlan",
  "progressPhotos",
  "dailyCheckIns",
  "dailyBriefings",
  "briefingReconciliationWorkItems",
  "confidenceInitializationArtifacts",
  "analyses",
  "evidencePackages",
  "evidenceReviews",
  "canonicalEvidenceObjects",
  "trainingPerformanceEvents",
  "trainingPerformanceEventBatches",
  "canonicalExerciseLibrary",
  "piEnergyConfidenceWorkItems",
  "piEnergyFinalizationReceipts",
  "piTrainingConfidenceWorkItems",
  "piTrainingFinalizationReceipts",
  "piLowerLevelConfidenceWorkerRuns",
  "migrationMarkers",
  "goalConfidenceSnapshots",
  "goalConfidenceHistory",
  "goalConfidenceContinuitySeeds",
  "phaseReviewDecisions",
  "phaseReviewTransactions",
  "phaseStrategies",
  "phaseExpectedTrajectories",
  "phaseLifecycleReadModels",
]);

export const FOUNDATION_OPTIONAL_SOURCE_COLLECTIONS = Object.freeze([]);

export const FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS = Object.freeze([
  Object.freeze({
    sourceCollection: "operatingRhythm",
    classification: "derived/noncanonical state",
    canonicalOwner: "src/data/founderSeed/operatingRhythm.js",
  }),
  Object.freeze({
    sourceCollection: "adaptiveTrustProfile",
    classification: "future-only/inactive design collection",
    canonicalOwner: null,
  }),
  Object.freeze({
    sourceCollection: "milestones",
    classification: "deprecated/retired collection",
    canonicalOwner: null,
  }),
]);

// Backwards-compatible name used by import/schema code. In contract v2 this is
// deliberately the persisted canonical set, not the hydrated runtime shape.
export const FOUNDATION_SOURCE_COLLECTIONS = FOUNDATION_REQUIRED_SOURCE_COLLECTIONS;

export const FOUNDATION_RUNTIME_METADATA_KEYS = Object.freeze([
  "version", "revision", "lastCommitId", "updatedAt", "importedAt",
]);

export function inspectFoundationSourceInventory(sourceObject) {
  const sourceKeys = new Set(Object.keys(sourceObject ?? {}));
  const requiredPresent = FOUNDATION_REQUIRED_SOURCE_COLLECTIONS.filter((name) => sourceKeys.has(name));
  const requiredMissing = FOUNDATION_REQUIRED_SOURCE_COLLECTIONS.filter((name) => !sourceKeys.has(name));
  const optionalPresent = FOUNDATION_OPTIONAL_SOURCE_COLLECTIONS.filter((name) => sourceKeys.has(name));
  const optionalAbsent = FOUNDATION_OPTIONAL_SOURCE_COLLECTIONS.filter((name) => !sourceKeys.has(name));
  const excluded = FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS.map((entry) => Object.freeze({
    ...entry,
    sourcePresent: sourceKeys.has(entry.sourceCollection),
  }));
  const known = new Set([
    ...FOUNDATION_RUNTIME_METADATA_KEYS,
    ...FOUNDATION_REQUIRED_SOURCE_COLLECTIONS,
    ...FOUNDATION_OPTIONAL_SOURCE_COLLECTIONS,
    ...FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS.map((entry) => entry.sourceCollection),
  ]);
  const unknown = [...sourceKeys].filter((name) => !known.has(name)).sort();
  return Object.freeze({
    contractVersion: FOUNDATION_COLLECTION_CONTRACT_VERSION,
    required: Object.freeze({ expectedCount: FOUNDATION_REQUIRED_SOURCE_COLLECTIONS.length, presentCount: requiredPresent.length, present: Object.freeze(requiredPresent), missing: Object.freeze(requiredMissing) }),
    optional: Object.freeze({ expectedCount: FOUNDATION_OPTIONAL_SOURCE_COLLECTIONS.length, presentCount: optionalPresent.length, present: Object.freeze(optionalPresent), absent: Object.freeze(optionalAbsent) }),
    excluded: Object.freeze(excluded),
    unknown: Object.freeze(unknown),
  });
}

export function assertFoundationSourceInventory(sourceObject) {
  const inventory = inspectFoundationSourceInventory(sourceObject);
  if (inventory.unknown.length) throw new Error(`Unknown runtime source keys: ${inventory.unknown.join(", ")}`);
  if (inventory.required.missing.length) throw new Error(`Runtime source is missing required collections: ${inventory.required.missing.join(", ")}`);
  return inventory;
}
