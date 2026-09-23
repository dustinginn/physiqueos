import { createHash } from "node:crypto";
import { isActiveCanonicalEvidenceObject } from "../../domain/services/CanonicalReadModel.js";
import { HealthKitWorkoutFamily } from "../../domain/services/HealthKitWorkoutService.js";
import { HealthKitWorkoutLinkStatus } from "../../domain/services/HealthKitWorkoutLinkService.js";
import {
  findHealthKitWorkoutRelationshipViolations,
  getHealthKitWorkoutLinkClaimId,
} from "../../domain/services/HealthKitWorkoutRelationshipService.js";

const hash = (value) => (value == null ? null : createHash("sha256").update(String(value)).digest("hex").slice(0, 10));
const hashes = (values) => [...new Set((values ?? []).map(hash).filter(Boolean))].sort();

/**
 * Pure, read-only proof that ONE real-world strength workout is ONE logical
 * PhysiqueOS training event across every representation it may have on a
 * day: the Workout Logger session, screenshot-derived Training evidence
 * (target-bound support merge, unbound-but-matched supersession, or an
 * unmatched second object), the HealthKit canonical strength workout, its
 * link candidate/claims, and the cardio workouts that must stay separate.
 *
 * Reports only hashed identifiers, counts, enum states and presence
 * booleans -- never exercise names, loads, notes, or telemetry values.
 */
export function summarizeHealthKitTrainingReconciliation({
  canonicalEvidenceObjects = [],
  evidenceReviews = [],
  evidencePackages = [],
  trainingPerformanceEvents = [],
  canonicalWorkouts = [],
  links = [],
  claims = [],
  localDate,
} = {}) {
  const payloadOf = (record) => record.payload ?? record;
  const idOf = (record) => record.canonicalId ?? payloadOf(record).id ?? record.id;
  const dateOf = (record) => String(payloadOf(record).observed_at ?? "").slice(0, 10);
  const trainingOnDay = canonicalEvidenceObjects.filter((record) =>
    payloadOf(record).evidence_type === "training" && dateOf(record) === localDate);

  const training = trainingOnDay.map((record) => {
    const payload = payloadOf(record);
    const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
    const provenance = record.provenance ?? payload.provenance ?? {};
    const activityType = String(payload.metadata?.activity_type ?? "").toLowerCase();
    return {
      canonicalId: hash(idOf(record)),
      active: isActiveCanonicalEvidenceObject(record),
      qualityStatus: record.quality?.status ?? payload.quality?.status ?? null,
      supersededBy: hash(record.quality?.supersededBy ?? payload.quality?.supersededBy ?? record.supersededBy ?? null),
      activityType: activityType || null,
      isStrength: /strength|resistance|weight/i.test(activityType),
      loggerOrigin: payload.metadata?.logger_origin ?? null,
      exerciseCount: exercises.length,
      setCount: exercises.reduce((sum, exercise) => sum + (Array.isArray(exercise?.sets) ? exercise.sets.length : 0), 0),
      sourceModality: payload.source?.modality ?? null,
      sourceApplication: payload.source?.application ?? null,
      telemetryPresent: {
        startTime: payload.metadata?.start_time != null,
        endTime: payload.metadata?.end_time != null,
        durationSeconds: payload.metadata?.duration_seconds != null,
        activeCalories: payload.metadata?.active_calories != null,
      },
      reconciliationMatchBasis: payload.reconciliation?.match_basis ?? null,
      reconciliationTargetCanonicalId: hash(payload.reconciliation?.target_canonical_id ?? null),
      provenance: {
        evidencePackageIds: hashes(provenance.evidence_package_ids),
        evidenceReviewIds: hashes(provenance.evidence_review_ids),
        contributingEvidenceObjectCount: (provenance.contributing_evidence_object_ids ?? []).length,
        sourceArtifactRefCount: (provenance.source_artifact_refs ?? []).length,
      },
      version: record.version ?? null,
    };
  });
  const activeStrength = training.filter((item) => item.active && item.isStrength && item.exerciseCount > 0);
  const activeStrengthTelemetryOnly = training.filter((item) => item.active && item.isStrength && item.exerciseCount === 0);
  const supersededStrength = training.filter((item) => !item.active && item.isStrength);

  // Screenshot-derived Training reviews touching this day: state + linkage
  // fields, so a merge (target-bound or matched) is distinguishable from a
  // second session, without reading any interpreted content.
  const reviews = evidenceReviews
    .map((record) => payloadOf(record))
    .filter((review) => {
      const metadata = review.interpretedEvidence?.review_metadata ?? review.review_metadata ?? {};
      const objects = review.interpretedEvidence?.evidence_objects ?? review.evidence_objects ?? [];
      const dates = [review.localDate, review.date, metadata.localDate, ...objects.map((object) => String(object?.observed_at ?? "").slice(0, 10))];
      return objects.some((object) => object?.evidence_type === "training") && dates.some((date) => String(date ?? "").slice(0, 10) === localDate);
    })
    .map((review) => {
      const metadata = review.interpretedEvidence?.review_metadata ?? review.review_metadata ?? {};
      const objects = (review.interpretedEvidence?.evidence_objects ?? review.evidence_objects ?? []).filter((object) => object?.evidence_type === "training");
      return {
        reviewId: hash(review.id),
        status: review.status ?? null,
        packageId: hash(review.interpretedEvidence?.package_id ?? review.package_id ?? review.submissionId ?? null),
        recoveryContextKind: metadata.recoveryContext?.kind ?? null,
        targetTrainingSessionCanonicalId: hash(metadata.targetTrainingSessionCanonicalId ?? null),
        trainingObjectCount: objects.length,
        explicitSupportBindings: objects.filter((object) => object?.reconciliation?.match_basis === "explicit_native_training_support_binding").length,
        boundTargetCanonicalIds: hashes(objects.map((object) => object?.reconciliation?.target_canonical_id).filter(Boolean)),
        canonicalCommitStatus: review.commitProgress?.canonical_commit?.status ?? null,
        canonicalEvidenceIds: hashes(review.commitProgress?.canonical_commit?.result?.canonicalEvidenceIds),
      };
    });

  const packagesOnDay = evidencePackages
    .map((record) => payloadOf(record))
    .filter((pkg) => (pkg.evidence_objects ?? []).some((object) => object?.evidence_type === "training" && String(object?.observed_at ?? "").slice(0, 10) === localDate))
    .map((pkg) => ({
      packageId: hash(pkg.id ?? pkg.submissionId),
      status: pkg.status ?? null,
      sourceKind: pkg.provenance?.source ?? pkg.source?.modality ?? null,
      isLoggerSubmission: /^training_logger_submission_/.test(String(pkg.id ?? "")),
    }));

  const events = trainingPerformanceEvents
    .map((record) => payloadOf(record))
    .filter((event) => String(event.workoutDate ?? event.localDate ?? "").slice(0, 10) === localDate)
    .map((event) => ({
      eventId: hash(event.id),
      sourceCanonicalTrainingId: hash(event.sourceCanonicalTrainingId ?? null),
      sourceSessionId: hash(event.sourceSessionId ?? null),
      sourceReviewId: hash(event.sourceReviewId ?? null),
    }));
  const activeStrengthIds = new Set(activeStrength.map((item) => item.canonicalId));
  const eventsPointingAtActiveStrength = events.filter((event) => activeStrengthIds.has(event.sourceCanonicalTrainingId)).length;

  const workoutsOnDay = canonicalWorkouts.filter((workout) => workout.localDate === localDate);
  const workouts = workoutsOnDay.map((workout) => ({
    canonicalWorkout: hash(workout.id),
    family: workout.current?.family ?? null,
    canonicalType: workout.current?.canonicalType ?? null,
    evidenceEligibility: workout.evidenceEligibility?.state ?? null,
    linkAssessmentOutcome: workout.linkAssessment?.outcome ?? null,
    coexistenceState: workout.coexistence?.state ?? null,
    revision: workout.revision ?? null,
  }));
  const linksOnDay = links.filter((link) => link.localDate === localDate).map((link) => ({
    link: hash(link.id),
    status: link.status,
    version: link.version ?? null,
    matchOutcome: link.matchOutcome ?? null,
    matchBasis: link.matchBasis ?? null,
    confidence: link.confidence ?? null,
    canonicalWorkout: hash(link.canonicalWorkoutId),
    loggerSession: hash(link.loggerSessionCanonicalId),
    loggerSessionIsTheActiveStrengthObject: activeStrengthIds.has(hash(link.loggerSessionCanonicalId)),
    contentAuthority: link.contentAuthority ?? null,
    evidenceEligibility: link.evidenceEligibility?.state ?? null,
    claimsHeld: [["workout", link.canonicalWorkoutId], ["session", link.loggerSessionCanonicalId]].filter(([kind, subject]) =>
      claims.some((claim) => claim.id === getHealthKitWorkoutLinkClaimId(kind, subject) && claim.status === "held" && claim.holderLinkId === link.id)).length,
  }));

  const screenshotPackageIds = new Set(reviews.map((review) => review.packageId).filter(Boolean));
  const activeStrengthCarryingScreenshot = activeStrength.filter((item) => item.provenance.evidencePackageIds.some((id) => screenshotPackageIds.has(id)));
  const activeStrengthCarryingLogger = activeStrength.filter((item) => item.loggerOrigin === "training_logger" || item.provenance.evidencePackageIds.length > 0);

  const shape =
    activeStrength.length === 1 && activeStrengthTelemetryOnly.length === 0 && (reviews.length === 0 || activeStrengthCarryingScreenshot.length === 1)
      ? "one_logical_event"
      : activeStrength.length === 1 && activeStrengthTelemetryOnly.length > 0
        ? "second_telemetry_only_object"
        : activeStrength.length > 1
          ? "multiple_active_strength_objects"
          : activeStrength.length === 0
            ? "no_active_strength_object"
            : "screenshot_unlinked_to_active_object";

  return Object.freeze({
    localDate,
    training: { records: training, activeStrengthCount: activeStrength.length, activeStrengthTelemetryOnlyCount: activeStrengthTelemetryOnly.length, supersededStrengthCount: supersededStrength.length, activeStrengthCarryingScreenshotPackage: activeStrengthCarryingScreenshot.length, activeStrengthCarryingLoggerProvenance: activeStrengthCarryingLogger.length },
    screenshotReviews: reviews,
    evidencePackagesOnDay: packagesOnDay,
    trainingPerformanceEvents: { count: events.length, pointingAtActiveStrength: eventsPointingAtActiveStrength, records: events },
    healthKit: {
      workouts,
      strengthWorkoutCount: workouts.filter((workout) => workout.family === HealthKitWorkoutFamily.STRENGTH).length,
      cardioWorkoutCount: workouts.filter((workout) => workout.family === HealthKitWorkoutFamily.CARDIO).length,
      cardioWithLinks: linksOnDay.filter((link) => workouts.find((workout) => workout.canonicalWorkout === link.canonicalWorkout)?.family === HealthKitWorkoutFamily.CARDIO).length,
      links: linksOnDay,
      confirmedLinkCount: linksOnDay.filter((link) => link.status === HealthKitWorkoutLinkStatus.CONFIRMED).length,
      violations: findHealthKitWorkoutRelationshipViolations({ links, claims }),
    },
    shape,
  });
}
