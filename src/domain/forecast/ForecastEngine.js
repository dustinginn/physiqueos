import { validateStructuredInterpretation } from "../interpretation/StructuredInterpretationModel";
import { createForecastAssessment } from "./ForecastAssessmentModel";
import {
  createForecastExplanation,
  evaluateGoalForecast,
} from "./ForecastEvaluationService";
import { evaluateForecastMilestones } from "./ForecastMilestoneService";
import { determineForecastMovement } from "./ForecastMovementService";
import {
  FORECAST_ASSESSMENT_VERSION,
  FORECAST_ENGINE_VERSION,
  FORECAST_PRODUCTION_ENGINE_VERSION,
} from "./ForecastRuntimeContract";
import { evaluateForecastTimeline } from "./ForecastTimelineService";
import { evaluateGoalAttainability } from "./GoalAttainabilityService";
import { semanticHash, uniqueStrings } from "./forecastRuntimeUtils";

const INPUT_KEYS = new Set([
  "goalContract", "structuredInterpretation", "previousForecastContext",
]);

export function createForecastEngine({ runtimeMode = "shadow" } = {}) {
  if (!["shadow", "production"].includes(runtimeMode)) {
    throw new Error("Forecast runtime mode is invalid.");
  }
  const engineVersion = runtimeMode === "production"
    ? FORECAST_PRODUCTION_ENGINE_VERSION
    : FORECAST_ENGINE_VERSION;
  return Object.freeze({
    forecast(input = {}) {
      const normalized = normalizeInput(input);
      const timeline = evaluateForecastTimeline(
        normalized.goalContract, normalized.structuredInterpretation);
      const milestoneForecasts = evaluateForecastMilestones(normalized);
      const goalAttainability = evaluateGoalAttainability({
        goalContract: normalized.goalContract, timeline,
      });
      const interpretationSemanticFingerprint =
        createInterpretationSemanticFingerprint(
          normalized.structuredInterpretation, normalized.goalContract,
          timeline, goalAttainability);
      const evaluated = evaluateGoalForecast({
        ...normalized, timeline, milestoneForecasts, goalAttainability,
      });
      const evaluation = stabilizeForecastForUnchangedInterpretation({
        evaluation: evaluated,
        previousForecastContext: normalized.previousForecastContext,
        interpretationSemanticFingerprint,
      });
      const movement = determineForecastMovement({
        ...evaluation,
        currentStrategyRevision:
          normalized.structuredInterpretation.strategyRef.strategyVersion,
        interpretationSemanticFingerprint,
        previousForecastContext: normalized.previousForecastContext,
        structuredInterpretation: normalized.structuredInterpretation,
      });
      const forecastExplanation = createForecastExplanation({
        structuredInterpretation: normalized.structuredInterpretation,
        evaluation,
        timeline,
        milestoneForecasts,
        movement,
      });
      const inputFingerprint = `sha256_${semanticHash({
        goalContract: normalized.goalContract,
        interpretationRef: normalized.structuredInterpretation.id,
        interpretationFingerprint:
          normalized.structuredInterpretation.provenance.inputFingerprint,
        previousForecastContext: normalized.previousForecastContext,
        engineVersion,
      })}`;
      return createForecastAssessment({
        contractVersion: FORECAST_ASSESSMENT_VERSION,
        goalRef: normalized.structuredInterpretation.goalRef,
        strategyRef: normalized.structuredInterpretation.strategyRef,
        assessmentContext: {
          evidenceCutoff: normalized.structuredInterpretation.evaluationContext
            .evidenceCutoff,
          assessedAt: normalized.structuredInterpretation.evaluationContext
            .interpretedAt,
          timelinePhase: timeline.phase,
        },
        goalForecastStatus: evaluation.goalForecastStatus,
        confidenceBand: evaluation.confidenceBand,
        forecastDirection: evaluation.forecastDirection,
        movement,
        timeline,
        trajectoryForecast: evaluation.trajectoryForecast,
        objectiveForecasts: evaluation.objectiveForecasts,
        guardrailForecasts: evaluation.guardrailForecasts,
        milestoneForecasts,
        forecastExplanation,
        remainingUncertainty: forecastUncertainty(
          normalized.structuredInterpretation.remainingUncertainty),
        nextDecisiveEvidence: forecastNextEvidence(
          normalized.structuredInterpretation.nextDecisiveEvidence),
        interpretationRef: normalized.structuredInterpretation.id,
        forecastMetadata: {
          engineVersion,
          shadowOnly: runtimeMode === "shadow",
          goalContractFingerprint: normalized.goalContract.provenance
            ?.inputFingerprint ?? `sha256_${semanticHash(normalized.goalContract)}`,
          interpretationFingerprint:
            normalized.structuredInterpretation.provenance.inputFingerprint,
          interpretationSemanticFingerprint,
          previousForecastRef:
            normalized.previousForecastContext?.priorForecastRef ?? null,
          previousContextAdapterVersion: normalized.previousForecastContext
            ?.compatibility?.adapterVersion ?? null,
          previousContextMissingSemantics: uniqueStrings(
            normalized.previousForecastContext?.compatibility?.missingSemantics),
          inputFingerprint,
        },
      });
    },
  });
}

export const ForecastEngine = createForecastEngine();

function normalizeInput(input) {
  const unexpected = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unexpected.length) {
    throw new Error(`Forecast accepts no input field: ${unexpected.sort()[0]}.`);
  }
  const structuredInterpretation = structuredClone(
    input.structuredInterpretation ?? {});
  validateStructuredInterpretation(structuredInterpretation);
  const goalContract = normalizeGoalContract(input.goalContract);
  if (goalContract.goal.goalId !== structuredInterpretation.goalRef.goalId ||
      goalContract.contractVersion !==
        structuredInterpretation.goalRef.goalContractVersion ||
      goalContract.contractId !== structuredInterpretation.goalRef.goalContractId) {
    throw new Error("Forecast Goal Contract and Interpretation identity mismatch.");
  }
  validateGoalConclusionCoverage(goalContract, structuredInterpretation);
  const previousForecastContext = normalizePreviousForecastContext(
    input.previousForecastContext);
  if (previousForecastContext?.goalId &&
      previousForecastContext.goalId !== goalContract.goal.goalId) {
    throw new Error("Previous Forecast Context belongs to a different Goal.");
  }
  return { goalContract, structuredInterpretation, previousForecastContext };
}

function validateGoalConclusionCoverage(goalContract, interpretation) {
  const objectiveIds = uniqueStrings(goalContract.objectives.map((item) =>
    item.objectiveId));
  const interpretedObjectiveIds = uniqueStrings(
    interpretation.objectiveEvaluation.conclusions.map((item) => item.objectiveId));
  const guardrailIds = uniqueStrings(goalContract.guardrails.map((item) =>
    item.guardrailId));
  const interpretedGuardrailIds = uniqueStrings(
    interpretation.guardrailEvaluation.conclusions.map((item) => item.guardrailId));
  if (JSON.stringify(objectiveIds) !== JSON.stringify(interpretedObjectiveIds) ||
      JSON.stringify(guardrailIds) !== JSON.stringify(interpretedGuardrailIds)) {
    throw new Error("Forecast Goal conclusions do not match the Goal Contract.");
  }
}

function normalizePreviousForecastContext(value) {
  if (!value) return null;
  const allowed = new Set([
    "contextVersion", "sourceType", "priorForecastRef", "goalId",
    "strategyRevision", "assessedAt", "goalForecastStatus", "confidenceBand",
    "forecastDirection", "movementDirection",
    "interpretationSemanticFingerprint", "compatibility",
  ]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new Error(
      `Previous Forecast Context cannot contain ${unexpected.sort()[0]}.`);
  }
  return structuredClone({
    contextVersion: value.contextVersion ?? "previous_forecast_context_unknown",
    sourceType: value.sourceType ?? "unknown",
    priorForecastRef: value.priorForecastRef ?? null,
    goalId: value.goalId ?? null,
    strategyRevision: value.strategyRevision ?? null,
    assessedAt: value.assessedAt ?? null,
    goalForecastStatus: value.goalForecastStatus ?? "unknown",
    confidenceBand: value.confidenceBand ?? "unknown",
    forecastDirection: value.forecastDirection ?? "indeterminate",
    movementDirection: value.movementDirection ?? "no_meaningful_change",
    interpretationSemanticFingerprint:
      value.interpretationSemanticFingerprint ?? null,
    compatibility: {
      adapterVersion: value.compatibility?.adapterVersion ?? null,
      missingSemantics: uniqueStrings(value.compatibility?.missingSemantics),
      inferredSemantics: uniqueStrings(value.compatibility?.inferredSemantics),
      ignoredLegacyFields: uniqueStrings(value.compatibility?.ignoredLegacyFields),
      sourceFingerprint: value.compatibility?.sourceFingerprint ?? null,
    },
  });
}

function createInterpretationSemanticFingerprint(interpretation, goalContract,
  timeline, goalAttainability) {
  return `sha256_${semanticHash({
    objectives: interpretation.objectiveEvaluation.conclusions.map((item) => ({
      objectiveId: item.objectiveId,
      status: item.status,
      expectationRef: item.expectationRef,
      elapsedTimeAdequacy: item.elapsedTimeAdequacy,
      observedResult: item.observedResult,
    })),
    guardrails: interpretation.guardrailEvaluation.conclusions.map((item) => ({
      guardrailId: item.guardrailId,
      status: item.status,
      observedResult: item.observedResult,
    })),
    strategyStatus: interpretation.strategyValidation.status,
    agreementStatus: interpretation.evidenceReconciliation.agreementStatus,
    qualityStatus: interpretation.evidenceReconciliation.quality.status,
    durability: semanticDurability(
      interpretation.evidenceReconciliation.durability),
    uncertainty: {
      status: interpretation.remainingUncertainty.status,
      items: interpretation.remainingUncertainty.items.map((item) => ({
        kind: item.kind,
        question: item.question,
        cause: item.cause,
        materiality: item.materiality,
        reducibility: item.reducibility,
      })),
    },
    nextDecisiveEvidence: {
      status: interpretation.nextDecisiveEvidence.status,
      evidenceCapability: interpretation.nextDecisiveEvidence.evidenceCapability,
      decisionBoundary: interpretation.nextDecisiveEvidence.decisionBoundary,
    },
    quantitativeProgress: goalContract.quantitativeProgress ?? null,
    expectedTrajectory: goalContract.expectedTrajectory ?? null,
    timeline,
    goalAttainability,
  })}`;
}

function semanticDurability(value = {}) {
  return {
    persistence: value.persistence ?? "emerging",
    independentPeriodCount: Math.min(3,
      Number(value.independentPeriodCount ?? 0)),
    corroboratingCapabilityCount:
      Number(value.corroboratingCapabilityCount ?? 0),
    contradictionState: value.contradictionState ?? "none",
    transition: value.transition ?? null,
    signals: (value.signals ?? []).map((item) => ({
      signalKey: item.signalKey,
      persistence: item.persistence,
      independentPeriodCount: Math.min(3,
        Number(item.independentPeriodCount ?? 0)),
      transition: item.transition ?? null,
    })).sort((left, right) => String(left.signalKey)
      .localeCompare(String(right.signalKey))),
    reducedUncertaintyKeys: uniqueStrings(value.reducedUncertaintyKeys),
  };
}

function stabilizeForecastForUnchangedInterpretation({
  evaluation,
  previousForecastContext,
  interpretationSemanticFingerprint,
}) {
  const sameSemantics = previousForecastContext
    ?.interpretationSemanticFingerprint === interpretationSemanticFingerprint;
  const validStatus = [
    "ahead_of_forecast", "on_forecast", "forecast_uncertain",
    "forecast_at_risk", "forecast_unlikely",
  ].includes(previousForecastContext?.goalForecastStatus);
  const validBand = [
    "very_low", "low", "developing", "moderate", "high", "very_high",
  ].includes(previousForecastContext?.confidenceBand);
  if (!sameSemantics || !validStatus || !validBand) return evaluation;
  return {
    ...evaluation,
    goalForecastStatus: previousForecastContext.goalForecastStatus,
    confidenceBand: previousForecastContext.confidenceBand,
    forecastDirection: previousForecastContext.forecastDirection ??
      evaluation.forecastDirection,
  };
}

function normalizeGoalContract(value = {}) {
  if (!value.contractVersion || !value.goal?.goalId ||
      !Array.isArray(value.objectives) || !Array.isArray(value.guardrails)) {
    throw new Error("Forecast requires a versioned Goal Contract.");
  }
  return structuredClone({
    contractVersion: value.contractVersion,
    contractId: value.contractId ?? null,
    goal: {
      goalId: value.goal.goalId,
      goalVersion: value.goal.goalVersion ?? null,
      category: value.goal.category ?? null,
    },
    objectives: value.objectives.map((item) => ({
      objectiveId: item.objectiveId,
      required: item.required !== false,
      trajectoryRef: item.trajectoryRef ?? null,
      target: structuredClone(item.target ?? null),
    })),
    guardrails: value.guardrails.map((item) => ({
      guardrailId: item.guardrailId,
      required: item.required !== false,
      constraint: structuredClone(item.constraint ?? null),
    })),
    timeline: value.timeline ?? {},
    quantitativeProgress: value.quantitativeProgress ?? null,
    expectedTrajectory: value.expectedTrajectory ?? { segments: [] },
    milestones: value.milestones ?? [],
    successCriteria: value.successCriteria ?? null,
    provenance: value.provenance ?? {},
  });
}

function forecastUncertainty(value = {}) {
  return {
    status: value.status ?? "material",
    items: (value.items ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      question: item.question,
      cause: item.cause,
      affectedConclusionRefs: uniqueStrings(item.affectedConclusionRefs),
      reducibility: item.reducibility,
      materiality: item.materiality,
      candidateEvidenceMapRefs: uniqueStrings(item.candidateEvidenceMapRefs),
      rationale: item.rationale,
    })),
    summary: structuredClone(value.summary ?? {}),
  };
}

function forecastNextEvidence(value = {}) {
  return {
    status: value.status ?? "unavailable",
    evidenceCapability: value.evidenceCapability ?? null,
    expectedEventType: value.expectedEventType ?? null,
    expectedWindow: structuredClone(value.expectedWindow ?? null),
    uncertaintyRefs: uniqueStrings(value.uncertaintyRefs),
    decisionBoundary: value.decisionBoundary ?? null,
    whyDecisive: value.whyDecisive ?? "interpretation_candidate_unavailable",
  };
}
