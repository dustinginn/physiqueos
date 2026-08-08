import { ForecastEngine } from "./ForecastEngine";
import { adaptPIV1AssessmentToPreviousForecastContext } from "./PIV1ForecastCompatibilityAdapter";
import { deepFreeze, uniqueStrings } from "./forecastRuntimeUtils";

export const FORECAST_SHADOW_VERSION = "forecast_shadow_v1";
const MAX_DIAGNOSTIC_BYTES = 4096;

export function isForecastShadowDiagnosticsEnabled(environment = process.env) {
  return environment.NODE_ENV !== "production" &&
    environment.PI_V2_FORECAST_SHADOW_DIAGNOSTICS === "true";
}

export function createForecastShadowService({
  engine = ForecastEngine,
  previousContextAdapter = adaptPIV1AssessmentToPreviousForecastContext,
  diagnosticSink = null,
  diagnosticsEnabled = isForecastShadowDiagnosticsEnabled(),
} = {}) {
  return Object.freeze({
    run(input = {}) {
      const canonicalInput = input.canonicalInput
        ? structuredClone(input.canonicalInput)
        : {
          goalContract: structuredClone(input.goalContract),
          structuredInterpretation: structuredClone(input.structuredInterpretation),
          previousForecastContext: input.previousForecastContext
            ? structuredClone(input.previousForecastContext)
            : input.v1PreviousAssessment
              ? previousContextAdapter(input.v1PreviousAssessment) : null,
        };
      const assessment = engine.forecast(canonicalInput);
      const diagnostics = createDiagnostics(
        canonicalInput.structuredInterpretation, assessment);
      if (diagnosticsEnabled && typeof diagnosticSink === "function") {
        const serialized = JSON.stringify(diagnostics);
        diagnosticSink(serialized.length <= MAX_DIAGNOSTIC_BYTES
          ? diagnostics
          : {
            schemaVersion: FORECAST_SHADOW_VERSION,
            status: "diagnostic_payload_bounded",
            forecastAssessmentId: assessment.id,
          });
      }
      return deepFreeze({
        schemaVersion: FORECAST_SHADOW_VERSION,
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
          notificationAttempted: false,
        },
      });
    },
  });
}

export const ForecastShadowService = createForecastShadowService();

function createDiagnostics(interpretation, assessment) {
  return {
    schemaVersion: FORECAST_SHADOW_VERSION,
    status: "comparison_available",
    interpretationId: interpretation.id,
    forecastAssessmentId: assessment.id,
    comparison: {
      objectiveStatus: interpretation.objectiveEvaluation.aggregateStatus,
      guardrailStatus: interpretation.guardrailEvaluation.aggregateStatus,
      strategyStatus: interpretation.strategyValidation.status,
      agreementStatus: interpretation.evidenceReconciliation.agreementStatus,
      qualityStatus: interpretation.evidenceReconciliation.quality.status,
      uncertaintyKinds: uniqueStrings(
        interpretation.remainingUncertainty.items.map((item) => item.kind)),
      goalForecastStatus: assessment.goalForecastStatus,
      confidenceBand: assessment.confidenceBand,
      forecastMovement: assessment.movement.direction,
    },
  };
}
