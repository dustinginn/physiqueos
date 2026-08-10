import {
  INTERPRETATION_ENGINE_VERSION,
  STRUCTURED_INTERPRETATION_VERSION,
} from "./InterpretationRuntimeContract";
import { reconcileInterpretationEvidence } from "./EvidenceReconciliationService";
import {
  evaluateInterpretationGuardrails,
  evaluateInterpretationObjectives,
} from "./GoalEvaluationService";
import { evaluateInterpretationStrategy } from "./StrategyValidationService";
import {
  createRemainingInterpretationUncertainty,
  selectNextDecisiveEvidence,
} from "./InterpretationUncertaintyService";
import { createStructuredInterpretation } from "./StructuredInterpretationModel";
import { attachNamedUncertaintyLifecycle } from "./EvidenceDurabilityService";
import {
  requiredTimestamp,
  semanticHash,
  uniqueStrings,
} from "./interpretationRuntimeUtils";

export function createInterpretationEngine() {
  return Object.freeze({
    interpret(input = {}) {
      const normalized = normalizeInput(input);
      const evidenceReconciliation = reconcileInterpretationEvidence(normalized);
      const objectiveEvaluation = evaluateInterpretationObjectives({
        ...normalized, evidenceReconciliation,
      });
      const guardrailEvaluation = evaluateInterpretationGuardrails({
        ...normalized, evidenceReconciliation,
      });
      const strategyValidation = evaluateInterpretationStrategy({
        strategyHypothesis: normalized.strategyHypothesis,
        executionState: normalized.executionState,
        evidenceReconciliation,
      });
      const initialUncertainty = createRemainingInterpretationUncertainty({
        ...normalized,
        objectiveEvaluation,
        guardrailEvaluation,
        strategyValidation,
        evidenceReconciliation,
      });
      const lifecycle = attachNamedUncertaintyLifecycle({
        remainingUncertainty: initialUncertainty,
        durability: evidenceReconciliation.durability,
        durabilityContext: normalized.durabilityContext,
      });
      const finalizedEvidenceReconciliation = {
        ...evidenceReconciliation,
        durability: lifecycle.durability,
      };
      const remainingUncertainty = lifecycle.remainingUncertainty;
      const nextDecisiveEvidence = selectNextDecisiveEvidence({
        goalContract: normalized.goalContract,
        remainingUncertainty,
      });
      const inputFingerprint = `sha256_${semanticHash({
        goalContract: normalized.goalContract,
        strategyHypothesis: normalized.strategyHypothesis,
        executionState: normalized.executionState,
        evidenceDescriptors: normalized.evidenceDescriptors,
        durabilityContext: normalized.durabilityContext,
        evaluationContext: {
          ...normalized.evaluationContext,
          interpretedAt: undefined,
        },
        compatibility: normalized.compatibility,
        engineVersion: INTERPRETATION_ENGINE_VERSION,
      })}`;
      const provenance = {
        goalContractFingerprint: normalized.goalContract.provenance?.inputFingerprint ??
          `sha256_${semanticHash(normalized.goalContract)}`,
        strategyFingerprint: `sha256_${semanticHash(normalized.strategyHypothesis)}`,
        executionRefs: uniqueStrings(normalized.executionState.refs),
        evidenceRefs: normalized.evidenceDescriptors.map((item) => item.id).sort(),
        sourceObservationIds: uniqueStrings(normalized.evidenceDescriptors
          .flatMap((item) => item.sourceObservationIds ?? [])),
        sourceClaimIds: uniqueStrings(normalized.evidenceDescriptors
          .flatMap((item) => item.sourceClaimIds ?? [])),
        inputFingerprint,
        engineVersion: INTERPRETATION_ENGINE_VERSION,
      };
      return createStructuredInterpretation({
        contractVersion: STRUCTURED_INTERPRETATION_VERSION,
        goalRef: {
          goalId: normalized.goalContract.goal.goalId,
          goalContractVersion: normalized.goalContract.contractVersion,
          goalContractId: normalized.goalContract.contractId ?? null,
        },
        strategyRef: {
          strategyId: normalized.strategyHypothesis.strategyRef?.strategyId ?? null,
          strategyVersion: normalized.strategyHypothesis.strategyRef?.strategyVersion ?? null,
          hypothesisId: normalized.strategyHypothesis.hypothesisId ?? null,
        },
        evaluationContext: normalized.evaluationContext,
        objectiveEvaluation,
        guardrailEvaluation,
        strategyValidation,
        evidenceReconciliation: finalizedEvidenceReconciliation,
        remainingUncertainty,
        nextDecisiveEvidence,
        interpretationSummary: {
          outcome: objectiveEvaluation.aggregateStatus,
          expectationMatch: objectiveEvaluation.aggregateStatus,
          strategyResult: strategyValidation.status,
          guardrailResult: guardrailEvaluation.aggregateStatus,
          evidenceResult: finalizedEvidenceReconciliation.agreementStatus,
          uncertaintyResult: remainingUncertainty.status,
        },
        provenance,
      });
    },
  });
}

export const InterpretationEngine = createInterpretationEngine();

function normalizeInput(input) {
  const goalContract = structuredClone(input.goalContract ?? {});
  if (!goalContract.goal?.goalId || !goalContract.contractVersion) {
    throw new Error("Interpretation requires a versioned Goal Contract identity.");
  }
  if (!Array.isArray(goalContract.objectives) ||
      !Array.isArray(goalContract.guardrails) ||
      !Array.isArray(goalContract.relevantEvidence?.entries)) {
    throw new Error("Interpretation requires Goal Objectives, Guardrails, and evidence map arrays.");
  }
  const strategyHypothesis = structuredClone(input.strategyHypothesis ??
    goalContract.strategyHypothesis ?? {});
  const executionState = structuredClone(input.executionState ?? {
    adequacy: "unknown", elapsedTimeAdequacy: "unknown", refs: [],
  });
  const evidenceDescriptors = structuredClone(input.evidenceDescriptors ?? [])
    .sort((left, right) => String(left?.id ?? "")
      .localeCompare(String(right?.id ?? "")));
  const evaluationContext = {
    type: input.evaluationContext?.type ?? "shadow_evaluation",
    windowStart: input.evaluationContext?.windowStart ?? null,
    evidenceCutoff: requiredTimestamp(
      input.evaluationContext?.evidenceCutoff, "evaluationContext.evidenceCutoff"),
    interpretedAt: requiredTimestamp(
      input.evaluationContext?.interpretedAt, "evaluationContext.interpretedAt"),
    priorInterpretationId: input.evaluationContext?.priorInterpretationId ?? null,
    trajectorySegmentId: input.evaluationContext?.trajectorySegmentId ?? null,
    elapsedTimeAdequacy: input.evaluationContext?.elapsedTimeAdequacy ?? "unknown",
  };
  const durabilityContext = normalizeDurabilityContext(input.durabilityContext);
  return {
    goalContract,
    strategyHypothesis,
    executionState,
    evidenceDescriptors,
    evaluationContext,
    durabilityContext,
    compatibility: structuredClone(input.compatibility ?? { missingMetadata: [] }),
  };
}

function normalizeDurabilityContext(value = {}) {
  return structuredClone({
    currentPeriod: value.currentPeriod ?? null,
    priorPeriods: [...(value.priorPeriods ?? [])].sort((left, right) =>
      String(left?.id ?? "").localeCompare(String(right?.id ?? ""))),
    previousDurability: value.previousDurability ?? null,
    previousUncertaintyKeys: [...new Set(
      (value.previousUncertaintyKeys ?? []).map(String))].sort(),
    uncertaintyComparisonSafe: value.uncertaintyComparisonSafe === true,
  });
}
