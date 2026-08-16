import { createHash } from "node:crypto";
import { createStartingForecastContext } from "../confidence/StartingForecastService";
import { adaptDEXAEventToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract } from
  "../confidence/ProductionConfidenceContextAdapter";
import { validatePhaseStrategy } from "../models/phaseStrategy";
import { validatePhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";

export const PHASE_2_STARTING_FORECAST_INPUT_VERSION =
  "phase_2_starting_forecast_input_package_v1";

export function createPhase2StartingForecastInputPackage({
  store, goal, activePhase, acceptedStrategy, acceptedTrajectory, decision,
} = {}) {
  if (!store || !goal?.id || !activePhase?.id || !decision?.decisionId) {
    throw incomplete("canonical_inputs_required");
  }
  validatePhaseStrategy(acceptedStrategy, { expectedGoalId: goal.id,
    expectedPhaseId: activePhase.id });
  validatePhaseExpectedTrajectory(acceptedTrajectory, { expectedGoalId: goal.id,
    expectedPhaseId: activePhase.id });
  if (acceptedStrategy.status !== "accepted" || acceptedTrajectory.status !== "accepted") {
    throw incomplete("accepted_activation_records_required");
  }
  if (acceptedStrategy.revision !== decision.expectedStrategyRevision ||
      acceptedTrajectory.revision !== decision.expectedTrajectoryRevision) {
    throw incomplete("accepted_record_revision_mismatch");
  }
  const sourceEvidenceId = decision.phaseEstablishment?.lineage?.sourceEvidenceId ?? null;
  const decisionDate = decision.decidedAt?.slice(0, 10);
  const phaseBaselineScan = (store.dexaScans ?? []).find((item) => item.id === sourceEvidenceId) ??
    [...(store.dexaScans ?? [])].filter((item) => {
      const observed = item.measuredAt ?? item.date;
      return observed && (!decisionDate || observed <= decisionDate);
    }).sort((a, b) => String(a.measuredAt ?? a.date).localeCompare(String(b.measuredAt ?? b.date))).at(-1) ?? null;
  const baselineObservedOn = phaseBaselineScan?.measuredAt ?? phaseBaselineScan?.date ?? null;
  const phaseBoundaryBaseline = phaseBaselineScan ? {
    baselineId: phaseBaselineScan.id,
    observedOn: baselineObservedOn,
    kind: "canonical_dexa_summary",
    bodyFatPercentage: number(phaseBaselineScan.bodyFatPercentage),
    leanMass: normalizedMass(phaseBaselineScan.leanMass),
    fatMass: normalizedMass(phaseBaselineScan.fatMass),
    sourceRef: phaseBaselineScan.id,
    rawEvidenceIncluded: false,
  } : null;
  const executionRefs = (store.executionItems ?? []).filter((item) =>
    !item.goalId || item.goalId === goal.id || item.goalIds?.includes(goal.id))
    .map((item) => item.id).filter(Boolean).sort();
  const priorGoals = (store.goals ?? []).filter((item) => item.userId === goal.userId &&
    item.id !== goal.id && item.status === "completed").map((item) => ({
    goalId: item.id, status: item.status, completedAt: item.completedAt ?? null,
  })).sort((a, b) => a.goalId.localeCompare(b.goalId));
  const priorPhases = (goal.phases ?? []).filter((item) => item.id !== activePhase.id)
    .map((item) => ({ phaseId: item.id, status: item.status,
      startedAt: item.startedAt ?? item.startDate ?? null,
      completedAt: item.completedAt ?? null,
      completionDecisionId: item.completionDecisionId ?? null,
    })).sort((a, b) => a.phaseId.localeCompare(b.phaseId));
  const latestSnapshot = (store.goalConfidenceSnapshots ?? []).filter((item) =>
    item.goalId === goal.id).sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "")
    .localeCompare(String(a.updatedAt ?? a.createdAt ?? "")))[0] ?? null;
  const latestConfidenceContext = latestSnapshot ? {
    snapshotId: latestSnapshot.id,
    phaseId: latestSnapshot.phaseId,
    assessmentId: latestSnapshot.currentAssessmentId,
    confidenceBand: latestSnapshot.scoreBand ?? null,
    canonicalPercentage: latestSnapshot.currentScore ?? null,
    schemaVersion: latestSnapshot.schemaVersion,
    sourceCutoff: latestSnapshot.evidenceCutoff ?? null,
    v1NumericConversionUsed: false,
  } : null;
  const targetDate = goal.timeline?.targetDate ?? goal.target?.targetDate;
  const activationDate = activePhase.startedAt ?? activePhase.startDate ??
    decision.projectedNextPhaseStart ?? nextLocalDay(decision.decidedAt.slice(0, 10));
  const remainingDays = daysBetween(activationDate, targetDate);
  const goalContract = adaptProductionGoalToCanonicalContract(goal, {
    activePhase,
    strategyHypothesis: acceptedStrategy.strategyHypothesis,
    expectedTrajectory: acceptedTrajectory.expectedTrajectory,
    canonicalStore: store,
    asOf: decision.decidedAt,
  });
  const progress = goalContract.quantitativeProgress;
  const goalBaseline = progress?.baseline ? {
    baselineId: progress.baseline.sourceRef,
    observedOn: progress.baseline.observedOn,
    kind: progress.baseline.sourceType,
    metric: progress.metric,
    value: progress.baseline.value,
    unit: progress.baseline.unit,
    derivation: progress.baseline.derivation,
    rawEvidenceIncluded: false,
  } : null;
  const semanticGaps = [
    ...(goalBaseline ? [] : ["goal_baseline_missing"]),
    ...(phaseBoundaryBaseline ? [] : ["phase_activation_baseline_missing"]),
    ...(latestConfidenceContext ? [] : ["latest_canonical_confidence_context_missing"]),
    ...(executionRefs.length ? [] : ["historical_execution_references_missing"]),
    "true_maintenance_intake_remains_calibration_dependent",
    "productive_surplus_remains_response_dependent",
    "expected_rate_of_weight_gain_not_canonically_fixed",
  ].sort();
  const startingForecastContext = createStartingForecastContext({
    goalAmbition: Number(goal.target?.amount) >= 10 ? "high" : "moderate",
    timelineFeasibility: targetDate && remainingDays > 0 ? "reasonable" : "unknown",
    baselineQuality: goalBaseline ? "known" : "partial",
    priorGoalHistory: priorGoals.length ? "mixed" : "unavailable",
    historicalExecution: executionRefs.length ? "adequate" : "unavailable",
    strategyQuality: "strong",
    experience: priorGoals.length || executionRefs.length ? "experienced_user" : "new_user",
    priorGoalRefs: priorGoals.map((item) => item.goalId),
    historyRefs: [...executionRefs, ...(goalBaseline?.baselineId ? [goalBaseline.baselineId] : []),
      ...(phaseBoundaryBaseline?.baselineId ? [phaseBoundaryBaseline.baselineId] : [])],
    missingInformation: semanticGaps,
  });
  const startingEvidenceDescriptors = phaseBaselineScan
    ? adaptDEXAEventToEvidenceDescriptors({ scan: phaseBaselineScan, priorScan: null }) : [];
  const result = {
    schemaVersion: PHASE_2_STARTING_FORECAST_INPUT_VERSION,
    goalContract,
    acceptedStrategy: structuredClone(acceptedStrategy),
    acceptedExpectedTrajectory: structuredClone(acceptedTrajectory),
    executionTargets: structuredClone(decision.phaseEstablishment?.executionTargets ?? null),
    activePhase: { goalId: goal.id, phaseId: activePhase.id, status: activePhase.status,
      startedAt: activationDate },
    priorHistory: { goals: priorGoals, phases: priorPhases },
    historicalExecutionRefs: executionRefs,
    goalBaseline,
    phaseBoundaryBaseline,
    goalProgress: progress ? {
      status: progress.status,
      metric: progress.metric,
      cumulativeProgress: progress.cumulativeProgress,
      requiredProgress: progress.requiredProgress,
      remainingGap: progress.remainingGap,
      progressFraction: progress.progressFraction,
      currentMeasurementRef: progress.current?.sourceRef ?? null,
    } : null,
    currentGuardrailState: phaseBoundaryBaseline ? {
      bodyFatPercentage: phaseBoundaryBaseline.bodyFatPercentage,
      sourceRef: phaseBoundaryBaseline.sourceRef,
      observedOn: phaseBoundaryBaseline.observedOn,
    } : null,
    startingEvidenceDescriptors,
    latestConfidenceContext,
    phaseReviewDecisionLineage: {
      decisionId: decision.decisionId,
      idempotencyKey: decision.idempotencyKey,
      actorId: decision.actorId,
      decidedAt: decision.decidedAt,
      reasoningLineage: structuredClone(decision.reasoningLineage),
      originatingArtifactId: decision.originatingArtifactId,
      originatingForecastId: decision.originatingForecastId,
      originatingInterpretationId: decision.originatingInterpretationId,
      sourceEvidenceId,
    },
    remainingGoalTimeline: { activationDate, targetDate, remainingDays,
      derivation: "actual_activation_to_goal_target_inclusive_exclusive_day_delta" },
    knownSemanticGaps: semanticGaps,
    startingForecastContext,
    exclusions: {
      rawEvidenceRecords: true, briefingJSX: true, presentationCopy: true,
      syntheticDEXAValues: true, unacceptedStrategyDrafts: true,
      v1NumericConversionAsV2Meaning: true,
    },
  };
  result.inputFingerprint = fingerprint(result);
  validatePhase2StartingForecastInputPackage(result);
  return deepFreeze(result);
}

export function validatePhase2StartingForecastInputPackage(value) {
  if (value?.schemaVersion !== PHASE_2_STARTING_FORECAST_INPUT_VERSION ||
      value.acceptedStrategy?.status !== "accepted" ||
      value.acceptedExpectedTrajectory?.status !== "accepted" ||
      value.activePhase?.status !== "active" || !value.goalContract?.contractId ||
      !value.startingForecastContext || !value.phaseReviewDecisionLineage?.decisionId) {
    throw incomplete("package_contract_invalid");
  }
  for (const flag of Object.values(value.exclusions ?? {})) {
    if (flag !== true) throw incomplete("required_exclusion_missing");
  }
  if ((value.goalBaseline && value.goalBaseline.rawEvidenceIncluded !== false) ||
      (value.latestConfidenceContext && value.latestConfidenceContext.v1NumericConversionUsed !== false)) {
    throw incomplete("prohibited_semantics_present");
  }
  const copy = structuredClone(value); delete copy.inputFingerprint;
  if (value.inputFingerprint !== fingerprint(copy)) throw incomplete("fingerprint_invalid");
  return true;
}

function normalizedMass(value) { const parsed = number(value?.value ?? value);
  return parsed == null ? null : { value: parsed, unit: value?.unit ?? "lb" }; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function daysBetween(start, end) { return Math.round((Date.parse(`${end}T00:00:00.000Z`) -
  Date.parse(`${start}T00:00:00.000Z`)) / 86400000); }
function nextLocalDay(value) { const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function fingerprint(value) { return `sha256_${createHash("sha256").update(stable(value)).digest("hex")}`; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
function incomplete(code) { const error = new Error(`Phase 2 Starting Forecast input incomplete: ${code}.`);
  error.code = `PHASE_2_STARTING_FORECAST_${code.toUpperCase()}`; return error; }
