import { adaptTrainingPerformanceReportToPIObservations } from "./TrainingPIObservationAdapter";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { createWeightPIObservations } from "./WeightPIObservationService";
import { createEnergyPIObservations } from "./EnergyPIObservationService";
import {
  applyPIGoalContextToObservations,
  createPIGoalContext,
} from "./PIObservationGoalContextService";
import {
  createTrainingWeightClaims,
  createWeightEnergyClaims,
} from "./PICrossDomainClaimService";
import { evaluatePIClaimSetLifecycle } from "./PIClaimLifecycleService";
import { selectPIClaimsForNarrative } from "./PIClaimRankingService";
import { isPICrossDomainClaim } from "./PICrossDomainClaimService";
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

export const MIDWEEK_PI_SHADOW_SCHEMA_VERSION = "midweek_pi_shadow_v1";

export function createMidweekPIShadowResult(input = {}) {
  const before = structuredClone(input);
  const evidenceWindow = normalizeWindow(input.evidenceWindow);
  const evaluationDate = date(input.evaluationDate, "evaluationDate");
  const timeZone =
    input.timeZone ?? evidenceWindow.timeZone ?? "America/Los_Angeles";
  const comparisonWindow = input.comparisonWindow
    ? normalizeRange(input.comparisonWindow, "comparisonWindow")
    : null;
  const trainingReport =
    input.trainingReport ??
    createTrainingPerformanceIntelligenceReport({
      canonicalObjects: input.canonicalTrainingEvidence ?? [],
      now: `${evaluationDate}T12:00:00Z`,
      generatedAt: `${evaluationDate}T12:00:00.000Z`,
    });
  const training = Array.isArray(input.canonicalTrainingEvidence)
    ? createCadenceTrainingPIObservations({
        report: trainingReport,
        canonicalTrainingEvidence: input.canonicalTrainingEvidence,
        cadence: "midweek",
        evidenceWindow,
        comparisonWindow,
        windowTimeZone: timeZone,
      })
    : adaptTrainingPerformanceReportToPIObservations(trainingReport);
  const weight = createWeightPIObservations({
    weights: input.weights ?? [],
    observationWindow: evidenceWindow,
    comparisonWindow,
    requestedScopes: ["average_comparison"],
    semanticHorizon: "midweek",
    includeInsufficientData: input.includeInsufficientObservations === true,
  });
  const energy = createEnergyPIObservations({
    days: input.energyDays ?? [],
    observationWindow: evidenceWindow,
    comparisonWindow,
    semanticHorizon: "midweek",
    includeInsufficientData: input.includeInsufficientObservations === true,
  });
  const goalContext = createPIGoalContext({
    activeGoal: input.activeGoal ?? null,
    activePhase: input.activePhase ?? null,
    relatedGoals: input.relatedGoals ?? [],
    protocols: input.protocols ?? [],
    currentDate: `${evaluationDate}T12:00:00Z`,
    timeZone,
  });
  const baseObservations = applyPIGoalContextToObservations(
    [
      ...training,
      ...weight,
      ...energy,
      ...bodyCompositionObservations(input, evidenceWindow),
    ],
    goalContext
  );
  const recoveryPI = createRecoveryPIComposition({
    records: input.recoveryEvidenceRecords ?? [],
    cadence: "midweek",
    evidenceWindow,
    comparisonWindow,
    timezone: timeZone,
    evaluationDate,
    goalContext,
    trainingObservations: baseObservations.filter((item) => item.domain === "training"),
    energyObservations: baseObservations.filter((item) => item.domain === "energy"),
    priorClaims: (input.priorClaims ?? []).filter((claim) =>
      claim.participatingDomains?.includes("recovery")
    ),
    competingCandidates: eventCandidates(baseObservations),
  });
  const observations = [...baseObservations, ...recoveryPI.observations]
    .sort((left, right) => left.id.localeCompare(right.id));
  const byDomain = (domain) =>
    observations.filter((item) => item.domain === domain);
  const trainingEnergyReadiness = assessPITrainingEnergyReadiness({
    cadence: "midweek",
    trainingObservations: byDomain("training"),
    energyObservations: byDomain("energy"),
    competingCandidates: eventCandidates(observations),
    renderingCompatible: true,
    memoryCompatible: true,
  });
  const claims = [
    ...createWeightEnergyClaims(byDomain("weight"), byDomain("energy")),
    ...createTrainingWeightClaims(byDomain("training"), byDomain("weight")),
    ...(trainingEnergyReadiness.authorityReady
      ? [trainingEnergyReadiness.claim]
      : []),
    ...recoveryPI.lifecycleResult.currentClaims.filter((claim) =>
      recoveryPI.authorityReadyCandidates.some((candidate) =>
        candidate.sourceId === claim.id
      )
    ),
    ...createBodyCompositionClaims(observations),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const lifecycleResult = lifecycle(claims, input, evaluationDate);
  const rankingResult = selectPIClaimsForNarrative(
    lifecycleResult.currentClaims,
    {
      cadence: "midweek",
      evaluationDate,
      ...(input.rankingContext ?? {}),
    },
    input.rankingOptions ?? {}
  );
  const energyTrendSummary = createEnergyTrendSummary({
    energyDays: input.energyDays ?? [],
    evidenceWindow,
    comparisonWindow,
    precomputed: input.energyTrendSummary ?? null,
  });
  const result = {
    schemaVersion: MIDWEEK_PI_SHADOW_SCHEMA_VERSION,
    briefingDate: evidenceWindow.briefingDate,
    evidenceWindow,
    comparisonWindows: {
      weight: comparisonWindow,
      energy: comparisonWindow,
    },
    observationCountsByDomain: Object.fromEntries(
      ["training", "weight", "energy"].map((domain) => [
        domain,
        byDomain(domain).length,
      ])
    ),
    observations,
    claims,
    lifecycleResult,
    rankingResult,
    primaryCandidate: rankingResult.primary[0] ?? null,
    supportingCandidates: rankingResult.supporting,
    backgroundCandidates: rankingResult.background,
    suppressedCandidates: rankingResult.suppressed,
    energyTrendSummary,
    coverage: {
      training: coverage(byDomain("training")),
      weight: coverage(byDomain("weight")),
      energy: coverage(byDomain("energy")),
      lifecycleContinuity:
        lifecycleResult.status === "evaluated" ? "available" : "unavailable",
    },
    limitations: [
      ...(comparisonWindow ? [] : ["midweek_comparison_window_unavailable"]),
      ...(lifecycleResult.status === "unavailable"
        ? ["pi_lifecycle_continuity_unavailable"]
        : []),
      ...(observations.length ? [] : ["pi_observations_unavailable"]),
      ...(claims.length ? [] : ["cross_domain_claims_unavailable"]),
      ...goalContext.limitations,
      ...energyTrendSummary.limitations,
    ].filter((value, index, values) => values.indexOf(value) === index).sort(),
    parityDiagnostics: auditMidweekPIParity({
      observations,
      claims,
      legacySummary: input.legacySemanticSummary ?? {},
      exact: input.exactPrecomputed === true,
    }),
    trainingEnergyReadiness,
    recoveryPI,
    provenance: {
      producer: "midweek_briefing_pi_shadow_service",
      producerVersion: "midweek_pi_shadow_pipeline_v1",
      evaluationDate,
      timeZone,
      trainingEvidenceRange: evidenceRange(byDomain("training")),
      weightCurrentRange: {
        startDate: evidenceWindow.startDate,
        endDate: evidenceWindow.endDate,
      },
      weightComparisonRange: comparisonWindow,
      energyPairedRange: energyTrendSummary.pairedDayRange,
      sourceEvidenceIds: sourceIds(observations),
      sourceFingerprint: fingerprint(sourceIds(observations)),
      repositoryReads: 0,
      persistenceWrites: 0,
    },
  };
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Midweek PI shadow input mutation detected.");
  }
  return result;
}


export function createMidweekPIAuthoritativeSelection(input = {}) {
  const currentAssessment = input.currentEnergyAssessment;
  const comparisonAssessment = input.comparisonEnergyAssessment;
  if (!currentAssessment || !comparisonAssessment) {
    throw new Error("Exact current and comparison Energy assessments are required.");
  }
  const priorSnapshots = input.continuity?.priorClaims ?? [];
  const shadow = createMidweekPIShadowResult({
    ...input,
    energyDays: [
      ...comparisonAssessment.dailyRecords,
      ...currentAssessment.dailyRecords,
    ],
    priorClaims: priorSnapshots.filter(isPICrossDomainClaim),
    energyTrendSummary: {
      currentAverageIntake: currentAssessment.intake.average,
      currentTotalIntake: currentAssessment.intake.total,
      currentAverageExpenditure: currentAssessment.estimatedExpenditure.average,
      currentTotalExpenditure: currentAssessment.estimatedExpenditure.total,
      currentAverageBalance: currentAssessment.netBalance.average,
      currentTotalBalance: currentAssessment.netBalance.total,
      comparisonAverageIntake: comparisonAssessment.intake.average,
      comparisonAverageExpenditure:
        comparisonAssessment.estimatedExpenditure.average,
      comparisonAverageBalance: comparisonAssessment.netBalance.average,
      pairedDayCount: currentAssessment.coverage.pairedDayCount,
      completeDayCount: currentAssessment.coverage.completePairedDayCount,
      partialDayCount: currentAssessment.coverage.partialPairedDayCount,
      pairedDayRange: {
        startDate: currentAssessment.window.startDate,
        endDate: currentAssessment.window.endDate,
      },
      rmrSources: currentAssessment.rmr.sourceDexaId
        ? [{
            scanId: currentAssessment.rmr.sourceDexaId,
            scanDate: currentAssessment.rmr.sourceDexaDate,
            value: currentAssessment.rmr.value,
          }]
        : [],
      calculationMethod: currentAssessment.provenance.calculationMethod,
      limitations: currentAssessment.limitations,
    },
    exactPrecomputed: true,
  });
  const candidates = [
    ...shadow.lifecycleResult.currentClaims.map((claim) =>
      createPIClaimNarrativeCandidate({ claim })
    ),
    ...shadow.observations
      .filter((observation) =>
        observation.domain === "training" &&
        !shadow.trainingEnergyReadiness.authorityReady
      )
      .map((observation) =>
        createPIObservationNarrativeCandidate({ observation })
      ),
    ...shadow.recoveryPI.authorityReadyCandidates.filter((candidate) =>
      candidate.candidateType === "direct_recovery"
    ),
    createPIEnergyTrendNarrativeCandidate({
      currentAssessment,
      comparisonAssessment,
      goalContext: shadow.observations.find(
        (observation) => observation.domain === "energy"
      )?.goalContext ?? {},
    }),
    ...guardrailCandidates(shadow.observations),
  ];
  const priorCandidates = new Map(
    priorSnapshots
      .filter((snapshot) => snapshot.schemaVersion === "pi_narrative_candidate_v1")
      .map((snapshot) => [snapshot.id, snapshot])
  );
  const evaluated = candidates.map((candidate) =>
    candidate.candidateType === "cross_domain_claim"
      ? candidate
      : evaluatePINarrativeCandidateLifecycle(
          candidate,
          priorCandidates.get(candidate.id) ?? null,
          { evaluationDate: input.evaluationDate }
        )
  );
  const selection = selectPINarrativeCandidates(evaluated, {
    cadence: "midweek",
    activeGoal: input.activeGoal,
    communicatedCandidateIds:
      input.continuity?.communicatedClaimIds ?? [],
  }, {
    requireEnergyContext: true,
    claimsById: Object.fromEntries(
      shadow.lifecycleResult.currentClaims.map((claim) => [claim.id, claim])
    ),
  });
  return {
    shadow,
    candidates: evaluated,
    selection,
    communicatedClaimIds: [
      ...selection.primary,
      ...selection.supporting,
    ].map((entry) => entry.candidate.id),
  };
}

function bodyCompositionObservations(input, window) {
  const supplied = input.bodyCompositionObservations;
  const observations = Array.isArray(supplied) ? supplied : [
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
    return date && date >= window.startDate && date <= window.endDate;
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

export function auditMidweekPIParity({
  observations = [],
  claims = [],
  legacySummary = {},
  exact = false,
} = {}) {
  const comparisons = [
    compare("weight", legacySummary.weightDirection, directionOf(
      observations,
      "weight",
      "weight_average_change"
    ), exact),
    compare("training", legacySummary.trainingStatus, trainingState(observations), exact),
    compare("energy_intake", legacySummary.intakeDirection, directionOf(
      observations,
      "energy",
      "energy_intake"
    ), exact),
    compare("energy_expenditure", legacySummary.expenditureDirection, directionOf(
      observations,
      "energy",
      "energy_expenditure"
    ), exact),
    compare("energy_balance", legacySummary.balanceDirection, directionOf(
      observations,
      "energy",
      "energy_balance"
    ), exact),
  ];
  if (claims.length) {
    comparisons.push({
      domain: "cross_domain_relationship",
      state: "pi_only",
      legacy: null,
      pi: claims.map((claim) => claim.kind).sort(),
    });
  }
  if (legacySummary.genericConclusion) {
    comparisons.push({
      domain: "generic_conclusion",
      state: "legacy_only",
      legacy: legacySummary.genericConclusion,
      pi: null,
    });
  }
  return comparisons.sort((left, right) => left.domain.localeCompare(right.domain));
}

function lifecycle(claims, input, evaluationDate) {
  if (!Array.isArray(input.priorClaims)) {
    return {
      status: "unavailable",
      reason: "prior_pi_claims_not_supplied",
      currentClaims: claims,
      transitionedPriorClaims: [],
      diagnostics: [],
    };
  }
  return {
    status: "evaluated",
    ...evaluatePIClaimSetLifecycle(claims, input.priorClaims, {
      evaluationDate,
      evaluationCoverage: input.lifecycleEvaluationCoverage ?? "complete",
      ...(input.lifecycleOptions ?? {}),
    }),
  };
}

function createEnergyTrendSummary({
  energyDays,
  evidenceWindow,
  comparisonWindow,
  precomputed,
}) {
  if (precomputed) return structuredClone(precomputed);
  const current = selectDays(energyDays, evidenceWindow);
  const comparison = comparisonWindow
    ? selectDays(energyDays, comparisonWindow)
    : [];
  const complete = current.filter((day) => day.energyBalance != null);
  const averages = (rows, key) => average(
    rows.map((row) => row[key]).filter(Number.isFinite)
  );
  const pairedDates = complete.map((day) => day.date).sort();
  return {
    currentAverageIntake: averages(current, "calorieIntake"),
    currentTotalIntake: sum(current, "calorieIntake"),
    currentAverageExpenditure: averages(current, "estimatedExpenditure"),
    currentTotalExpenditure: sum(current, "estimatedExpenditure"),
    currentAverageBalance: averages(complete, "energyBalance"),
    currentTotalBalance: sum(complete, "energyBalance"),
    comparisonAverageIntake: averages(comparison, "calorieIntake"),
    comparisonAverageExpenditure: averages(comparison, "estimatedExpenditure"),
    comparisonAverageBalance: averages(comparison, "energyBalance"),
    pairedDayCount: complete.length,
    completeDayCount: current.filter(
      (day) => day.completeness === "complete"
    ).length,
    partialDayCount: current.filter(
      (day) => day.completeness !== "complete"
    ).length,
    pairedDayRange: pairedDates.length
      ? { startDate: pairedDates[0], endDate: pairedDates.at(-1) }
      : null,
    rmrSources: [...new Map(current.filter((day) => day.rmrScanId).map(
      (day) => [day.rmrScanId, {
        scanId: day.rmrScanId,
        scanDate: day.rmrScanDate,
        value: day.rmr,
      }]
    )).values()],
    calculationMethod: "midweek_precomputed_energy_days",
    limitations: [
      current.some((day) => day.completeness !== "complete")
        ? "midweek_energy_coverage_partial"
        : null,
      current.some((day) => day.rmrScanId == null)
        ? "some_days_lack_historical_rmr"
        : null,
    ].filter(Boolean),
  };
}

function compare(domain, legacy, pi, exact) {
  if (legacy == null && pi == null) {
    return { domain, state: "insufficient_for_comparison", legacy, pi };
  }
  if (legacy != null && pi == null) {
    return { domain, state: "legacy_only", legacy, pi };
  }
  if (legacy == null) return { domain, state: "pi_only", legacy, pi };
  if (legacy === pi) {
    return { domain, state: exact ? "exactly_aligned" : "aligned", legacy, pi };
  }
  const conflict = new Set([
    "rising|falling", "falling|rising",
    "improving|regressing", "regressing|improving",
  ]).has(`${legacy}|${pi}`);
  return {
    domain,
    state: conflict ? "semantic_conflict" : "partially_aligned",
    legacy,
    pi,
  };
}

function directionOf(observations, domain, kind) {
  return observations.find(
    (item) => item.domain === domain && item.kind === kind &&
      item.status === "observed"
  )?.direction ?? null;
}

function trainingState(observations) {
  const item = observations.find(
    (observation) =>
      observation.domain === "training" &&
      observation.subject.type === "training_scope"
  );
  return item?.status ?? null;
}

function coverage(observations) {
  if (!observations.length) return "missing";
  return observations.some((item) => item.status !== "insufficient_data")
    ? "available"
    : "insufficient";
}

function evidenceRange(observations) {
  const dates = observations.flatMap((item) => [
    item.evidenceWindow.startDate,
    item.evidenceWindow.endDate,
  ]).filter(Boolean).sort();
  return dates.length
    ? { startDate: dates[0], endDate: dates.at(-1) }
    : null;
}

function sourceIds(observations) {
  return [...new Set(observations.flatMap(
    (item) => item.supportingEvidenceIds
  ))].sort();
}

function fingerprint(ids) {
  let hash = 0x811c9dc5;
  for (const character of ids.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function selectDays(days, window) {
  return days.filter(
    (day) => day.date >= window.startDate && day.date <= window.endDate
  );
}

function average(values) {
  return values.length
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;
}

function sum(rows, key) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite);
  return values.length
    ? Math.round(values.reduce((total, value) => total + value, 0))
    : null;
}

function normalizeWindow(value) {
  if (!value) throw new Error("evidenceWindow is required.");
  return {
    ...value,
    briefingDate: date(value.briefingDate, "evidenceWindow.briefingDate"),
    startDate: date(value.startDate, "evidenceWindow.startDate"),
    endDate: date(value.endDate, "evidenceWindow.endDate"),
  };
}

function normalizeRange(value, field) {
  return {
    startDate: date(value.startDate, `${field}.startDate`),
    endDate: date(value.endDate, `${field}.endDate`),
  };
}

function date(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  return value;
}
