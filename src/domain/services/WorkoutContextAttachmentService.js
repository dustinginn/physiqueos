import { getCanonicalTrainingExerciseSlug } from "../models/trainingExerciseIdentity";

export function attachVoiceEvidenceToActiveWorkout({
  activeWorkoutContext = null,
  interpretation,
  transcript = "",
  attachedAt = new Date().toISOString(),
} = {}) {
  if (!activeWorkoutContext) {
    return {
      evidenceObjects: interpretation?.evidenceObjects ?? [],
      diagnostics: createStandaloneDiagnostics(interpretation),
    };
  }

  const targetValidation = validateTarget(activeWorkoutContext, transcript);
  if (targetValidation.conflict) {
    return {
      evidenceObjects: [],
      diagnostics: createConflictDiagnostics(activeWorkoutContext, targetValidation),
      conflict: {
        code: targetValidation.code,
        message: targetValidation.message,
      },
    };
  }

  const voiceTrainingSession = (interpretation?.evidenceObjects ?? []).find(
    (object) => object.evidence_type === "training"
  );
  if (!voiceTrainingSession) {
    return {
      evidenceObjects: interpretation?.evidenceObjects ?? [],
      diagnostics: createNoEnrichmentDiagnostics(activeWorkoutContext),
    };
  }

  const merge = mergeTrainingExercises({
    existing: activeWorkoutContext.exercises ?? [],
    incoming: voiceTrainingSession.exercises ?? [],
    correction: /\b(?:actually|correction|not\s+\d|was\s+\d.+not|forgot)\b/i.test(transcript),
  });
  merge.exercises = applyExplicitSetCorrection(merge.exercises, transcript);
  const appleRefs = getArtifactRefs(activeWorkoutContext);
  const voiceRefs = getArtifactRefs(voiceTrainingSession);
  const sourceArtifactRefs = unique([...appleRefs, ...voiceRefs]);
  const updatedTarget = {
    ...activeWorkoutContext,
    source: {
      ...activeWorkoutContext.source,
      source_artifact_refs: sourceArtifactRefs,
    },
    metadata: mergeMetadata(activeWorkoutContext.metadata, voiceTrainingSession.metadata),
    exercises: merge.exercises,
    provenance: {
      ...(activeWorkoutContext.provenance ?? {}),
      source_artifact_refs: sourceArtifactRefs,
      voice_attachments: [
        ...(activeWorkoutContext.provenance?.voice_attachments ?? []),
        {
          attached_at: attachedAt,
          original_transcript: interpretation?.transcript ?? transcript,
          resolved_transcript: interpretation?.resolvedTranscript ?? transcript,
          source_artifact_refs: voiceRefs,
          rejected_values:
            interpretation?.conversationalResolution?.rejected_values ?? [],
        },
      ],
      section_sources: {
        ...(activeWorkoutContext.provenance?.section_sources ?? {}),
        exercises: { modality: "voice", source_artifact_refs: voiceRefs },
      },
    },
  };

  return {
    evidenceObjects: [
      ...(interpretation?.evidenceObjects ?? []).filter(
        (object) => object.evidence_type !== "training"
      ),
      updatedTarget,
    ],
    updatedTarget,
    targetBeforeEnrichment: activeWorkoutContext,
    voiceInterpretation: voiceTrainingSession,
    diagnostics: {
      activeWorkoutContextProvided: true,
      targetWorkoutId: activeWorkoutContext.id,
      targetWorkoutObservedAt: activeWorkoutContext.observed_at,
      targetWorkoutSource: getTargetSource(activeWorkoutContext),
      workoutAttachmentMode: "enrich_existing_training_session",
      targetSelectionReason: "Explicit simulator workout context",
      targetConflictDetected: false,
      metadataPreserved: getMetadataPreservation(activeWorkoutContext, updatedTarget),
      exercisesAdded: merge.added,
      exercisesUpdated: merge.updated,
      duplicateTrainingSessionPrevented: true,
      createdTrainingSessionCount: 0,
      updatedTrainingSessionCount: 1,
    },
  };
}

function validateTarget(target, transcript) {
  if (target.evidence_type !== "training" || !/strength|resistance|weight/i.test(target.metadata?.activity_type ?? "")) {
    return {
      conflict: true,
      code: "non_strength_target",
      message: "Exercise details can only enrich the selected strength-training session.",
    };
  }
  if (/\b(?:those|these|that)\s+(?:sets?\s+)?(?:were|was)\s+(?:actually\s+)?for\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|tomorrow)/i.test(transcript)) {
    return {
      conflict: true,
      code: "target_date_conflict",
      message: `These details sound like they belong to a different workout than the selected ${formatDate(target.observed_at)} strength session. Choose the correct workout before saving.`,
    };
  }
  return { conflict: false };
}

function mergeTrainingExercises({ existing, incoming, correction }) {
  const byKey = new Map(existing.map((exercise) => [exerciseKey(exercise), exercise]));
  const added = [];
  const updated = [];
  incoming.forEach((exercise) => {
    const key = exerciseKey(exercise);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, exercise);
      added.push(exercise.name);
      return;
    }
    const incomingHasSets = (exercise.sets ?? []).length > 0;
    if (incomingHasSets && ((current.sets ?? []).length === 0 || correction)) {
      byKey.set(key, { ...current, ...exercise, id: current.id ?? exercise.id });
      updated.push(current.name ?? exercise.name);
    }
  });
  return { exercises: [...byKey.values()], added, updated };
}

function mergeMetadata(existing = {}, incoming = {}) {
  const merged = { ...existing };
  ["workout_focus", "effort_level", "location"].forEach((field) => {
    if ((merged[field] === null || merged[field] === undefined) && incoming[field] != null) {
      merged[field] = incoming[field];
    }
  });
  return merged;
}

function exerciseKey(exercise) {
  return getCanonicalTrainingExerciseSlug(exercise.name) || exercise.id;
}

function applyExplicitSetCorrection(exercises, transcript) {
  const match = transcript.match(
    /\b(?:the\s+)?(last|first|second|third|fourth|\d+(?:st|nd|rd|th)?)\s+(?:[a-z-]+\s+){0,4}?set\s+was\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)(?:\s+reps?)?/i
  );
  if (!match) return exercises;
  const exercise = findCorrectionExercise(exercises, transcript);
  if (!exercise || (exercise.sets ?? []).length === 0) return exercises;
  const setIndex = match[1].toLowerCase() === "last"
    ? exercise.sets.length - 1
    : ordinalToIndex(match[1]);
  const reps = numberWordToNumber(match[2]);
  if (setIndex < 0 || setIndex >= exercise.sets.length || !Number.isFinite(reps)) return exercises;

  return exercises.map((item) => item !== exercise ? item : {
    ...item,
    sets: item.sets.map((set, index) => index === setIndex ? { ...set, reps } : set),
  });
}

function findCorrectionExercise(exercises, transcript) {
  return exercises.find((exercise) => {
    const words = exercise.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => transcript.toLowerCase().includes(word));
  }) ?? (exercises.length === 1 ? exercises[0] : null);
}

function ordinalToIndex(value) {
  const ordinals = { first: 0, second: 1, third: 2, fourth: 3 };
  return ordinals[value.toLowerCase()] ?? Math.max(0, Number.parseInt(value, 10) - 1);
}

function numberWordToNumber(value) {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15 };
  return words[value.toLowerCase()] ?? Number(value);
}

function getArtifactRefs(object) {
  return unique([
    ...(object.source?.source_artifact_refs ?? []),
    ...(object.provenance?.source_artifact_refs ?? []),
  ]);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function getTargetSource(target) { return target.source?.integration ?? target.source?.application ?? target.source?.modality ?? null; }
function formatDate(value) { return new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric" }); }
function getMetadataPreservation(before, after) {
  return Object.fromEntries(["duration_seconds", "active_calories", "activity_type", "observed_at"].map((field) => [field, field === "observed_at" ? before.observed_at === after.observed_at : before.metadata?.[field] === after.metadata?.[field]]));
}
function createStandaloneDiagnostics(interpretation) { return { activeWorkoutContextProvided: false, workoutAttachmentMode: "create_standalone_training_session", createdTrainingSessionCount: (interpretation?.evidenceObjects ?? []).filter((item) => item.evidence_type === "training").length, updatedTrainingSessionCount: 0, duplicateTrainingSessionPrevented: false }; }
function createConflictDiagnostics(target, validation) { return { activeWorkoutContextProvided: true, targetWorkoutId: target.id, targetWorkoutObservedAt: target.observed_at, targetWorkoutSource: getTargetSource(target), workoutAttachmentMode: "blocked_target_conflict", targetSelectionReason: "Explicit simulator workout context", targetConflictDetected: true, targetConflictCode: validation.code, metadataPreserved: getMetadataPreservation(target, target), exercisesAdded: [], exercisesUpdated: [], duplicateTrainingSessionPrevented: true, createdTrainingSessionCount: 0, updatedTrainingSessionCount: 0 }; }
function createNoEnrichmentDiagnostics(target) { return { ...createConflictDiagnostics(target, { code: null }), workoutAttachmentMode: "no_training_details_detected", targetConflictDetected: false, targetConflictCode: null }; }
