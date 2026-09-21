import { createHash } from "node:crypto";
import {
  getTrainingFalseSupersessionCorrectedCanonicalId,
  planTrainingFalseSupersessionCorrection,
} from "../../domain/services/TrainingFalseSupersessionCorrectionService.js";
import {
  planRetroactiveTrainingPerformanceEvents,
  TRAINING_RETROACTIVE_EVENT_SOURCE,
} from "../../domain/services/TrainingRetroactiveEventPlanner.js";
import { resolveTrainingPerformanceEventLiveness } from "../../domain/services/TrainingPerformanceEventLiveness.js";

/**
 * Bounded, owner-scoped Training historical repair. `records` is the application's
 * canonical record store, so every write has the semantics of every other canonical write:
 * new rows only (`putIfAbsent`, never an update of an existing row), the owner runtime lock
 * taken before reading, and the runtime revision advanced once after a write so stale
 * composite editors are fenced exactly as they are for every other canonical mutation.
 *
 *   dry-run  reads, plans and proves the repair; writes nothing.
 *   apply    requires `expected` facts captured by a dry run immediately before it; refuses
 *            (writes nothing) if production drifted, then re-verifies inside the same
 *            transaction and throws to force a ROLLBACK if any invariant fails.
 *
 * Two phases, applied separately and in order:
 *   sep13_correction     one immutable correction revision + its correction package
 *   retroactive_events   the exact Founder-approved durable events + one audit marker
 */
export async function runTrainingAuthorityRepair({
  records,
  authorization,
  phase,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  if (phase === "sep13_correction") return runSep13Correction({ records, authorization, apply, expected, now });
  if (phase === "retroactive_events") return runRetroactiveEvents({ records, authorization, apply, expected, now });
  throw Object.assign(new Error("Unsupported repair phase."), { code: "PHASE_INVALID" });
}

async function runSep13Correction({ records, authorization, apply, expected, now }) {
  const { ownerUserId, sep13Correction: target } = authorization;
  const runtime = await records.getRuntimeMetadata({ ownerUserId, lock: apply });
  const canonicalObjects = await records.list({ ownerUserId, collection: "canonicalEvidenceObjects" });
  const goals = await records.list({ ownerUserId, collection: "goals" });
  const correctedCanonicalId = getTrainingFalseSupersessionCorrectedCanonicalId(target);
  const packageId = `repair_training_${target.workoutDate.replaceAll("-", "_")}_false_supersession_v1`;
  const existingPackage = await records.get({ ownerUserId, collection: "evidencePackages", recordId: packageId });
  const facts = collectSep13Facts({ canonicalObjects, runtime, target, correctedCanonicalId });

  const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects, goals, userId: ownerUserId, target });
  if (plan.status === "already_applied") {
    const copies = canonicalObjects.filter((object) => object.canonicalId === correctedCanonicalId);
    if (copies.length !== 1 || !existingPackage) {
      throw Object.assign(new Error("Already applied but the correction record or package is not exactly once."), { code: "CORRECTION_STATE_INCONSISTENT" });
    }
    return Object.freeze({ outcome: "already_applied", correctedCanonicalId, facts });
  }
  if (plan.status !== "ready") return Object.freeze({ outcome: "refused", reasons: plan.reasons, facts });
  if (existingPackage) {
    throw Object.assign(new Error("The correction package exists without its canonical record."), { code: "CORRECTION_STATE_INCONSISTENT" });
  }
  const summary = {
    correctedCanonicalId,
    correctionPackageId: packageId,
    predicted: plan.predicted,
    facts,
    correction: describeCorrection(plan.createdRecord),
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });

  const ordinal = canonicalObjects.length;
  const canonicalRecordId = `@index:${ordinal}`;
  const created = await records.putIfAbsent({
    ownerUserId, collection: "canonicalEvidenceObjects", recordId: canonicalRecordId, payload: plan.createdRecord,
    sourceIdentity: authorization.repairId,
  });
  const createdPackage = await records.putIfAbsent({
    ownerUserId, collection: "evidencePackages", recordId: packageId, sourceIdentity: authorization.repairId,
    payload: { ...plan.correctionPackage, review_metadata: { confirmedAt: now().toISOString(), origin: authorization.repairId } },
  });
  if (!created.created || !createdPackage.created) {
    throw Object.assign(new Error("A correction row already existed."), { code: "CORRECTION_ROW_EXISTS" });
  }
  await records.advanceRuntimeMetadata({ ownerUserId, expectedRevision: runtime.revision, commandId: authorization.repairId, at: now() });

  // Re-verify inside the transaction; any failure throws and the runner rolls everything back.
  const after = await records.list({ ownerUserId, collection: "canonicalEvidenceObjects" });
  const before = new Map(canonicalObjects.map((object) => [object.canonicalId, digest(object)]));
  const changedExisting = after.filter((object) => before.has(object.canonicalId) && digest(object) !== before.get(object.canonicalId));
  const copies = after.filter((object) => object.canonicalId === correctedCanonicalId);
  const invariants = {
    exactlyOneNewRecord: after.length === canonicalObjects.length + 1 && copies.length === 1,
    existingRecordsUnchanged: changedExisting.length === 0,
    correctionActive: copies[0]?.quality?.status === "active",
    correctionRoster: describeCorrection(copies[0]).exercises === target.exerciseCount && describeCorrection(copies[0]).sets === target.setCount,
    originalAndContaminatedStillSuperseded: [target.originalCanonicalId, ...target.contaminatedCanonicalIds]
      .every((id) => after.find((object) => object.canonicalId === id)?.quality?.status === "superseded"),
    mustRemainActive: target.mustRemainActiveSessionIds.every((sessionId) =>
      after.some((object) => object.payload?.id === sessionId && object.quality?.status !== "superseded")),
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...summary, invariants, canonicalRecordId, recordVersion: created.record.version });
}

async function runRetroactiveEvents({ records, authorization, apply, expected, now }) {
  const { ownerUserId, sep13Correction: target } = authorization;
  const runtime = await records.getRuntimeMetadata({ ownerUserId, lock: apply });
  const canonicalObjects = await records.list({ ownerUserId, collection: "canonicalEvidenceObjects" });
  const existingEvents = await records.list({ ownerUserId, collection: "trainingPerformanceEvents" });
  const correctedCanonicalId = getTrainingFalseSupersessionCorrectedCanonicalId(target);
  const correction = canonicalObjects.find((object) => object.canonicalId === correctedCanonicalId);
  if (correction?.quality?.status !== "active") {
    return Object.freeze({ outcome: "refused", reasons: ["The Sep 13 canonical correction is not active; events are derived from repaired authority only."] });
  }
  const markerId = `${TRAINING_RETROACTIVE_EVENT_SOURCE}|${authorization.repairId}`;
  const existingMarker = await records.get({ ownerUserId, collection: "migrationMarkers", recordId: markerId });
  const facts = {
    runtimeRevision: runtime.revision,
    existingEventCount: existingEvents.length,
    existingEventsDigest: digest(existingEvents.map((event) => [event.id, event.version, digest(event)]).sort()),
  };
  const approved = [...authorization.approvedEvents].sort((left, right) => left.id.localeCompare(right.id));

  const { proposed, skipped } = planRetroactiveTrainingPerformanceEvents({ canonicalObjects, existingEvents, now });
  const proposedRows = proposed.map(describeEvent).sort((left, right) => left.id.localeCompare(right.id));
  const alreadyPresent = approved.filter((event) => existingEvents.some((existing) => existing.id === event.id));
  if (alreadyPresent.length === approved.length && proposed.length === 0 && existingMarker) {
    return Object.freeze({ outcome: "already_applied", eventIds: approved.map((event) => event.id), facts });
  }
  if (JSON.stringify(proposedRows) !== JSON.stringify(approved.map(describeApproved))) {
    return Object.freeze({
      outcome: "refused",
      reasons: ["The recalculated event set differs from the Founder-approved set; nothing was written."],
      recalculated: proposedRows, approved: approved.map(describeApproved), facts,
    });
  }
  const summary = { facts, skipped, eventCount: proposed.length, events: proposedRows, markerId };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });

  const writtenAt = now().toISOString();
  for (const event of proposed) {
    const written = await records.putIfAbsent({
      ownerUserId, collection: "trainingPerformanceEvents", recordId: event.id, sourceIdentity: authorization.repairId,
      payload: { ...event, createdAt: writtenAt },
    });
    if (!written.created) throw Object.assign(new Error("An event row already existed."), { code: "EVENT_ROW_EXISTS" });
  }
  const marker = await records.putIfAbsent({
    ownerUserId, collection: "migrationMarkers", recordId: markerId, sourceIdentity: authorization.repairId,
    payload: {
      id: markerId, schemaVersion: TRAINING_RETROACTIVE_EVENT_SOURCE, repairId: authorization.repairId,
      correctedCanonicalId, reconciledEventIds: proposed.map((event) => event.id).sort(), reconciledAt: writtenAt,
      authorizedBy: authorization.authorizedBy,
    },
  });
  if (!marker.created) throw Object.assign(new Error("The audit marker already existed."), { code: "MARKER_EXISTS" });
  await records.advanceRuntimeMetadata({ ownerUserId, expectedRevision: runtime.revision, commandId: authorization.repairId, at: now() });

  const afterEvents = await records.list({ ownerUserId, collection: "trainingPerformanceEvents" });
  const originals = new Map(existingEvents.map((event) => [event.id, digest(event)]));
  const liveness = resolveTrainingPerformanceEventLiveness({ events: afterEvents, canonicalObjects });
  const invariants = {
    exactlyTwelveNew: afterEvents.length === existingEvents.length + approved.length,
    existingEventsUnchanged: afterEvents.filter((event) => originals.has(event.id)).every((event) => digest(event) === originals.get(event.id)) && [...originals.keys()].every((id) => afterEvents.some((event) => event.id === id)),
    approvedEventsPresent: approved.every((event) => afterEvents.some((existing) => existing.id === event.id)),
    everyEventLive: afterEvents.every((event) => liveness.get(event.id)?.state === "live"),
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...summary, invariants, createdCount: proposed.length });
}

function collectSep13Facts({ canonicalObjects, runtime, target, correctedCanonicalId }) {
  const keyIds = [target.originalCanonicalId, ...target.contaminatedCanonicalIds];
  const sessions = target.mustRemainActiveSessionIds;
  const keyRecords = {};
  for (const id of keyIds) {
    const record = canonicalObjects.find((object) => object.canonicalId === id);
    keyRecords[id] = record ? { version: record.version, status: record.quality?.status, digest: digest(record) } : null;
  }
  for (const sessionId of sessions) {
    const record = canonicalObjects.find((object) => object.payload?.id === sessionId && object.quality?.status !== "superseded");
    keyRecords[sessionId] = record ? { version: record.version, status: record.quality?.status, digest: digest(record) } : null;
  }
  return {
    runtimeRevision: runtime.revision,
    canonicalObjectCount: canonicalObjects.length,
    trainingObjectCount: canonicalObjects.filter((object) => (object.payload ?? object).evidence_type === "training").length,
    canonicalCollectionDigest: digest(canonicalObjects.map((object) => [object.canonicalId, object.version, digest(object)]).sort()),
    correctionPresent: canonicalObjects.some((object) => object.canonicalId === correctedCanonicalId),
    keyRecords,
  };
}

function compareFacts(expected, facts) {
  if (!expected) return ["expected facts are required to apply"];
  const differences = [];
  for (const key of Object.keys(facts)) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(facts[key])) differences.push(key);
  }
  return differences;
}

function describeCorrection(record) {
  const exercises = record?.payload?.exercises ?? [];
  return {
    canonicalId: record?.canonicalId ?? null,
    date: String(record?.payload?.observed_at ?? "").slice(0, 10),
    sessionId: record?.payload?.id ?? null,
    status: record?.quality?.status ?? null,
    exercises: exercises.length,
    sets: exercises.reduce((sum, exercise) => sum + (exercise.sets?.length ?? 0), 0),
    telemetry: {
      start_time: record?.payload?.metadata?.start_time ?? null,
      end_time: record?.payload?.metadata?.end_time ?? null,
      duration_seconds: record?.payload?.metadata?.duration_seconds ?? null,
      active_calories: record?.payload?.metadata?.active_calories ?? null,
    },
    sourceArtifactRefs: record?.provenance?.source_artifact_refs ?? [],
  };
}

function describeEvent(event) {
  return { id: event.id, date: event.workoutDate, exercise: event.canonicalExerciseId, type: event.eventType, load: event.load ?? null, prior: event.previousBaselineValue, value: event.currentValue };
}
function describeApproved(event) {
  return { id: event.id, date: event.date, exercise: event.exercise, type: event.type, load: event.load ?? null, prior: event.prior, value: event.value };
}

export function digest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
