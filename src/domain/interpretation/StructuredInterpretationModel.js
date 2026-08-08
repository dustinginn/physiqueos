import {
  EvidenceAgreementStatus,
  EvidenceQualityStatus,
  GuardrailStatus,
  ObjectiveStatus,
  StrategyValidationStatus,
  STRUCTURED_INTERPRETATION_VERSION,
  enumSet,
} from "./InterpretationRuntimeContract";
import {
  assertEnum,
  deepFreeze,
  requiredText,
  requiredTimestamp,
  semanticHash,
  stableSerialize,
  uniqueStrings,
} from "./interpretationRuntimeUtils";

const OBJECTIVES = enumSet(ObjectiveStatus);
const GUARDRAILS = enumSet(GuardrailStatus);
const STRATEGIES = enumSet(StrategyValidationStatus);
const AGREEMENTS = enumSet(EvidenceAgreementStatus);
const QUALITY = enumSet(EvidenceQualityStatus);
const FORBIDDEN_OUTPUT_KEY = /(score|confidence|forecast|narrative|publication|presentation|coaching|recommendation)/i;

export function createStructuredInterpretation(input = {}) {
  rejectForbiddenOutput(input);
  const contractVersion = input.contractVersion ?? STRUCTURED_INTERPRETATION_VERSION;
  if (contractVersion !== STRUCTURED_INTERPRETATION_VERSION) {
    throw new Error("Unsupported Structured Interpretation version.");
  }
  const goalRef = {
    goalId: requiredText(input.goalRef?.goalId, "goalRef.goalId"),
    goalContractVersion: requiredText(
      input.goalRef?.goalContractVersion, "goalRef.goalContractVersion"),
    goalContractId: input.goalRef?.goalContractId ?? null,
  };
  const strategyRef = {
    strategyId: input.strategyRef?.strategyId ?? null,
    strategyVersion: input.strategyRef?.strategyVersion ?? null,
    hypothesisId: input.strategyRef?.hypothesisId ?? null,
  };
  const evaluationContext = {
    type: requiredText(input.evaluationContext?.type, "evaluationContext.type"),
    windowStart: input.evaluationContext?.windowStart ?? null,
    evidenceCutoff: requiredTimestamp(
      input.evaluationContext?.evidenceCutoff, "evaluationContext.evidenceCutoff"),
    interpretedAt: requiredTimestamp(
      input.evaluationContext?.interpretedAt, "evaluationContext.interpretedAt"),
    priorInterpretationId: input.evaluationContext?.priorInterpretationId ?? null,
  };
  assertEnum(input.objectiveEvaluation?.aggregateStatus, OBJECTIVES,
    "objective aggregate status");
  input.objectiveEvaluation?.conclusions?.forEach((item) =>
    assertEnum(item.status, OBJECTIVES, "objective status"));
  assertEnum(input.guardrailEvaluation?.aggregateStatus, GUARDRAILS,
    "guardrail aggregate status");
  input.guardrailEvaluation?.conclusions?.forEach((item) =>
    assertEnum(item.status, GUARDRAILS, "guardrail status"));
  assertEnum(input.strategyValidation?.status, STRATEGIES,
    "strategy validation status");
  assertEnum(input.evidenceReconciliation?.agreementStatus, AGREEMENTS,
    "evidence agreement status");
  assertEnum(input.evidenceReconciliation?.quality?.status, QUALITY,
    "evidence quality status");
  const provenance = {
    goalContractFingerprint: requiredText(
      input.provenance?.goalContractFingerprint,
      "provenance.goalContractFingerprint"
    ),
    strategyFingerprint: requiredText(
      input.provenance?.strategyFingerprint,
      "provenance.strategyFingerprint"
    ),
    executionRefs: uniqueStrings(input.provenance?.executionRefs),
    evidenceRefs: uniqueStrings(input.provenance?.evidenceRefs),
    sourceObservationIds: uniqueStrings(input.provenance?.sourceObservationIds),
    sourceClaimIds: uniqueStrings(input.provenance?.sourceClaimIds),
    inputFingerprint: requiredText(
      input.provenance?.inputFingerprint, "provenance.inputFingerprint"),
    engineVersion: requiredText(input.provenance?.engineVersion,
      "provenance.engineVersion"),
  };
  const semantic = {
    contractVersion,
    goalRef,
    strategyRef,
    evaluationContext: {
      type: evaluationContext.type,
      windowStart: evaluationContext.windowStart,
      evidenceCutoff: evaluationContext.evidenceCutoff,
      priorInterpretationId: evaluationContext.priorInterpretationId,
    },
    objectiveEvaluation: input.objectiveEvaluation,
    guardrailEvaluation: input.guardrailEvaluation,
    strategyValidation: input.strategyValidation,
    evidenceReconciliation: input.evidenceReconciliation,
    remainingUncertainty: input.remainingUncertainty,
    nextDecisiveEvidence: input.nextDecisiveEvidence,
    interpretationSummary: input.interpretationSummary,
    inputFingerprint: provenance.inputFingerprint,
  };
  const expectedId = `structured_interpretation|${semanticHash(semantic)}`;
  if (input.id && input.id !== expectedId) {
    throw new Error("Structured Interpretation identity mismatch.");
  }
  return deepFreeze({
    contractVersion,
    id: expectedId,
    goalRef,
    strategyRef,
    evaluationContext,
    objectiveEvaluation: structuredClone(input.objectiveEvaluation),
    guardrailEvaluation: structuredClone(input.guardrailEvaluation),
    strategyValidation: structuredClone(input.strategyValidation),
    evidenceReconciliation: structuredClone(input.evidenceReconciliation),
    remainingUncertainty: structuredClone(input.remainingUncertainty),
    nextDecisiveEvidence: structuredClone(input.nextDecisiveEvidence),
    interpretationSummary: structuredClone(input.interpretationSummary),
    provenance,
  });
}

export function validateStructuredInterpretation(value) {
  const rebuilt = createStructuredInterpretation(value);
  if (stableSerialize(rebuilt) !== stableSerialize(value)) {
    throw new Error("Structured Interpretation is not canonical.");
  }
  return true;
}

function rejectForbiddenOutput(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_OUTPUT_KEY.test(key)) {
      throw new Error(`Structured Interpretation cannot contain ${key}.`);
    }
    rejectForbiddenOutput(child);
  }
}
