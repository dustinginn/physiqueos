import { createHash } from "node:crypto";
import {
  createTrainingExerciseRelationshipGroup,
  deriveTrainingExerciseRelationshipContext,
  getTrainingExerciseRelationshipComparisonKey,
  validateTrainingExerciseRelationshipGroups,
} from "../../domain/models/trainingExerciseRelationship.js";
import { getTrainingExecutionVariantKey } from "../../domain/models/trainingExecutionVariant.js";

export const HISTORICAL_TRAINING_SUPERSET_OWNER = "user_founder_001";
export const HISTORICAL_TRAINING_SUPERSET_COLLECTION = "canonicalEvidenceObjects";

const LEGACY_KEY = "super_set";
const TARGET_EXERCISE_IDS = Object.freeze([
  "leg_extension",
  "sissy_squat",
  "seated_hip_adductions",
  "seated_hip_abductions",
]);
const TARGETS = Object.freeze({
  "leg_extension+sissy_squat": Object.freeze({
    count: 2,
    order: Object.freeze(["leg_extension", "sissy_squat"]),
    setsPerMember: 4,
  }),
  "seated_hip_abductions+seated_hip_adductions": Object.freeze({
    count: 1,
    order: Object.freeze(["seated_hip_adductions", "seated_hip_abductions"]),
    setsPerMember: 3,
  }),
});
const LABELS = Object.freeze({
  leg_extension: Object.freeze(["leg extensions", "leg extension"]),
  sissy_squat: Object.freeze(["sissy squats", "sissy squat"]),
  seated_hip_adductions: Object.freeze(["seated hip adductions", "seated hip adduction"]),
  seated_hip_abductions: Object.freeze(["seated hip abductions", "seated hip abduction"]),
});
const SHA = /^[0-9a-f]{40}$/;

/**
 * One-time historical correction for the three audited Founder Training sessions
 * where `super_set` was stored as an execution variant instead of an ordered
 * exercise relationship.
 *
 * Preview is the default and is read-only. Execute requires the exact sealed
 * preview plus a separate authorization reference. Transaction isolation,
 * owner locking and COMMIT/ROLLBACK are enforced by the console entrypoint.
 */
export async function runHistoricalTrainingSupersetCorrection({
  store,
  authorization = {},
  deployment = {},
  apply = false,
  expected = null,
} = {}) {
  const ownerUserId = String(authorization.ownerUserId ?? "");
  if (ownerUserId !== HISTORICAL_TRAINING_SUPERSET_OWNER) {
    throw operationError("OWNER_MISMATCH", "This correction is bounded to the Founder owner.");
  }
  const runtimeSha = String(deployment.runtimeSha ?? "");
  const expectedSha = String(deployment.expectedSha ?? "");
  if (!SHA.test(expectedSha) || runtimeSha !== expectedSha) {
    throw operationError("RUNTIME_SHA_MISMATCH", "The runtime SHA does not match the authorized Server source.");
  }
  if (apply && !String(authorization.authorizationReference ?? "").trim()) {
    throw operationError("AUTHORIZATION_REFERENCE_REQUIRED", "Execute requires a separate Founder authorization reference.");
  }

  if (apply && expected?.targets?.length === 3) {
    const replay = await assessReplay({ store, ownerUserId, expected });
    if (replay) return replay;
  }

  const state = await readState(store, ownerUserId);
  const prepared = preparePreview(state);
  if (prepared.refusals.length > 0) {
    return Object.freeze({ outcome: "refused", reasons: prepared.refusals, facts: prepared.facts });
  }

  const preview = Object.freeze({
    outcome: "preview",
    previewDigest: prepared.previewDigest,
    targets: prepared.targetSummaries,
    predictedMutations: prepared.plans.map((plan) => ({
      collection: HISTORICAL_TRAINING_SUPERSET_COLLECTION,
      recordId: plan.recordId,
      operation: "update",
      expectedVersion: plan.version,
    })),
    facts: prepared.facts,
  });
  if (!apply) return preview;

  const drift = compareExpectedPreview(expected, preview);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts: preview.facts });

  for (const plan of prepared.plans) {
    await store.updateTrainingSession({
      ownerUserId,
      recordId: plan.recordId,
      expectedVersion: plan.version,
      payload: plan.correctedPayload,
    });
  }

  const postRows = await store.getTrainingSessions({
    ownerUserId,
    recordIds: prepared.plans.map((plan) => plan.recordId),
  });
  const postEvidenceMetadata = await store.listEvidenceMetadata({ ownerUserId, limit: 1_000 });
  const postPerformanceEvents = await store.listPerformanceEvents({
    ownerUserId,
    targetCanonicalExerciseIds: TARGET_EXERCISE_IDS,
    sourceCanonicalIds: prepared.sourceCanonicalIds,
    sourceSessionIds: prepared.sourceSessionIds,
    limit: 100,
  });
  const failures = verifyPostconditions({
    plans: prepared.plans,
    postRows,
    beforeEvidenceMetadata: state.evidenceMetadata,
    postEvidenceMetadata,
    beforePerformanceEvents: state.performanceEvents,
    postPerformanceEvents,
  });
  if (failures.length > 0) {
    throw operationError("POST_WRITE_VERIFICATION_FAILED", failures.join(","));
  }

  return Object.freeze({
    ...preview,
    outcome: "applied",
    writes: prepared.plans.length,
    postconditionsVerified: true,
  });
}

async function readState(store, ownerUserId) {
  const candidates = await store.listLegacyCandidates({ ownerUserId, limit: 10 });
  if (candidates.length >= 10) throw operationError("CANDIDATE_BOUND_REACHED", "The bounded candidate query reached its limit.");
  const refs = unique(candidates.flatMap((row) => lineageRefs(canonical(row))));
  const lineage = await store.listLineage({ ownerUserId, recordIds: refs, limit: 50 });
  if (lineage.length >= 50) throw operationError("LINEAGE_BOUND_REACHED", "The bounded lineage query reached its limit.");
  const sourceCanonicalIds = unique(candidates.map((row) => canonical(row)?.canonicalId).filter(Boolean));
  const sourceSessionIds = unique(candidates.map((row) => session(row)?.id).filter(Boolean));
  const [impactSessions, performanceEvents, evidenceMetadata, variantDefinitions] = await Promise.all([
    store.listImpactTrainingSessions({ ownerUserId, targetCanonicalExerciseIds: TARGET_EXERCISE_IDS, limit: 100 }),
    store.listPerformanceEvents({
      ownerUserId,
      targetCanonicalExerciseIds: TARGET_EXERCISE_IDS,
      sourceCanonicalIds,
      sourceSessionIds,
      limit: 100,
    }),
    store.listEvidenceMetadata({ ownerUserId, limit: 1_000 }),
    store.listVariantDefinitions({ ownerUserId, limit: 100 }),
  ]);
  if (impactSessions.length >= 100) throw operationError("IMPACT_SESSION_BOUND_REACHED", "The bounded impact query reached its limit.");
  if (performanceEvents.length >= 100) throw operationError("PERFORMANCE_EVENT_BOUND_REACHED", "The bounded event query reached its limit.");
  if (evidenceMetadata.length >= 1_000) throw operationError("EVIDENCE_METADATA_BOUND_REACHED", "The bounded evidence query reached its limit.");
  if (variantDefinitions.length >= 100) throw operationError("VARIANT_DEFINITION_BOUND_REACHED", "The bounded definition query reached its limit.");
  return { candidates, lineage, impactSessions, performanceEvents, evidenceMetadata, variantDefinitions };
}

function preparePreview(state) {
  const refusals = [];
  const lineageById = new Map(state.lineage.map((row) => [row.recordId, row]));
  const plans = [];
  const signatureCounts = new Map();

  for (const row of state.candidates) {
    const outer = canonical(row);
    const workout = session(row);
    const affected = (workout?.exercises ?? []).filter((exercise) =>
      getTrainingExecutionVariantKey(exercise) === LEGACY_KEY
    );
    const signature = affected.map((exercise) => exercise.canonicalExerciseId).sort().join("+");
    const target = TARGETS[signature];
    if (!target) {
      refusals.push("unexpected_legacy_pair");
      continue;
    }
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
    const issue = validateCandidate({ row, outer, workout, affected, target, lineageById });
    if (issue) {
      refusals.push(issue);
      continue;
    }
    plans.push(buildPlan({ row, outer, workout, affected }));
  }

  if (state.candidates.length !== 3) refusals.push("target_session_count_not_three");
  if (plans.length !== 3) refusals.push("valid_plan_count_not_three");
  for (const [signature, target] of Object.entries(TARGETS)) {
    if ((signatureCounts.get(signature) ?? 0) !== target.count) refusals.push(`pair_count_mismatch:${signature}`);
  }

  const affectedRecordIds = new Set(plans.map((plan) => plan.recordId));
  const affectedCanonicalIds = new Set(plans.map((plan) => plan.canonicalId));
  const affectedSessionIds = new Set(plans.map((plan) => plan.sessionId));
  const affectedExerciseIds = new Set(TARGET_EXERCISE_IDS);
  const targetPerformanceEvents = state.performanceEvents.filter((row) => {
    const event = canonical(row);
    return affectedExerciseIds.has(event?.canonicalExerciseId) &&
      (affectedCanonicalIds.has(event?.sourceCanonicalTrainingId) || affectedSessionIds.has(event?.sourceSessionId));
  });
  const targetExercisePerformanceEvents = state.performanceEvents.filter((row) =>
    affectedExerciseIds.has(canonical(row)?.canonicalExerciseId)
  );
  const targetSessionPerformanceEvents = state.performanceEvents.filter((row) => {
    const event = canonical(row);
    return affectedCanonicalIds.has(event?.sourceCanonicalTrainingId) || affectedSessionIds.has(event?.sourceSessionId);
  });
  if (targetPerformanceEvents.length !== 0) refusals.push("affected_target_performance_events_present");
  const forbiddenSupersetDefinitions = state.variantDefinitions.filter((row) => {
    const definition = canonical(row);
    return definition?.key === "super_set" || (definition?.legacyKeys ?? []).includes("super_set");
  });
  if (forbiddenSupersetDefinitions.length !== 0) refusals.push("forbidden_superset_definition_present");

  const totalOccurrences = plans.reduce((sum, plan) => sum + plan.members.length, 0);
  const totalSets = plans.reduce((sum, plan) => sum + plan.members.reduce((memberSum, member) => memberSum + member.setCount, 0), 0);
  if (totalOccurrences !== 6) refusals.push("affected_occurrence_count_not_six");
  if (totalSets !== 22) refusals.push("affected_set_count_not_twenty_two");

  const impact = deriveImpact(state.impactSessions, state.performanceEvents, plans);
  const evidenceMetadata = state.evidenceMetadata.map((row) => ({ recordId: row.recordId, version: Number(row.version) }));
  const unrelatedEvidenceMetadata = evidenceMetadata.filter((row) => !affectedRecordIds.has(row.recordId));
  const targetSummaries = plans.map((plan) => ({
    recordId: plan.recordId,
    canonicalId: plan.canonicalId,
    sessionId: plan.sessionId,
    version: plan.version,
    payloadDigest: plan.payloadDigest,
    expectedAfterPayloadDigest: plan.expectedAfterPayloadDigest,
    relationshipGroupId: plan.relationshipGroup.id,
    relationshipType: plan.relationshipGroup.relationshipType,
    memberExerciseIds: [...plan.relationshipGroup.memberExerciseIds],
    members: plan.members.map((member) => ({ ...member })),
    lineageDigest: plan.lineageDigest,
  })).sort((left, right) => left.recordId.localeCompare(right.recordId));
  const factsBase = {
    targetSessionCount: plans.length,
    affectedOccurrenceCount: totalOccurrences,
    affectedSetCount: totalSets,
    relationshipGroupCount: plans.length,
    forbiddenSupersetDefinitionCount: forbiddenSupersetDefinitions.length,
    lineageRecordCount: state.lineage.length,
    evidenceRecordCount: evidenceMetadata.length,
    evidenceMetadataDigest: digest(evidenceMetadata),
    unrelatedEvidenceMetadataDigest: digest(unrelatedEvidenceMetadata),
    performanceEventCount: state.performanceEvents.length,
    targetExercisePerformanceEventCount: targetExercisePerformanceEvents.length,
    targetSessionPerformanceEventCount: targetSessionPerformanceEvents.length,
    performanceEventDigest: digest(state.performanceEvents.map(eventSeal)),
    affectedTargetPerformanceEventCount: targetPerformanceEvents.length,
    impact,
    targets: targetSummaries,
  };
  const previewDigest = digest(factsBase);
  return {
    refusals: unique(refusals).sort(),
    plans,
    targetSummaries,
    previewDigest,
    facts: Object.freeze({ ...factsBase, previewDigest }),
    sourceCanonicalIds: [...affectedCanonicalIds],
    sourceSessionIds: [...affectedSessionIds],
  };
}

function validateCandidate({ row, outer, workout, affected, target, lineageById }) {
  if (!row.recordId || !Number.isSafeInteger(Number(row.version))) return "target_storage_identity_or_version_missing";
  if (!outer || !workout || workout.evidence_type !== "training") return "target_not_training";
  if (outer?.quality?.status === "superseded" || outer?.quality?.supersededBy) return "target_superseded";
  if (affected.length !== 2) return "target_affected_member_count_not_two";
  const ids = affected.map((exercise) => String(exercise.id ?? ""));
  if (ids.some((id) => !id) || new Set(ids).size !== 2) return "target_occurrence_identity_invalid";
  if ((workout.exerciseRelationshipGroups ?? []).length !== 0) return "target_relationship_group_already_present";
  if ((workout.structuralReviewIssues ?? []).length !== 0) return "target_structural_review_issue_present";
  if (affected.map((exercise) => exercise.canonicalExerciseId).join("|") !== target.order.join("|")) {
    return "target_member_order_mismatch";
  }
  if (affected.some((exercise) => (exercise.sets ?? []).length !== target.setsPerMember)) return "target_set_shape_mismatch";
  if (affected.some((exercise) => (exercise.sets ?? []).some((set) =>
    set.reps == null || set.weight == null || set.duration_seconds != null ||
    !["weighted_reps", undefined, null].includes(set.measurement_type)
  ))) return "target_set_semantics_mismatch";
  const relationshipIssues = validateTrainingExerciseRelationshipGroups({
    exercises: workout.exercises,
    groups: [relationshipFor(workout, affected)],
  });
  if (relationshipIssues.length > 0) return "proposed_relationship_invalid";
  const reviewIds = lineageRefs(outer).filter((id) => /review/i.test(id));
  const confirmed = reviewIds.map((id) => lineageById.get(id)).filter((item) => item && reviewStatus(item) === "confirmed");
  if (!confirmed.some((item) => textProvesOrder(item.payload, target.order))) return "confirmed_lineage_does_not_prove_pair_order";
  return null;
}

function buildPlan({ row, outer, workout, affected }) {
  const relationshipGroup = relationshipFor(workout, affected);
  const correctedWorkout = structuredClone(workout);
  const affectedIds = new Set(affected.map((exercise) => exercise.id));
  correctedWorkout.exercises = correctedWorkout.exercises.map((exercise) => {
    if (!affectedIds.has(exercise.id)) return exercise;
    const corrected = { ...exercise };
    delete corrected.executionVariant;
    return corrected;
  });
  correctedWorkout.exerciseRelationshipGroups = [relationshipGroup];
  const correctedPayload = outer?.payload
    ? { ...structuredClone(outer), payload: correctedWorkout }
    : correctedWorkout;
  const version = Number(row.version);
  const expectedStoredPayload = { ...structuredClone(correctedPayload), version: version + 1 };
  const members = affected.map((exercise, index) => ({
    occurrenceId: exercise.id,
    canonicalExerciseId: exercise.canonicalExerciseId,
    memberIndex: index,
    setCount: (exercise.sets ?? []).length,
    setsDigest: digest(exercise.sets ?? []),
  }));
  return {
    recordId: row.recordId,
    canonicalId: outer.canonicalId ?? null,
    sessionId: workout.id ?? null,
    version,
    payloadDigest: digest(row.payload),
    correctedPayload,
    expectedAfterPayloadDigest: digest(expectedStoredPayload),
    relationshipGroup,
    members,
    lineageDigest: digest(lineageRefs(outer)),
  };
}

function relationshipFor(workout, affected) {
  const refs = unique([
    ...(workout?.provenance?.source_artifact_refs ?? []),
    ...(workout?.source?.source_artifact_refs ?? []),
  ]);
  const provenanceRef = refs[0] ?? "typed_evidence_0";
  return createTrainingExerciseRelationshipGroup({
    relationshipType: "superset",
    memberExerciseIds: affected.map((exercise) => exercise.id),
    provenance_ref: provenanceRef,
    provenance: { source_artifact_refs: refs.length ? refs : [provenanceRef] },
  });
}

function deriveImpact(rows, events, plans) {
  const correctedByRecordId = new Map(plans.map((plan) => [plan.recordId, plan.correctedPayload]));
  const proposedRows = rows.map((row) => correctedByRecordId.has(row.recordId)
    ? { ...row, payload: correctedByRecordId.get(row.recordId) }
    : row);
  const currentContexts = occurrenceContexts(rows);
  const proposedContexts = occurrenceContexts(proposedRows);
  const eventContexts = new Map();
  for (const row of events) {
    const event = canonical(row);
    if (!TARGET_EXERCISE_IDS.includes(event?.canonicalExerciseId)) continue;
    const variant = getTrainingExecutionVariantKey(event?.executionVariant);
    const relationship = getTrainingExerciseRelationshipComparisonKey(event?.relationshipContext);
    const key = `${event.canonicalExerciseId}|variant:${variant}|relationship:${relationship}`;
    eventContexts.set(key, (eventContexts.get(key) ?? 0) + 1);
  }
  return {
    sourceSessionCount: rows.length,
    currentOccurrenceContexts: [...currentContexts.values()].sort(compareContext),
    proposedOccurrenceContexts: [...proposedContexts.values()].sort(compareContext),
    eventContexts: [...eventContexts].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function occurrenceContexts(rows) {
  const contexts = new Map();
  for (const row of rows) {
    const workout = session(row);
    for (const exercise of workout?.exercises ?? []) {
      if (!TARGET_EXERCISE_IDS.includes(exercise.canonicalExerciseId)) continue;
      const context = `variant:${getTrainingExecutionVariantKey(exercise)}|relationship:${getTrainingExerciseRelationshipComparisonKey(
        deriveTrainingExerciseRelationshipContext({ exercise, session: workout })
      )}`;
      const key = `${exercise.canonicalExerciseId}|${context}`;
      const prior = contexts.get(key) ?? { canonicalExerciseId: exercise.canonicalExerciseId, context, occurrences: 0, sets: 0 };
      prior.occurrences += 1;
      prior.sets += (exercise.sets ?? []).length;
      contexts.set(key, prior);
    }
  }
  return contexts;
}

function compareExpectedPreview(expected, preview) {
  if (!expected || typeof expected !== "object") return ["expected_preview_missing"];
  const failures = [];
  if (expected.previewDigest !== preview.previewDigest) failures.push("preview_digest_changed");
  if (digest(expected.targets ?? []) !== digest(preview.targets)) failures.push("target_seal_changed");
  if (digest(expected.facts ?? {}) !== digest(preview.facts)) failures.push("facts_changed");
  return failures;
}

async function assessReplay({ store, ownerUserId, expected }) {
  const rows = await store.getTrainingSessions({
    ownerUserId,
    recordIds: expected.targets.map((target) => target.recordId),
  });
  if (rows.length !== 3) return null;
  const byId = new Map(rows.map((row) => [row.recordId, row]));
  const matches = expected.targets.every((target) => {
    const row = byId.get(target.recordId);
    return row && Number(row.version) === Number(target.version) + 1 &&
      digest(row.payload) === target.expectedAfterPayloadDigest &&
      correctedTargetMatches(row, target);
  });
  if (!matches) return null;
  return Object.freeze({
    outcome: "already_corrected",
    previewDigest: expected.previewDigest,
    targets: expected.targets.map((target) => ({ recordId: target.recordId, version: Number(target.version) + 1 })),
    writes: 0,
    postconditionsVerified: true,
  });
}

function correctedTargetMatches(row, target) {
  const workout = session(row);
  const byId = new Map((workout?.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  if (target.memberExerciseIds?.some((id) => getTrainingExecutionVariantKey(byId.get(id)) !== "ordinary")) return false;
  const groups = workout?.exerciseRelationshipGroups ?? [];
  return groups.length === 1 && groups[0].id === target.relationshipGroupId &&
    groups[0].relationshipType === "superset" &&
    JSON.stringify(groups[0].memberExerciseIds) === JSON.stringify(target.memberExerciseIds);
}

function verifyPostconditions({ plans, postRows, beforeEvidenceMetadata, postEvidenceMetadata, beforePerformanceEvents, postPerformanceEvents }) {
  const failures = [];
  const byId = new Map(postRows.map((row) => [row.recordId, row]));
  for (const plan of plans) {
    const row = byId.get(plan.recordId);
    if (!row) failures.push(`target_missing:${plan.recordId}`);
    else if (Number(row.version) !== plan.version + 1) failures.push(`target_version_mismatch:${plan.recordId}`);
    else if (digest(row.payload) !== plan.expectedAfterPayloadDigest) failures.push(`target_payload_mismatch:${plan.recordId}`);
    else if (!correctedTargetMatches(row, {
      memberExerciseIds: plan.relationshipGroup.memberExerciseIds,
      relationshipGroupId: plan.relationshipGroup.id,
    })) failures.push(`target_structure_mismatch:${plan.recordId}`);
  }
  const targetIds = new Set(plans.map((plan) => plan.recordId));
  const beforeUnrelated = beforeEvidenceMetadata.filter((row) => !targetIds.has(row.recordId));
  const afterUnrelated = postEvidenceMetadata.filter((row) => !targetIds.has(row.recordId));
  if (postEvidenceMetadata.length !== beforeEvidenceMetadata.length) failures.push("evidence_count_changed");
  if (digest(beforeUnrelated) !== digest(afterUnrelated)) failures.push("unrelated_evidence_changed");
  if (digest(beforePerformanceEvents.map(eventSeal)) !== digest(postPerformanceEvents.map(eventSeal))) failures.push("performance_events_changed");
  return failures;
}

function lineageRefs(outer) {
  return unique([
    ...(outer?.provenance?.evidence_review_ids ?? []),
    ...(outer?.provenance?.evidence_package_ids ?? []),
    ...(outer?.payload?.provenance?.evidence_review_ids ?? []),
    ...(outer?.payload?.provenance?.evidence_package_ids ?? []),
  ]).sort();
}

function reviewStatus(row) {
  const value = row?.payload ?? row;
  return String(value?.status ?? value?.reviewStatus ?? value?.review_status ?? value?.quality?.status ?? "").toLowerCase();
}

function textProvesOrder(payload, order) {
  const text = collectText(payload).join("\n").toLowerCase();
  const positions = order.map((exerciseId) => Math.min(...LABELS[exerciseId]
    .map((label) => text.indexOf(label)).filter((index) => index >= 0)));
  return positions.every(Number.isFinite) && positions[0] < positions[1] &&
    order.every((exerciseId) => LABELS[exerciseId].some((label) => {
      const index = text.indexOf(label);
      return index >= 0 && /super\s*set/.test(text.slice(index, index + label.length + 40));
    }));
}

function collectText(value, key = "", output = [], seen = new Set()) {
  if (value == null || seen.has(value)) return output;
  if (typeof value === "string") {
    if (/text/i.test(key)) output.push(value);
    return output;
  }
  if (typeof value !== "object") return output;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item) => collectText(item, key, output, seen));
  else Object.entries(value).forEach(([childKey, child]) => collectText(child, childKey, output, seen));
  return output;
}

function eventSeal(row) {
  return { recordId: row.recordId, version: Number(row.version), payloadDigest: digest(row.payload ?? row) };
}

function canonical(row) { return row?.payload ?? row; }
function session(row) { const value = canonical(row); return value?.payload ?? value; }
function unique(values) { return [...new Set(values.filter(Boolean).map(String))]; }
function compareContext(left, right) {
  return left.canonicalExerciseId.localeCompare(right.canonicalExerciseId) || left.context.localeCompare(right.context);
}
function digest(value) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function operationError(code, message) { return Object.assign(new Error(message), { code }); }
