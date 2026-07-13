import { createNutritionDayEvidenceFromText } from "../models/nutritionDayEvidence";
import { createTrainingSessionEvidenceFromText } from "../models/trainingSessionEvidence";

export function interpretTextEvidence(evidence = {}) {
  const expectedEvidenceType = evidence.expectedEvidenceType ?? evidence.evidenceType ?? null;
  const shouldParseTraining =
    expectedEvidenceType === null ||
    expectedEvidenceType === "auto" ||
    expectedEvidenceType === "training";
  const shouldParseNutrition =
    expectedEvidenceType === null ||
    expectedEvidenceType === "auto" ||
    expectedEvidenceType === "nutrition";
  const trainingSession = shouldParseTraining
    ? createTrainingSessionEvidenceFromText({
        capturedAt: evidence.capturedAt ?? null,
        id: evidence.id ? `${evidence.id}_training_session` : "manual_training_session",
        observedAt: evidence.observedAt ?? evidence.measuredAt ?? null,
        provenanceRef: evidence.provenanceRef ?? "typed_evidence_0",
        sourceArtifactRefs: evidence.sourceArtifactRefs ?? [evidence.provenanceRef ?? "typed_evidence_0"],
        sourceModality: "manual",
        text: evidence.text,
      })
    : null;
  const nutritionDay = shouldParseNutrition
    ? createNutritionDayEvidenceFromText({
        capturedAt: evidence.capturedAt ?? null,
        date: evidence.observedAt ?? evidence.measuredAt ?? null,
        id: evidence.id ? `${evidence.id}_nutrition_day` : "manual_nutrition_day",
        provenanceRef: evidence.provenanceRef ?? "typed_evidence_0",
        sourceArtifactRefs: evidence.sourceArtifactRefs ?? [evidence.provenanceRef ?? "typed_evidence_0"],
        sourceModality: "manual",
        text: evidence.text,
      })
    : null;
  const evidenceObjects = [trainingSession, nutritionDay].filter(Boolean);

  return {
    sourceId: evidence.id ?? "",
    sourceType: evidence.type ?? "text",
    facts: evidence.text ? [evidence.text] : [],
    evidenceObjects,
    observations: [],
    recommendations: [],
    confidence: evidenceObjects.length > 0 ? "moderate" : "pending",
    status: evidenceObjects.length > 0 ? "structured" : "stub",
  };
}
