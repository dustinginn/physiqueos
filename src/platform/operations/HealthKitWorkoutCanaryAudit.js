import { createHash } from "node:crypto";
import {
  assessHealthKitStrategicEvidenceEligibility,
  isHealthKitDerivedRecord,
} from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { resolveHealthKitWorkoutActivationPolicy } from "../../domain/services/HealthKitObservationService.js";
import { deriveHealthKitWorkoutLocalDate } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HealthKitStrengthMatchOutcome,
  assessHealthKitStrengthLinkCandidates,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import { findHealthKitWorkoutRelationshipViolations } from "../../domain/services/HealthKitWorkoutRelationshipService.js";
import { isActiveDetailedStrengthSession } from "../../domain/services/HealthKitObservationService.js";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 10);

/**
 * Pure, read-only proof for a Workout canary window. It reports the policy,
 * every workout observation and canonical workout in the window, the stored and
 * a freshly recomputed strength link assessment, existing links, and the
 * strategic quarantine counts. Private identifiers (HealthKit ids, Logger
 * session ids) are shown only as short hashes; `includeValues` controls whether
 * telemetry numbers appear.
 */
export function summarizeHealthKitWorkoutCanary({
  policyRecord = null,
  observations = [],
  canonicalWorkouts = [],
  links = [],
  claims = [],
  canonicalEvidenceObjects = [],
  startLocalDate,
  endLocalDate,
  includeValues = true,
} = {}) {
  const policy = resolveHealthKitWorkoutActivationPolicy(policyRecord);
  const inWindow = (date) => date >= startLocalDate && date <= endLocalDate;
  const effectiveDate = (record) => deriveHealthKitWorkoutLocalDate({ startedAt: record.occurrence?.startedAt, timeZone: record.occurrence?.timeZone }) ?? record.occurrenceDate;
  const workoutObs = observations.filter((record) => record.observationType === "workout" && inWindow(effectiveDate(record)));
  const workouts = canonicalWorkouts.filter((record) => inWindow(record.localDate));
  const loggerSessionsInWindow = canonicalEvidenceObjects.filter((record) =>
    isActiveDetailedStrengthSession(record) && inWindow(String((record.payload ?? record).observed_at ?? "").slice(0, 10)));
  const perWorkout = workouts.map((workout) => {
    const live = assessHealthKitStrengthLinkCandidates({ canonicalWorkout: workout, canonicalObjects: canonicalEvidenceObjects, existingLinks: links });
    const own = links.filter((link) => link.canonicalWorkoutId === workout.id);
    return {
      canonicalWorkout: hash(workout.id),
      family: workout.current.family,
      canonicalType: workout.current.canonicalType,
      localDate: workout.localDate,
      localDateBasis: workout.current.localDateBasis,
      revision: workout.revision,
      sourceRevision: workout.current.sourceRevision,
      revisionHistoryCount: (workout.revisionHistory ?? []).length,
      evidenceEligibility: workout.evidenceEligibility?.state,
      strategicEligible: assessHealthKitStrategicEvidenceEligibility(workout).eligible === true,
      activityInteraction: workout.activityInteraction,
      contentAuthority: workout.contentAuthority,
      storedLinkAssessment: workout.linkAssessment ? { outcome: workout.linkAssessment.outcome, reason: workout.linkAssessment.reason, candidateCount: workout.linkAssessment.candidates.length } : null,
      liveLinkAssessment: { outcome: live.outcome, reason: live.reason, unverifiableSessionCount: live.unverifiableSessionCount, candidateCount: live.candidates.length,
        confidences: live.candidates.map((candidate) => candidate.confidence) },
      storedCoexistence: workout.coexistence ? workout.coexistence.state : null,
      links: own.map((link) => ({
        link: hash(link.id), loggerSession: hash(link.loggerSessionCanonicalId), status: link.status,
        matchOutcome: link.matchOutcome, confidence: link.confidence, createdBy: link.createdBy?.kind,
        contentAuthority: link.contentAuthority,
      })),
      ...(includeValues ? { telemetry: workout.current.telemetry, startedAt: workout.current.startedAt, endedAt: workout.current.endedAt } : {}),
    };
  });
  const perFamily = {};
  for (const workout of workouts) perFamily[workout.current.family] = (perFamily[workout.current.family] ?? 0) + 1;
  const duplicateWorkouts = Object.entries(workouts.reduce((acc, w) => {
    acc[w.current.source.bundleIdentifier + "|" + w.current.startedAt + "|" + w.current.endedAt] = (acc[w.current.source.bundleIdentifier + "|" + w.current.startedAt + "|" + w.current.endedAt] ?? 0) + 1;
    return acc;
  }, {})).filter(([, count]) => count > 1).length;
  const byState = {};
  for (const record of workoutObs) {
    const key = `${record.ingestionPurpose}|${record.reconciliation?.state}|${record.reconciliation?.reason ?? ""}`;
    byState[key] = (byState[key] ?? 0) + 1;
  }
  const hkInEvidence = canonicalEvidenceObjects.filter((record) => isHealthKitDerivedRecord(record));
  return {
    window: { startLocalDate, endLocalDate },
    policy: {
      enabled: policy.enabled,
      effectiveLocalDate: policy.effectiveLocalDate,
      endLocalDate: policy.endLocalDate,
      openEnded: policy.openEnded === true,
      families: policy.families ?? [],
      strategicEvidenceEligibility: policyRecord?.strategicEvidenceEligibility ?? null,
      historicalBackfill: policyRecord?.historicalBackfill ?? null,
      linkAutoConfirm: policyRecord?.linkAutoConfirm ?? null,
      invalidReason: policy.invalidReason,
    },
    workoutObservationsByState: byState,
    canonicalWorkoutCount: workouts.length,
    canonicalWorkoutsByFamily: perFamily,
    duplicateCanonicalWorkoutsByWindow: duplicateWorkouts,
    possibleDuplicateCanonicalWorkouts: workouts.filter((workout) =>
      (workout.linkAssessment?.possibleDuplicateOf ?? workout.coexistence?.possibleDuplicateOf ?? []).length > 0).length,
    workouts: perWorkout,
    loggerStrengthSessionsInWindow: loggerSessionsInWindow.length,
    linkStatusCounts: links.filter((link) => inWindow(link.localDate)).reduce((acc, link) => ({ ...acc, [link.status]: (acc[link.status] ?? 0) + 1 }), {}),
    oneToOneIntegrity: findHealthKitWorkoutRelationshipViolations({ links, claims }),
    ambiguousAutoLinked: links.filter((link) => link.matchOutcome === HealthKitStrengthMatchOutcome.AMBIGUOUS).length,
    strategic: {
      healthKitWorkoutsStrategicEligible: perWorkout.filter((item) => item.strategicEligible).length,
      healthKitWorkoutsNotQuarantined: workouts.filter((workout) => workout.evidenceEligibility?.state !== "quarantined").length,
      healthKitDerivedRecordsInStrategicEvidence: hkInEvidence.length,
    },
  };
}
