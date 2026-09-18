import { projectConfidenceV3 } from "./ConfidenceV3ProjectionService.js";
import { composeNarrativeV3 } from "./NarrativeV3CompositionService.js";
import { createStrategicInterpretationV3 } from "./StrategicInterpretationV3Engine.js";
import { selectStrategicallyEligibleEvidenceV3 } from "./EvidenceEligibilityV3.js";
import { V3_SCHEMA, deepFreeze, semanticFingerprint } from "./V3Runtime.js";

export function runConfidenceNarrativeV3({
  goalContract,
  observations,
  priorInterpretation = null,
  priorCoachingState = null,
  priorConfidence,
  priorNarrativePlan = null,
  evaluationContext,
  surface,
}) {
  const eligibility = selectStrategicallyEligibleEvidenceV3({
    goalContract,
    observations,
    evidenceCutoff: evaluationContext.evidenceCutoff,
  });
  const strategic = createStrategicInterpretationV3({
    goalContract,
    observations: eligibility.eligibleObservations,
    priorInterpretation,
    priorCoachingState,
    evaluationContext,
  });
  const confidence = projectConfidenceV3({
    goalContract,
    interpretation: strategic.interpretation,
    authorityBindings: strategic.authorityBindings,
    priorConfidence,
    evaluationContext,
  });
  const narrativePlan = composeNarrativeV3({
    goalContract,
    interpretation: strategic.interpretation,
    confidence,
    surface,
    priorNarrativePlan,
    evaluatedAt: evaluationContext.evaluatedAt,
  });
  const semantic = {
    schemaVersion: V3_SCHEMA.calibrationResult,
    goalContractId: goalContract.id,
    observationIds: eligibility.eligibleObservationIds,
    evidenceEligibility: eligibility,
    strategicInterpretation: strategic.interpretation,
    coachingState: strategic.coachingState,
    confidence,
    narrativePlan,
    publication: {
      mode: "calibration_only",
      persistenceWrites: 0,
      artifactWrites: 0,
      clientWiring: false,
    },
  };
  return deepFreeze({
    ...semantic,
    id: `confidence_narrative_v3_calibration|${semanticFingerprint(semantic).slice(7)}`,
  });
}
