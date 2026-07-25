import { adaptTrainingPerformanceReportToPIObservations } from "./TrainingPIObservationAdapter";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import {
  createDailyWeightPIObservations,
  createWeightPIObservations,
} from "./WeightPIObservationService";
import {
  createDailyEnergyPIObservations,
  createEnergyPIObservations,
} from "./EnergyPIObservationService";
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
import { createDEXAPIObservations } from "./DEXAPIObservationService";
import { createPhotoPIObservations } from "./PhotoPIObservationService";
import { createBodyCompositionClaims } from "./PIBodyCompositionClaimService";
import { createCadenceTrainingPIObservations } from "./CadenceTrainingPIObservationService";
import { assessPITrainingEnergyReadiness } from "./PITrainingEnergyReadinessService";
import { createRecoveryPIComposition } from "./RecoveryPICompositionService";

export const DAILY_PI_SHADOW_SCHEMA_VERSION = "daily_pi_shadow_v1";
export const DAILY_PI_SHADOW_VERSION = "daily_pi_shadow_pipeline_v1";

export function createDailyPIShadowResult(input = {}) {
  const before = structuredClone(input);
  const evidenceWindow = normalizeDailyWindow(input.evidenceWindow);
  const evaluationDate = requiredDate(
    input.evaluationDate,
    "evaluationDate"
  );
  const timeZone =
    input.timeZone ?? evidenceWindow.timeZone ?? "America/Los_Angeles";
  const dailyEndDate = evidenceWindow.endDate;
  const weightWindow = rollingWindow(dailyEndDate, 7);
  const weightComparisonWindow = precedingWindow(weightWindow);
  const energyWindow = rollingWindow(dailyEndDate, 7);
  const energyComparisonWindow = precedingWindow(energyWindow);
  const trainingReport =
    input.trainingReport ??
    createTrainingPerformanceIntelligenceReport({
      canonicalObjects: input.canonicalTrainingEvidence ?? [],
      now: `${evaluationDate}T12:00:00Z`,
      generatedAt: `${evaluationDate}T12:00:00.000Z`,
    });
  const rawTraining = Array.isArray(input.canonicalTrainingEvidence)
    ? createCadenceTrainingPIObservations({
        report: trainingReport,
        canonicalTrainingEvidence: input.canonicalTrainingEvidence,
        cadence: "daily",
        evidenceWindow,
        comparisonWindow: precedingWindow(evidenceWindow),
        windowTimeZone: timeZone,
      })
    : adaptTrainingPerformanceReportToPIObservations(trainingReport);
  const exactWeight = input.dailyWeightAssessment != null;
  const exactEnergy = input.dailyEnergyAssessment != null;
  const rawWeight = exactWeight
    ? createDailyWeightPIObservations({
        precomputedAssessment: input.dailyWeightAssessment,
        includeInsufficientData: input.includeInsufficientObservations === true,
      })
    : createWeightPIObservations({
        weights: input.weights ?? [],
        observationWindow: weightWindow,
        comparisonWindow: weightComparisonWindow,
        semanticHorizon: "rolling_7_days",
        includeInsufficientData: input.includeInsufficientObservations === true,
      });
  const energyInput = resolveEnergyInput(input, timeZone);
  const rawEnergy = exactEnergy
    ? createDailyEnergyPIObservations({
        precomputedAssessment: input.dailyEnergyAssessment,
        includeInsufficientData: input.includeInsufficientObservations === true,
      })
    : createEnergyPIObservations({
        ...energyInput,
        observationWindow: energyWindow,
        comparisonWindow: energyComparisonWindow,
        semanticHorizon: "rolling_7_days",
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
      ...rawTraining,
      ...rawWeight,
      ...rawEnergy,
      ...bodyCompositionObservations(input, evidenceWindow),
    ],
    goalContext
  );
  const recoveryPI = createRecoveryPIComposition({
    records: input.recoveryEvidenceRecords ?? [],
    cadence: "daily",
    evidenceWindow,
    comparisonWindow: input.recoveryComparisonWindow ?? precedingWindow(evidenceWindow),
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
  const trainingObservations = observations.filter(
    (item) => item.domain === "training"
  );
  const weightObservations = observations.filter(
    (item) => item.domain === "weight"
  );
  const energyObservations = observations.filter(
    (item) => item.domain === "energy"
  );
  const trainingEnergyReadiness = assessPITrainingEnergyReadiness({
    cadence: "daily",
    trainingObservations,
    energyObservations,
    competingCandidates: eventCandidates(observations),
    renderingCompatible: true,
    memoryCompatible: true,
  });
  const claims = [
    ...createWeightEnergyClaims(weightObservations, energyObservations),
    ...createTrainingWeightClaims(trainingObservations, weightObservations),
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
  const lifecycleResult = resolveLifecycle(claims, input, evaluationDate);
  const claimsForRanking = lifecycleResult.currentClaims;
  const rankingResult = selectPIClaimsForNarrative(
    claimsForRanking,
    {
      cadence: "daily",
      evaluationDate,
      ...(input.rankingContext ?? {}),
    },
    input.rankingOptions ?? {}
  );
  const coverage = {
    training: trainingCoverage(trainingObservations),
    weight: weightCoverage(weightObservations),
    energy: energyCoverage(energyObservations),
    lifecycleContinuity:
      lifecycleResult.status === "evaluated" ? "available" : "unavailable",
  };
  const limitations = [
    ...(!exactWeight
      ? ["daily_weight_semantics_use_rolling_7_day_shadow_window"]
      : []),
    ...(!exactEnergy
      ? ["daily_energy_semantics_use_rolling_7_day_shadow_window"]
      : []),
    ...(lifecycleResult.status === "unavailable"
      ? ["pi_lifecycle_continuity_unavailable"]
      : []),
    ...goalContext.limitations,
    ...(observations.length === 0 ? ["pi_observations_unavailable"] : []),
    ...(claims.length === 0 ? ["cross_domain_claims_unavailable"] : []),
  ];
  const diagnostics = [
    ...(!exactWeight ? [{
      code: "daily_weight_window_extended_for_existing_pi_producer",
      canonicalWindow: {
        startDate: evidenceWindow.startDate,
        endDate: evidenceWindow.endDate,
      },
      shadowWindow: weightWindow,
    }] : []),
    ...(!exactEnergy ? [{
      code: "daily_energy_window_extended_for_existing_pi_producer",
      canonicalWindow: {
        startDate: evidenceWindow.startDate,
        endDate: evidenceWindow.endDate,
      },
      shadowWindow: energyWindow,
    }] : []),
    ...rankingResult.diagnostics,
  ];
  const result = {
    schemaVersion: DAILY_PI_SHADOW_SCHEMA_VERSION,
    briefingDate: evidenceWindow.briefingDate,
    evidenceWindow,
    observationCountsByDomain: countByDomain(observations),
    observations,
    claims,
    lifecycleResult,
    rankingResult,
    primaryCandidate: rankingResult.primary[0] ?? null,
    supportingCandidates: rankingResult.supporting,
    backgroundCandidates: rankingResult.background,
    suppressedCandidates: rankingResult.suppressed,
    coverage,
    limitations: [...new Set(limitations)].sort(),
    diagnostics,
    trainingEnergyReadiness,
    recoveryPI,
    provenance: {
      producer: "daily_briefing_pi_shadow_service",
      producerVersion: DAILY_PI_SHADOW_VERSION,
      evaluationDate,
      timeZone,
      source: {
        evidenceWindowId: evidenceWindow.id,
        evidenceIds: sourceIds(input),
        evidenceFingerprint: fingerprint(sourceIds(input)),
      },
      internalWindows: {
        weight: {
          mode: exactWeight ? "exact_daily_precomputed" : "fallback",
          semanticHorizon: exactWeight
            ? "daily"
            : "rolling_7_days",
          observationWindow: exactWeight
            ? evidenceRange(rawWeight)
            : weightWindow,
          comparisonWindow: exactWeight
            ? comparisonRange(rawWeight)
            : weightComparisonWindow,
        },
        energy: {
          mode: exactEnergy ? "exact_daily_precomputed" : "fallback",
          semanticHorizon: exactEnergy ? "daily" : "rolling_7_days",
          observationWindow: exactEnergy
            ? evidenceRange(rawEnergy)
            : energyWindow,
          comparisonWindow: exactEnergy ? null : energyComparisonWindow,
        },
        training: trainingWindowProvenance(trainingObservations),
      },
      repositoryReads: 0,
      persistenceWrites: 0,
    },
  };
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Daily PI shadow input mutation detected.");
  }
  return result;
}


function bodyCompositionObservations(input, window) {
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

export function auditDailyPIShadowParity({
  shadowResult,
  legacySignals = {},
} = {}) {
  if (!shadowResult || typeof shadowResult !== "object") {
    throw new Error("shadowResult is required.");
  }
  const diagnostics = [];
  compareSignal({
    diagnostics,
    domain: "weight",
    legacy: normalizeMovement(legacySignals.weightDirection),
    pi: piWeightDirection(shadowResult.observations),
    exact:
      shadowResult.provenance?.internalWindows?.weight?.mode ===
        "exact_daily_precomputed" &&
      exactWeightParity(shadowResult.observations, legacySignals.weightAssessment),
  });
  compareSignal({
    diagnostics,
    domain: "training",
    legacy: normalizeTraining(legacySignals.trainingStatus),
    pi: piTrainingDirection(shadowResult.observations),
  });
  compareSignal({
    diagnostics,
    domain: "energy",
    legacy: normalizeCoverage(legacySignals.energyCoverage),
    pi:
      (shadowResult.observationCountsByDomain?.energy ?? 0) > 0
        ? shadowResult.coverage?.energy ?? null
        : null,
    exact:
      shadowResult.provenance?.internalWindows?.energy?.mode ===
        "exact_daily_precomputed" &&
      exactEnergyParity(shadowResult.observations, legacySignals.energyAssessment),
  });

  const rankedDomains = new Set(
    shadowResult.rankingResult?.rankedClaims?.flatMap(
      (item) => item.claim.participatingDomains
    ) ?? []
  );
  if (legacySignals.thesisDomain) {
    diagnostics.push({
      domain: "thesis",
      state: rankedDomains.has(legacySignals.thesisDomain)
        ? "aligned"
        : "legacy_only",
      legacy: legacySignals.thesisDomain,
      pi: [...rankedDomains].sort(),
    });
  } else if (shadowResult.claims.length > 0) {
    diagnostics.push({
      domain: "cross_domain_relationship",
      state: "pi_only",
      legacy: null,
      pi: shadowResult.claims.map((claim) => claim.kind).sort(),
    });
  }
  if (legacySignals.genericTheme === true) {
    diagnostics.push({
      domain: "generic_theme",
      state:
        shadowResult.primaryCandidate == null
          ? "partially_aligned"
          : "legacy_only",
      legacy: "present",
      pi: shadowResult.primaryCandidate?.claimId ?? null,
    });
  }
  return {
    schemaVersion: "daily_pi_shadow_parity_v1",
    overallState: overallParityState(diagnostics),
    diagnostics: diagnostics.sort((left, right) =>
      `${left.domain}|${left.state}`.localeCompare(
        `${right.domain}|${right.state}`
      )
    ),
    provenance: {
      producer: "daily_briefing_pi_shadow_service",
      producerVersion: DAILY_PI_SHADOW_VERSION,
      comparisonMethod: "structured_semantic_parity",
      proseCompared: false,
    },
  };
}

function resolveLifecycle(claims, input, evaluationDate) {
  const mode = input.lifecycleMode ?? "unevaluated";
  if (mode === "unevaluated") {
    return {
      status: "unavailable",
      reason: "prior_pi_claims_not_supplied",
      currentClaims: claims,
      transitionedPriorClaims: [],
      diagnostics: [],
    };
  }
  if (!["new", "evaluate"].includes(mode)) {
    throw new Error("lifecycleMode must be unevaluated, new, or evaluate.");
  }
  if (mode === "evaluate" && !Array.isArray(input.priorClaims)) {
    throw new Error("priorClaims are required for lifecycleMode evaluate.");
  }
  return {
    status: "evaluated",
    ...evaluatePIClaimSetLifecycle(
      claims,
      mode === "new" ? [] : input.priorClaims,
      {
        evaluationDate,
        evaluationCoverage: input.lifecycleEvaluationCoverage ?? "complete",
        ...(input.lifecycleOptions ?? {}),
      }
    ),
  };
}

function resolveEnergyInput(input, timeZone) {
  if (input.energyDays != null) return { days: input.energyDays };
  if (input.energyReconciliationInput != null) {
    return {
      reconciliationInput: {
        ...input.energyReconciliationInput,
        timeZone,
      },
    };
  }
  const objects = (input.canonicalEnergyEvidence ?? []).map(unwrap);
  return {
    reconciliationInput: {
      nutritionDays: objects.filter(
        (item) => item?.evidence_type === "nutrition"
      ),
      activityDays: objects.filter(
        (item) => item?.evidence_type === "activity_day"
      ),
      dexaScans: input.dexaScans ?? [],
      timeZone,
    },
  };
}

function normalizeDailyWindow(window) {
  if (!window || typeof window !== "object") {
    throw new Error("The canonical Daily evidenceWindow is required.");
  }
  const startDate = requiredDate(
    window.startDate ?? String(window.start ?? "").slice(0, 10),
    "evidenceWindow.startDate"
  );
  const endDate = requiredDate(
    window.endDate ?? String(window.end ?? "").slice(0, 10),
    "evidenceWindow.endDate"
  );
  return {
    id: window.id ?? `daily:${startDate}:${window.timeZone ?? "unknown"}`,
    cadence: window.cadence ?? "daily",
    briefingDate: requiredDate(
      window.briefingDate ?? endDate,
      "evidenceWindow.briefingDate"
    ),
    date: window.date ?? endDate,
    startDate,
    endDate,
    start: window.start ?? `${startDate}T00:00:00`,
    end: window.end ?? `${endDate}T23:59:59.999`,
    timeZone: window.timeZone ?? null,
  };
}

function rollingWindow(endDate, days) {
  return { startDate: shiftDate(endDate, -(days - 1)), endDate };
}

function precedingWindow(window) {
  const days = daysInclusive(window.startDate, window.endDate);
  const endDate = shiftDate(window.startDate, -1);
  return { startDate: shiftDate(endDate, -(days - 1)), endDate };
}

function trainingCoverage(observations) {
  if (observations.length === 0) return "missing";
  return observations.some((item) => item.status !== "insufficient_data")
    ? "available"
    : "insufficient";
}

function weightCoverage(observations) {
  if (observations.length === 0) return "missing";
  return observations.some((item) => item.status === "observed")
    ? "available"
    : "insufficient";
}

function energyCoverage(observations) {
  const coverage = observations.find(
    (item) => item.kind === "paired_day_coverage"
  );
  if (!coverage) return "missing";
  if (coverage.status === "insufficient_data") return "missing";
  return coverage.explanationData.partialDays > 0 ? "partial" : "complete";
}

function trainingEvidenceRange(observations) {
  const dates = observations.flatMap((item) => [
    item.evidenceWindow.startDate,
    item.evidenceWindow.endDate,
  ]).filter(Boolean).sort();
  return dates.length
    ? { startDate: dates[0], endDate: dates.at(-1) }
    : { startDate: null, endDate: null };
}

function trainingWindowProvenance(observations) {
  const cadenceWindow = observations.find(
    (item) => item.subject?.type === "training_scope"
  )?.explanationData?.cadenceWindow;
  if (!cadenceWindow) return trainingEvidenceRange(observations);
  const sourceWindow = cadenceWindow.sourceWindow ?? {
    startDate: null,
    endDate: null,
  };
  return {
    // Keep the legacy range alias available to internal consumers while
    // making each distinct semantic window explicit.
    startDate: sourceWindow.startDate,
    endDate: sourceWindow.endDate,
    evidenceWindow: structuredClone(cadenceWindow.evidenceWindow),
    comparisonWindow: structuredClone(cadenceWindow.comparisonWindow),
    sourceWindow: structuredClone(sourceWindow),
  };
}

function countByDomain(observations) {
  return ["training", "weight", "energy"].reduce(
    (result, domain) => ({
      ...result,
      [domain]: observations.filter((item) => item.domain === domain).length,
    }),
    {}
  );
}

function sourceIds(input) {
  return [...new Set([
    ...(input.weights ?? []).map((item) => item.id),
    ...(input.canonicalTrainingEvidence ?? []).map(
      (item) => item.canonicalId ?? item.id ?? item.payload?.id
    ),
    ...(input.canonicalEnergyEvidence ?? []).map(
      (item) => item.canonicalId ?? item.id ?? item.payload?.id
    ),
    ...(input.energyDays ?? []).flatMap((item) => [
      item.nutritionDayId,
      item.activityDayId,
      item.rmrScanId,
    ]),
    ...(input.trainingReport?.observations ?? []).flatMap(
      (item) => item.supporting_session_ids ?? []
    ),
    ...(input.dailyWeightAssessment?.currentEvidenceIds ?? []),
    ...(input.dailyWeightAssessment?.comparisonEvidenceIds ?? []),
    ...(input.dailyEnergyAssessment?.sourceEvidenceIds ?? []),
    input.dailyEnergyAssessment?.nutritionDayId,
    input.dailyEnergyAssessment?.activityDayId,
    input.dailyEnergyAssessment?.rmrScanId,
  ].filter(Boolean))].sort();
}

function fingerprint(ids) {
  let hash = 0x811c9dc5;
  for (const character of ids.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function compareSignal({ diagnostics, domain, legacy, pi, exact = false }) {
  if (!legacy && !pi) {
    diagnostics.push({
      domain,
      state: "insufficient_for_comparison",
      legacy,
      pi,
    });
    return;
  }
  if (legacy && !pi) {
    diagnostics.push({ domain, state: "legacy_only", legacy, pi });
    return;
  }
  if (!legacy && pi) {
    diagnostics.push({ domain, state: "pi_only", legacy, pi });
    return;
  }
  diagnostics.push({
    domain,
    state: signalsConflict(legacy, pi)
      ? "semantic_conflict"
      : legacy === pi
        ? exact
          ? "exactly_aligned"
          : "aligned"
        : "partially_aligned",
    legacy,
    pi,
  });
}

function piWeightDirection(observations) {
  const item = observations.find(
    (observation) =>
      observation.domain === "weight" &&
      [
        "weight_average_change",
        "weight_daily_rolling_average_change",
      ].includes(observation.kind) &&
      observation.status === "observed"
  );
  return normalizeMovement(item?.direction);
}

function piTrainingDirection(observations) {
  const overall = observations.find(
    (item) =>
      item.domain === "training" &&
      item.subject.type === "training_scope"
  );
  return normalizeTraining(overall?.status);
}

function normalizeMovement(value) {
  if (["rising", "falling", "stable"].includes(value)) return value;
  if (value === "moving") return "changing";
  return null;
}

function normalizeTraining(value) {
  if (value === "positive") return "improving";
  if (value === "negative") return "regressing";
  if (value === "neutral" || value === "plateauing") return "stable";
  if (["improving", "regressing", "stable"].includes(value)) return value;
  return null;
}

function normalizeCoverage(value) {
  return ["complete", "partial", "missing"].includes(value) ? value : null;
}

function signalsConflict(left, right) {
  return new Set([
    "rising|falling",
    "falling|rising",
    "improving|regressing",
    "regressing|improving",
    "complete|missing",
    "missing|complete",
  ]).has(`${left}|${right}`);
}

function overallParityState(diagnostics) {
  if (diagnostics.some((item) => item.state === "semantic_conflict")) {
    return "semantic_conflict";
  }
  if (diagnostics.every((item) => item.state === "exactly_aligned")) {
    return "exactly_aligned";
  }
  if (
    diagnostics.every((item) =>
      ["aligned", "exactly_aligned"].includes(item.state)
    )
  ) return "aligned";
  if (
    diagnostics.every(
      (item) => item.state === "insufficient_for_comparison"
    )
  ) return "insufficient_for_comparison";
  return "partially_aligned";
}

function unwrap(item) {
  return item?.payload ? { ...item.payload, id: item.payload.id ?? item.canonicalId } : item;
}

function evidenceRange(observations) {
  const item = observations.find((observation) =>
    observation.evidenceWindow?.startDate
  );
  return item
    ? {
        startDate: item.evidenceWindow.startDate,
        endDate: item.evidenceWindow.endDate,
      }
    : { startDate: null, endDate: null };
}

function comparisonRange(observations) {
  const item = observations.find((observation) =>
    observation.evidenceWindow?.comparisonStartDate
  );
  return item
    ? {
        startDate: item.evidenceWindow.comparisonStartDate,
        endDate: item.evidenceWindow.comparisonEndDate,
      }
    : null;
}

function exactWeightParity(observations, assessment) {
  if (!assessment) return false;
  const item = observations.find(
    (observation) =>
      observation.kind === "weight_daily_rolling_average_change"
  );
  return Boolean(
    item &&
      item.explanationData.currentAverage === assessment.currentAverage &&
      item.explanationData.comparisonAverage === assessment.comparisonAverage &&
      item.explanationData.absoluteChange === assessment.absoluteChange &&
      sameIds(item.supportingEvidenceIds, [
        ...(assessment.currentEvidenceIds ?? []),
        ...(assessment.comparisonEvidenceIds ?? []),
      ])
  );
}

function exactEnergyParity(observations, assessment) {
  if (!assessment) return false;
  const coverage = observations.find(
    (observation) =>
      observation.domain === "energy" &&
      observation.kind === "paired_day_coverage"
  );
  return Boolean(
    coverage &&
      coverage.explanationData.evidenceDate === assessment.evidenceDate &&
      coverage.explanationData.pairedStatus === assessment.pairedStatus &&
      sameIds(coverage.supportingEvidenceIds, [
        ...(assessment.sourceEvidenceIds ?? []),
        assessment.nutritionDayId,
        assessment.activityDayId,
        assessment.rmrScanId,
      ])
  );
}

function sameIds(left = [], right = []) {
  return [...new Set(left)].sort().join("|") ===
    [...new Set(right.filter(Boolean))].sort().join("|");
}

function requiredDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  return value;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysInclusive(startDate, endDate) {
  return (
    Math.floor(
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000)
    ) + 1
  );
}
