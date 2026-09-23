import { createHash } from "node:crypto";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, HealthKitWorkoutFamily } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HealthKitWorkoutLinkStatus,
  assessHealthKitStrengthLinkCandidates,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import {
  HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
  HealthKitWorkoutReconciliationAction,
  assessDeterministicStrengthAutoConfirm,
  createHealthKitWorkoutReconciliationReview,
  getHealthKitWorkoutReconciliationId,
  isHealthKitWorkoutReconciliationReview,
  resolveHealthKitWorkoutReconciliationRecord,
} from "../../domain/services/HealthKitWorkoutReconciliationService.js";
import { runHealthKitWorkoutLinkConfirmation } from "./HealthKitWorkoutLinkConfirmationRunner.js";

/**
 * Bounded acceptance operation for one existing deterministic Strength
 * candidate. It composes the established drift-fenced confirmation runner and
 * adds the stronger auto-confirm predicate plus durable, strategically inert
 * reconciliation history. The console entry supplies the transaction,
 * advisory lock, runtime authority checks, and rollback/commit fence.
 */
export async function runHealthKitStrengthAutoConfirmAcceptance({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const { ownerUserId, startLocalDate, endLocalDate } = authorization ?? {};
  const [workouts, links, evidence, metadata] = await Promise.all([
    records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION }),
    records.list({ ownerUserId, collection: "canonicalEvidenceObjects" }),
    records.listStorageMetadata({ ownerUserId, collection: "canonicalEvidenceObjects" }),
  ]);
  const inWindow = workouts.filter((workout) => workout.localDate >= startLocalDate &&
    workout.localDate <= endLocalDate && workout.current?.family === HealthKitWorkoutFamily.STRENGTH);
  const relationships = links.filter((link) => inWindow.some((workout) => workout.id === link.canonicalWorkoutId) &&
    [HealthKitWorkoutLinkStatus.CANDIDATE, HealthKitWorkoutLinkStatus.CONFIRMED].includes(link.status));
  if (inWindow.length !== 1 || relationships.length !== 1) {
    return Object.freeze({ outcome: "refused", reasons: ["acceptance_case_not_unique"], workoutCount: inWindow.length, relationshipCount: relationships.length });
  }
  const [workout] = inWindow;
  const [link] = relationships;
  const reviewId = getHealthKitWorkoutReconciliationId(workout.id);
  const existingHistory = await records.get({
    ownerUserId,
    collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
    recordId: reviewId,
  });
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) {
    const sameHistory = isHealthKitWorkoutReconciliationReview(existingHistory) &&
      existingHistory.status === "resolved_confirmed" && existingHistory.resolution?.linkId === link.id;
    return Object.freeze({
      outcome: sameHistory ? "already_confirmed" : "refused",
      reasons: sameHistory ? [] : ["confirmed_link_missing_reconciliation_history"],
      linkId: link.id,
      reviewId,
    });
  }

  const assessment = assessHealthKitStrengthLinkCandidates({
    canonicalWorkout: workout,
    canonicalObjects: evidence,
    existingLinks: links,
    canonicalWorkouts: workouts,
    loggerSessionServerCommitTimestamps: new Map(metadata.map((row) => [row.recordId, row.createdAt])),
  });
  const gate = assessDeterministicStrengthAutoConfirm({
    canonicalWorkout: workout,
    assessment,
    canonicalObjects: evidence,
    canonicalWorkouts: workouts,
    existingLinks: links,
    link,
  });
  const autoConfirmFacts = Object.freeze({
    ruleVersion: gate.ruleVersion,
    eligible: gate.eligible,
    reasons: [...gate.reasons],
    assessmentDigest: digest({
      workoutId: workout.id,
      workoutVersion: workout.version,
      linkId: link.id,
      linkVersion: link.version,
      assessment,
      loggerCommitMetadata: metadata
        .filter((row) => assessment.candidates.some((candidate) => candidate.loggerSessionCanonicalId === row.recordId))
        .map((row) => ({ recordId: row.recordId, createdAt: row.createdAt })),
    }),
  });
  if (!gate.eligible) {
    return Object.freeze({ outcome: "refused", reasons: [...gate.reasons], autoConfirmFacts });
  }
  if (existingHistory && (!isHealthKitWorkoutReconciliationReview(existingHistory) || existingHistory.status !== "pending")) {
    return Object.freeze({ outcome: "refused", reasons: ["reconciliation_history_conflict"], autoConfirmFacts });
  }
  if (apply && stable(expected?.autoConfirm) !== stable(autoConfirmFacts)) {
    return Object.freeze({ outcome: "drifted", drift: ["autoConfirm"], facts: { autoConfirm: autoConfirmFacts } });
  }

  const confirmation = await runHealthKitWorkoutLinkConfirmation({
    records,
    authorization,
    apply,
    expected: apply ? expected?.confirmation : null,
    now,
  });
  if (!apply) {
    if (confirmation.outcome !== "dry_run") return Object.freeze({ ...confirmation, autoConfirmFacts });
    return Object.freeze({
      ...confirmation,
      outcome: "dry_run",
      autoConfirmFacts,
      facts: Object.freeze({ autoConfirm: autoConfirmFacts, confirmation: confirmation.facts }),
      predictedMutations: Object.freeze([
        ...confirmation.predictedMutations,
        {
          collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
          recordId: reviewId,
          operation: existingHistory ? "resolve" : "create_resolved_history",
          to: "resolved_confirmed",
        },
      ]),
    });
  }

  if (confirmation.outcome !== "applied") return Object.freeze({ ...confirmation, autoConfirmFacts });
  const at = now().toISOString();
  const by = { kind: "system_matcher", ref: gate.ruleVersion };
  const base = existingHistory ?? createHealthKitWorkoutReconciliationReview({
    ownerUserId,
    canonicalWorkout: workout,
    assessment,
    canonicalObjects: evidence,
    now: at,
  });
  const resolved = resolveHealthKitWorkoutReconciliationRecord(base, {
    action: HealthKitWorkoutReconciliationAction.CONFIRM,
    selectedLoggerSessionCanonicalId: link.loggerSessionCanonicalId,
    linkId: link.id,
    by,
    now: at,
    basis: { mode: "deterministic_auto_confirm_acceptance", ruleVersion: gate.ruleVersion },
  });
  const saved = existingHistory
    ? await records.put({
        ownerUserId,
        collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
        recordId: reviewId,
        expectedVersion: existingHistory.version,
        sourceIdentity: reviewId,
        payload: resolved,
      })
    : (await records.putIfAbsent({
        ownerUserId,
        collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
        recordId: reviewId,
        sourceIdentity: reviewId,
        payload: resolved,
      })).record;
  const invariants = Object.freeze({
    ...confirmation.invariants,
    reconciliationHistoryResolvedExactlyOnce: saved.status === "resolved_confirmed" &&
      saved.resolution?.linkId === link.id && saved.resolutionHistory?.length === 1,
    historyStrategicallyInert: saved.strategicEvidenceEligibility === "quarantined" &&
      saved.evidenceEligibility?.strategic === false,
  });
  if (Object.values(invariants).some((value) => value !== true)) {
    throw Object.assign(new Error("Strength auto-confirm acceptance invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED" });
  }
  return Object.freeze({
    ...confirmation,
    outcome: "applied",
    autoConfirmFacts,
    reconciliationReviewId: saved.id,
    reconciliationReviewVersion: saved.version,
    invariants,
  });
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
