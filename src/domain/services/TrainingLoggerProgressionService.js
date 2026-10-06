import {
  getCanonicalTrainingExerciseSlug,
} from "../models/trainingExerciseIdentity";
import {
  getTrainingExecutionVariantKey,
} from "../models/trainingExecutionVariant";
import {
  deriveTrainingExerciseRelationshipContext,
  getTrainingExerciseRelationshipComparisonKey,
} from "../models/trainingExerciseRelationship";
import {
  resolveExecutableTrainingProgressionPolicy,
} from "./TrainingProgressionPolicy.js";

export const TRAINING_LOGGER_PROGRESSION_STATUS = Object.freeze({
  INSUFFICIENT: "insufficient_evidence",
  MAINTAIN: "maintain_current_performance",
  ON_PACE: "on_pace",
  OPPORTUNITY: "progression_opportunity",
  RECOVER: "recover_prior_performance",
});

const PHASE_EXPECTATIONS = Object.freeze({
  gain: { opportunityDays: 12, label: "gain phase" },
  maintenance: { opportunityDays: 28, label: "maintenance phase" },
  cut: { opportunityDays: 35, label: "cut phase" },
  unknown: { opportunityDays: 21, label: "current phase" },
});

export function createTrainingLoggerProgressionRecommendation({
  canonicalExerciseId,
  goalContext = null,
  nowDate,
  relationshipContext = null,
  sessions = [],
  trainingStrategy = null,
  variant = null,
} = {}) {
  const comparisonContext = createComparisonContext({
    canonicalExerciseId,
    relationshipContext,
    variant,
  });
  const policy = resolveExecutableTrainingProgressionPolicy({
    canonicalExerciseId,
    trainingStrategy,
  });
  const nowDateKey = String(nowDate ?? "").slice(0, 10);
  const comparable = listComparablePerformances({
    canonicalExerciseId,
    relationshipContext,
    sessions,
    variant,
  }).filter((entry) => !nowDateKey || entry.date <= nowDateKey);
  const phase = resolveTrainingProgressionPhase(goalContext);
  const phaseExpectation = PHASE_EXPECTATIONS[phase];

  if (!policy.executable) {
    return insufficient({
      calibration: diagnosticCalibration({ comparable, phase, phaseExpectation, sessions }),
      comparisonContext,
      comparable,
      policy,
      reason: "The active Training Strategy progression rule cannot be executed safely.",
      reasonCode: policy.reasonCode,
    });
  }

  if (comparable.length < 2) {
    return insufficient({
      calibration: diagnosticCalibration({ comparable, phase, phaseExpectation, sessions }),
      comparisonContext,
      comparable,
      policy,
      reason: "More comparable finalized sessions are needed before recommending progression.",
      reasonCode: "insufficient_comparable_finalized_sessions",
    });
  }

  const latest = comparable[0];
  const previous = comparable[1] ?? null;
  const calibration = diagnosticCalibration({ comparable, phase, phaseExpectation, sessions });
  const currentLoadRun = listCurrentLoadRun(comparable, latest);
  const qualifyingRun = listCurrentQualifyingRun(currentLoadRun, policy);
  const exposureStartDate = qualifyingRun.at(-1)?.date ?? null;
  const exposureDays = exposureStartDate ? daysBetween(nowDateKey, exposureStartDate) : 0;
  const qualifyingSuccessfulSessions = qualifyingRun.length;
  const sessionCountGateSatisfied = qualifyingSuccessfulSessions >= policy.successfulSessionsRequired;
  const exposureGateSatisfied = exposureStartDate !== null && exposureDays >= policy.minimumExposureDays;
  const gates = Object.freeze({
    eligible: sessionCountGateSatisfied && exposureGateSatisfied,
    exposureGateSatisfied,
    sessionCountGateSatisfied,
  });
  const confidence = comparable.length >= 5 ? "high" : comparable.length >= 3 ? "moderate" : "low";
  const common = {
    confidence,
    comparisonContext,
    historyReferences: comparable.slice(0, 6).map(toHistoryReference),
    calibration,
    progressionPolicy: projectPolicy(policy),
    successfulSessionsRequired: policy.successfulSessionsRequired,
    qualifyingSuccessfulSessions,
    exposureStartDate,
    minimumExposureDays: policy.minimumExposureDays,
    exposureDays,
    progressionGates: gates,
  };

  if (previous && comparePerformance(latest, previous) < 0) {
    return {
      ...common,
      status: TRAINING_LOGGER_PROGRESSION_STATUS.RECOVER,
      reason: "The latest comparable session was below the prior performance.",
      reasonCode: "latest_performance_regressed",
      recommendedAction: "keep_previous",
      recommendedLoad: previous.load,
      recommendedLoadType: previous.loadType,
      recommendedReps: previous.reps,
      recommendedUnit: previous.unit,
      targetSelection: Object.freeze({ status: "recovery_target", policy: "prior_comparable_performance" }),
    };
  }

  if (gates.eligible) {
    const target = deriveEvidenceSupportedTarget(comparable, policy);
    return {
      ...common,
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      reason: `The current prescription has ${qualifyingSuccessfulSessions} qualifying successful sessions and ${exposureDays} days of exposure.`,
      reasonCode: "strategy_eligibility_gates_satisfied",
      recommendedAction: target ? "use_suggestion" : "consider_progression",
      recommendedLoad: target?.load ?? null,
      recommendedLoadType: target ? latest.loadType : null,
      recommendedReps: target?.reps ?? null,
      recommendedUnit: target ? latest.unit : null,
      targetSelection: target
        ? Object.freeze({ status: "available", policy: target.policy })
        : Object.freeze({ status: "unavailable", policy: "no_evidence_supported_load_increment" }),
    };
  }

  const progressed = previous && comparePerformance(latest, previous) > 0;
  const reasonCode = !sessionCountGateSatisfied
    ? "successful_session_gate_pending"
    : "minimum_exposure_gate_pending";
  return {
    ...common,
    status: progressed
      ? TRAINING_LOGGER_PROGRESSION_STATUS.ON_PACE
      : TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
    reason: !sessionCountGateSatisfied
      ? `${policy.successfulSessionsRequired - qualifyingSuccessfulSessions} more qualifying successful session${policy.successfulSessionsRequired - qualifyingSuccessfulSessions === 1 ? " is" : "s are"} required at the current prescription.`
      : `${policy.minimumExposureDays - exposureDays} more exposure day${policy.minimumExposureDays - exposureDays === 1 ? " is" : "s are"} required from the first qualifying success.`,
    reasonCode,
    recommendedAction: "maintain",
    recommendedLoad: latest.load,
    recommendedLoadType: latest.loadType,
    recommendedReps: latest.reps,
    recommendedUnit: latest.unit,
    targetSelection: Object.freeze({ status: "not_eligible", policy: null }),
  };
}

export function resolveTrainingProgressionPhase(goalContext = null) {
  const explicitPhase = [
    goalContext?.phase?.type,
    goalContext?.phase?.label,
    goalContext?.phase?.name,
  ].filter(Boolean).join(" ").toLowerCase();
  const fallback = [
    goalContext?.type,
    goalContext?.title,
    goalContext?.strategy,
  ].filter(Boolean).join(" ").toLowerCase();
  return phaseFromText(explicitPhase) ?? phaseFromText(fallback) ?? "unknown";
}

export function listComparablePerformances({
  canonicalExerciseId,
  relationshipContext = null,
  sessions = [],
  variant = null,
} = {}) {
  const requestedVariantKey = getTrainingExecutionVariantKey(variant);
  const requestedRelationshipKey = getTrainingExerciseRelationshipComparisonKey(
    relationshipContext
  );
  const matches = listAllPerformances(sessions)
    .filter((entry) => entry.canonicalExerciseId === canonicalExerciseId)
    .filter((entry) => entry.variantKey === requestedVariantKey)
    .filter((entry) => entry.relationshipKey === requestedRelationshipKey)
    .sort(compareOccurrenceOrder);
  const bySession = new Map();
  matches.forEach((entry) => {
    const existing = bySession.get(entry.sessionKey);
    if (!existing || entry.sets.length > existing.sets.length ||
      (entry.sets.length === existing.sets.length && comparePerformance(entry, existing) > 0)) {
      bySession.set(entry.sessionKey, entry);
    }
  });
  return [...bySession.values()].sort(compareOccurrenceOrder);
}

function listAllPerformances(sessions = []) {
  return sessions.flatMap((candidate, sessionIndex) => {
    const session = candidate?.payload ?? candidate;
    const qualityStatus = String(candidate?.quality?.status ?? session?.quality?.status ?? "").toLowerCase();
    if (session?.evidence_type !== "training" ||
      ["draft", "pending", "partial", "superseded"].includes(qualityStatus)) return [];
    const observedAt = String(session.observed_at ?? session.date ?? "");
    const sessionId = session.id ?? candidate?.canonicalId ?? null;
    const sessionKey = String(sessionId ?? `legacy_session_${sessionIndex}_${observedAt}`);
    return (session.exercises ?? []).map((exercise, exerciseIndex) => {
      const sets = normalizeComparableSets(exercise.sets);
      const best = getBestComparableSet(sets);
      if (!best) return null;
      return {
        canonicalExerciseId: exercise.canonicalExerciseId ??
          getCanonicalTrainingExerciseSlug(exercise.name),
        date: observedAt.slice(0, 10),
        load: best.load,
        loadType: best.loadType,
        occurrenceId: exercise.id ?? `occurrence_${exerciseIndex}`,
        observedAt,
        reps: best.reps,
        relationshipKey: getTrainingExerciseRelationshipComparisonKey(
          deriveTrainingExerciseRelationshipContext({ exercise, session })
        ),
        sessionId,
        sessionKey,
        setProfileKey: sets.map(setProfilePart).join(";"),
        sets,
        unit: best.unit,
        variantKey: getTrainingExecutionVariantKey(exercise),
      };
    }).filter((entry) => entry?.date);
  });
}

function normalizeComparableSets(sets = []) {
  return (sets ?? [])
    .filter((set) => set?.completed !== false && set?.isCompleted !== false)
    .map((set) => {
      const loadType = set.load_type ?? set.loadType ??
        (set.weight_unit === "bodyweight" || set.unit === "bodyweight"
          ? "bodyweight"
          : "external_load");
      return {
        load: loadType === "bodyweight" ? 0 : finite(set.weight ?? set.load),
        loadType,
        reps: finite(set.reps),
        unit: loadType === "bodyweight" ? "bodyweight" : set.weight_unit ?? set.unit ?? "lb",
      };
    })
    .filter((set) => set.load !== null && set.reps !== null);
}

function getBestComparableSet(sets = []) {
  return [...sets].sort((left, right) => comparePerformance(right, left))[0] ?? null;
}

function listCurrentLoadRun(entries, latest) {
  const run = [];
  for (const entry of entries) {
    if (!sameLoadContext(entry, latest)) break;
    run.push(entry);
  }
  return run;
}

function listCurrentQualifyingRun(entries, policy) {
  if (!entries.length) return [];
  const latestProfile = entries[0].setProfileKey;
  const run = [];
  for (const entry of entries) {
    const qualifies = policy.qualificationMode === "prescribed_top_of_rep_range"
      ? qualifiesAtConfiguredTopOfRange(entry, policy)
      : entry.setProfileKey === latestProfile;
    if (!qualifies) break;
    run.push(entry);
  }
  return run;
}

function qualifiesAtConfiguredTopOfRange(entry, policy) {
  if (!entry.sets.length) return false;
  if (policy.workingSetsRequired !== null && entry.sets.length !== policy.workingSetsRequired) return false;
  return entry.sets.every((set) =>
    sameLoadContext(set, entry) && set.reps >= policy.repRange.maximum
  );
}

function diagnosticCalibration({ comparable, phase, phaseExpectation, sessions }) {
  const movementCadenceDays = inferProgressionCadenceDays(comparable, 3);
  const userCadenceDays = inferUserProgressionCadenceDays(listAllPerformances(sessions), 4);
  return Object.freeze({
    phase,
    phaseExpectationDays: phaseExpectation.opportunityDays,
    movementCadenceDays,
    userCadenceDays,
    effectiveCadenceDays: movementCadenceDays ?? userCadenceDays ?? phaseExpectation.opportunityDays,
    eligibilityRole: "diagnostic_only",
  });
}

function inferProgressionCadenceDays(entries = [], minimumEvents) {
  const intervals = listProgressionIntervals(entries);
  if (intervals.length < minimumEvents) return null;
  intervals.sort((left, right) => left - right);
  return intervals[Math.floor(intervals.length / 2)];
}

function inferUserProgressionCadenceDays(entries = [], minimumEvents) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const key = [entry.canonicalExerciseId, entry.variantKey, entry.relationshipKey].join("|");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  });
  const intervals = [...grouped.values()].flatMap(listProgressionIntervals);
  if (intervals.length < minimumEvents) return null;
  intervals.sort((left, right) => left - right);
  return intervals[Math.floor(intervals.length / 2)];
}

function listProgressionIntervals(entries = []) {
  const ordered = [...entries].sort((left, right) => compareOccurrenceOrder(right, left));
  const intervals = [];
  for (let index = 1; index < ordered.length; index += 1) {
    if (comparePerformance(ordered[index], ordered[index - 1]) > 0) {
      const interval = daysBetween(ordered[index].date, ordered[index - 1].date);
      if (interval > 0 && interval <= 90) intervals.push(interval);
    }
  }
  return intervals;
}

function deriveEvidenceSupportedTarget(entries = [], policy) {
  const ordered = [...entries].sort((left, right) => compareOccurrenceOrder(right, left));
  const increments = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const prior = ordered[index - 1];
    if (current.loadType !== prior.loadType || current.unit !== prior.unit) continue;
    const increment = current.load - prior.load;
    if (increment > 0 && increment <= 50) increments.push(increment);
  }
  const latest = entries[0];
  if (increments.length < 2 || latest.load <= 0) return null;
  return {
    load: latest.load + Math.min(...increments),
    reps: policy.repRange?.minimum ?? Math.max(1, latest.reps - 2),
    policy: "historical_minimum_load_increment",
  };
}

function insufficient({ calibration, comparisonContext, comparable, policy, reason, reasonCode }) {
  return {
    status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
    confidence: "low",
    reason,
    reasonCode,
    recommendedAction: "manual_or_previous",
    recommendedLoad: null,
    recommendedLoadType: null,
    recommendedReps: null,
    recommendedUnit: null,
    comparisonContext,
    historyReferences: comparable.slice(0, 6).map(toHistoryReference),
    calibration,
    progressionPolicy: projectPolicy(policy),
    successfulSessionsRequired: policy.successfulSessionsRequired ?? null,
    qualifyingSuccessfulSessions: 0,
    exposureStartDate: null,
    minimumExposureDays: policy.minimumExposureDays ?? null,
    exposureDays: 0,
    progressionGates: Object.freeze({
      eligible: false,
      exposureGateSatisfied: false,
      sessionCountGateSatisfied: false,
    }),
    targetSelection: Object.freeze({ status: "not_eligible", policy: null }),
  };
}

function projectPolicy(policy) {
  if (!policy.executable) {
    return Object.freeze({
      executable: false,
      version: policy.version,
      reasonCode: policy.reasonCode,
    });
  }
  return Object.freeze({
    executable: true,
    version: policy.version,
    source: policy.source,
    ruleType: policy.ruleType,
    condition: policy.condition,
    action: policy.action,
    qualificationMode: policy.qualificationMode,
    minimumExposureSource: policy.minimumExposureSource,
    limitation: policy.limitation,
  });
}

function compareOccurrenceOrder(left, right) {
  const observed = String(right.observedAt).localeCompare(String(left.observedAt));
  if (observed !== 0) return observed;
  return String(right.sessionKey).localeCompare(String(left.sessionKey));
}

function comparePerformance(left, right) {
  if (left.load !== right.load) return left.load - right.load;
  return left.reps - right.reps;
}

function sameLoadContext(left, right) {
  return left.load === right.load && left.loadType === right.loadType && left.unit === right.unit;
}

function daysBetween(later, earlier) {
  const laterTime = Date.parse(String(later ?? ""));
  const earlierTime = Date.parse(String(earlier ?? ""));
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return 0;
  return Math.max(0, Math.floor((laterTime - earlierTime) / 86400000));
}

function createComparisonContext({ canonicalExerciseId, relationshipContext, variant }) {
  return {
    canonicalExerciseId,
    relationshipKey: getTrainingExerciseRelationshipComparisonKey(relationshipContext),
    variantKey: getTrainingExecutionVariantKey(variant),
  };
}

function toHistoryReference(entry) {
  return {
    date: entry.date,
    sessionId: entry.sessionId,
  };
}

function setProfilePart(set) {
  return [set.loadType, set.load, set.unit, set.reps].join("|");
}

function phaseFromText(text) {
  if (!text) return null;
  if (/cut|deficit|fat loss|lean out/.test(text)) return "cut";
  if (/maintain|maintenance|stabil/.test(text)) return "maintenance";
  if (/gain|surplus|build|hypertrophy|mass/.test(text)) return "gain";
  return null;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
