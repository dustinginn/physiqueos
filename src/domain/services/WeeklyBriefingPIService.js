import { adaptTrainingPerformanceReportToPIObservations } from "./TrainingPIObservationAdapter";
import { createWeightPIObservations } from "./WeightPIObservationService";
import { createEnergyPIObservations } from "./EnergyPIObservationService";
import { applyPIGoalContextToObservations, createPIGoalContext } from "./PIObservationGoalContextService";
import { createTrainingWeightClaims, createWeightEnergyClaims, isPICrossDomainClaim } from "./PICrossDomainClaimService";
import { evaluatePIClaimSetLifecycle } from "./PIClaimLifecycleService";
import {
  createPIClaimNarrativeCandidate,
  createPIBodyFatGuardrailNarrativeCandidate,
  createPIEnergyTrendNarrativeCandidate,
  createPIObservationNarrativeCandidate,
  evaluatePINarrativeCandidateLifecycle,
  selectPINarrativeCandidates,
} from "./PINarrativeCandidateService";
import { createDEXAPIObservations } from "./DEXAPIObservationService";
import { createPhotoPIObservations } from "./PhotoPIObservationService";
import { createBodyCompositionClaims } from "./PIBodyCompositionClaimService";
import { createEarlyPhaseBodyFatGuardrailAssessment } from "./PIBodyFatGuardrailService";
import { createCadenceTrainingPIObservations } from "./CadenceTrainingPIObservationService";
import { assessPITrainingEnergyReadiness } from "./PITrainingEnergyReadinessService";
import { createRecoveryPIComposition } from "./RecoveryPICompositionService";

export function createWeeklyBriefingPIResult(input = {}) {
  const before = structuredClone(input);
  requireDate(input.evaluationDate);
  const current = input.currentEnergyAssessment;
  const comparison = input.comparisonEnergyAssessment;
  if (!current || !comparison) throw new Error("Exact Weekly Energy assessments are required.");
  const goalContext = createPIGoalContext({
    activeGoal: input.activeGoal ?? null,
    activePhase: input.activePhase ?? null,
    relatedGoals: input.relatedGoals ?? [],
    protocols: input.protocols ?? [],
    currentDate: `${input.evaluationDate}T12:00:00Z`,
    timeZone: input.timeZone ?? input.evidenceWindow.timeZone,
  });
  const training = Array.isArray(input.canonicalTrainingEvidence)
    ? createCadenceTrainingPIObservations({
        report: input.trainingReport,
        canonicalTrainingEvidence: input.canonicalTrainingEvidence,
        cadence: "weekly",
        evidenceWindow: input.evidenceWindow,
        comparisonWindow: input.comparisonWindow,
        windowTimeZone: input.timeZone ?? input.evidenceWindow.timeZone,
      })
    : adaptTrainingPerformanceReportToPIObservations(input.trainingReport);
  const baseObservations = applyPIGoalContextToObservations([
    ...training,
    ...createWeightPIObservations({
      weights: input.weights ?? [],
      observationWindow: input.evidenceWindow,
      comparisonWindow: input.comparisonWindow,
      requestedScopes: ["short_window", "average_comparison"],
      semanticHorizon: "weekly",
      includeInsufficientData: true,
    }),
    ...createEnergyPIObservations({
      days: [...comparison.dailyRecords, ...current.dailyRecords],
      observationWindow: input.evidenceWindow,
      comparisonWindow: input.comparisonWindow,
      semanticHorizon: "weekly",
      includeInsufficientData: true,
    }),
    ...bodyCompositionObservations(input),
  ], goalContext);
  const recoveryPI = createRecoveryPIComposition({
    records: input.recoveryEvidenceRecords ?? [],
    cadence: "weekly",
    evidenceWindow: input.evidenceWindow,
    comparisonWindow: input.comparisonWindow,
    timezone: input.timeZone ?? input.evidenceWindow.timeZone,
    evaluationDate: input.evaluationDate,
    goalContext,
    trainingObservations: baseObservations.filter((item) => item.domain === "training"),
    energyObservations: baseObservations.filter((item) => item.domain === "energy"),
    priorClaims: (input.continuity?.priorClaims ?? []).filter((claim) =>
      claim.participatingDomains?.includes("recovery")
    ),
    competingCandidates: eventCandidates(baseObservations),
  });
  const observations = [...baseObservations, ...recoveryPI.observations]
    .sort((left, right) => left.id.localeCompare(right.id));
  const byDomain = (domain) => observations.filter((item) => item.domain === domain);
  const trainingEnergyReadiness = assessPITrainingEnergyReadiness({
    cadence: "weekly",
    trainingObservations: byDomain("training"),
    energyObservations: byDomain("energy"),
    competingCandidates: eventCandidates(observations),
    renderingCompatible: true,
    memoryCompatible: true,
  });
  const claims = [
    ...createTrainingWeightClaims(byDomain("training"), byDomain("weight")),
    ...createWeightEnergyClaims(byDomain("weight"), byDomain("energy")),
    ...(trainingEnergyReadiness.authorityReady
      ? [trainingEnergyReadiness.claim]
      : []),
    ...recoveryPI.lifecycleResult.currentClaims.filter((claim) =>
      recoveryPI.authorityReadyCandidates.some((candidate) =>
        candidate.sourceId === claim.id
      )
    ),
    ...createBodyCompositionClaims(observations),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const prior = input.continuity?.priorClaims ?? [];
  const lifecycleResult = evaluatePIClaimSetLifecycle(
    claims,
    prior.filter(isPICrossDomainClaim),
    {
      evaluationDate: input.evaluationDate,
      evaluationCoverage: current.coverage.state === "complete" ? "complete" : "partial",
    }
  );
  const candidates = [
    ...lifecycleResult.currentClaims.map((claim) => createPIClaimNarrativeCandidate({ claim })),
    ...byDomain("training")
      .filter(() => !trainingEnergyReadiness.authorityReady)
      .map((observation) => createPIObservationNarrativeCandidate({ observation })),
    ...recoveryPI.authorityReadyCandidates.filter((candidate) =>
      candidate.candidateType === "direct_recovery"
    ),
    createPIEnergyTrendNarrativeCandidate({
      currentAssessment: current,
      comparisonAssessment: comparison,
      goalContext: byDomain("energy")[0]?.goalContext ?? {},
    }),
    ...guardrailCandidates(observations),
  ];
  const priorCandidates = new Map(
    prior.filter((item) => item.schemaVersion === "pi_narrative_candidate_v1")
      .map((item) => [item.id, item])
  );
  const evaluated = candidates.map((candidate) =>
    candidate.candidateType === "cross_domain_claim" ? candidate :
      evaluatePINarrativeCandidateLifecycle(
        candidate,
        priorCandidates.get(candidate.id) ?? null,
        { evaluationDate: input.evaluationDate }
      )
  );
  const selection = selectPINarrativeCandidates(evaluated, {
    cadence: "weekly",
    activeGoal: input.activeGoal,
    communicatedCandidateIds: input.continuity?.communicatedClaimIds ?? [],
  }, {
    requireEnergyContext: true,
    claimsById: Object.fromEntries(lifecycleResult.currentClaims.map((claim) => [claim.id, claim])),
  });
  const result = {
    schemaVersion: "weekly_briefing_pi_v1",
    briefingDate: input.evaluationDate,
    evidenceWindow: structuredClone(input.evidenceWindow),
    comparisonWindow: structuredClone(input.comparisonWindow),
    observations,
    claims,
    lifecycleResult,
    candidates: evaluated,
    selection,
    energyTrend: evaluated.find((item) => item.candidateType === "energy_trend"),
    coverage: { energy: current.coverage, weight: byDomain("weight").length, training: byDomain("training").length },
    limitations: [...new Set([...current.limitations, ...goalContext.limitations])].sort(),
    parityDiagnostics: weeklyParity(input.legacySemanticSummary ?? {}, current, observations),
    trainingEnergyReadiness,
    recoveryPI,
    provenance: { producer: "weekly_briefing_pi_service", evaluationDate: input.evaluationDate, repositoryReads: 0, runtimeClockReads: 0 },
  };
  if (JSON.stringify(input) !== JSON.stringify(before)) throw new Error("Weekly PI input mutation detected.");
  return result;
}


function bodyCompositionObservations(input) {
  const observations = Array.isArray(input.bodyCompositionObservations)
    ? input.bodyCompositionObservations
    : [
        ...createDEXAPIObservations({
          scans: input.dexaScans ?? [],
          includeInsufficientData: false,
        }),
        ...createPhotoPIObservations({
          sessions: input.photoSessions ?? [],
          includeInsufficientData: false,
        }),
      ];
  return observations.filter((item) => {
    const date = item.evidenceWindow?.endDate;
    return date && date >= input.evidenceWindow.startDate &&
      date <= input.evidenceWindow.endDate;
  });
}

function eventCandidates(observations) {
  return [
    ...(observations.some((item) => item.domain === "dexa")
      ? [{ candidateType: "dexa_event", participatingDomains: ["dexa"] }]
      : []),
    ...(observations.some((item) => item.domain === "photos")
      ? [{ candidateType: "photo_event", participatingDomains: ["photos"] }]
      : []),
  ];
}

function guardrailCandidates(observations) {
  const assessment = createEarlyPhaseBodyFatGuardrailAssessment({ observations });
  return assessment.state === "insufficient"
    ? []
    : [createPIBodyFatGuardrailNarrativeCandidate({ assessment })];
}

function weeklyParity(legacy, energy, observations) {
  const state = (expected, actual) => expected == null ? "pi_only" : expected === actual ? "exactly_aligned" : "semantic_conflict";
  const weight = observations.find((item) => item.domain === "weight" && item.kind === "weight_short_window_change");
  const training = observations.find((item) => item.domain === "training" && item.subject.type === "training_scope");
  return {
    weightMovement: state(legacy.weightDirection, weight?.direction ?? null),
    training: state(legacy.trainingStatus, training?.status ?? null),
    intake: state(legacy.averageIntake, energy.intake.average),
    expenditure: state(legacy.averageExpenditure, energy.estimatedExpenditure.average),
    balance: state(legacy.averageBalance, energy.netBalance.average),
    coverage: state(legacy.coverageState, energy.coverage.state),
  };
}
function requireDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Explicit Weekly evaluationDate is required.");
}
