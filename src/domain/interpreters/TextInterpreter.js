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
  const shouldParseWeight =
    expectedEvidenceType === null ||
    expectedEvidenceType === "auto" ||
    ["weight", "morning_weight"].includes(expectedEvidenceType);
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
  const morningWeight = shouldParseWeight ? createTypedWeightEvidence(evidence) : null;
  const evidenceObjects = [morningWeight, trainingSession, nutritionDay].filter(Boolean);

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

export function createTypedWeightEvidence(evidence = {}) {
  const text = String(evidence.text ?? "").trim().replace(/[’]/g, "'");
  if (!text || /\b(?:sets?|reps?|workout|exercise|deadlift|squat|press|row)\b/i.test(text)) return null;
  const patterns = [
    /^(?:today'?s\s+)?weight\s*(?:was|is|:)?\s*(\d{2,3}(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)?[.!]?$/i,
    /^weighed\s*(?:in\s*)?(?:at\s*)?(\d{2,3}(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)?[.!]?$/i,
    /^morning\s+weight\s*(?:was|is|:)?\s*(\d{2,3}(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)?[.!]?$/i,
    /^(\d{2,3}(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)[.!]?$/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  if (!match) return null;
  const value = Math.round(Number(match[1]) * 10) / 10;
  const unit = /kg/i.test(match[2] ?? "") ? "kg" : "lb";
  const valid = unit === "kg" ? value >= 22 && value <= 454 : value >= 50 && value <= 1000;
  if (!valid) return null;
  const observedAt = evidence.observedAt ?? evidence.measuredAt ?? evidence.capturedAt?.slice(0, 10) ?? null;
  const sourceRefs = evidence.sourceArtifactRefs ?? [evidence.provenanceRef ?? "typed_evidence_0"];
  return {
    id: evidence.id ? `${evidence.id}_morning_weight` : "manual_morning_weight",
    evidence_type: "morning_weight",
    observed_at: observedAt,
    value,
    unit,
    source: { modality: "manual", application: "Typed evidence", source_artifact_refs: sourceRefs },
    confidence: { extraction: "high", interpretation: "high" },
    quality: { status: "complete", limitations: [] },
    provenance: { source_artifact_refs: sourceRefs },
  };
}
