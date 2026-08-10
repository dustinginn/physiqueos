import {
  createPILowerLevelCanonicalEvidenceCommitService,
} from "./PILowerLevelCanonicalEvidenceCommitService";

// Canonical evidence confirmation has one Founder transaction boundary. The
// existing lower-level coordinator remains an optional participant, while the
// briefing reconciliation participant is always active.
export function createCanonicalEvidenceConfirmationCommitService(options = {}) {
  return createPILowerLevelCanonicalEvidenceCommitService(options);
}
