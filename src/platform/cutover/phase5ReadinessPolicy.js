export const PHASE5_REQUIRED_READINESS_GATES = Object.freeze([
  "phase1Accepted", "phase2Accepted", "providerStagingAccepted", "phase3Accepted", "phase4Accepted",
  "providerCompositionPassed", "providerReadParityPassed", "providerCommandParityPassed", "concurrencyRetryPassed",
  "migrationTimingApproved", "productionRunbookComplete", "authenticationSequenceApproved", "backupPlanApproved",
  "rollbackMatrixApproved", "monitoringOwnershipApproved", "productionLineageApproved", "founderIntegrityProcessReady",
  "canonicalCollectionsKnown", "deterministicMigrationDefectsResolved", "deterministicParityDefectsResolved",
  "securityDefectsResolved", "providerCredentialsReady", "webFallbackProven", "safeDeploymentLifecycleRecorded",
  "livingDocumentationCurrent",
]);

export const PHASE5_AUTHENTICATION_SEQUENCE = Object.freeze([
  "migrate-canonical-data-and-media-with-production-auth-inactive",
  "cut-web-to-postgresql-through-temporary-legacy-web-compatibility-principal",
  "stabilize-web-and-verify-recovery-build",
  "generate-one-time-founder-recovery-credential-at-enrollment",
  "enroll-founder-web-passkey-and-create-web-session",
  "remove-legacy-compatibility-principal-after-authenticated-web-acceptance",
  "enable-ios-pairing-only-after-web-recovery-path-is-proven",
]);

export const PHASE5_SAFE_NEXT_LIFECYCLE = Object.freeze([
  "stop-canonical-production-process",
  "build-and-preflight-intended-commit-in-isolation",
  "atomically-promote-accepted-artifact",
  "restart-canonical-production-process",
  "verify-routes-assets-build-identity-and-runtime-ownership",
]);

export const PHASE5_API_COMPATIBILITY = Object.freeze({
  apiMajor: "v1",
  minimumSupportDays: 180,
  supportedAcceptedBuilds: 2,
  evolution: "additive",
  unknownEnumBehavior: "unsupported-state",
  unavailableCapabilityBehavior: "structured-error-with-web-fallback",
  forcedUpgradePolicy: "security-or-canonical-data-risk-only-after-replacement-acceptance",
});

export const PHASE5_ROLLBACK_MATRIX = Object.freeze({
  immediateRollback: Object.freeze(["production-route-failure", "static-asset-mismatch", "database-readiness-failure-before-write", "authentication-lockout", "cutover-window-exceeded-before-first-postgresql-write"]),
  pauseAndInvestigate: Object.freeze(["migration-manifest-mismatch", "missing-canonical-record", "relationship-mismatch", "media-hash-mismatch", "read-model-parity-failure", "write-command-failure", "unexpected-data-mutation", "unknown-canonical-source-collection"]),
  degradedOptionalFeature: Object.freeze(["optional-media-rendition-unavailable", "noncritical-briefing-regeneration-delayed"]),
  disableFeatureWithoutRollback: Object.freeze(["future-native-capability-failure", "future-notification-delivery-failure", "future-health-sync-failure", "future-share-extension-failure"]),
});

export function evaluatePhase5Readiness(evidence = {}) {
  const missing = PHASE5_REQUIRED_READINESS_GATES.filter((gate) => evidence[gate] !== true);
  return Object.freeze({ classification: missing.length === 0 ? "READY" : "BLOCKED", missing: Object.freeze(missing) });
}

export function classifyCutoverFailure(code, { postgresqlWriteAccepted = false } = {}) {
  if (postgresqlWriteAccepted && [...PHASE5_ROLLBACK_MATRIX.immediateRollback, ...PHASE5_ROLLBACK_MATRIX.pauseAndInvestigate].includes(code)) {
    return "pause-forward-fix-or-reviewed-reconciliation";
  }
  if (PHASE5_ROLLBACK_MATRIX.immediateRollback.includes(code)) return "immediate-rollback";
  if (PHASE5_ROLLBACK_MATRIX.pauseAndInvestigate.includes(code)) return "pause-and-investigate";
  if (PHASE5_ROLLBACK_MATRIX.degradedOptionalFeature.includes(code)) return "continue-degraded-optional-feature";
  if (PHASE5_ROLLBACK_MATRIX.disableFeatureWithoutRollback.includes(code)) return "disable-new-feature-no-canonical-rollback";
  return "pause-and-escalate-unknown-failure";
}
