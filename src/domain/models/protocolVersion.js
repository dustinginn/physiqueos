export const ProtocolVersionStatus = {
  ACTIVE: "active",
  SUPERSEDED: "superseded",
};

export function createProtocolVersion(data = {}) {
  return {
    id: "",
    protocolId: "",
    versionNumber: 1,
    status: ProtocolVersionStatus.ACTIVE,
    effectiveAt: "",
    endedAt: null,
    author: {
      type: "user",
      id: "",
      displayName: "",
    },
    change: {
      reason: "",
      changedFields: [],
      previousVersionId: null,
    },
    goalLinks: [],
    phaseContext: null,
    intent: {
      summary: "",
    },
    expectations: [],
    evaluationWindows: [],
    coachingPolicy: {},
    reviewTriggers: [],
    evidenceBasis: {},
    confirmation: {},
    createdAt: "",
    ...data,
  };
}

export function validateProtocolVersion(version = {}) {
  const errors = [];

  if (!version.id) errors.push("Protocol version id is required.");
  if (!version.protocolId) errors.push("Protocol id is required.");
  if (!Number.isInteger(version.versionNumber) || version.versionNumber < 1) {
    errors.push("Protocol version number must be a positive integer.");
  }
  if (!version.effectiveAt) errors.push("Effective date is required.");
  if (!version.author?.id || !version.author?.displayName) {
    errors.push("Protocol author is required.");
  }
  if (!version.intent?.summary) errors.push("Protocol intent is required.");
  if (!version.confirmation?.confirmedByUser) {
    errors.push("Explicit user confirmation is required.");
  }

  return { valid: errors.length === 0, errors };
}
