import {
  createTrainingSessionEvidenceObject,
} from "../models/trainingSessionEvidence";

export const APPLE_WORKOUT_EVIDENCE_CATEGORIES = Object.freeze({
  STRENGTH: "strength",
  CARDIO: "cardio",
  ACTIVITY: "activity",
});

export const APPLE_WORKOUT_CANONICAL_OWNER_TYPES = Object.freeze({
  TRAINING_SESSION: "training_session",
  CARDIO_WORKOUT: "cardio_workout",
  ACTIVITY_RECORD: "activity_record",
});

export const APPLE_HEALTH_MATCH_STATES = Object.freeze({
  STRONG: "strong_match",
  MULTIPLE: "multiple_matches",
  NONE: "no_match",
});

export function normalizeAppleWorkoutEvidenceObjects({
  batchId,
  canonicalObjects = [],
  evidenceObjects = [],
} = {}) {
  const consumed = listConsumedSourceWorkoutIds(canonicalObjects);
  return evidenceObjects
    .filter((object) => object?.evidence_type === "training")
    .map((object, index) => normalizeAppleWorkoutObject(object, { batchId, index, consumed }))
    .filter(Boolean);
}

export function createProductionAppleHealthReconciliation({
  batchId = null,
  canonicalObjects = [],
  evidenceObjects = [],
  workoutDate,
} = {}) {
  const normalizedEvidence = normalizeAppleWorkoutEvidenceObjects({
    batchId,
    canonicalObjects,
    evidenceObjects,
  });
  const effectiveBatchId = batchId ?? normalizedEvidence[0]?.batchId ?? null;
  const strengthCandidates = normalizedEvidence.filter((item) =>
    item.batchId === effectiveBatchId &&
    item.sessionDate === workoutDate &&
    item.category === APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH &&
    item.consumption.state === "unlinked"
  );
  const matchState = strengthCandidates.length === 0
    ? APPLE_HEALTH_MATCH_STATES.NONE
    : strengthCandidates.length === 1
      ? APPLE_HEALTH_MATCH_STATES.STRONG
      : APPLE_HEALTH_MATCH_STATES.MULTIPLE;

  return {
    batchId: effectiveBatchId,
    normalizedEvidence,
    matchState,
    strengthCandidateIds: strengthCandidates.map((item) => item.sourceWorkoutId),
    selectedStrengthSourceId:
      matchState === APPLE_HEALTH_MATCH_STATES.STRONG
        ? strengthCandidates[0].sourceWorkoutId
        : null,
    continueWithoutStrength: false,
    additionalEvidenceActions: normalizedEvidence
      .filter((item) =>
        item.batchId === effectiveBatchId &&
        item.sessionDate === workoutDate &&
        item.category !== APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH &&
        item.consumption.state === "unlinked"
      )
      .map((item) => ({
        sourceWorkoutId: item.sourceWorkoutId,
        included: item.category === APPLE_WORKOUT_EVIDENCE_CATEGORIES.CARDIO,
        canonicalOwnerType: item.category === APPLE_WORKOUT_EVIDENCE_CATEGORIES.CARDIO
          ? APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
          : APPLE_WORKOUT_CANONICAL_OWNER_TYPES.ACTIVITY_RECORD,
      })),
    proposedCanonicalRecords: [],
    finalized: false,
  };
}

export function buildTrainingLoggerEvidencePackage({
  canonicalObjects = [],
  draft,
  sourcePackage = null,
  userId,
} = {}) {
  assertProductionDraft(draft);
  const reconciliation = draft.reconciliation ?? {};
  const selectedIds = [
    reconciliation.selectedStrengthSourceId,
    ...(reconciliation.additionalEvidenceActions ?? [])
      .filter((item) => item.included)
      .map((item) => item.sourceWorkoutId),
  ].filter(Boolean);
  const consumed = listConsumedSourceWorkoutIds(canonicalObjects);
  const newlyConsumed = selectedIds.find((sourceWorkoutId) => consumed.has(sourceWorkoutId));
  if (newlyConsumed) {
    const error = new Error("An Apple workout selected for this log has already been consumed.");
    error.code = "APPLE_WORKOUT_ALREADY_CONSUMED";
    error.sourceWorkoutId = newlyConsumed;
    throw error;
  }

  const normalizedById = new Map(
    (reconciliation.normalizedEvidence ?? []).map((item) => [item.sourceWorkoutId, item])
  );
  const rawObjects = sourcePackage?.evidence_objects ?? [];
  const rawBySourceId = new Map(rawObjects.map((object, index) => [
    getSourceWorkoutId(object, index),
    object,
  ]));
  const matchedStrength = normalizedById.get(reconciliation.selectedStrengthSourceId) ?? null;
  const draftArtifactId = `training_logger_draft_${cleanId(draft.draftId)}`;
  const detailed = createDetailedTrainingSession({ draft, draftArtifactId, matchedStrength });
  const additional = (reconciliation.additionalEvidenceActions ?? [])
    .filter((action) => action.included)
    .map((action) => {
      const normalized = normalizedById.get(action.sourceWorkoutId);
      const raw = rawBySourceId.get(action.sourceWorkoutId);
      if (!normalized || !raw) return null;
      return attachDurableSourceLinkage(raw, normalized, action.canonicalOwnerType);
    })
    .filter(Boolean);
  const capturedAt = new Date().toISOString();
  const packageId = `training_logger_submission_${cleanId(draft.draftId)}`;
  const sourceArtifacts = [
    ...(sourcePackage?.provenance?.source_artifacts ?? []),
    {
      id: draftArtifactId,
      kind: "structured_training_logger_draft",
      file_name: "Training Logger",
      mime_type: "application/vnd.physiqueos.training-draft+json",
      uploaded_at: capturedAt,
    },
  ];
  const evidenceObjects = [detailed, ...additional];

  return {
    package_id: packageId,
    schema_version: "physiqueos-evidence-v1",
    source_modality: sourcePackage ? "mixed" : "manual",
    userId,
    detected_source_application: matchedStrength ? "Apple Fitness" : "Training Logger",
    detected_source_confidence: "high",
    detected_evidence_type: evidenceObjects.length > 1 ? "mixed" : "training",
    detected_evidence_objects: [{
      evidence_type: "training",
      canonical_name: "TrainingSession",
      count: evidenceObjects.length,
    }],
    detected_evidence_type_confidence: "high",
    captured_at: capturedAt,
    observed_date: draft.workoutDate,
    interpreter: {
      name: "PhysiqueOS Training Logger",
      version: "training-logger-web-v1",
      provider: "internal",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "complete",
      limitations: matchedStrength ? [] : ["No Apple workout was linked; exact session timing remains unknown."],
    },
    evidence_objects: evidenceObjects,
    provenance: {
      evidence_date: draft.workoutDate,
      submission_id: packageId,
      source_artifacts: dedupeById(sourceArtifacts),
    },
    review_metadata: {
      origin: "training_logger",
      presentationMode: "training_logger_summary",
      draftId: draft.draftId,
      loggerMode: draft.mode,
      appleEvidencePackageId: sourcePackage?.package_id ?? null,
    },
    diagnostics: {
      stages: [{
        id: `${packageId}_proposal`,
        label: "Training Logger canonical proposal",
        evidenceObjectCount: evidenceObjects.length,
        sourceArtifactRefs: sourceArtifacts.map((artifact) => artifact.id),
      }],
      warnings: [],
    },
  };
}

export function listConsumedSourceWorkoutIds(canonicalObjects = []) {
  const values = new Set();
  canonicalObjects.forEach((record, index) => {
    const object = record?.payload ?? record;
    [
      object?.reconciliation?.source_workout_id,
      object?.reconciliation?.sourceWorkoutId,
      object?.source?.source_workout_id,
      object?.source?.workout_id,
      object?.metadata?.source_workout_id,
      object?.provenance?.source_workout_id,
    ].filter(Boolean).forEach((value) => values.add(String(value)));
    if (
      object?.evidence_type === "training" &&
      /apple/i.test(String(object?.source?.application ?? object?.source?.integration ?? ""))
    ) {
      const derived = getSourceWorkoutId(object, index);
      if (derived) values.add(derived);
    }
  });
  return values;
}

function createDetailedTrainingSession({ draft, draftArtifactId, matchedStrength }) {
  const appleRefs = matchedStrength?.sourceArtifactRefs ?? [];
  const sourceArtifactRefs = [...new Set([draftArtifactId, ...appleRefs])];
  const liveTiming = !matchedStrength && draft.mode === "live" && draft.startedAt
    ? {
        start_time: draft.startedAt,
        end_time: draft.finishedAt ?? null,
        duration_seconds: getDurationSeconds(draft.startedAt, draft.finishedAt),
      }
    : {};
  const metadata = {
    activity_type: "Traditional Strength Training",
    ...liveTiming,
    ...(matchedStrength ? {
      active_calories: matchedStrength.activeCalories,
      duration_seconds: matchedStrength.durationSeconds,
      start_time: matchedStrength.startTime,
      end_time: matchedStrength.endTime,
    } : {}),
    logger_mode: draft.mode,
    logger_origin: "training_logger",
    source_workout_id: matchedStrength?.sourceWorkoutId ?? null,
  };
  const object = createTrainingSessionEvidenceObject({
    capturedAt: new Date().toISOString(),
    confidence: { extraction: "high", interpretation: "high" },
    exerciseRelationshipGroups: draft.exerciseRelationshipGroups,
    exercises: draft.exercises.map((exercise) => ({
      id: exercise.id,
      canonicalExerciseId: exercise.canonicalExerciseId,
      name: exercise.name,
      body_region: exercise.bodyRegion,
      equipment: exercise.equipment,
      ...(exercise.resolutionStatus
        ? { resolutionStatus: exercise.resolutionStatus }
        : {}),
      ...(exercise.provisionalExercise
        ? { provisionalExercise: structuredClone(exercise.provisionalExercise) }
        : {}),
      ...(exercise.executionVariant ? { executionVariant: exercise.executionVariant } : {}),
      sets: exercise.sets.map((set, index) => ({
        id: set.id,
        set_number: index + 1,
        reps: Number(set.reps),
        weight: Number(set.load),
        weight_unit: set.unit ?? "lb",
        provenance_ref: draftArtifactId,
      })),
      provenance_ref: draftArtifactId,
    })),
    id: `training_logger_session_${cleanId(draft.draftId)}`,
    metadata,
    observedAt: draft.workoutDate,
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
    quality: {
      status: "complete",
      limitations: matchedStrength ? [] : ["Exact start time, end time, and duration are unknown."],
    },
    source: {
      modality: matchedStrength ? "mixed" : "manual",
      application: matchedStrength ? "Apple Fitness + Training Logger" : "Training Logger",
      integration: matchedStrength ? "apple_health_screenshot_interpretation" : null,
      source_artifact_refs: sourceArtifactRefs,
    },
  });
  return {
    ...object,
    reconciliation: matchedStrength ? {
      source_workout_id: matchedStrength.sourceWorkoutId,
      sourceEvidenceId: matchedStrength.sourceEvidenceId,
      disposition: "linked_to_detailed_training_session",
    } : {
      disposition: "detailed_training_session_without_apple_link",
    },
  };
}

function attachDurableSourceLinkage(raw, normalized, canonicalOwnerType) {
  return {
    ...structuredClone(raw),
    id: raw.id ?? `apple_workout_${cleanId(normalized.sourceWorkoutId)}`,
    source: {
      ...(raw.source ?? {}),
      source_workout_id: normalized.sourceWorkoutId,
    },
    metadata: {
      ...(raw.metadata ?? {}),
      source_workout_id: normalized.sourceWorkoutId,
    },
    provenance: {
      ...(raw.provenance ?? {}),
      source_workout_id: normalized.sourceWorkoutId,
    },
    reconciliation: {
      ...(raw.reconciliation ?? {}),
      source_workout_id: normalized.sourceWorkoutId,
      canonical_owner_type: canonicalOwnerType,
      disposition: canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
        ? "separate_cardio_training_session"
        : "separate_activity_workout",
    },
  };
}

function normalizeAppleWorkoutObject(object, { batchId, consumed, index }) {
  const workoutType = String(object.metadata?.activity_type ?? object.title ?? "Apple Workout");
  const sourceWorkoutId = getSourceWorkoutId(object, index);
  const sessionDate = String(object.observed_at ?? "").slice(0, 10);
  if (!sessionDate || !sourceWorkoutId) return null;
  const sourceArtifactRefs = [...new Set([
    ...(object.provenance?.source_artifact_refs ?? []),
    ...(object.source?.source_artifact_refs ?? []),
  ].map(String))];
  const category = classifyWorkout(workoutType);
  return {
    sourceWorkoutId,
    sourceEvidenceId: object.id ?? `${sourceWorkoutId}_evidence`,
    sourceSystem: "apple_health",
    ingestionAdapter: "apple_health_screenshot_interpretation",
    batchId: batchId ?? "apple_health_batch",
    sessionDate,
    startTime: object.metadata?.start_time ?? object.metadata?.started_at ?? null,
    endTime: object.metadata?.end_time ?? object.metadata?.ended_at ?? null,
    workoutType,
    category,
    durationSeconds: finite(object.metadata?.duration_seconds),
    durationMinutes: finite(object.metadata?.duration_seconds) == null
      ? null
      : Math.round(Number(object.metadata.duration_seconds) / 60),
    activeCalories: finite(object.metadata?.active_calories),
    sourceArtifactRefs,
    consumption: consumed.has(sourceWorkoutId)
      ? { state: "consumed" }
      : { state: "unlinked" },
  };
}

function getSourceWorkoutId(object, index) {
  const explicit = [
    object?.reconciliation?.source_workout_id,
    object?.reconciliation?.source_workout_identifier,
    object?.source?.source_workout_id,
    object?.source?.workout_id,
    object?.metadata?.source_workout_id,
    object?.metadata?.workout_id,
    object?.metadata?.apple_health_uuid,
    object?.provenance?.source_workout_id,
  ].find(Boolean);
  if (explicit) return String(explicit);
  const metadata = object?.metadata ?? {};
  const discriminators = [
    metadata.start_time ?? metadata.started_at,
    metadata.end_time ?? metadata.ended_at,
    finite(metadata.duration_seconds),
    finite(metadata.active_calories),
    finite(metadata.distance),
    finite(metadata.average_heart_rate),
  ];
  if (discriminators.filter((value) =>
    value !== null && value !== undefined && value !== ""
  ).length >= 2) {
    return `apple_workout_${stableHash([
      String(object?.observed_at ?? "").slice(0, 10),
      String(metadata.activity_type ?? object?.title ?? "apple workout").trim().toLowerCase(),
      ...discriminators,
    ].join("|"))}`;
  }
  const refs = [...new Set([
    ...(object?.provenance?.source_artifact_refs ?? []),
    ...(object?.source?.source_artifact_refs ?? []),
  ].map(String))].sort();
  if (refs.length === 0 && !object?.id) return null;
  return `apple_screenshot_workout_${stableHash([
    ...refs,
    object?.id ?? index,
    object?.observed_at,
    object?.metadata?.activity_type,
    object?.metadata?.start_time,
  ].join("|"))}`;
}

function classifyWorkout(value) {
  const text = String(value ?? "").toLowerCase();
  if (/strength|weight training|resistance/.test(text)) {
    return APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH;
  }
  if (/walk|walking/.test(text)) return APPLE_WORKOUT_EVIDENCE_CATEGORIES.ACTIVITY;
  return APPLE_WORKOUT_EVIDENCE_CATEGORIES.CARDIO;
}

function assertProductionDraft(draft) {
  if (!draft?.draftId || !/^\d{4}-\d{2}-\d{2}$/.test(String(draft.workoutDate))) {
    throw new Error("A valid Training Logger draft and workout date are required.");
  }
  if (!["live", "retrospective"].includes(draft.mode)) {
    throw new Error("A valid Training Logger mode is required.");
  }
  if (!Array.isArray(draft.exercises) || draft.exercises.length === 0) {
    throw new Error("At least one exercise is required.");
  }
  if (draft.exercises.some((exercise) =>
    !Array.isArray(exercise.sets) ||
    exercise.sets.length === 0 ||
    exercise.sets.some((set) =>
      !Number.isFinite(Number(set.reps)) ||
      Number(set.reps) <= 0 ||
      !Number.isFinite(Number(set.load)) ||
      Number(set.load) < 0
    )
  )) {
    throw new Error("Every exercise needs at least one performed set with valid reps and load.");
  }
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cleanId(value) {
  return String(value ?? "draft").replace(/[^a-z0-9_-]+/gi, "_");
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getDurationSeconds(startedAt, finishedAt) {
  const start = Date.parse(String(startedAt ?? ""));
  const end = Date.parse(String(finishedAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function dedupeById(items) {
  return [...new Map(items.filter(Boolean).map((item) => [item.id, item])).values()];
}
