import { createHash } from "node:crypto";
import {
  RECOVERY_BRIEFING_SCHEMA_VERSION,
  RECOVERY_STATUS_POLICY_V1,
  RECOVERY_STATUS_POLICY_VERSION,
  RecoveryBriefingCadence,
  RecoveryBriefingStatus,
} from "./RecoveryBriefingPolicyV1.js";

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_CADENCES = new Set(Object.values(RecoveryBriefingCadence));
const ALLOWED_FOAM_STATUSES = new Set(["scheduled", "completed", "missed", "excused"]);
const ALLOWED_TRAINING_RELATIONS = new Set(["same_period", "sleep_precedes_signal"]);
const TRAINING_EXCLUSION_FLAGS = Object.freeze([
  "plannedRest", "deload", "travel", "illness", "injury", "scheduleChange",
]);

export const RECOVERY_BRIEFING_ASSESSMENT_SERVICE_VERSION =
  "recovery_briefing_assessment_service_v1";

export function createRecoveryBriefingAssessmentV1(input = {}) {
  const before = stableSerialize(input);
  const period = normalizePeriod(input.period);
  const evidenceCutoff = timestamp(input.evidenceCutoff, "evidenceCutoff");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const sleepSelection = selectSleepEvidence({
    records: input.sleepEvidence ?? [],
    period,
    evidenceCutoff,
  });
  const baseline = assessBaseline(sleepSelection.baselineRows);
  const periodSleep = assessPeriodSleep({
    rows: sleepSelection.periodRows,
    baseline,
    cadence: period.cadence,
  });
  const training = assessTrainingContext(input.training, period);
  const classification = classify({
    cadence: period.cadence,
    expectedNights: period.expectedNights,
    baseline,
    periodSleep,
    training,
  });
  const foam = assessFoamRolling({
    input: input.foamRolling,
    period,
    evidenceCutoff,
  });
  const corroboration = createCorroboration({ classification, training });
  const commentary = createCommentary({ classification, periodSleep, training });
  const dataLimitations = unique([
    ...sleepSelection.limitations,
    ...classification.limitations,
    ...training.limitations,
    ...foam.limitations,
  ]);
  const sleepEvidenceIds = unique([
    ...sleepSelection.baselineRows.map((row) => row.id),
    ...sleepSelection.periodRows.map((row) => row.id),
  ]);
  const body = {
    schemaVersion: RECOVERY_BRIEFING_SCHEMA_VERSION,
    shadow: true,
    period: {
      cadence: period.cadence,
      startDate: period.startDate,
      endDate: period.endDate,
      timeZone: period.timeZone,
      expectedNights: period.expectedNights,
      observedNights: sleepSelection.periodRows.length,
    },
    status: {
      state: classification.status,
      label: statusLabel(classification.status),
      reasonCodes: classification.reasonCodes,
    },
    sleep: {
      source: "healthkit_sleep",
      baseline: {
        lookbackNights: RECOVERY_STATUS_POLICY_V1.baseline.lookbackNights,
        usableNights: baseline.usableNights,
        centerMinutes: baseline.centerMinutes,
        robustSpreadMinutes: baseline.robustSpreadMinutes,
        excludesCurrentPeriod: true,
        usesFutureData: false,
      },
      periodSummary: {
        averageMinutes: periodSleep.averageMinutes,
        deltaFromBaselineMinutes: periodSleep.averageDeltaMinutes,
        materialLowNights: periodSleep.materialLowNights,
        severeLowNights: periodSleep.severeLowNights,
        longestMaterialLowRun: periodSleep.materialRun,
        longestSevereLowRun: periodSleep.severeRun,
      },
      trend: createTrendProjection(period.cadence, periodSleep.rows),
    },
    foamRolling: foam.presentation,
    corroboration,
    commentary,
    dataLimitations,
    policy: {
      version: RECOVERY_STATUS_POLICY_VERSION,
      confidenceCoupling: "none",
      foamCanSetStatus: false,
      foamCanEscalateStatus: false,
      foamCanRescueStatus: false,
      trainingCanManufactureNonGreenStatus: false,
      causalClaimsAllowed: false,
      medicalThresholds: false,
    },
    provenance: {
      producer: "recovery_briefing_assessment_service_v1",
      producerVersion: RECOVERY_BRIEFING_ASSESSMENT_SERVICE_VERSION,
      shadow: true,
      strategicEligibility: "excluded",
      evidenceCutoff,
      generatedAt: evaluatedAt,
      sleepEvidenceIds,
      foamEvidenceIds: foam.evidenceIds,
      trainingEvidenceIds: training.evidenceIds,
      repositoryReads: 0,
      persistenceWrites: 0,
      runtimeClockReads: 0,
    },
  };
  const semantic = {
    schemaVersion: body.schemaVersion,
    period: body.period,
    status: body.status,
    sleep: body.sleep,
    foamRolling: body.foamRolling,
    corroboration: body.corroboration,
    commentary: body.commentary,
    dataLimitations: body.dataLimitations,
    policy: body.policy,
    evidenceLineage: {
      sleepEvidenceIds,
      foamEvidenceIds: foam.evidenceIds,
      trainingEvidenceIds: training.evidenceIds,
    },
  };
  const semanticDigest = digest(semantic);
  const result = deepFreeze({
    ...body,
    assessmentId: `recovery_briefing_v1|${semanticDigest.slice(7)}`,
    integrity: {
      algorithm: "sha256:stable-json",
      semanticDigest,
    },
  });
  if (stableSerialize(input) !== before) {
    throw new Error("Recovery Briefing V1 assessment input mutation detected.");
  }
  return result;
}

export function validateRecoveryBriefingAssessmentV1(value) {
  if (!value || value.schemaVersion !== RECOVERY_BRIEFING_SCHEMA_VERSION ||
      value.shadow !== true || !String(value.assessmentId).startsWith("recovery_briefing_v1|") ||
      value.policy?.version !== RECOVERY_STATUS_POLICY_VERSION ||
      value.policy?.confidenceCoupling !== "none" ||
      value.policy?.foamCanSetStatus !== false ||
      value.policy?.foamCanEscalateStatus !== false ||
      value.policy?.foamCanRescueStatus !== false ||
      value.policy?.trainingCanManufactureNonGreenStatus !== false ||
      value.policy?.causalClaimsAllowed !== false ||
      value.policy?.medicalThresholds !== false ||
      value.foamRolling?.displayRole !== "execution_context_only" ||
      value.provenance?.shadow !== true ||
      value.provenance?.strategicEligibility !== "excluded" ||
      value.provenance?.repositoryReads !== 0 ||
      value.provenance?.persistenceWrites !== 0 ||
      value.provenance?.runtimeClockReads !== 0 ||
      !Object.values(RecoveryBriefingStatus).includes(value.status?.state)) {
    throw new Error("Invalid Recovery Briefing V1 assessment.");
  }
  const { assessmentId: _assessmentId, integrity: _integrity, ...body } = value;
  const semantic = {
    schemaVersion: body.schemaVersion,
    period: body.period,
    status: body.status,
    sleep: body.sleep,
    foamRolling: body.foamRolling,
    corroboration: body.corroboration,
    commentary: body.commentary,
    dataLimitations: body.dataLimitations,
    policy: body.policy,
    evidenceLineage: {
      sleepEvidenceIds: body.provenance.sleepEvidenceIds,
      foamEvidenceIds: body.provenance.foamEvidenceIds,
      trainingEvidenceIds: body.provenance.trainingEvidenceIds,
    },
  };
  const expectedDigest = digest(semantic);
  if (expectedDigest !== value.integrity?.semanticDigest ||
      value.assessmentId !== `recovery_briefing_v1|${expectedDigest.slice(7)}`) {
    throw new Error("Recovery Briefing V1 assessment integrity mismatch.");
  }
  return value;
}

function normalizePeriod(value) {
  if (!value || !ALLOWED_CADENCES.has(value.cadence)) {
    throw new Error("Recovery Briefing V1 requires a supported cadence.");
  }
  const startDate = date(value.startDate, "period.startDate");
  const endDate = date(value.endDate, "period.endDate");
  if (startDate > endDate) throw new Error("Recovery period must be closed and bounded.");
  const expectedNights = daysBetween(startDate, endDate) + 1;
  if (value.cadence === RecoveryBriefingCadence.MIDWEEK && expectedNights !== 3) {
    throw new Error("Midweek Recovery requires an exact three-night period.");
  }
  if (value.cadence === RecoveryBriefingCadence.WEEKLY && expectedNights !== 7) {
    throw new Error("Weekly Recovery requires an exact seven-night period.");
  }
  if (value.cadence === RecoveryBriefingCadence.MONTHLY &&
      (expectedNights < 28 || expectedNights > 31 || !startDate.endsWith("-01") ||
       shift(endDate, 1).slice(0, 7) === endDate.slice(0, 7))) {
    throw new Error("Monthly Recovery requires one exact calendar month.");
  }
  const timeZone = String(value.timeZone ?? "").trim();
  try {
    if (!timeZone || new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone === undefined) {
      throw new Error();
    }
  } catch {
    throw new Error("Recovery period requires a valid IANA timezone.");
  }
  return { cadence: value.cadence, startDate, endDate, timeZone, expectedNights };
}

function selectSleepEvidence({ records, period, evidenceCutoff }) {
  if (!Array.isArray(records)) throw new Error("sleepEvidence must be an array.");
  const cutoffDate = evidenceCutoff.slice(0, 10);
  const baselineStart = shift(period.startDate, -RECOVERY_STATUS_POLICY_V1.baseline.lookbackNights);
  const selected = [];
  let unreliable = 0;
  for (const raw of records) {
    const sleepDay = raw?.sleepDay ?? raw?.date;
    if (!isValidDateText(sleepDay)) continue;
    if (sleepDay > period.endDate || sleepDay > cutoffDate) {
      continue;
    }
    const availableAt = raw?.availableAt ?? raw?.ingestedAt ?? raw?.recordedAt ?? null;
    if (availableAt !== null) {
      if (!Number.isFinite(Date.parse(availableAt))) {
        unreliable += 1;
        continue;
      }
      if (new Date(availableAt).toISOString() > evidenceCutoff) continue;
    }
    if (sleepDay < baselineStart) continue;
    if (raw.durationReliable !== true || !Number.isFinite(Number(raw.totalSleepMinutes))) {
      unreliable += 1;
      continue;
    }
    const totalSleepMinutes = Number(raw.totalSleepMinutes);
    if (totalSleepMinutes <= 0 || totalSleepMinutes > 1_440) {
      unreliable += 1;
      continue;
    }
    const id = requiredText(raw.id, "sleepEvidence.id");
    selected.push({
      id,
      sleepDay,
      totalSleepMinutes,
      timeZoneUncertain: raw.timeZoneUncertain === true,
      clockTimeReliable: raw.clockTimeReliable === true && raw.timeZoneUncertain !== true,
    });
  }
  selected.sort((left, right) =>
    `${left.sleepDay}|${left.id}`.localeCompare(`${right.sleepDay}|${right.id}`)
  );
  const duplicateDay = selected.find((row, index) =>
    index > 0 && row.sleepDay === selected[index - 1].sleepDay
  );
  if (duplicateDay) throw new Error("Recovery Sleep evidence must be canonical per sleep day.");
  const baselineRows = selected.filter((row) =>
    row.sleepDay >= baselineStart && row.sleepDay < period.startDate
  );
  const periodRows = selected.filter((row) =>
    row.sleepDay >= period.startDate && row.sleepDay <= period.endDate
  );
  return {
    baselineRows,
    periodRows,
    limitations: unique([
      unreliable ? "unreliable_sleep_duration_excluded" : null,
      periodRows.some((row) => row.timeZoneUncertain)
        ? "clock_metrics_ineligible_for_timezone_uncertain_sleep" : null,
    ]),
  };
}

function assessBaseline(rows) {
  const values = rows.map((row) => row.totalSleepMinutes);
  const exactCenterMinutes = median(values);
  const medianAbsoluteDeviation = exactCenterMinutes == null
    ? null
    : median(values.map((value) => Math.abs(value - exactCenterMinutes)));
  const exactRobustSpreadMinutes = medianAbsoluteDeviation == null
    ? null
    : Math.max(
      RECOVERY_STATUS_POLICY_V1.baseline.robustSpread.absoluteFloorMinutes,
      RECOVERY_STATUS_POLICY_V1.baseline.robustSpread.madScale * medianAbsoluteDeviation
    );
  return {
    usableNights: rows.length,
    centerMinutes: round1(exactCenterMinutes),
    exactCenterMinutes,
    robustSpreadMinutes: round1(exactRobustSpreadMinutes),
    exactRobustSpreadMinutes,
    materialThresholdMinutes: exactRobustSpreadMinutes == null ? null : Math.max(
      RECOVERY_STATUS_POLICY_V1.nightFlags.materialLow.absoluteFloorMinutes,
      exactRobustSpreadMinutes * RECOVERY_STATUS_POLICY_V1.nightFlags.materialLow.spreadMultiplier
    ),
    severeThresholdMinutes: exactRobustSpreadMinutes == null ? null : Math.max(
      RECOVERY_STATUS_POLICY_V1.nightFlags.severeLow.absoluteFloorMinutes,
      exactRobustSpreadMinutes * RECOVERY_STATUS_POLICY_V1.nightFlags.severeLow.spreadMultiplier
    ),
  };
}

function assessPeriodSleep({ rows, baseline, cadence }) {
  const evaluated = rows.map((row) => {
    const delta = baseline.exactCenterMinutes == null
      ? null : row.totalSleepMinutes - baseline.exactCenterMinutes;
    return {
      ...row,
      deltaMinutes: delta,
      materialLow: delta != null && delta <= -baseline.materialThresholdMinutes,
      severeLow: delta != null && delta <= -baseline.severeThresholdMinutes,
    };
  });
  const averageMinutes = mean(evaluated.map((row) => row.totalSleepMinutes));
  const averageDeltaMinutes = averageMinutes == null || baseline.exactCenterMinutes == null
    ? null : averageMinutes - baseline.exactCenterMinutes;
  const materialDates = evaluated.filter((row) => row.materialLow).map((row) => row.sleepDay);
  const severeDates = evaluated.filter((row) => row.severeLow).map((row) => row.sleepDay);
  return {
    rows: evaluated,
    averageMinutes: round1(averageMinutes),
    averageDeltaMinutes: round1(averageDeltaMinutes),
    exactAverageDeltaMinutes: averageDeltaMinutes,
    materialLowNights: materialDates.length,
    severeLowNights: severeDates.length,
    materialRun: longestConsecutiveRun(materialDates),
    severeRun: longestConsecutiveRun(severeDates),
    yellowSubperiods: cadence === RecoveryBriefingCadence.MONTHLY
      ? countMonthlyYellowSubperiods(evaluated, baseline.materialThresholdMinutes)
      : 0,
  };
}

function classify({ cadence, expectedNights, baseline, periodSleep, training }) {
  const policy = RECOVERY_STATUS_POLICY_V1.cadences[cadence];
  const limitations = [];
  const reasons = [];
  if (baseline.usableNights < RECOVERY_STATUS_POLICY_V1.baseline.minimumUsableNights) {
    reasons.push("insufficient_baseline_nights");
    limitations.push("minimum_personal_baseline_not_met");
  }
  if (periodSleep.rows.length < policy.minimumPeriodNights) {
    reasons.push("insufficient_period_nights");
    limitations.push("minimum_period_coverage_not_met");
  }
  if (reasons.length) {
    return {
      status: RecoveryBriefingStatus.UNAVAILABLE,
      reasonCodes: unique(reasons),
      limitations: unique(limitations),
      sleepYellow: false,
      redKind: null,
    };
  }
  const averageDelta = periodSleep.exactAverageDeltaMinutes;
  const materialThreshold = baseline.materialThresholdMinutes;
  const severeThreshold = baseline.severeThresholdMinutes;
  let sleepYellow = false;
  let sleepOnlyRed = false;
  let corroboratedRed = false;
  if (cadence === RecoveryBriefingCadence.MIDWEEK) {
    const threshold = Math.max(
      policy.yellow.averageDeltaFloorMinutes,
      baseline.exactRobustSpreadMinutes
    );
    sleepYellow = periodSleep.materialLowNights >= policy.yellow.minimumMaterialLowNights &&
      periodSleep.materialRun >= policy.yellow.minimumMaterialRun &&
      averageDelta <= -threshold;
  } else if (cadence === RecoveryBriefingCadence.WEEKLY) {
    sleepYellow = periodSleep.materialLowNights >= policy.yellow.minimumMaterialLowNights &&
      periodSleep.materialRun >= policy.yellow.minimumMaterialRun &&
      averageDelta <= -materialThreshold;
    sleepOnlyRed = periodSleep.severeLowNights >= policy.red.minimumSevereLowNights &&
      periodSleep.severeRun >= policy.red.minimumSevereRun &&
      averageDelta <= -severeThreshold;
    corroboratedRed = sleepYellow &&
      periodSleep.severeLowNights >= policy.red.corroboratedMinimumSevereLowNights &&
      training.qualifies;
  } else {
    sleepYellow = periodSleep.yellowSubperiods >= policy.yellow.minimumYellowSubperiods ||
      periodSleep.materialLowNights >= policy.yellow.minimumMaterialLowNights;
    sleepOnlyRed = periodSleep.rows.length > 0 &&
      periodSleep.severeLowNights / periodSleep.rows.length >= policy.red.severeNightRatio &&
      averageDelta <= -severeThreshold;
    corroboratedRed = sleepYellow &&
      periodSleep.severeLowNights >= policy.red.corroboratedMinimumSevereLowNights &&
      training.qualifies;
  }
  if (policy.redAllowed && (sleepOnlyRed || corroboratedRed)) {
    return {
      status: RecoveryBriefingStatus.RED,
      reasonCodes: unique([
        "severe_persistent_low_sleep",
        corroboratedRed ? "corroborated_training_constraint" : null,
      ]),
      limitations: [],
      sleepYellow,
      redKind: corroboratedRed ? "corroborated" : "sleep_only_extreme",
    };
  }
  if (sleepYellow) {
    return {
      status: RecoveryBriefingStatus.YELLOW,
      reasonCodes: ["persistent_low_sleep"],
      limitations: [],
      sleepYellow: true,
      redKind: null,
    };
  }
  return {
    status: RecoveryBriefingStatus.GREEN,
    reasonCodes: ["period_typical"],
    limitations: expectedNights > periodSleep.rows.length ? ["period_sleep_coverage_partial"] : [],
    sleepYellow: false,
    redKind: null,
  };
}

function assessTrainingContext(value, period) {
  const current = value?.current ?? null;
  const periods = Array.isArray(value?.baselinePeriods) ? value.baselinePeriods : [];
  if (!current) {
    return trainingResult("insufficient", false, false, [], ["training_context_unavailable"], null);
  }
  if (current.periodStartDate !== period.startDate || current.periodEndDate !== period.endDate) {
    return trainingResult("insufficient", false, false,
      unique(current.evidenceIds ?? []), ["training_current_period_unbounded"], null);
  }
  const exclusion = TRAINING_EXCLUSION_FLAGS.find((flag) => current.context?.[flag] === true);
  const currentEvidenceIds = unique(current.evidenceIds ?? []);
  if (exclusion) {
    return trainingResult("excluded", false, false, currentEvidenceIds,
      [`training_context_excluded_${exclusion}`], null);
  }
  const comparable = periods
    .filter((item) => item?.comparable === true && !item.excludedReason &&
      isValidDateText(item.endDate) && item.endDate < period.startDate &&
      Number.isInteger(Number(item.completedSessions)) && Number(item.completedSessions) >= 0)
    .sort((left, right) => String(left.endDate ?? left.id ?? "")
      .localeCompare(String(right.endDate ?? right.id ?? "")))
    .slice(-RECOVERY_STATUS_POLICY_V1.training.baselineComparablePeriods);
  const evidenceIds = unique([
    ...currentEvidenceIds,
    ...comparable.flatMap((item) => item.evidenceIds ?? []),
  ]);
  if (comparable.length < RECOVERY_STATUS_POLICY_V1.training.minimumComparablePeriods) {
    return trainingResult("insufficient", false, false,
      evidenceIds, ["training_comparable_baseline_insufficient"], null);
  }
  const typicalSessions = median(comparable.map((item) => Number(item.completedSessions)));
  if (typicalSessions < RECOVERY_STATUS_POLICY_V1.training.minimumTypicalSessions) {
    return trainingResult("insufficient", false, false,
      evidenceIds, ["training_typical_session_count_too_low"], typicalSessions);
  }
  const completedSessions = Number(current.completedSessions);
  if (!Number.isInteger(completedSessions) || completedSessions < 0) {
    return trainingResult("insufficient", false, false,
      evidenceIds, ["training_completed_sessions_invalid"], typicalSessions);
  }
  const expectedSessions = typicalSessions * period.expectedNights / 7;
  const minimumReduction = Math.max(
    RECOVERY_STATUS_POLICY_V1.training.minimumReductionSessions[period.cadence],
    Math.ceil(expectedSessions * RECOVERY_STATUS_POLICY_V1.training.minimumReductionRatio)
  );
  const reduction = Number.isFinite(completedSessions)
    ? expectedSessions - completedSessions : null;
  const temporalRelation = ALLOWED_TRAINING_RELATIONS.has(current.temporalRelation)
    ? current.temporalRelation : null;
  const qualifies = current.materialConstraint === true &&
    currentEvidenceIds.length > 0 && temporalRelation !== null &&
    reduction != null && reduction >= minimumReduction;
  const held = current.performanceHeld === true && current.materialConstraint !== true &&
    currentEvidenceIds.length > 0;
  const limitations = unique([
    current.materialConstraint === true && currentEvidenceIds.length === 0
      ? "training_constraint_evidence_missing" : null,
    current.materialConstraint === true && temporalRelation === null
      ? "training_temporal_relation_unavailable" : null,
    !qualifies && current.materialConstraint !== true
      ? "training_absence_alone_not_corroboration" : null,
    current.performanceHeld === true && currentEvidenceIds.length === 0
      ? "training_held_evidence_missing" : null,
  ]);
  return trainingResult(
    qualifies ? "material_constraint" : held ? "held" : "not_material",
    qualifies,
    held,
    evidenceIds,
    limitations,
    typicalSessions,
    { completedSessions, expectedSessions, reduction, minimumReduction, temporalRelation }
  );
}

function trainingResult(state, qualifies, held, evidenceIds, limitations, typicalSessions, detail = {}) {
  return {
    state,
    qualifies,
    held,
    evidenceIds: unique(evidenceIds),
    limitations: unique(limitations),
    typicalSessions: round1(typicalSessions),
    completedSessions: detail.completedSessions ?? null,
    expectedSessions: detail.expectedSessions ?? null,
    reduction: detail.reduction ?? null,
    minimumReduction: detail.minimumReduction ?? null,
    temporalRelation: detail.temporalRelation ?? null,
    causality: "not_inferred",
  };
}

function assessFoamRolling({ input, period, evidenceCutoff }) {
  const occurrences = Array.isArray(input?.occurrences) ? input.occurrences : [];
  const cutoffDate = evidenceCutoff.slice(0, 10);
  const effectiveFrom = input?.scheduleEffectiveFrom == null
    ? null : date(input.scheduleEffectiveFrom, "foamRolling.scheduleEffectiveFrom");
  const relevant = occurrences.filter((item) => {
    const occurrenceDate = item?.date;
    return DATE.test(String(occurrenceDate ?? "")) &&
      occurrenceDate >= period.startDate && occurrenceDate <= period.endDate &&
      occurrenceDate <= cutoffDate;
  }).map((item) => ({
    id: requiredText(item.id, "foamRolling.occurrences.id"),
    date: item.date,
    status: ALLOWED_FOAM_STATUSES.has(item.status) ? item.status : "scheduled",
    authority: item.authority === "authoritative" ? "authoritative" : "observed_only",
  })).sort((left, right) => `${left.date}|${left.id}`.localeCompare(`${right.date}|${right.id}`));
  const authoritative = relevant.filter((item) => item.authority === "authoritative" &&
    effectiveFrom !== null && item.date >= effectiveFrom);
  const observed = relevant.filter((item) => item.authority === "observed_only" &&
    item.status === "completed");
  const authorityEffective = effectiveFrom !== null && effectiveFrom <= period.endDate;
  const completed = authorityEffective
    ? authoritative.filter((item) => item.status === "completed").length
    : observed.length;
  const missed = authoritative.filter((item) => item.status === "missed").length;
  const excused = authoritative.filter((item) => item.status === "excused").length;
  const state = authorityEffective
    ? missed > 0 ? "mixed" : "on_track"
    : observed.length ? "observed_only"
      : effectiveFrom && effectiveFrom > period.endDate ? "not_scheduled" : "unavailable";
  return {
    presentation: {
      displayRole: "execution_context_only",
      scheduleAuthority: authorityEffective
        ? "authoritative"
        : effectiveFrom && effectiveFrom > period.endDate ? "not_yet_effective" : "unavailable",
      scheduledOccurrences: authorityEffective ? authoritative.length : null,
      completedOccurrences: completed,
      missedOccurrences: authorityEffective ? missed : null,
      exceptionOccurrences: authorityEffective ? excused : null,
      state,
    },
    evidenceIds: unique(relevant.map((item) => item.id)),
    limitations: unique([
      !authorityEffective ? "foam_schedule_authority_unavailable_for_period" : null,
      observed.length && !authorityEffective
        ? "foam_observed_completions_have_no_schedule_denominator" : null,
      observed.length && authorityEffective
        ? "foam_observed_only_completions_excluded_from_authoritative_counts" : null,
    ]),
  };
}

function createCorroboration({ classification, training }) {
  if (!training.qualifies || !classification.sleepYellow ||
      classification.status !== RecoveryBriefingStatus.RED ||
      classification.redKind !== "corroborated") return [];
  return [{
    domain: "training",
    signal: "material_training_constraint",
    temporalRelation: training.temporalRelation,
    language: "A material training constraint accompanied the severe Sleep pattern. The timing is associated; causation is not inferred.",
    causality: "not_inferred",
  }];
}

function createCommentary({ classification, periodSleep, training }) {
  if (classification.status === RecoveryBriefingStatus.GREEN ||
      classification.status === RecoveryBriefingStatus.UNAVAILABLE) {
    return { visible: false, headline: null, body: null };
  }
  if (classification.status === RecoveryBriefingStatus.YELLOW) {
    return {
      visible: true,
      headline: "Sleep was persistently below your personal baseline.",
      body: `${periodSleep.materialLowNights} nights were materially low.${training.held ? " Training performance held." : ""}`,
    };
  }
  return {
    visible: true,
    headline: "Sleep strain was severe and persistent.",
    body: classification.redKind === "corroborated"
      ? `${periodSleep.severeLowNights} nights were severely low. A material training constraint accompanied the Sleep pattern; causation is not inferred.`
      : `${periodSleep.severeLowNights} nights were severely low.`,
  };
}

function createTrendProjection(cadence, rows) {
  const clockMetricsEligible = rows.length > 0 && rows.every((row) => row.clockTimeReliable);
  if (cadence !== RecoveryBriefingCadence.MONTHLY) {
    return {
      granularity: "night",
      clockMetricsEligible,
      points: rows.map((row) => ({
        label: row.sleepDay,
        totalSleepMinutes: round1(row.totalSleepMinutes),
        reliability: row.timeZoneUncertain ? "timezone_uncertain" : "reliable",
      })),
    };
  }
  const groups = new Map();
  for (const row of rows) {
    const weekStart = sunday(row.sleepDay);
    const group = groups.get(weekStart) ?? [];
    group.push(row);
    groups.set(weekStart, group);
  }
  return {
    granularity: "week",
    clockMetricsEligible,
    points: [...groups].sort(([left], [right]) => left.localeCompare(right))
      .map(([weekStart, values]) => ({
        label: weekStart,
        totalSleepMinutes: round1(mean(values.map((row) => row.totalSleepMinutes))),
        reliability: values.some((row) => row.timeZoneUncertain)
          ? "timezone_uncertain" : "reliable",
      })),
  };
}

function countMonthlyYellowSubperiods(rows, materialThreshold) {
  if (!Number.isFinite(materialThreshold)) return 0;
  const groups = new Map();
  for (const row of rows) {
    const weekStart = sunday(row.sleepDay);
    const group = groups.get(weekStart) ?? [];
    group.push(row);
    groups.set(weekStart, group);
  }
  return [...groups.values()].filter((week) => {
    const lows = week.filter((row) => row.materialLow);
    return week.length >= 4 && lows.length >= 3 &&
      longestConsecutiveRun(lows.map((row) => row.sleepDay)) >= 2 &&
      mean(week.map((row) => row.deltaMinutes)) <= -materialThreshold;
  }).length;
}

function longestConsecutiveRun(values) {
  const dates = unique(values).sort();
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const value of dates) {
    current = previous !== null && shift(previous, 1) === value ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = value;
  }
  return longest;
}

function statusLabel(status) {
  return ({ green: "Green", yellow: "Yellow", red: "Red",
    unavailable: "Not enough data" })[status];
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!valid.length) return null;
  const midpoint = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[midpoint] : (valid[midpoint - 1] + valid[midpoint]) / 2;
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function sunday(value) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shift(value, -day);
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS)
    .toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T12:00:00Z`) -
    Date.parse(`${left}T12:00:00Z`)) / DAY_MS);
}

function date(value, field) {
  const text = String(value ?? "");
  if (!isValidDateText(text)) {
    throw new Error(`${field} requires a valid YYYY-MM-DD date.`);
  }
  return text;
}

function isValidDateText(value) {
  const text = String(value ?? "");
  if (!DATE.test(text)) return false;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function timestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} requires a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256_${createHash("sha256").update(stableSerialize(value)).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
