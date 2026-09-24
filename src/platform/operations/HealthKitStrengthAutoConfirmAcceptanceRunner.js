import { createHash } from "node:crypto";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION, HealthKitWorkoutFamily } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_COLLECTION,
  HealthKitWorkoutLinkError,
  HealthKitWorkoutLinkStatus,
  assessHealthKitStrengthLinkCandidates,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import {
  HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
  HealthKitWorkoutReconciliationAction,
  assessDeterministicStrengthAutoConfirm,
  createHealthKitWorkoutReconciliationReview,
  getHealthKitWorkoutReconciliationId,
  hasExactHealthKitWorkoutReconciliationIdentity,
  hasExactHealthKitWorkoutReconciliationResolution,
  hasExactStoredHealthKitWorkoutReconciliationTerminal,
  resolveHealthKitWorkoutReconciliationRecord,
} from "../../domain/services/HealthKitWorkoutReconciliationService.js";
import {
  HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION,
  assertHealthKitWorkoutRelationshipConfirmationAllowed,
  findHealthKitWorkoutRelationshipViolations,
  getHealthKitWorkoutLinkClaimId,
} from "../../domain/services/HealthKitWorkoutRelationshipService.js";
import { runHealthKitWorkoutLinkConfirmation } from "./HealthKitWorkoutLinkConfirmationRunner.js";

export const HEALTHKIT_STRENGTH_AUTO_CONFIRM_ACCEPTANCE_DATE = "2026-09-23";

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
  if (startLocalDate !== HEALTHKIT_STRENGTH_AUTO_CONFIRM_ACCEPTANCE_DATE ||
      endLocalDate !== HEALTHKIT_STRENGTH_AUTO_CONFIRM_ACCEPTANCE_DATE) {
    return Object.freeze({ outcome: "refused", reasons: ["acceptance_window_not_september_23"] });
  }
  const [workouts, links, claims, evidence, metadata] = await Promise.all([
    records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_COLLECTION }),
    records.list({ ownerUserId, collection: HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION }),
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
  const relationshipViolations = findHealthKitWorkoutRelationshipViolations({ links, claims });
  if (Object.values(relationshipViolations).some((count) => count !== 0)) {
    return Object.freeze({ outcome: "refused", reasons: ["stored_relationship_violations"], violations: relationshipViolations });
  }
  try {
    assertHealthKitWorkoutRelationshipConfirmationAllowed({
      link,
      links,
      workouts,
      evidence,
      claims,
      loggerSessionServerCommitTimestamps: new Map(metadata.map((row) => [row.recordId, row.createdAt])),
    });
  } catch (error) {
    if (error instanceof HealthKitWorkoutLinkError) {
      return Object.freeze({ outcome: "refused", reasons: [error.code], linkId: link.id });
    }
    throw error;
  }
  const reviewId = getHealthKitWorkoutReconciliationId(workout.id);
  const existingHistory = await records.get({
    ownerUserId,
    collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
    recordId: reviewId,
  });
  const historyIdentityExact = hasExactHealthKitWorkoutReconciliationIdentity(existingHistory, {
    ownerUserId,
    canonicalWorkoutId: workout.id,
  });
  if (existingHistory && !historyIdentityExact) {
    return Object.freeze({ outcome: "refused", reasons: ["reconciliation_history_identity_conflict"], linkId: link.id, reviewId });
  }
  if (link.status === HealthKitWorkoutLinkStatus.CONFIRMED) {
    const sameHistory = hasExactHealthKitWorkoutReconciliationResolution(existingHistory, {
      action: HealthKitWorkoutReconciliationAction.CONFIRM,
      selectedLoggerSessionCanonicalId: link.loggerSessionCanonicalId,
      linkId: link.id,
      ownerUserId,
      canonicalWorkoutId: workout.id,
    });
    const exactClaims = claimsHeldByLink(claims, link);
    return Object.freeze({
      outcome: sameHistory && exactClaims ? "already_confirmed" : "refused",
      reasons: sameHistory && exactClaims
        ? []
        : !sameHistory
          ? ["confirmed_link_missing_reconciliation_history"]
          : ["confirmed_link_without_exact_held_claims"],
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
  if (existingHistory && (!historyIdentityExact || existingHistory.status !== "pending")) {
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
  let saved;
  if (existingHistory) {
    saved = await records.put({
        ownerUserId,
        collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
        recordId: reviewId,
        expectedVersion: existingHistory.version,
        sourceIdentity: reviewId,
        payload: resolved,
      });
  } else {
    const created = await records.putIfAbsent({
        ownerUserId,
        collection: HEALTHKIT_WORKOUT_RECONCILIATION_COLLECTION,
        recordId: reviewId,
        sourceIdentity: reviewId,
        payload: resolved,
      });
    if (!created.created) {
      throw Object.assign(new Error("Strength auto-confirm history identity was occupied before commit."), { code: "RECONCILIATION_HISTORY_COLLISION" });
    }
    saved = created.record;
  }
  const invariants = Object.freeze({
    ...confirmation.invariants,
    reconciliationHistoryResolvedExactlyOnce: hasExactStoredHealthKitWorkoutReconciliationTerminal(saved, {
      ownerUserId,
      canonicalWorkoutId: workout.id,
    }) &&
      hasExactHealthKitWorkoutReconciliationIdentity(saved, { ownerUserId, canonicalWorkoutId: workout.id }) &&
      saved.resolution?.linkId === link.id,
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

function claimsHeldByLink(claims, link) {
  const held = claims.filter((claim) => claim.status === "held" && claim.holderLinkId === link.id);
  return held.length === 2 && [["workout", link.canonicalWorkoutId], ["session", link.loggerSessionCanonicalId]].every(([kind, subject]) => {
    const claim = claims.find((item) => item.id === getHealthKitWorkoutLinkClaimId(kind, subject));
    return claim?.status === "held" && claim.holderLinkId === link.id && claim.kind === kind;
  });
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
