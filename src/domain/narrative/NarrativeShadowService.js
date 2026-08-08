import { NarrativeEngine } from "./NarrativeEngine";
import { deepFreeze } from "./narrativeRuntimeUtils";

export const NARRATIVE_SHADOW_VERSION = "narrative_shadow_v1";
const MAX_DIAGNOSTIC_BYTES = 4096;

export function isNarrativeShadowDiagnosticsEnabled(environment = process.env) {
  return environment.NODE_ENV !== "production" &&
    environment.PI_V2_NARRATIVE_SHADOW_DIAGNOSTICS === "true";
}

export function createNarrativeShadowService({
  engine = NarrativeEngine,
  diagnosticSink = null,
  diagnosticsEnabled = isNarrativeShadowDiagnosticsEnabled(),
} = {}) {
  return Object.freeze({
    run(input = {}) {
      const canonicalInput = input.canonicalInput
        ? structuredClone(input.canonicalInput)
        : {
          goalContract: structuredClone(input.goalContract),
          forecastAssessment: structuredClone(input.forecastAssessment),
        };
      const assessment = engine.explain(canonicalInput);
      const diagnostics = createDiagnostics(
        canonicalInput.forecastAssessment, assessment);
      if (diagnosticsEnabled && typeof diagnosticSink === "function") {
        const serialized = JSON.stringify(diagnostics);
        diagnosticSink(serialized.length <= MAX_DIAGNOSTIC_BYTES
          ? diagnostics
          : {
            schemaVersion: NARRATIVE_SHADOW_VERSION,
            status: "diagnostic_payload_bounded",
            narrativeAssessmentId: assessment.id,
          });
      }
      return deepFreeze({
        schemaVersion: NARRATIVE_SHADOW_VERSION,
        status: "shadow_completed",
        shadowOnly: true,
        assessment,
        diagnostics,
        sideEffects: {
          persistenceAttempted: false,
          publicationAttempted: false,
          artifactMutationAttempted: false,
          homeMutationAttempted: false,
          briefingMutationAttempted: false,
          presentationMutationAttempted: false,
          renderingAttempted: false,
          notificationAttempted: false,
        },
      });
    },
  });
}

export const NarrativeShadowService = createNarrativeShadowService();

function createDiagnostics(forecast, narrative) {
  return {
    schemaVersion: NARRATIVE_SHADOW_VERSION,
    status: "comparison_available",
    forecastAssessmentId: forecast.id,
    narrativeAssessmentId: narrative.id,
    comparison: {
      goalForecastStatus: forecast.goalForecastStatus,
      confidenceBand: forecast.confidenceBand,
      movement: forecast.movement.direction,
      coachingDirection: narrative.recommendedCoachingDirection.state,
      supportingFactorCount: narrative.primarySupportingFactors.length,
      limitingFactorCount: narrative.primaryLimitingFactors.length,
      uncertaintyStatus:
        narrative.remainingUncertaintyExplanation.status,
      nextEvidenceStatus:
        narrative.nextDecisiveEvidenceExplanation.status,
    },
  };
}
