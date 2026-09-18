import { deepFreeze, semanticFingerprint } from "./V3Runtime.js";

// Unwired server projection of the already-composed canonical assessment.
// No scoring, reason inference or client-side prose generation belongs here.
export function createHomeConfidenceV3Sample({ confidence, narrativePlan }) {
  const snapshot = narrativePlan.primaryConfidenceSnapshot;
  if (confidence.primaryDimension !== "goal_completion" || narrativePlan.confidenceAssessmentId !== confidence.id ||
    narrativePlan.strategicInterpretationId !== confidence.strategicInterpretationId ||
    snapshot.percentage !== confidence.currentPercentage || snapshot.delta !== confidence.delta || snapshot.movement !== confidence.movement) {
    throw new Error("Home Confidence requires a matching canonical Goal Confidence assessment and Narrative plan.");
  }
  const semantic = {
    schemaVersion: "home_confidence_v3_calibration_sample_v1",
    confidenceAssessmentId: confidence.id,
    strategicInterpretationId: narrativePlan.strategicInterpretationId,
    narrativePlanId: narrativePlan.id,
    primaryDimension: "goal_completion",
    latestMeaningfulConfidenceChange: narrativePlan.latestMeaningfulConfidenceChange,
    collapsed: { ...snapshot, label: "goal confidence", percentageLabel: `${snapshot.percentage}%`, directionSymbol: snapshot.delta > 0 ? "↑" : snapshot.delta < 0 ? "↓" : "—", movementLabel: snapshot.delta > 0 ? `up ${snapshot.delta} points` : snapshot.delta < 0 ? `down ${Math.abs(snapshot.delta)} points` : "unchanged" },
    expanded: { ...snapshot, heading: `Why confidence is ${snapshot.percentage}%`, explanation: narrativePlan.confidenceDeepExplanation },
    publication: { mode: "calibration_only", persistenceWrites: 0, artifactWrites: 0, clientWiring: false },
  };
  return deepFreeze({ ...semantic, id: `home_confidence_sample_v3|${semanticFingerprint(semantic).slice(7)}` });
}
