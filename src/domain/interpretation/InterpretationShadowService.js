import { InterpretationEngine } from "./InterpretationEngine";
import { adaptPIV1ToInterpretationInput } from "./PIV1InterpretationCompatibilityAdapter";
import { deepFreeze, uniqueStrings } from "./interpretationRuntimeUtils";

export const INTERPRETATION_SHADOW_VERSION = "interpretation_shadow_v1";
const MAX_DIAGNOSTIC_BYTES = 4096;

export function isInterpretationShadowDiagnosticsEnabled(environment = process.env) {
  return environment.NODE_ENV !== "production" &&
    environment.PI_V2_INTERPRETATION_SHADOW_DIAGNOSTICS === "true";
}

export function createInterpretationShadowService({
  engine = InterpretationEngine,
  adapter = adaptPIV1ToInterpretationInput,
  diagnosticSink = null,
  diagnosticsEnabled = isInterpretationShadowDiagnosticsEnabled(),
} = {}) {
  return Object.freeze({
    run(input = {}) {
      const canonicalInput = input.canonicalInput
        ? structuredClone(input.canonicalInput)
        : adapter(input.v1 ?? {});
      const interpretation = engine.interpret(canonicalInput);
      const diagnostics = createDiagnostics(input.v1, canonicalInput, interpretation);
      if (diagnosticsEnabled && typeof diagnosticSink === "function") {
        const serialized = JSON.stringify(diagnostics);
        diagnosticSink(serialized.length <= MAX_DIAGNOSTIC_BYTES
          ? diagnostics
          : { schemaVersion: INTERPRETATION_SHADOW_VERSION,
            status: "diagnostic_payload_bounded",
            interpretationId: interpretation.id });
      }
      return deepFreeze({
        schemaVersion: INTERPRETATION_SHADOW_VERSION,
        status: "shadow_completed",
        shadowOnly: true,
        interpretation,
        diagnostics,
        sideEffects: {
          persistenceAttempted: false,
          publicationAttempted: false,
          artifactMutationAttempted: false,
          presentationMutationAttempted: false,
        },
      });
    },
  });
}

export const InterpretationShadowService = createInterpretationShadowService();

function createDiagnostics(v1 = {}, canonicalInput, interpretation) {
  const assessment = v1?.assessment ?? {};
  const v1Directions = uniqueStrings((assessment.contributors ?? [])
    .map((item) => item.direction));
  return {
    schemaVersion: INTERPRETATION_SHADOW_VERSION,
    status: "comparison_available",
    interpretationId: interpretation.id,
    sourceAssessmentId: canonicalInput.compatibility?.sourceAssessmentId ??
      assessment.id ?? null,
    comparison: {
      v1Directions,
      v1LimitationCodes: uniqueStrings(assessment.reasoning?.limitations),
      v2ObjectiveStatus: interpretation.objectiveEvaluation.aggregateStatus,
      v2GuardrailStatus: interpretation.guardrailEvaluation.aggregateStatus,
      v2StrategyStatus: interpretation.strategyValidation.status,
      v2AgreementStatus: interpretation.evidenceReconciliation.agreementStatus,
      v2QualityStatus: interpretation.evidenceReconciliation.quality.status,
      v2UncertaintyKinds: uniqueStrings(
        interpretation.remainingUncertainty.items.map((item) => item.kind)),
      missingCompatibilityMetadata: canonicalInput.compatibility?.missingMetadata ?? [],
    },
  };
}
