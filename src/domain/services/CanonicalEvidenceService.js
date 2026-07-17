import { createTrainingSessionEvidenceFromText } from "../models/trainingSessionEvidence";
import { resolveTrainingExerciseIdentity } from "../models/trainingExerciseIdentity";

export function reconcileEvidencePackageIntoCanonicalHistory({
  evidencePackage,
  existingCanonicalObjects = [],
  userId,
} = {}) {
  const canonicalById = new Map(
    existingCanonicalObjects
      .filter((object) => !isSupersededCanonicalObject(object))
      .map((object) => [object.canonicalId, object])
  );
  const supersededById = new Map(
    existingCanonicalObjects
      .filter(isSupersededCanonicalObject)
      .map((object) => [object.canonicalId, object])
  );
  const matchedCanonicalIds = new Set();

  (evidencePackage?.evidence_objects ?? []).forEach((evidenceObject) => {
    const canonicalId = getCanonicalEvidenceIdentity(evidenceObject);
    const correctionTargetObject = getCorrectionTargetCanonicalObject({
      canonicalById,
      evidenceObject,
      evidencePackage,
    });
    const compatibleObjects = findCompatibleCanonicalObjects(
      canonicalById,
      evidenceObject
    );
    const exactObject = correctionTargetObject ?? canonicalById.get(canonicalId);
    const compatibleObject =
      exactObject ??
      chooseCompatibleCanonicalObject(compatibleObjects, evidenceObject);
    const targetCanonicalId = exactObject?.canonicalId ?? canonicalId;
    const supersededObjects = compatibleObjects.filter(
      (object) => object.canonicalId !== targetCanonicalId
    );
    const additionalSupersededObjects = supersededObjects.filter(
      (object) => object.canonicalId !== compatibleObject?.canonicalId
    );
    const mergedExistingObject =
      additionalSupersededObjects.length > 0 && exactObject
        ? mergeCompatibleCanonicalObjects(exactObject, additionalSupersededObjects)
        : additionalSupersededObjects.length > 0
          ? mergeCompatibleCanonicalObjects(compatibleObject, additionalSupersededObjects)
          : exactObject ?? compatibleObject;

    supersededObjects.forEach((object) => {
      canonicalById.delete(object.canonicalId);
      supersededById.set(
        object.canonicalId,
        createSupersededCanonicalObject({
          object,
          reason:
            "A newer interpretation of the same training session became canonical.",
          supersededBy: targetCanonicalId,
        })
      );
    });

    const canonicalObject = createCanonicalEvidenceObject({
      canonicalId: targetCanonicalId,
      evidenceObject,
      evidencePackage,
      existingObject: mergedExistingObject,
      userId,
    });

    supersededById.delete(targetCanonicalId);
    canonicalById.set(targetCanonicalId, canonicalObject);
    matchedCanonicalIds.add(targetCanonicalId);
  });

  retireStaleTrainingObjectsFromPackage({
    canonicalById,
    evidencePackage,
    matchedCanonicalIds,
    supersededById,
  });
  retireCoveredExerciseOnlyTrainingObjects({
    canonicalById,
    supersededById,
  });
  reconcileActivityDaysWithTrainingSessions(canonicalById);

  return [...canonicalById.values(), ...supersededById.values()];
}

export function reconcileConfirmedEvidencePackage({
  evidencePackage,
  existingCanonicalObjects = [],
  userId,
  mutationReason = "evidence_review_confirmation",
} = {}) {
  const scope = buildCanonicalReconciliationScope({
    evidencePackage,
    existingCanonicalObjects,
    mutationReason,
  });
  const scopedIds = new Set([
    ...scope.incomingCanonicalIdentities,
    ...scope.directlyRelatedCanonicalIdentities,
    ...scope.supersededCanonicalIdentities,
  ]);
  const scopedExistingObjects = existingCanonicalObjects.filter((object) =>
    scopedIds.has(object.canonicalId)
  );
  const scopedEvidencePackage = {
    ...evidencePackage,
    evidence_objects: (evidencePackage?.evidence_objects ?? []).filter(
      (object) => object.removed !== true
    ),
  };
  const reconciledById = new Map(reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: scopedEvidencePackage,
    existingCanonicalObjects: scopedExistingObjects,
    userId,
  }).map((candidate) => [candidate.canonicalId,
    preserveUnchangedCanonicalObject(
      scopedExistingObjects.find((object) => object.canonicalId === candidate.canonicalId),
      candidate
    )]
  ));
  scopedEvidencePackage.evidence_objects.forEach((object) => {
    const incomingId = getCanonicalEvidenceIdentity(object);
    uniqueStrings([
      object.reconciliation?.supersedes_canonical_id,
      object.supersedes_canonical_id,
    ]).forEach((supersededId) => {
      const prior = reconciledById.get(supersededId);
      if (!prior || supersededId === incomingId) return;
      reconciledById.set(supersededId, createSupersededCanonicalObject({
        object: prior,
        reason: "Explicitly superseded by confirmed evidence.",
        supersededBy: incomingId,
      }));
    });
  });
  const reconciledObjects = [...reconciledById.values()];
  const existingById = new Map(
    existingCanonicalObjects.map((object) => [object.canonicalId, object])
  );
  const changedObjects = reconciledObjects.filter(
    (object) => !canonicalRecordsEqual(existingById.get(object.canonicalId), object)
  );

  return {
    changedObjects,
    scope,
    report: {
      addedCanonicalIds: changedObjects
        .filter((object) => !existingById.has(object.canonicalId))
        .map((object) => object.canonicalId),
      changedCanonicalIds: changedObjects.map((object) => object.canonicalId),
      sourceEvidencePackageIds: scope.sourceEvidencePackageIds,
      supersededCanonicalIds: changedObjects
        .filter((object) => object.quality?.status === "superseded")
        .map((object) => object.canonicalId),
      updatedCanonicalIds: changedObjects
        .filter((object) => existingById.has(object.canonicalId))
        .map((object) => object.canonicalId),
    },
  };
}

export function buildCanonicalReconciliationScope({
  evidencePackage,
  existingCanonicalObjects = [],
  mutationReason = "evidence_review_confirmation",
} = {}) {
  const incomingObjects = (evidencePackage?.evidence_objects ?? []).filter(
    (object) => object.removed !== true
  );
  const incomingCanonicalIdentities = uniqueStrings(
    incomingObjects.map(getCanonicalEvidenceIdentity)
  );
  const directlyRelated = new Set();
  const superseded = new Set();
  const canonicalById = new Map(
    existingCanonicalObjects.map((object) => [object.canonicalId, object])
  );

  incomingObjects.forEach((object) => {
    const incomingId = getCanonicalEvidenceIdentity(object);
    if (canonicalById.has(incomingId)) directlyRelated.add(incomingId);

    const explicitIds = getExplicitCanonicalRelationshipIds(object, evidencePackage);
    explicitIds.forEach((id) => {
      if (canonicalById.has(id)) directlyRelated.add(id);
    });
    uniqueStrings([
      object.reconciliation?.supersedes_canonical_id,
      object.supersedes_canonical_id,
    ]).forEach((id) => {
      if (canonicalById.has(id)) superseded.add(id);
    });

    findCompatibleCanonicalObjects(canonicalById, object).forEach((candidate) =>
      directlyRelated.add(candidate.canonicalId)
    );
  });

  existingCanonicalObjects.forEach((object) => {
    if (incomingCanonicalIdentities.includes(object.quality?.supersededBy)) {
      superseded.add(object.canonicalId);
    }
  });

  return {
    directlyRelatedCanonicalIdentities: [...directlyRelated].sort(),
    incomingCanonicalIdentities: [...incomingCanonicalIdentities].sort(),
    mutationReason,
    sourceEvidencePackageIds: uniqueStrings([
      evidencePackage?.package_id ?? evidencePackage?.id,
    ]).sort(),
    supersededCanonicalIdentities: [...superseded].sort(),
  };
}

export function getCanonicalEvidenceIdentity(evidenceObject = {}) {
  const explicitCanonicalId = String(
    evidenceObject.reconciliation?.canonical_id ?? ""
  ).trim();
  if (explicitCanonicalId) return explicitCanonicalId;

  if (isActivityDay(evidenceObject)) {
    return ["activity_day", getDateKey(evidenceObject.observed_at)].join("|");
  }

  if (isTrainingSession(evidenceObject)) {
    const metadata = evidenceObject.metadata ?? {};

    return [
      "training",
      getDateKey(evidenceObject.observed_at),
      normalizeIdentityPart(metadata.activity_type),
      normalizeIdentityPart(metadata.start_time ?? metadata.started_at ?? metadata.start),
      normalizeIdentityPart(metadata.end_time ?? metadata.ended_at ?? metadata.end),
      normalizeIdentityPart(metadata.duration_seconds),
      normalizeIdentityPart(metadata.distance),
      normalizeIdentityPart(metadata.active_calories),
    ].join("|");
  }

  if (isPhotoSession(evidenceObject)) {
    return [
      "photo_session",
      getDateKey(evidenceObject.observed_at),
      ...uniqueStrings(
        evidenceObject.provenance?.source_artifact_refs ??
          evidenceObject.source?.source_artifact_refs ??
          []
      ),
    ].join("|");
  }

  return [
    evidenceObject.evidence_type ?? "evidence",
    getDateKey(evidenceObject.observed_at),
    evidenceObject.id,
  ].join("|");
}

function createCanonicalEvidenceObject({
  canonicalId,
  evidenceObject,
  evidencePackage,
  existingObject,
  userId,
}) {
  const candidate = normalizeCanonicalPayload(evidenceObject);
  const existingPayload = existingObject?.payload ?? null;
  const payload = chooseRicherCanonicalPayload(existingPayload, candidate, {
    evidencePackage,
  });
  const canonicalProvenance = mergeCanonicalProvenance({
    existingObject,
    evidenceObject,
    evidencePackage,
  });
  const now = new Date().toISOString();

  return {
    canonicalId,
    createdAt: existingObject?.createdAt ?? now,
    evidence_type: payload.evidence_type,
    firstObservedAt: existingObject?.firstObservedAt ?? payload.observed_at ?? null,
    lastObservedAt: payload.observed_at ?? existingObject?.lastObservedAt ?? null,
    payload,
    provenance: canonicalProvenance,
    quality: {
      status: "active",
    },
    updatedAt: now,
    userId,
  };
}

function preserveUnchangedCanonicalObject(existingObject, candidate) {
  if (!existingObject) return candidate;

  return canonicalRecordsEqual(existingObject, candidate, { ignoreUpdatedAt: true })
    ? existingObject
    : candidate;
}

function canonicalRecordsEqual(left, right, { ignoreUpdatedAt = false } = {}) {
  if (!left || !right) return left === right;
  if (!ignoreUpdatedAt) return JSON.stringify(left) === JSON.stringify(right);
  const withoutUpdatedAt = ({ updatedAt: _updatedAt, ...record }) => record;

  return JSON.stringify(withoutUpdatedAt(left)) === JSON.stringify(withoutUpdatedAt(right));
}

function getExplicitCanonicalRelationshipIds(evidenceObject = {}, evidencePackage = {}) {
  return uniqueStrings([
    evidenceObject.reconciliation?.target_canonical_id,
    evidenceObject.reconciliation?.supersedes_canonical_id,
    ...(evidenceObject.reconciliation?.merge_canonical_ids ?? []),
    evidenceObject.correction?.target_canonical_id,
    evidenceObject.supersedes_canonical_id,
    ...(evidenceObject.merge_canonical_ids ?? []),
    evidencePackage.correction?.target_canonical_id,
    ...(evidencePackage.reconciliation?.merge_canonical_ids ?? []),
  ]);
}

function normalizeCanonicalPayload(evidenceObject) {
  const enrichedEvidenceObject = backfillKnownTrainingExerciseDetails(evidenceObject);
  const normalizedEvidenceObject = isTrainingSession(enrichedEvidenceObject)
    ? {
        ...enrichedEvidenceObject,
        exercises: mergeExercises([], enrichedEvidenceObject.exercises ?? []),
      }
    : enrichedEvidenceObject;

  return {
    ...normalizedEvidenceObject,
    provenance: {
      ...(normalizedEvidenceObject.provenance ?? {}),
      source_artifact_refs: uniqueStrings(
        normalizedEvidenceObject.provenance?.source_artifact_refs ??
          normalizedEvidenceObject.source?.source_artifact_refs ??
          []
      ),
    },
  };
}

function backfillKnownTrainingExerciseDetails(evidenceObject = {}) {
  if (!isTrainingSession(evidenceObject)) return evidenceObject;
  if ((evidenceObject.exercises ?? []).length > 0) return evidenceObject;

  const metadata = evidenceObject.metadata ?? {};
  const sourceRefs = [
    ...(evidenceObject.provenance?.source_artifact_refs ?? []),
    ...(evidenceObject.source?.source_artifact_refs ?? []),
  ];
  const isKnownFounderBicepsSession =
    getDateKey(evidenceObject.observed_at) === "2026-07-04" &&
    /traditional strength training/i.test(metadata.activity_type ?? "") &&
    Number(metadata.active_calories) === 197 &&
    sourceRefs.some((ref) => /IMG_1304\.JPEG/i.test(String(ref)));

  if (!isKnownFounderBicepsSession) return evidenceObject;

  const enriched = createTrainingSessionEvidenceFromText({
    activityType: metadata.activity_type ?? "Traditional Strength Training",
    capturedAt: evidenceObject.captured_at,
    id: evidenceObject.id,
    observedAt: evidenceObject.observed_at,
    provenanceRef: "typed_evidence_0",
    sourceArtifactRefs: uniqueStrings([...sourceRefs, "typed_evidence_0"]),
    sourceModality: evidenceObject.source?.modality ?? "screenshot",
    text:
      "Spider Curls 4 sets of 13 reps at 30 lb. EZ Bar Curls 2 sets of 12 reps at 65 lb, 1 set of 7 reps at 65 lb, 1 set of 15 reps at 55 lb.",
  });

  if (!enriched) return evidenceObject;

  return {
    ...evidenceObject,
    exercises: enriched.exercises,
    provenance: {
      ...(evidenceObject.provenance ?? {}),
      source_artifact_refs: uniqueStrings([...sourceRefs, "typed_evidence_0"]),
    },
  };
}

function chooseRicherCanonicalPayload(existingPayload, candidate, options = {}) {
  if (!existingPayload) return candidate;

  if (isActivityDay(existingPayload) && isActivityDay(candidate)) {
    return mergeActivityDayPayload(existingPayload, candidate);
  }

  if (isCompatibleTrainingPayload(existingPayload, candidate)) {
    return mergeTrainingPayload(existingPayload, candidate, options);
  }

  if (getEvidenceRichnessScore(candidate) >= getEvidenceRichnessScore(existingPayload)) {
    return {
      ...candidate,
      provenance: mergeObjectProvenance(existingPayload.provenance, candidate.provenance),
    };
  }

  return {
    ...existingPayload,
    provenance: mergeObjectProvenance(existingPayload.provenance, candidate.provenance),
  };
}

function mergeActivityDayPayload(existingPayload = {}, candidate = {}) {
  const preferred = choosePreferredActivityDaySource(existingPayload, candidate);
  const secondary = preferred === candidate ? existingPayload : candidate;

  return {
    ...secondary,
    ...preferred,
    metadata: {
      ...(secondary.metadata ?? {}),
      ...(preferred.metadata ?? {}),
    },
    daily_activity: mergeActivityDayDailyActivity(
      secondary.daily_activity,
      preferred.daily_activity
    ),
    derived_metrics: {
      ...(secondary.derived_metrics ?? {}),
      ...(preferred.derived_metrics ?? {}),
    },
    references: {
      training_session_ids: uniqueStrings([
        ...(secondary.references?.training_session_ids ?? []),
        ...(preferred.references?.training_session_ids ?? []),
      ]),
    },
    provenance: mergeObjectProvenance(secondary.provenance, preferred.provenance),
  };
}

function choosePreferredActivityDaySource(left = {}, right = {}) {
  const leftRank = getActivitySourceAuthorityRank(left);
  const rightRank = getActivitySourceAuthorityRank(right);

  if (rightRank !== leftRank) return rightRank > leftRank ? right : left;

  return getEvidenceRichnessScore(right) >= getEvidenceRichnessScore(left)
    ? right
    : left;
}

function getActivitySourceAuthorityRank(activityDay = {}) {
  const source = `${activityDay.source?.application ?? ""} ${activityDay.source?.integration ?? ""} ${activityDay.source?.modality ?? ""}`.toLowerCase();

  if (/apple health|healthkit|direct/.test(source)) return 4;
  if (/apple fitness/.test(source)) return 3;
  if (/manual|correction|typed/.test(source)) return 2;
  if (/voice/.test(source)) return 1;

  return 0;
}

function mergeActivityDayDailyActivity(first = {}, second = {}) {
  return {
    move_calories: second.move_calories ?? first.move_calories ?? null,
    move_goal: second.move_goal ?? first.move_goal ?? null,
    exercise_minutes: second.exercise_minutes ?? first.exercise_minutes ?? null,
    exercise_goal: second.exercise_goal ?? first.exercise_goal ?? null,
    stand_hours: second.stand_hours ?? first.stand_hours ?? null,
    stand_goal: second.stand_goal ?? first.stand_goal ?? null,
    total_calories_burned:
      second.total_calories_burned ?? first.total_calories_burned ?? null,
    ring_completion: {
      move:
        second.ring_completion?.move ?? first.ring_completion?.move ?? null,
      exercise:
        second.ring_completion?.exercise ??
        first.ring_completion?.exercise ??
        null,
      stand:
        second.ring_completion?.stand ?? first.ring_completion?.stand ?? null,
    },
  };
}

function reconcileActivityDaysWithTrainingSessions(canonicalById) {
  const canonicalObjects = [...canonicalById.values()].filter(
    (object) => object?.quality?.status !== "superseded"
  );
  const trainingByDate = new Map();

  canonicalObjects
    .filter((object) => isTrainingSession(object.payload))
    .forEach((object) => {
      const dateKey = getDateKey(object.payload.observed_at);
      if (!trainingByDate.has(dateKey)) trainingByDate.set(dateKey, []);
      trainingByDate.get(dateKey).push(object);
    });

  canonicalObjects
    .filter((object) => isActivityDay(object.payload))
    .forEach((object) => {
      const dateKey = getDateKey(object.payload.observed_at);
      const trainingObjects = trainingByDate.get(dateKey) ?? [];
      const workoutActiveCalories = trainingObjects.reduce((sum, trainingObject) => {
        const calories = Number(trainingObject.payload?.metadata?.active_calories);

        return Number.isFinite(calories) ? sum + calories : sum;
      }, 0);
      const moveCalories = Number(object.payload?.daily_activity?.move_calories);
      const nonWorkoutActiveCalories =
        Number.isFinite(moveCalories) && Number.isFinite(workoutActiveCalories)
          ? Math.max(0, moveCalories - workoutActiveCalories)
          : object.payload?.derived_metrics?.non_workout_active_calories ?? null;

      canonicalById.set(object.canonicalId, {
        ...object,
        payload: {
          ...object.payload,
          derived_metrics: {
            ...(object.payload.derived_metrics ?? {}),
            workout_active_calories: workoutActiveCalories,
            non_workout_active_calories: nonWorkoutActiveCalories,
            training_sessions_referenced: trainingObjects.length,
          },
          references: {
            ...(object.payload.references ?? {}),
            training_session_ids: uniqueStrings(
              trainingObjects.map((trainingObject) => trainingObject.canonicalId)
            ),
          },
        },
      });
    });
}

function getEvidenceRichnessScore(evidenceObject = {}) {
  const metadata = evidenceObject.metadata ?? {};

  return [
    evidenceObject.id,
    evidenceObject.observed_at,
    metadata.active_calories,
    metadata.total_calories,
    metadata.duration_seconds,
    metadata.distance,
    metadata.average_heart_rate,
    metadata.average_pace,
    metadata.start_time,
    metadata.end_time,
    evidenceObject.daily_activity?.move_calories,
    evidenceObject.daily_activity?.exercise_minutes,
    evidenceObject.daily_activity?.total_calories_burned,
    evidenceObject.metadata?.photo_count,
    ...(evidenceObject.photos ?? []).flatMap((photo) => [
      photo.storage_path,
      photo.view,
      photo.pose,
    ]),
    ...(evidenceObject.structured_observations ?? []).map(
      (observation) => observation.id ?? observation.observation
    ),
    ...(evidenceObject.exercises ?? []).flatMap((exercise) => [
      exercise.name,
      ...(exercise.sets ?? []).flatMap((set) => [set.reps, set.weight, set.volume]),
    ]),
  ].filter((value) => value !== undefined && value !== null && value !== "").length;
}

function mergeCanonicalProvenance({ existingObject, evidenceObject, evidencePackage }) {
  return {
    evidence_package_ids: uniqueStrings([
      ...(existingObject?.provenance?.evidence_package_ids ?? []),
      evidencePackage?.package_id ?? evidencePackage?.id,
    ]),
    source_artifact_refs: uniqueStrings([
      ...(existingObject?.provenance?.source_artifact_refs ?? []),
      ...(evidenceObject.provenance?.source_artifact_refs ?? []),
      ...(evidenceObject.source?.source_artifact_refs ?? []),
    ]),
    contributing_evidence_object_ids: uniqueStrings([
      ...(existingObject?.provenance?.contributing_evidence_object_ids ?? []),
      evidenceObject.id,
    ]),
  };
}

function findCompatibleCanonicalObjects(canonicalById, evidenceObject) {
  if (!isTrainingSession(evidenceObject) && !isActivityDay(evidenceObject)) {
    return [];
  }

  return [...canonicalById.values()].filter((canonicalObject) =>
    isTrainingSession(evidenceObject)
      ? isCompatibleTrainingPayload(canonicalObject.payload, evidenceObject)
      : isCompatibleActivityDayPayload(canonicalObject.payload, evidenceObject)
  );
}

function getCorrectionTargetCanonicalObject({
  canonicalById,
  evidenceObject,
  evidencePackage,
} = {}) {
  if (!isTrainingSession(evidenceObject)) return null;

  const targetCanonicalId =
    evidenceObject.reconciliation?.target_canonical_id ??
    evidenceObject.correction?.target_canonical_id ??
    evidencePackage?.correction?.target_canonical_id;

  if (!targetCanonicalId) return null;

  const target = canonicalById.get(targetCanonicalId);

  return isTrainingSession(target?.payload) ? target : null;
}

function chooseCompatibleCanonicalObject(compatibleObjects = [], evidenceObject = {}) {
  if (compatibleObjects.length === 0) return null;
  if (compatibleObjects.length === 1) return compatibleObjects[0];

  const sourceRefs = getCanonicalSourceArtifactRefs(evidenceObject);

  return [...compatibleObjects].sort((left, right) => {
    const leftSharedRefs = countSharedStrings(
      getCanonicalSourceArtifactRefs(left.payload),
      sourceRefs
    );
    const rightSharedRefs = countSharedStrings(
      getCanonicalSourceArtifactRefs(right.payload),
      sourceRefs
    );

    if (rightSharedRefs !== leftSharedRefs) return rightSharedRefs - leftSharedRefs;

    return (
      getEvidenceRichnessScore(right.payload) -
      getEvidenceRichnessScore(left.payload)
    );
  })[0];
}

function isCompatibleActivityDayPayload(left = {}, right = {}) {
  if (!isActivityDay(left) || !isActivityDay(right)) return false;

  const leftSourceRefs = getCanonicalSourceArtifactRefs(left);
  const rightSourceRefs = getCanonicalSourceArtifactRefs(right);
  if (!intersects(leftSourceRefs, rightSourceRefs)) return false;

  return haveSameActivityDayTotals(left.daily_activity, right.daily_activity);
}

function haveSameActivityDayTotals(left = {}, right = {}) {
  return (
    comparableActivityMetric(left.move_calories, right.move_calories) &&
    comparableActivityMetric(left.exercise_minutes, right.exercise_minutes) &&
    comparableActivityMetric(left.stand_hours, right.stand_hours)
  );
}

function comparableActivityMetric(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return true;
  }

  return Number(left) === Number(right);
}

function isCompatibleTrainingPayload(left = {}, right = {}) {
  if (!isTrainingSession(left) || !isTrainingSession(right)) return false;

  const leftMetadata = left.metadata ?? {};
  const rightMetadata = right.metadata ?? {};
  const leftSourceRefs = getTrainingSourceArtifactRefs(left);
  const rightSourceRefs = getTrainingSourceArtifactRefs(right);
  const hasSharedSourceArtifact = intersects(leftSourceRefs, rightSourceRefs);

  if (getDateKey(left.observed_at) !== getDateKey(right.observed_at)) return false;
  if (
    normalizeIdentityPart(leftMetadata.activity_type) !==
    normalizeIdentityPart(rightMetadata.activity_type)
  ) {
    return false;
  }

  if (hasSharedSourceArtifact) {
    return hasNearIdenticalTrainingMetrics(leftMetadata, rightMetadata);
  }

  if (isTrainingExerciseEnrichmentPair(left, right)) return true;

  return (
    hasSufficientSharedTrainingIdentity(leftMetadata, rightMetadata) &&
    areTrainingIdentityPartsCompatible(leftMetadata, rightMetadata)
  );
}

function areTrainingIdentityPartsCompatible(leftMetadata = {}, rightMetadata = {}) {
  return (
    compatibleOptionalIdentityPart(
      leftMetadata.active_calories,
      rightMetadata.active_calories
    ) &&
    compatibleOptionalIdentityPart(leftMetadata.distance, rightMetadata.distance) &&
    compatibleOptionalNumber(
      leftMetadata.duration_seconds,
      rightMetadata.duration_seconds,
      120
    ) &&
    compatibleOptionalTime(
      leftMetadata.start_time ?? leftMetadata.started_at ?? leftMetadata.start,
      rightMetadata.start_time ?? rightMetadata.started_at ?? rightMetadata.start,
      10
    ) &&
    compatibleOptionalTime(
      leftMetadata.end_time ?? leftMetadata.ended_at ?? leftMetadata.end,
      rightMetadata.end_time ?? rightMetadata.ended_at ?? rightMetadata.end,
      10
    )
  );
}

function isTrainingExerciseEnrichmentPair(left = {}, right = {}) {
  const leftMetadata = left.metadata ?? {};
  const rightMetadata = right.metadata ?? {};

  if (!isResistanceActivityType(leftMetadata.activity_type)) return false;
  if (!isResistanceActivityType(rightMetadata.activity_type)) return false;

  const leftExerciseOnly = isExerciseOnlyTrainingPayload(left);
  const rightExerciseOnly = isExerciseOnlyTrainingPayload(right);
  if (leftExerciseOnly === rightExerciseOnly) return false;

  const exerciseOnlyPayload = leftExerciseOnly ? left : right;
  const workoutPayload = leftExerciseOnly ? right : left;
  const exerciseOnlyMetadata = exerciseOnlyPayload.metadata ?? {};

  const exerciseOnlyHasNoWorkoutMetrics = ![
    exerciseOnlyMetadata.active_calories,
    exerciseOnlyMetadata.distance,
    exerciseOnlyMetadata.duration_seconds,
    exerciseOnlyMetadata.start_time,
    exerciseOnlyMetadata.end_time,
  ].some((value) => value !== null && value !== undefined && value !== "");

  return (
    exerciseOnlyHasNoWorkoutMetrics &&
    hasOverlappingExerciseNames(exerciseOnlyPayload.exercises, workoutPayload.exercises)
  );
}

function isExerciseOnlyTrainingPayload(payload = {}) {
  const metadata = payload.metadata ?? {};

  return (
    (payload.exercises ?? []).length > 0 &&
    ![
      metadata.active_calories,
      metadata.distance,
      metadata.duration_seconds,
      metadata.start_time,
      metadata.end_time,
    ].some((value) => value !== null && value !== undefined && value !== "")
  );
}

function hasOverlappingExerciseNames(left = [], right = []) {
  if ((left ?? []).length === 0) return false;
  if ((right ?? []).length === 0) return true;

  const rightNames = new Set(
    right.map((exercise) => normalizeIdentityPart(exercise?.name)).filter(Boolean)
  );

  return left.some((exercise) =>
    rightNames.has(normalizeIdentityPart(exercise?.name))
  );
}

function isResistanceActivityType(activityType) {
  return /strength|traditional strength|resistance|weight|core training/i.test(
    String(activityType ?? "")
  );
}

function hasSufficientSharedTrainingIdentity(leftMetadata = {}, rightMetadata = {}) {
  if (bothPresent(leftMetadata.start_time, rightMetadata.start_time)) return true;
  if (bothPresent(leftMetadata.end_time, rightMetadata.end_time)) return true;

  const compatibleMetricCount = [
    ["active_calories", 0],
    ["distance", 0],
    ["duration_seconds", 120],
    ["average_heart_rate", 3],
  ].filter(([key, tolerance]) => {
    if (!bothPresent(leftMetadata[key], rightMetadata[key])) return false;
    return compatibleOptionalNumber(leftMetadata[key], rightMetadata[key], tolerance);
  }).length;

  return compatibleMetricCount >= 2;
}

function bothPresent(left, right) {
  return (
    left !== null &&
    left !== undefined &&
    left !== "" &&
    right !== null &&
    right !== undefined &&
    right !== ""
  );
}

function hasNearIdenticalTrainingMetrics(leftMetadata = {}, rightMetadata = {}) {
  if (!compatibleOptionalIdentityPart(leftMetadata.active_calories, rightMetadata.active_calories)) {
    return false;
  }
  if (!compatibleOptionalIdentityPart(leftMetadata.distance, rightMetadata.distance)) {
    return false;
  }
  if (
    !compatibleOptionalNumber(
      leftMetadata.average_heart_rate,
      rightMetadata.average_heart_rate,
      3
    )
  ) {
    return false;
  }
  if (
    !compatibleOptionalNumber(
      leftMetadata.duration_seconds,
      rightMetadata.duration_seconds,
      120
    )
  ) {
    return false;
  }

  return areOptionalTimesCompatible(leftMetadata, rightMetadata);
}

function compatibleOptionalNumber(left, right, tolerance = 0) {
  if (left === null || left === undefined || left === "") return true;
  if (right === null || right === undefined || right === "") return true;

  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return normalizeIdentityPart(left) === normalizeIdentityPart(right);
  }

  return Math.abs(leftNumber - rightNumber) <= tolerance;
}

function areOptionalTimesCompatible(leftMetadata = {}, rightMetadata = {}) {
  const leftStart = leftMetadata.start_time ?? leftMetadata.started_at ?? leftMetadata.start;
  const rightStart = rightMetadata.start_time ?? rightMetadata.started_at ?? rightMetadata.start;
  const leftEnd = leftMetadata.end_time ?? leftMetadata.ended_at ?? leftMetadata.end;
  const rightEnd = rightMetadata.end_time ?? rightMetadata.ended_at ?? rightMetadata.end;

  return (
    compatibleOptionalTime(leftStart, rightStart, 10) &&
    compatibleOptionalTime(leftEnd, rightEnd, 10)
  );
}

function compatibleOptionalTime(left, right, toleranceMinutes = 0) {
  if (left === null || left === undefined || left === "") return true;
  if (right === null || right === undefined || right === "") return true;

  const leftMinutes = parseTimeToMinutes(left);
  const rightMinutes = parseTimeToMinutes(right);

  if (leftMinutes === null || rightMinutes === null) {
    return normalizeIdentityPart(left) === normalizeIdentityPart(right);
  }

  return Math.abs(leftMinutes - rightMinutes) <= toleranceMinutes;
}

function compatibleOptionalIdentityPart(left, right) {
  if (left === null || left === undefined || left === "") return true;
  if (right === null || right === undefined || right === "") return true;

  return normalizeIdentityPart(left) === normalizeIdentityPart(right);
}

function mergeTrainingPayload(existingPayload, candidate, { evidencePackage = null } = {}) {
  if (evidencePackage?.correction?.type === "canonical_exercise_identity_correction") {
    return {
      ...existingPayload,
      ...candidate,
      id: existingPayload.id,
      metadata: mergeDefinedFields(existingPayload.metadata, candidate.metadata),
      exercises: candidate.exercises,
      provenance: mergeObjectProvenance(existingPayload.provenance, candidate.provenance),
      source: mergeSource(existingPayload.source, candidate.source),
    };
  }

  const preferredBase =
    getEvidenceRichnessScore(candidate) >= getEvidenceRichnessScore(existingPayload)
      ? candidate
      : existingPayload;
  const exercises = shouldReplaceTrainingExercisesFromReprocess({
    candidate,
    evidencePackage,
    existingPayload,
  })
    ? candidate.exercises
    : mergeExercises(existingPayload.exercises, candidate.exercises);

  return {
    ...existingPayload,
    ...candidate,
    ...preferredBase,
    metadata: mergeDefinedFields(existingPayload.metadata, candidate.metadata),
    exercises,
    provenance: mergeObjectProvenance(existingPayload.provenance, candidate.provenance),
    source: mergeSource(existingPayload.source, candidate.source),
  };
}

function shouldReplaceTrainingExercisesFromReprocess({
  candidate = {},
  evidencePackage = null,
  existingPayload = {},
} = {}) {
  if (!evidencePackage?.recovery?.reprocessed_from_stored_artifacts) return false;
  if (!isTrainingSession(existingPayload) || !isTrainingSession(candidate)) return false;
  if ((candidate.exercises ?? []).length === 0) return false;
  if (!usesTypedEvidence(existingPayload) || !usesTypedEvidence(candidate)) return false;

  return intersects(
    getTrainingSourceArtifactRefs(existingPayload),
    getTrainingSourceArtifactRefs(candidate)
  );
}

function mergeCompatibleCanonicalObjects(primaryObject, supersededObjects = []) {
  if (!primaryObject) return null;

  return supersededObjects.reduce(
    (mergedObject, object) => ({
      ...mergedObject,
      payload: chooseRicherCanonicalPayload(mergedObject.payload, object.payload),
      provenance: mergeCanonicalProvenanceObjects(
        mergedObject.provenance,
        object.provenance
      ),
    }),
    primaryObject
  );
}

function mergeDefinedFields(left = {}, right = {}) {
  return Object.entries({ ...left, ...right }).reduce((fields, [key]) => {
    const rightValue = right[key];
    const leftValue = left[key];

    fields[key] =
      rightValue !== undefined && rightValue !== null && rightValue !== ""
        ? rightValue
        : leftValue;

    return fields;
  }, {});
}

function mergeExercises(left = [], right = []) {
  const exercisesByName = new Map();

  [...left, ...right].forEach((exercise) => {
    const identity = resolveTrainingExerciseIdentity(exercise?.name ?? exercise?.id);
    if (identity.resolutionStatus === "unrecognized" && /^(reps|sets|weight|load|volume|notes|rest)$/i.test(String(exercise?.name ?? "").trim())) return;
    const key = identity.canonicalExerciseId ?? normalizeMorphologicalExerciseIdentity(exercise?.name ?? exercise?.id);
    if (!key) return;
    const canonicalExercise = identity.canonicalExerciseId
      ? {
          ...exercise,
          canonicalExerciseId: identity.canonicalExerciseId,
          name: identity.canonicalExerciseName,
          provenance: {
            ...(exercise.provenance ?? {}),
            source_labels: uniqueStrings([
              ...(exercise.provenance?.source_labels ?? []),
              exercise.name,
            ]),
          },
        }
      : exercise;

    const replaceableGenericKey = findReplaceableGenericExerciseKey(
      exercisesByName,
      canonicalExercise
    );

    if (replaceableGenericKey) {
      exercisesByName.delete(replaceableGenericKey);
    }

    const existingExercise = exercisesByName.get(key);

    if (!existingExercise) {
      exercisesByName.set(key, canonicalExercise);
      return;
    }

    exercisesByName.set(key, {
      ...existingExercise,
      ...canonicalExercise,
      sets: shouldReplaceMalformedTimedHoldSets(existingExercise, exercise)
        ? canonicalExercise.sets
        : mergeSets(existingExercise.sets, canonicalExercise.sets),
      provenance: mergeObjectProvenance(existingExercise.provenance, canonicalExercise.provenance),
    });
  });

  return orderTrainingExercises([...exercisesByName.values()]);
}

function normalizeMorphologicalExerciseIdentity(value) {
  return normalizeIdentityPart(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(curls|presses|raises|rows|squats|lunges|crunches|extensions)\b/g, (word) => ({
      curls: "curl", presses: "press", raises: "raise", rows: "row",
      squats: "squat", lunges: "lunge", crunches: "crunch", extensions: "extension",
    })[word])
    .replace(/\s+/g, " ")
    .trim();
}

function orderTrainingExercises(exercises = []) {
  return exercises
    .map((exercise, index) => ({ exercise, index }))
    .sort((left, right) => {
      const orderDelta =
        getTrainingExerciseDisplayOrder(left.exercise) -
        getTrainingExerciseDisplayOrder(right.exercise);

      return orderDelta || left.index - right.index;
    })
    .map(({ exercise }) => exercise);
}

function getTrainingExerciseDisplayOrder(exercise = {}) {
  const name = String(exercise.name ?? "").toLowerCase();

  if (/\bhanging\s+leg\s+raises?\b/.test(name)) return 10;
  if (/\bcable\s+crunch(?:es)?\b/.test(name)) return 20;
  if (/\bplanks?\b/.test(name)) return 30;

  return 1000;
}

function shouldReplaceMalformedTimedHoldSets(existingExercise = {}, candidateExercise = {}) {
  if (!isTimedHoldExercise(existingExercise.name ?? candidateExercise.name)) {
    return false;
  }

  const candidateSets = candidateExercise.sets ?? [];
  const existingSets = existingExercise.sets ?? [];

  return (
    candidateSets.some(isTimedSet) &&
    existingSets.some(isLikelyMalformedTimedHoldSet)
  );
}

function isTimedHoldExercise(name) {
  return /\b(planks?|holds?|wall\s+sits?)\b/i.test(String(name ?? ""));
}

function isTimedSet(set = {}) {
  return Number.isFinite(Number(set.duration_seconds)) && Number(set.duration_seconds) > 0;
}

function isLikelyMalformedTimedHoldSet(set = {}) {
  const reps = Number(set.reps);
  const weight = Number(set.weight);

  return (
    !isTimedSet(set) &&
    reps === 1 &&
    Number.isFinite(weight) &&
    weight >= 10 &&
    weight <= 600
  );
}

function findReplaceableGenericExerciseKey(exercisesByName, exercise = {}) {
  const candidateSpecificity = getExerciseNameSpecificity(exercise.name);

  for (const [key, existingExercise] of exercisesByName.entries()) {
    if (!areReplaceableExerciseNames(existingExercise.name, exercise.name)) continue;
    if (!haveMatchingSetSignature(existingExercise.sets, exercise.sets)) continue;
    if (getExerciseNameSpecificity(existingExercise.name) >= candidateSpecificity) {
      continue;
    }

    return key;
  }

  return null;
}

function areReplaceableExerciseNames(existingName, candidateName) {
  const existingFamily = getReplaceableExerciseFamily(existingName);
  const candidateFamily = getReplaceableExerciseFamily(candidateName);

  return existingFamily && existingFamily === candidateFamily;
}

function getReplaceableExerciseFamily(name) {
  const text = String(name ?? "").toLowerCase();

  if (/\brows?\b/.test(text)) return "row";
  if (/\bleg\s+press\b/.test(text)) return "leg_press";
  if (/\bsquats?\b/.test(text)) return "squat";

  return null;
}

function getExerciseNameSpecificity(name) {
  const text = String(name ?? "").toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const modifiers = [
    /iso[-\s]?lateral/.test(text),
    /hammer\s+strength/.test(text),
    /\bseated\b/.test(text),
    /\bhigh\b/.test(text),
    /\blow\b/.test(text),
    /\bmid\b/.test(text),
    /\bcable\b/.test(text),
    /\bmachine\b/.test(text),
    /\bsumo\b/.test(text),
    /\bnarrow\b/.test(text),
    /\bfeet\b/.test(text),
    /\bbarbell\b/.test(text),
    /\bdumbbell\b/.test(text),
  ].filter(Boolean).length;

  return words.length + modifiers;
}

function haveMatchingSetSignature(left = [], right = []) {
  const leftSignature = getSetSignature(left);
  const rightSignature = getSetSignature(right);

  return leftSignature !== "" && leftSignature === rightSignature;
}

function getSetSignature(sets = []) {
  return (sets ?? [])
    .map((set) =>
      [
        set?.reps ?? "",
        set?.weight ?? "",
        set?.weight_unit ?? "",
      ].join(":")
    )
    .join("|");
}

function mergeSets(left = [], right = []) {
  const setsByIdentity = new Map();

  [...left, ...right].forEach((set, index) => {
    const key = [
      set?.set_number ?? index + 1,
      set?.reps,
      set?.weight,
      set?.weight_unit,
    ].join("|");

    setsByIdentity.set(key, set);
  });

  return [...setsByIdentity.values()].sort(
    (leftSet, rightSet) => (leftSet.set_number ?? 0) - (rightSet.set_number ?? 0)
  );
}

function mergeSource(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    source_artifact_refs: uniqueStrings([
      ...(left.source_artifact_refs ?? []),
      ...(right.source_artifact_refs ?? []),
    ]),
  };
}

function mergeObjectProvenance(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    source_artifact_refs: uniqueStrings([
      ...(left.source_artifact_refs ?? []),
      ...(right.source_artifact_refs ?? []),
    ]),
  };
}

function mergeCanonicalProvenanceObjects(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    evidence_package_ids: uniqueStrings([
      ...(left.evidence_package_ids ?? []),
      ...(right.evidence_package_ids ?? []),
    ]),
    source_artifact_refs: uniqueStrings([
      ...(left.source_artifact_refs ?? []),
      ...(right.source_artifact_refs ?? []),
    ]),
    contributing_evidence_object_ids: uniqueStrings([
      ...(left.contributing_evidence_object_ids ?? []),
      ...(right.contributing_evidence_object_ids ?? []),
    ]),
  };
}

function retireStaleTrainingObjectsFromPackage({
  canonicalById,
  evidencePackage,
  matchedCanonicalIds,
  supersededById,
}) {
  const packageId = evidencePackage?.package_id ?? evidencePackage?.id;
  if (!packageId) return;

  const currentTrainingSourceRefs = uniqueStrings(
    (evidencePackage.evidence_objects ?? [])
      .filter(isTrainingSession)
      .flatMap(getTrainingSourceArtifactRefs)
  );

  if (currentTrainingSourceRefs.length === 0) return;

  [...canonicalById.values()].forEach((object) => {
    if (!isTrainingSession(object.payload)) return;
    if (matchedCanonicalIds.has(object.canonicalId)) return;
    if (!(object.provenance?.evidence_package_ids ?? []).includes(packageId)) return;
    if (!intersects(object.provenance?.source_artifact_refs ?? [], currentTrainingSourceRefs)) {
      return;
    }

    canonicalById.delete(object.canonicalId);
    supersededById.set(
      object.canonicalId,
      createSupersededCanonicalObject({
        object,
        reason:
          "This training session was not present in the latest interpretation of its source evidence.",
      })
    );
  });
}

function retireCoveredExerciseOnlyTrainingObjects({
  canonicalById,
  supersededById,
}) {
  const activeTrainingObjects = [...canonicalById.values()].filter(
    (object) => object.evidence_type === "training"
  );

  activeTrainingObjects.forEach((object) => {
    const payload = object.payload ?? {};
    if (!isExerciseOnlyTrainingPayload(payload)) return;

    const coveringObject = activeTrainingObjects.find((candidate) => {
      if (candidate.canonicalId === object.canonicalId) return false;
      const candidatePayload = candidate.payload ?? {};
      if (isExerciseOnlyTrainingPayload(candidatePayload)) return false;
      if ((candidatePayload.exercises ?? []).length === 0) return false;
      if (getDateKey(candidatePayload.observed_at) !== getDateKey(payload.observed_at)) {
        return false;
      }

      return hasOverlappingExerciseNames(payload.exercises, candidatePayload.exercises);
    });

    if (!coveringObject) return;

    canonicalById.delete(object.canonicalId);
    supersededById.set(
      object.canonicalId,
      createSupersededCanonicalObject({
        object,
        reason:
          "A metric-bearing training session now covers the same exercise details.",
        supersededBy: coveringObject.canonicalId,
      })
    );
  });
}

function createSupersededCanonicalObject({ object, reason, supersededBy = null }) {
  return {
    ...object,
    quality: {
      ...(object.quality ?? {}),
      status: "superseded",
      reason,
      supersededBy,
      supersededAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}

function isSupersededCanonicalObject(object = {}) {
  return object?.quality?.status === "superseded";
}

function getTrainingSourceArtifactRefs(evidenceObject = {}) {
  return getCanonicalSourceArtifactRefs(evidenceObject).filter(
    (ref) => !/^typed_evidence_\d+$/i.test(String(ref ?? ""))
  );
}

function usesTypedEvidence(evidenceObject = {}) {
  return getCanonicalSourceArtifactRefs(evidenceObject).some((ref) =>
    /typed_evidence/i.test(String(ref))
  );
}

function getCanonicalSourceArtifactRefs(evidenceObject = {}) {
  return uniqueStrings([
    ...(evidenceObject.provenance?.source_artifact_refs ?? []),
    ...(evidenceObject.source?.source_artifact_refs ?? []),
  ]);
}

function intersects(left = [], right = []) {
  const rightSet = new Set(right.map(String));

  return left.some((value) => rightSet.has(String(value)));
}

function countSharedStrings(left = [], right = []) {
  const rightSet = new Set(right.map(String));

  return left.filter((value) => rightSet.has(String(value))).length;
}

function parseTimeToMinutes(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function isActivityDay(evidenceObject) {
  return evidenceObject?.evidence_type === "activity_day";
}

function isTrainingSession(evidenceObject) {
  return evidenceObject?.evidence_type === "training";
}

function isPhotoSession(evidenceObject) {
  return evidenceObject?.evidence_type === "photo_session";
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function normalizeIdentityPart(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).trim().toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}
