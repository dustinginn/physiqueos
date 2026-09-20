import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";
import { isBareDisplayFilename } from "./WorkoutDuplicateIdentityService";

// Correction support for a canonical Training session that was falsely
// superseded (for example by a reused display filename). It follows the
// architecture's existing canonical revision semantics, the same as
// `CanonicalTrainingIdentityRepairService`: a superseded object is NEVER
// reactivated or edited. A new immutable correction revision is written from the
// authoritative ORIGINAL record, and the superseded records stay exactly as they
// are as audit history.
//
// This module only PLANS and SIMULATES. `applyTrainingFalseSupersessionCorrection`
// writes nothing itself: it hands the exact objects to an injected persistence
// function and refuses without an explicit, target-bound authorization.
export const TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE = "training_false_supersession_correction";
export const TRAINING_FALSE_SUPERSESSION_CORRECTION_VERSION = "training_false_supersession_correction_v1";
export const TRAINING_FALSE_SUPERSESSION_CORRECTION_SUFFIX = "repair|false_supersession_v1";

// The Founder's Sep 13 Logger workout: original `@index:503`, falsely superseded
// into `@518` (which also absorbed Sep 15 Apple telemetry) on the bare filename
// "Apple Health Screenshot 2.jpg".
export const SEP_13_FALSE_SUPERSESSION_TARGET = Object.freeze({
  originalCanonicalId:
    "training|authoritative|apple_workout_1btrcd1|training_logger_draft_ABB72390-C0D9-46B5-9F3F-939BA2820487|Apple Health Screenshot 2.jpg",
  contaminatedCanonicalIds: Object.freeze(["training|authoritative|Apple Health Screenshot 2.jpg"]),
  sessionId: "training_logger_session_ABB72390-C0D9-46B5-9F3F-939BA2820487",
  workoutDate: "2026-09-13",
  exerciseCount: 5,
  setCount: 20,
  // Active workouts that share the repeating filename but are different real
  // workouts. They must remain active and unchanged.
  mustRemainActiveSessionIds: Object.freeze([
    "training_logger_session_20A8DDEE-E0E8-42DD-8A27-0CB180743F40",
    "training_logger_session_42B1C76E-D584-4791-B688-286DDF892229",
  ]),
});

export function getTrainingFalseSupersessionCorrectedCanonicalId(target = SEP_13_FALSE_SUPERSESSION_TARGET) {
  const draftId = String(target.sessionId).replace(/^training_logger_session_/, "");
  return `training|authoritative|training_logger_draft_${draftId}|${TRAINING_FALSE_SUPERSESSION_CORRECTION_SUFFIX}`;
}

export function planTrainingFalseSupersessionCorrection({
  canonicalObjects = [],
  goals = [],
  userId,
  target = SEP_13_FALSE_SUPERSESSION_TARGET,
} = {}) {
  const correctedCanonicalId = getTrainingFalseSupersessionCorrectedCanonicalId(target);
  const byId = new Map(canonicalObjects.map((object) => [object.canonicalId, object]));
  const refuse = (...reasons) => ({ status: "refused", reasons, correctedCanonicalId, predicted: null });

  const existing = byId.get(correctedCanonicalId);
  if (existing?.quality?.status === "active") {
    return {
      status: "already_applied",
      reasons: [],
      correctedCanonicalId,
      predicted: emptyPrediction(),
    };
  }

  const original = byId.get(target.originalCanonicalId);
  if (!original) return refuse("The original canonical Training record is unavailable.");
  if (original.quality?.status !== "superseded") {
    return refuse("The original canonical Training record is not superseded; nothing to correct.");
  }
  const originalPayload = original.payload ?? {};
  if (originalPayload.evidence_type !== "training" || originalPayload.id !== target.sessionId ||
      String(originalPayload.observed_at).slice(0, 10) !== target.workoutDate) {
    return refuse("The original record is not the expected Training session and date.");
  }
  const exercises = originalPayload.exercises ?? [];
  const setCount = exercises.reduce((sum, exercise) => sum + (exercise.sets?.length ?? 0), 0);
  if (exercises.length !== target.exerciseCount || setCount !== target.setCount) {
    return refuse(`The original record must carry ${target.exerciseCount} exercises and ${target.setCount} sets.`);
  }
  const competing = canonicalObjects.filter((object) =>
    object.quality?.status !== "superseded" &&
    object.payload?.evidence_type === "training" &&
    (object.payload?.id === target.sessionId ||
      (String(object.payload?.observed_at).slice(0, 10) === target.workoutDate && (object.payload?.exercises ?? []).length > 0))
  );
  if (competing.length > 0) {
    return refuse("An active canonical Training session already represents this workout.");
  }
  const mustRemain = target.mustRemainActiveSessionIds.map((sessionId) =>
    canonicalObjects.find((object) => object.quality?.status !== "superseded" && object.payload?.id === sessionId)
  );
  if (mustRemain.some((object) => !object)) {
    return refuse("A workout that must remain active is not active in the current state.");
  }

  const correctionObject = createCorrectionObject({ original, correctedCanonicalId, target });
  if (getBareFilenameRefs(correctionObject).length > 0) {
    return refuse("The correction revision would carry a bare filename reference.");
  }
  const correctionPackage = createCorrectionPackage({ original, correctionObject, correctedCanonicalId, target, userId });

  const reconciliation = reconcileConfirmedEvidencePackage({
    evidencePackage: correctionPackage,
    existingCanonicalObjects: canonicalObjects,
    goals,
    userId,
    mutationReason: "training_false_supersession_correction",
  });
  const unexpected = reconciliation.changedObjects.filter((object) => object.canonicalId !== correctedCanonicalId);
  if (unexpected.length > 0) {
    return refuse(`The correction would also change: ${unexpected.map((object) => object.canonicalId).join(", ")}`);
  }
  const created = reconciliation.changedObjects.find((object) => object.canonicalId === correctedCanonicalId);
  if (!created || created.quality?.status !== "active") {
    return refuse("The correction did not produce one active canonical revision.");
  }

  const resulting = canonicalObjects.filter((object) => object.canonicalId !== correctedCanonicalId).concat(created);
  const stillActive = mustRemain.every((object) =>
    resulting.find((candidate) => candidate.canonicalId === object.canonicalId)?.quality?.status !== "superseded"
  );
  if (!stillActive) return refuse("A workout that must remain active would be superseded.");

  return {
    status: "ready",
    reasons: [],
    correctedCanonicalId,
    correctionPackage,
    correctionObject,
    createdRecord: created,
    predicted: {
      createdCanonicalIds: [correctedCanonicalId],
      changedCanonicalIds: reconciliation.report.changedCanonicalIds,
      supersededCanonicalIds: reconciliation.report.supersededCanonicalIds,
      unchangedSupersededCanonicalIds: [target.originalCanonicalId, ...target.contaminatedCanonicalIds],
      unchangedActiveSessionIds: [...target.mustRemainActiveSessionIds],
    },
  };
}

// Writes nothing itself. The exact created record is handed to `persist`, and
// only with an authorization bound to this exact target.
export async function applyTrainingFalseSupersessionCorrection({
  plan,
  authorization,
  persist,
  target = SEP_13_FALSE_SUPERSESSION_TARGET,
} = {}) {
  if (plan?.status === "already_applied") return { applied: false, idempotent: true, records: [] };
  if (plan?.status !== "ready") throw new Error("A ready correction plan is required.");
  if (authorization?.correctionType !== TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE ||
      authorization?.founderApproved !== true ||
      authorization?.correctedCanonicalId !== plan.correctedCanonicalId ||
      authorization?.originalCanonicalId !== target.originalCanonicalId) {
    throw new Error("The correction requires an explicit Founder authorization bound to this exact target.");
  }
  if (typeof persist !== "function") throw new Error("A persistence function is required.");
  await persist({ records: [plan.createdRecord], correctionPackage: plan.correctionPackage });
  return { applied: true, idempotent: false, records: [plan.createdRecord] };
}

function createCorrectionObject({ original, correctedCanonicalId, target }) {
  const payload = structuredClone(original.payload);
  const keepStable = (refs = []) => refs.filter((ref) => !isBareDisplayFilename(ref));
  return {
    ...payload,
    id: payload.id,
    source: {
      ...(payload.source ?? {}),
      source_artifact_refs: keepStable(payload.source?.source_artifact_refs),
    },
    provenance: {
      ...(payload.provenance ?? {}),
      source_artifact_refs: keepStable(payload.provenance?.source_artifact_refs),
    },
    reconciliation: {
      ...(payload.reconciliation ?? {}),
      canonical_id: correctedCanonicalId,
      corrects_canonical_ids: [target.originalCanonicalId, ...target.contaminatedCanonicalIds],
    },
    correction: {
      type: TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE,
      version: TRAINING_FALSE_SUPERSESSION_CORRECTION_VERSION,
      original_canonical_id: target.originalCanonicalId,
      contaminated_canonical_ids: [...target.contaminatedCanonicalIds],
      preserves_session_identity: payload.id,
      reason: "A reused display filename was treated as authoritative identity across workout dates and falsely superseded this workout.",
    },
  };
}

function createCorrectionPackage({ original, correctionObject, correctedCanonicalId, target, userId }) {
  const packageId = `repair_training_${target.workoutDate.replaceAll("-", "_")}_false_supersession_v1`;
  const originalPackageIds = original.provenance?.evidence_package_ids ?? [];
  return {
    package_id: packageId,
    userId,
    captured_at: original.payload.captured_at ?? `${target.workoutDate}T12:00:00.000Z`,
    detected_evidence_type: "training",
    detected_source_application: "Canonical correction",
    detected_source_confidence: "high",
    evidence_objects: [correctionObject],
    provenance: {
      correction_reason: correctionObject.correction.reason,
      original_package_ids: originalPackageIds,
      source_artifacts: [],
    },
    correction: {
      type: TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE,
      corrected_canonical_id: correctedCanonicalId,
      original_canonical_id: target.originalCanonicalId,
    },
    recovery: {
      original_package_id: originalPackageIds[0] ?? null,
      reason: "Immutable canonical correction of a falsely superseded Training session.",
    },
    quality: { status: "complete" },
  };
}

function getBareFilenameRefs(object) {
  return [
    ...(object.provenance?.source_artifact_refs ?? []),
    ...(object.source?.source_artifact_refs ?? []),
  ].filter(isBareDisplayFilename);
}

function emptyPrediction() {
  return {
    createdCanonicalIds: [],
    changedCanonicalIds: [],
    supersededCanonicalIds: [],
    unchangedSupersededCanonicalIds: [],
    unchangedActiveSessionIds: [],
  };
}
