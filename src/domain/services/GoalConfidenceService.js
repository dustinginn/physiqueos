export function createGoalConfidenceService() {
  return {
    calculateGoalConfidence({
      confidenceFactors = [],
      evidence = {},
      findings = [],
      missingEvidence = [],
    } = {}) {
      const factorImpact = confidenceFactors.reduce(
        (total, factor) => total + (factor.impact ?? 0),
        0
      );
      const evidenceImpact = getEvidenceImpact(evidence);
      const agreementImpact = getAgreementImpact(findings);
      const missingEvidencePenalty = Math.min(missingEvidence.length * 2, 8);
      const value = clamp(
        52 + factorImpact + evidenceImpact + agreementImpact - missingEvidencePenalty,
        0,
        97
      );

      return {
        value,
        label: getConfidenceLabel(value),
        factors: confidenceFactors,
        evidenceImpact,
        agreementImpact,
        missingEvidence,
      };
    },
  };
}

export const GoalConfidenceService = createGoalConfidenceService();

function getEvidenceImpact({
  dexaScanCount = 0,
  weightEntryCount = 0,
  progressPhotoCount = 0,
  protocolCount = 0,
} = {}) {
  return (
    clamp(dexaScanCount, 0, 6) +
    clamp(Math.floor(weightEntryCount / 5), 0, 6) +
    clamp(Math.floor(progressPhotoCount / 3), 0, 4) +
    (protocolCount > 0 ? 2 : 0)
  );
}

function getAgreementImpact(findings = []) {
  const positive = findings.filter((finding) => finding.status === "positive").length;
  const risks = findings.filter((finding) => finding.status === "risk").length;

  return clamp(positive * 2 - risks * 4, -10, 10);
}

function getConfidenceLabel(confidence) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";

  return "Building";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
