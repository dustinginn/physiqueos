import { activationFingerprint } from "./GoalTransitionActivationCanonicalization";

export const ProductionBaselineReconciliationVersion =
  "goal_transition_activation_production_baseline_reconciliation_v1";

export const ProductionBaselineSectionClass = Object.freeze({
  ACTIVATION_CRITICAL: "activation_critical",
  EVIDENCE_INGESTION: "expected_evidence_ingestion",
  EVIDENCE_DERIVED: "expected_evidence_derived_processing",
  NORMAL_ACTIVITY: "unrelated_but_valid_normal_app_activity",
  UNEXPLAINED: "unexplained_drift",
});

const ACTIVATION_SECTIONS = Object.freeze({
  goals: (store) => store.goals ?? [],
  goalTransitionDrafts: (store) => store.goalTransitionDrafts ?? [],
  goalProtocolTransitionDrafts: (store) => store.goalProtocolTransitionDrafts ?? [],
  protocols: (store) => store.protocols ?? [],
  protocolVersions: (store) => store.protocolVersions ?? [],
  energyStrategyLinks: (store) => store.energyStrategyLinks ?? [],
  executionItems: (store) => store.executionItems ?? [],
  reminders: (store) => store.reminders ?? [],
  operatingPlan: (store) => store.operatingPlan ?? null,
  dailyBriefings: (store) => store.dailyBriefings ?? [],
  revisionMetadata: (store) => ({
    revision: store.revision ?? null,
    lastCommitId: store.lastCommitId ?? null,
  }),
});

const EVIDENCE_SECTIONS = Object.freeze({
  weightEntries: (store) => store.weightEntries ?? [],
  dexaScans: (store) => store.dexaScans ?? [],
  progressPhotos: (store) => store.progressPhotos ?? [],
  dailyCheckIns: (store) => store.dailyCheckIns ?? [],
  evidencePackages: (store) => store.evidencePackages ?? [],
  evidenceReviews: (store) => store.evidenceReviews ?? [],
  canonicalEvidenceObjects: (store) => store.canonicalEvidenceObjects ?? [],
});

const DERIVED_SECTIONS = Object.freeze({
  analyses: (store) => store.analyses ?? [],
});

const RELATIONSHIP_SECTIONS = Object.freeze({
  evidenceRelationships: (store) => store.evidenceRelationships ?? [],
});

const IGNORED_ROOT_FIELDS = new Set([
  "version",
  "updatedAt",
  ...Object.keys(ACTIVATION_SECTIONS),
  ...Object.keys(EVIDENCE_SECTIONS),
  ...Object.keys(DERIVED_SECTIONS),
  ...Object.keys(RELATIONSHIP_SECTIONS),
]);

export function captureProductionRuntimeSemanticBaseline(store = {}) {
  const activationSections = fingerprintSections(store, ACTIVATION_SECTIONS);
  const evidenceSections = fingerprintSections(store, EVIDENCE_SECTIONS);
  const evidenceRelationshipSections = fingerprintSections(store, RELATIONSHIP_SECTIONS);
  const derivedSections = fingerprintSections(store, DERIVED_SECTIONS);
  const otherSections = Object.fromEntries(
    Object.keys(store)
      .filter((key) => !IGNORED_ROOT_FIELDS.has(key))
      .sort()
      .map((key) => [key, describeSection(store[key])])
  );

  return Object.freeze({
    version: ProductionBaselineReconciliationVersion,
    activationSections,
    evidenceSections,
    evidenceRelationshipSections,
    derivedSections,
    otherSections,
    activationCriticalFingerprint: activationFingerprint(activationSections),
    evidenceFingerprint: activationFingerprint(evidenceSections),
    evidenceRelationshipFingerprint: activationFingerprint(evidenceRelationshipSections),
    briefingArtifactFingerprint: activationSections.dailyBriefings.fingerprint,
    wholeSemanticFingerprint: activationFingerprint({
      activationSections,
      evidenceSections,
      evidenceRelationshipSections,
      derivedSections,
      otherSections,
    }),
  });
}

export function compareProductionRuntimeSemanticBaselines({
  before,
  after,
  explainedSections = {},
} = {}) {
  const changes = [
    ...compareFamily(before?.activationSections, after?.activationSections,
      ProductionBaselineSectionClass.ACTIVATION_CRITICAL),
    ...compareFamily(before?.evidenceSections, after?.evidenceSections,
      ProductionBaselineSectionClass.EVIDENCE_INGESTION),
    ...compareFamily(before?.evidenceRelationshipSections, after?.evidenceRelationshipSections,
      ProductionBaselineSectionClass.EVIDENCE_INGESTION),
    ...compareFamily(before?.derivedSections, after?.derivedSections,
      ProductionBaselineSectionClass.EVIDENCE_DERIVED),
    ...compareFamily(before?.otherSections, after?.otherSections,
      ProductionBaselineSectionClass.UNEXPLAINED),
  ].map((change) => {
    const explanation = explainedSections[change.section];
    if (!explanation) return change;
    return {
      ...change,
      classification: explanation.classification ?? change.classification,
      attribution: explanation.attribution ?? null,
    };
  });
  const blockers = changes.filter((change) =>
    change.classification === ProductionBaselineSectionClass.ACTIVATION_CRITICAL
    || change.classification === ProductionBaselineSectionClass.UNEXPLAINED
    || !change.attribution
  );

  return Object.freeze({
    changed: changes.length > 0,
    changes,
    blockers,
    acceptable: blockers.length === 0,
  });
}

export function compareControlledProductionWindow({ before, after } = {}) {
  const fields = [
    "sha256",
    "size",
    "modifiedUtc",
    "updatedAt",
    "revision",
    "lastCommitId",
    "activationCriticalFingerprint",
    "evidenceFingerprint",
    "evidenceRelationshipFingerprint",
    "briefingArtifactFingerprint",
  ];
  const changedFields = fields.filter(
    (field) => (before?.[field] ?? null) !== (after?.[field] ?? null)
  );
  return Object.freeze({
    passed: changedFields.length === 0,
    changedFields,
  });
}

export function decideProductionBaselineLock({
  reconciliation,
  controlledWindow,
  activationStateValid,
  coordinatorNonInvolvement,
  regressionsPassed,
  productionBoundaryAbsent,
} = {}) {
  const blockingReasons = [];
  if (!reconciliation?.acceptable) blockingReasons.push("SEMANTIC_DRIFT_UNRECONCILED");
  if (!controlledWindow?.passed) blockingReasons.push("CONTROLLED_WINDOW_CHANGED");
  if (activationStateValid !== true) blockingReasons.push("ACTIVATION_STATE_INVALID");
  if (coordinatorNonInvolvement !== true) blockingReasons.push("COORDINATOR_INVOLVEMENT_NOT_EXCLUDED");
  if (regressionsPassed !== true) blockingReasons.push("REGRESSIONS_FAILED");
  if (productionBoundaryAbsent !== true) blockingReasons.push("PRODUCTION_BOUNDARY_PRESENT");
  return Object.freeze({
    result: blockingReasons.length === 0 ? "LOCKED" : "BLOCKED",
    blockingReasons,
  });
}

export function findActivationSignatures(store = {}, {
  targetGoalId,
  syntheticIdFragments = ["synthetic", "_future_", "activation_commit"],
} = {}) {
  const serialized = JSON.stringify(store);
  const signatures = [];
  if (targetGoalId && (store.goals ?? []).some((goal) => goal.id === targetGoalId)) {
    signatures.push("TARGET_GOAL_PRESENT");
  }
  if (Number.isSafeInteger(store.revision) && store.revision > 0) {
    signatures.push("MONOTONIC_REVISION_PRESENT");
  }
  if (store.lastCommitId) signatures.push("ACTIVATION_COMMIT_METADATA_PRESENT");
  for (const fragment of syntheticIdFragments) {
    if (serialized.includes(fragment)) signatures.push(`ID_FRAGMENT:${fragment}`);
  }
  return Object.freeze([...new Set(signatures)].sort());
}

function fingerprintSections(store, definitions) {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, select]) => [name, describeSection(select(store))])
  );
}

function describeSection(value) {
  return Object.freeze({
    count: Array.isArray(value) ? value.length : value == null ? 0 : 1,
    fingerprint: activationFingerprint(value),
  });
}

function compareFamily(before = {}, after = {}, classification) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((section) => before?.[section]?.fingerprint !== after?.[section]?.fingerprint)
    .map((section) => ({
      section,
      classification,
      attribution: null,
      before: before?.[section] ?? null,
      after: after?.[section] ?? null,
    }));
}
