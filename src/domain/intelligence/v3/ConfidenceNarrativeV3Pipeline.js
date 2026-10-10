import { projectConfidenceV3 } from "./ConfidenceV3ProjectionService.js";
import { composeNarrativeV3 } from "./NarrativeV3CompositionService.js";
import { createStrategicInterpretationV3 } from "./StrategicInterpretationV3Engine.js";
import { selectStrategicallyEligibleEvidenceV3 } from "./EvidenceEligibilityV3.js";
import { V3_SCHEMA, deepFreeze, semanticFingerprint } from "./V3Runtime.js";
import { evaluateGoalAdaptationShadow, shadowInputsFromV3 } from "../../goalAdaptation/GoalAdaptationShadowEvaluator.js";

export function runConfidenceNarrativeV3({
  goalContract,
  observations,
  priorInterpretation = null,
  priorCoachingState = null,
  priorConfidence,
  priorNarrativePlan = null,
  evaluationContext,
  surface,
  briefingIntelligence = null,
  // Goal Adaptation Phase A (dormant). Only the shadow dry-run and tests pass
  // this; no production caller does, so published output is unchanged. When
  // present, the post-projection adaptation ladder runs on this evaluation's
  // own trajectory and guardrail findings and is returned beside (never
  // inside) the semantic result: it does not alter the recommendation,
  // Goal Confidence, narrative or the result id.
  goalAdaptationShadow = null,
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
    // The shared evidence picture also reads the eligible observations (for
    // example, qualitative photo comparisons) alongside period intelligence.
    ...(briefingIntelligence ? { briefingIntelligence, observations: eligibility.eligibleObservations } : {}),
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
  const adaptation = goalAdaptationShadow ? evaluateGoalAdaptationShadow({
    ...goalAdaptationShadow,
    ...shadowInputsFromV3({ goalContract, interpretation: strategic.interpretation, confidence }),
  }) : null;
  return deepFreeze({
    ...semantic,
    id: `confidence_narrative_v3_calibration|${semanticFingerprint(semantic).slice(7)}`,
    ...(adaptation ? { goalAdaptationShadow: adaptation } : {}),
  });
}
