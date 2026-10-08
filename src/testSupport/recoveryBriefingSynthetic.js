// Synthetic Recovery publication authority for tests. Production has NO such
// record (absent = OFF); creating one is a separately authorized operation.
import { RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION } from "../domain/services/RecoveryBriefingPolicyV1.js";

export function recoveryAuthorityRecord(overrides = {}) {
  return {
    schemaVersion: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION,
    status: "enabled",
    cadences: ["weekly", "monthly"],
    effectiveFromPeriodStart: "2026-10-18",
    recoveryEffectiveSleepDay: "2026-10-02",
    strategicEvidenceEligibility: "excluded",
    historicalBackfill: false,
    artifactRewrite: false,
    publishBeforeBaselineEligible: false,
    authorizationRef: "synthetic-test-authority",
    ...overrides,
  };
}
