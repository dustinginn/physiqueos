export const TRAINING_SESSION_SCHEMA_VERSION = "training-session-v1";

import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
  getFounderAlphaExerciseIdentityDiagnostics,
  getTrainingExerciseIdentityByName,
  resolveTrainingExerciseIdentity,
} from "./trainingExerciseIdentity";

const DEFAULT_METADATA = {
  activity_type: null,
  active_calories: null,
  total_calories: null,
  duration_seconds: null,
  distance: null,
  distance_unit: null,
  average_heart_rate: null,
  average_pace: null,
  effort_level: null,
  location: null,
};

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export function createTrainingSessionEvidenceObject({
  capturedAt = null,
  confidence = { extraction: "moderate", interpretation: "moderate" },
  exercises = [],
  id,
  metadata = {},
  observedAt = null,
  provenance = {},
  quality = { status: "partial", limitations: [] },
  source = {},
  values = [],
}) {
  const normalizedExercises = normalizeTrainingExercises(exercises);

  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    captured_at: capturedAt,
    source: {
      modality: source.modality ?? "manual",
      application: source.application ?? null,
      integration: source.integration ?? null,
      source_artifact_refs: source.source_artifact_refs ?? [],
    },
    metadata: {
      ...DEFAULT_METADATA,
      ...withoutEmptyValues(metadata),
    },
    exercises: normalizedExercises,
    values: removeTrainingHierarchyValues(values),
    confidence,
    quality,
    provenance: {
      source_artifact_refs:
        provenance.source_artifact_refs ??
        source.source_artifact_refs ??
        [],
    },
  };
}

export function createTrainingSessionEvidenceFromText({
  activityType = "Traditional Strength Training",
  capturedAt = null,
  id,
  observedAt = null,
  provenanceRef = "typed_evidence_0",
  sourceArtifactRefs = [provenanceRef],
  sourceModality = "manual",
  text,
}) {
  const exercises = parseStrengthTrainingText(text, { provenanceRef });

  if (exercises.length === 0) return null;

  return createTrainingSessionEvidenceObject({
    capturedAt,
    confidence: {
      extraction: "moderate",
      interpretation: "moderate",
    },
    exercises,
    id,
    metadata: {
      activity_type: activityType,
    },
    observedAt,
    quality: {
      status: "partial",
      limitations: [
        "Workout metadata is limited because this session came from typed or voice evidence without a connected workout source.",
      ],
    },
    source: {
      modality: sourceModality,
      application: null,
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
    values: [],
  });
}

export function parseStrengthTrainingText(text, { provenanceRef = "typed_evidence_0" } = {}) {
  const normalizedText = normalizeNumberWords(normalizeSetLineMetadata(normalizeTrainingTextInput(text)));
  if (
    !/strength|curl|press|row|squat|deadlift|bench|extension|raise|pull|pulldown|push\s*downs?|pushdowns?|leg|abduction|thrust|fly|flies|crunch|plank/i.test(normalizedText) &&
    !hasAnySetLine(normalizedText)
  ) {
    return [];
  }

  const naturalBlockParse = parseNaturalStrengthTrainingBlocks(normalizedText, {
    provenanceRef,
  });

  const exerciseMap = new Map();
  const segments = splitStrengthTrainingExerciseClauses(normalizedText);
  let currentExercise = null;

  for (const segment of segments) {
    const namedCompactMatch = segment.match(
      /^(.+?)\s+(\d+)\s*x\s*(\d+)\s*@\s*#?(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg)?/i
    );
    const compactContinuationMatch = segment.match(
      /^(\d+)\s*x\s*(\d+)\s*@\s*#?(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg)?$/i
    );
    const repsWeightShorthandContinuationMatch = segment.match(
      /^(\d+)(?:\s*[x×]\s*@?\s*#?|\s*@\s*#?|\s+reps?\s*(?:@|at)?\s*#?)(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|kg)?$/i
    );
    const namedRepsWeightShorthandMatch = segment.match(
      /^(.+?)\s+(\d+)\s*r(?:eps?)?\s+(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|kg)?$/i
    );
    const repsWeightLetterShorthandContinuationMatch = segment.match(
      /^(\d+)\s*r(?:eps?)?\s+(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|kg)?$/i
    );
    const repsBodyweightShorthandContinuationMatch = segment.match(
      /^(\d+)(?:\s*[xÃ—]\s*|\s*@\s*|\s+reps?\s*(?:@|at)?\s*)(?:body\s*weight|bodyweight|bw)$/i
    );
    const broadBodyweightShorthandContinuationMatch = segment.match(
      /^(\d+)(?:\s*[x×]\s*|\s*@\s*|\s+reps?\s*(?:@|at)?\s*)@?\s*(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)$/i
    );
    const letterBodyweightShorthandContinuationMatch = segment.match(
      /^(\d+)\s*r(?:eps?)?\s+(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)$/i
    );
    const timedSetContinuationMatch = getTimedSetContinuationMatch(segment);
    const namedPhraseMatch = segment.match(
      /^(.+?)\s+(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(?:pound|pounds|lb|lbs|kg)?/i
    );
    const phraseContinuationMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(?:pound|pounds|lb|lbs|kg)?$/i
    );
    const setsExerciseRepsWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(.+?)\s+(\d+)(?:\s+reps?)?\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsExerciseForRepsWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(.+?)\s+for\s+(\d+)(?:\s+reps?)?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsOnExerciseRepsWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+(?:on|for|with)\s+(?:the\s+)?(.+?),?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?(?:\s+per\s+set)?$/i
    );
    const setsRepsOnExerciseForWeightMatch = segment.match(
      /^(\d+)\s+sets?,?\s+(?:of\s+)?(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:on|for|with)\s+(?:the\s+)?(.+?)\s+(?:for|at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?$/i
    );
    const pronounSetsRepsWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(?:those|that|that\s+exercise|those\s+sets),?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?(?:\s+per\s+set)?$/i
    );
    const setsExerciseCommaRepsWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(.+?),?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsExerciseCommaRepsBareWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(.+?),?\s+(\d+)\s+reps?\s*(?:each|per\s+set)?,?\s*(?:at\s+)?#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsRepsExerciseMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:of\s+)?(.+?)$/i
    );
    const setsRepsOfExerciseWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+of\s+(.+?)\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsRepsExerciseWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+(?:of\s+)?(\d+)(?:\s+reps?)?\s+(?:of\s+)?(.+?)\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsExerciseWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(.+?)\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?(?:\s+each)?$/i
    );
    const setsExerciseCommaWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+(?:of\s+)?(.+?),?\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const namedSetsWeightMatch = segment.match(
      /^(.+?),?\s+(\d+)\s+sets?,?\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const namedSetsWeightForRepsMatch = segment.match(
      /^(.+?),?\s+(\d+)\s+sets?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?\s+for\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?$/i
    );
    const namedSetsWeightRepsMatch = segment.match(
      /^(.+?),?\s+(\d+)\s+sets?,?\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?,?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?$/i
    );
    const nearbyRepsBackfillMatch = segment.match(
      /^(?:(?:those|these|they|that)\s*)?(?:(\d+)\s+sets?\s*)?(?:were|was|are|is)?\s*(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)$/i
    );
    const namedCommaSetsRepsWeightMatch = segment.match(
      /^(.+?),?\s+(\d+)\s+sets?,?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const namedCommaSetsRepsBareWeightMatch = segment.match(
      /^(.+?),?\s+(\d+)\s+sets?,?\s+(\d+)\s+reps?\s*(?:each|per\s+set)?,?\s*(?:at\s+)?#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const namedGlueSetsRepsWeightMatch = segment.match(
      /^(.+?)\s+(?:and\s+(?:then\s+)?(?:i\s+)?did|then\s+(?:i\s+)?did|did)\s+(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?$/i
    );
    const namedSetsRepsMatch = segment.match(
      /^(.+?)\s+(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?$/i
    );
    const setsRepsBareWeightContinuationMatch = segment.match(
      /^(\d+)\s+sets?,?\s+(\d+)\s+reps?\s*(?:each|per\s+set)?,?\s*(?:at\s+)?#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const repsWeightContinuationMatch = segment.match(
      /^(\d+)(?:\s+reps?)?\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?$/i
    );
    const setsRepsOnExerciseWeightMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:on|for|with)\s+(?:the\s+)?(.+?)\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?(?:\s+each|\s+per\s+set)?$/i
    );
    const setsRepsWeightOnExerciseMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)?\s+(?:on|for|with)\s+(?:the\s+)?(.+?)$/i
    );
    const setsRepsOnExerciseMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:on|for|with)\s+(?:the\s+)?(.+?)$/i
    );
    const setsRepsOfWeightOnExerciseMatch = segment.match(
      /^(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+of\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?\s+(?:on|for|with)\s+(?:the\s+)?(.+?)$/i
    );
    const setsWeightRepsContinuationMatch = segment.match(
      /^(\d+)\s+sets?,?\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?,?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?$/i
    );
    const weightPerSetContinuationMatch = segment.match(
      /^(?:i\s+did\s+)?#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)\s+(?:per\s+set|each)$/i
    );
    const weightOnlyContinuationMatch = segment.match(
      /^#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kg)$/i
    );
    const weightFirstShorthandContinuationMatch = segment.match(
      /^(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|kg)\s+(\d+)\s*r(?:eps?)?$/i
    );
    const activeBlockBareWeightRepsContinuationMatch = segment.match(
      /^(\d+(?:\.\d+)?)\s+(\d+)(?:\s*r(?:eps?)?)?$/i
    );

    if (timedSetContinuationMatch && currentExercise) {
      appendTimedTrainingSets({
        durationSeconds: timedSetContinuationMatch.durationSeconds,
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        setCount: timedSetContinuationMatch.setCount,
      });
      continue;
    }

    if (
      (weightFirstShorthandContinuationMatch ||
        activeBlockBareWeightRepsContinuationMatch) &&
      currentExercise
    ) {
      const match =
        weightFirstShorthandContinuationMatch ??
        activeBlockBareWeightRepsContinuationMatch;
      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(match[3] ?? match[2]),
        setCount: 1,
        unit: weightFirstShorthandContinuationMatch ? match[2] : "lb",
        weight: Number(match[1]),
      });
      continue;
    }

    if (namedGlueSetsRepsWeightMatch) {
      currentExercise = cleanExerciseName(namedGlueSetsRepsWeightMatch[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(namedGlueSetsRepsWeightMatch[3]),
        setCount: Number(namedGlueSetsRepsWeightMatch[2]),
        unit: namedGlueSetsRepsWeightMatch[5] ?? "lb",
        weight: Number(namedGlueSetsRepsWeightMatch[4]),
      });
      continue;
    }

    if (namedCompactMatch || namedPhraseMatch) {
      const match = namedCompactMatch ?? namedPhraseMatch;
      currentExercise = cleanExerciseName(match[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(match[3]),
        setCount: Number(match[2]),
        unit: match[5] ?? "lb",
        weight: Number(match[4]),
      });
      appendContinuationSetsFromText({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        text: segment.slice(match[0].length),
      });
      continue;
    }

    if ((compactContinuationMatch || phraseContinuationMatch) && currentExercise) {
      const match = compactContinuationMatch ?? phraseContinuationMatch;
      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(match[2]),
        setCount: Number(match[1]),
        unit: match[4] ?? "lb",
        weight: Number(match[3]),
      });
      continue;
    }

    if (setsRepsOnExerciseWeightMatch) {
      currentExercise = cleanExerciseName(setsRepsOnExerciseWeightMatch[3]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsOnExerciseWeightMatch[2]),
        setCount: Number(setsRepsOnExerciseWeightMatch[1]),
        unit: setsRepsOnExerciseWeightMatch[5] ?? "lb",
        weight: Number(setsRepsOnExerciseWeightMatch[4]),
      });
      continue;
    }

    if (setsRepsWeightOnExerciseMatch) {
      currentExercise = cleanExerciseName(setsRepsWeightOnExerciseMatch[5]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsWeightOnExerciseMatch[2]),
        setCount: Number(setsRepsWeightOnExerciseMatch[1]),
        unit: setsRepsWeightOnExerciseMatch[4] ?? "lb",
        weight: Number(setsRepsWeightOnExerciseMatch[3]),
      });
      continue;
    }

    if (setsRepsOfWeightOnExerciseMatch) {
      currentExercise = cleanExerciseName(setsRepsOfWeightOnExerciseMatch[5]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsOfWeightOnExerciseMatch[2]),
        setCount: Number(setsRepsOfWeightOnExerciseMatch[1]),
        unit: setsRepsOfWeightOnExerciseMatch[4] ?? "lb",
        weight: Number(setsRepsOfWeightOnExerciseMatch[3]),
      });
      continue;
    }

    if (setsRepsOnExerciseForWeightMatch) {
      currentExercise = cleanExerciseName(setsRepsOnExerciseForWeightMatch[3]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsOnExerciseForWeightMatch[2]),
        setCount: Number(setsRepsOnExerciseForWeightMatch[1]),
        unit: setsRepsOnExerciseForWeightMatch[5] ?? "lb",
        weight: Number(setsRepsOnExerciseForWeightMatch[4]),
      });
      continue;
    }

    if (setsOnExerciseRepsWeightMatch) {
      currentExercise = cleanExerciseName(setsOnExerciseRepsWeightMatch[2]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsOnExerciseRepsWeightMatch[3]),
        setCount: Number(setsOnExerciseRepsWeightMatch[1]),
        unit: setsOnExerciseRepsWeightMatch[5] ?? "lb",
        weight: Number(setsOnExerciseRepsWeightMatch[4]),
      });
      continue;
    }

    if (pronounSetsRepsWeightMatch && currentExercise) {
      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(pronounSetsRepsWeightMatch[2]),
        setCount: Number(pronounSetsRepsWeightMatch[1]),
        unit: pronounSetsRepsWeightMatch[4] ?? "lb",
        weight: Number(pronounSetsRepsWeightMatch[3]),
      });
      continue;
    }

    if (setsRepsOfExerciseWeightMatch) {
      currentExercise = cleanExerciseName(setsRepsOfExerciseWeightMatch[3]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsOfExerciseWeightMatch[2]),
        setCount: Number(setsRepsOfExerciseWeightMatch[1]),
        unit: setsRepsOfExerciseWeightMatch[5] ?? "lb",
        weight: Number(setsRepsOfExerciseWeightMatch[4]),
      });
      continue;
    }

    if (setsRepsExerciseWeightMatch) {
      currentExercise = cleanExerciseName(setsRepsExerciseWeightMatch[3]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsExerciseWeightMatch[2]),
        setCount: Number(setsRepsExerciseWeightMatch[1]),
        unit: setsRepsExerciseWeightMatch[5] ?? "lb",
        weight: Number(setsRepsExerciseWeightMatch[4]),
      });
      continue;
    }

    if (
      namedCommaSetsRepsWeightMatch ||
      namedCommaSetsRepsBareWeightMatch
    ) {
      const match =
        namedCommaSetsRepsWeightMatch ??
        namedCommaSetsRepsBareWeightMatch;
      currentExercise = cleanExerciseName(match[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(match[3]),
        setCount: Number(match[2]),
        unit: match[5] ?? "lb",
        weight: Number(match[4]),
      });
      continue;
    }

    if (namedSetsWeightForRepsMatch) {
      currentExercise = cleanExerciseName(namedSetsWeightForRepsMatch[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(namedSetsWeightForRepsMatch[5]),
        setCount: Number(namedSetsWeightForRepsMatch[2]),
        unit: namedSetsWeightForRepsMatch[4] ?? "lb",
        weight: Number(namedSetsWeightForRepsMatch[3]),
      });
      continue;
    }

    if (namedSetsWeightRepsMatch) {
      currentExercise = cleanExerciseName(namedSetsWeightRepsMatch[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(namedSetsWeightRepsMatch[5]),
        setCount: Number(namedSetsWeightRepsMatch[2]),
        unit: namedSetsWeightRepsMatch[4] ?? "lb",
        weight: Number(namedSetsWeightRepsMatch[3]),
      });
      continue;
    }

    if (setsRepsOnExerciseMatch) {
      currentExercise = cleanExerciseName(setsRepsOnExerciseMatch[3]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsOnExerciseMatch[2]),
        setCount: Number(setsRepsOnExerciseMatch[1]),
        unit: null,
        weight: null,
      });
      continue;
    }

    if (setsWeightRepsContinuationMatch && currentExercise) {
      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsWeightRepsContinuationMatch[4]),
        setCount: Number(setsWeightRepsContinuationMatch[1]),
        unit: setsWeightRepsContinuationMatch[3] ?? "lb",
        weight: Number(setsWeightRepsContinuationMatch[2]),
      });
      continue;
    }

    if (
      (weightPerSetContinuationMatch || weightOnlyContinuationMatch) &&
      currentExercise
    ) {
      const match = weightPerSetContinuationMatch ?? weightOnlyContinuationMatch;
      applyWeightToExistingExerciseSets({
        exerciseMap,
        exerciseName: currentExercise,
        unit: match[2] ?? "lb",
        weight: Number(match[1]),
      });
      continue;
    }

    if (isSetLine(segment) && !currentExercise) {
      continue;
    }

    if (!isSetLine(segment) && !/\d/.test(segment)) {
      currentExercise = cleanExerciseName(segment);
      if (!exerciseMap.has(currentExercise)) {
        exerciseMap.set(currentExercise, {
        id: createExerciseId(currentExercise),
        name: currentExercise,
          ...inferExerciseMetadata(currentExercise),
          provenance_ref: provenanceRef,
          provenance: {
            source_artifact_refs: [provenanceRef],
          },
          sets: [],
        });
      }
      continue;
    }

    if (
      (repsWeightShorthandContinuationMatch ||
        repsWeightLetterShorthandContinuationMatch ||
        repsBodyweightShorthandContinuationMatch ||
        broadBodyweightShorthandContinuationMatch ||
        letterBodyweightShorthandContinuationMatch) &&
      currentExercise
    ) {
      const match =
        repsWeightShorthandContinuationMatch ??
        repsWeightLetterShorthandContinuationMatch ??
        repsBodyweightShorthandContinuationMatch ??
        broadBodyweightShorthandContinuationMatch ??
        letterBodyweightShorthandContinuationMatch;
      const isBodyweight =
        match === repsBodyweightShorthandContinuationMatch ||
        match === broadBodyweightShorthandContinuationMatch ||
        match === letterBodyweightShorthandContinuationMatch;

      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(match[1]),
        setCount: 1,
        unit: isBodyweight ? "bodyweight" : match[3] ?? "lb",
        weight: isBodyweight ? null : Number(match[2]),
      });
      continue;
    }

    if (namedRepsWeightShorthandMatch) {
      currentExercise = cleanExerciseName(namedRepsWeightShorthandMatch[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(namedRepsWeightShorthandMatch[2]),
        setCount: 1,
        unit: namedRepsWeightShorthandMatch[4] ?? "lb",
        weight: Number(namedRepsWeightShorthandMatch[3]),
      });
      continue;
    }

    if (
      setsExerciseRepsWeightMatch ||
      setsExerciseForRepsWeightMatch ||
      setsExerciseCommaRepsWeightMatch ||
      setsExerciseCommaRepsBareWeightMatch
    ) {
      const match =
        setsExerciseRepsWeightMatch ??
        setsExerciseForRepsWeightMatch ??
        setsExerciseCommaRepsWeightMatch ??
        setsExerciseCommaRepsBareWeightMatch;
      currentExercise = cleanExerciseName(match[2]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(match[3]),
        setCount: Number(match[1]),
        unit: match[5] ?? "lb",
        weight: Number(match[4]),
      });
      continue;
    }

    if (setsRepsBareWeightContinuationMatch && currentExercise) {
      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsBareWeightContinuationMatch[2]),
        setCount: Number(setsRepsBareWeightContinuationMatch[1]),
        unit: setsRepsBareWeightContinuationMatch[4] ?? "lb",
        weight: Number(setsRepsBareWeightContinuationMatch[3]),
      });
      continue;
    }

    if (setsExerciseWeightMatch) {
      currentExercise = cleanExerciseName(setsExerciseWeightMatch[2]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: null,
        setCount: Number(setsExerciseWeightMatch[1]),
        unit: setsExerciseWeightMatch[4] ?? "lb",
        weight: Number(setsExerciseWeightMatch[3]),
      });
      continue;
    }

    if (
      (setsExerciseCommaWeightMatch || namedSetsWeightMatch) &&
      !/\breps?\b/i.test(segment)
    ) {
      const match = setsExerciseCommaWeightMatch ?? namedSetsWeightMatch;
      const exerciseName = setsExerciseCommaWeightMatch ? match[2] : match[1];
      const setCount = setsExerciseCommaWeightMatch ? match[1] : match[2];
      const weight = setsExerciseCommaWeightMatch ? match[3] : match[3];
      const unit = setsExerciseCommaWeightMatch ? match[4] : match[4];

      currentExercise = cleanExerciseName(exerciseName);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: null,
        setCount: Number(setCount),
        unit: unit ?? "lb",
        weight: Number(weight),
      });
      continue;
    }

    if (nearbyRepsBackfillMatch && currentExercise) {
      const applied = applyRepsToExistingExerciseSets({
        exerciseMap,
        expectedSetCount: nearbyRepsBackfillMatch[1]
          ? Number(nearbyRepsBackfillMatch[1])
          : null,
        exerciseName: currentExercise,
        reps: Number(nearbyRepsBackfillMatch[2]),
      });

      if (applied) continue;
    }

    if (
      setsRepsExerciseMatch &&
      !/^(?:at|with)\b/i.test(setsRepsExerciseMatch[3])
    ) {
      currentExercise = cleanExerciseName(setsRepsExerciseMatch[3]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(setsRepsExerciseMatch[2]),
        setCount: Number(setsRepsExerciseMatch[1]),
        unit: null,
        weight: null,
      });
      continue;
    }

    if (namedSetsRepsMatch) {
      currentExercise = cleanExerciseName(namedSetsRepsMatch[1]);
      appendTrainingSets({
        equipment: inferEquipment(`${currentExercise} ${segment}`),
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(namedSetsRepsMatch[3]),
        setCount: Number(namedSetsRepsMatch[2]),
        unit: null,
        weight: null,
      });
      continue;
    }

    if (repsWeightContinuationMatch && currentExercise) {
      appendTrainingSets({
        exerciseMap,
        exerciseName: currentExercise,
        provenanceRef,
        reps: Number(repsWeightContinuationMatch[1]),
        setCount: 1,
        unit: repsWeightContinuationMatch[3] ?? "lb",
        weight: Number(repsWeightContinuationMatch[2]),
      });
      continue;
    }

  }
  const legacyExercises = normalizeTrainingExercises([...exerciseMap.values()]);
  const naturalExercises = normalizeTrainingExercises(naturalBlockParse.exercises);

  if (naturalExercises.length > 0 && legacyExercises.length === 0) {
    return naturalExercises;
  }
  if (
    naturalExercises.length > 0 &&
    getExerciseParseCompletenessScore(naturalExercises) >
      getExerciseParseCompletenessScore(legacyExercises)
  ) {
    return naturalExercises;
  }

  if (
    shouldUseNaturalStrengthBlockParser(naturalBlockParse, normalizedText) &&
    shouldPreferNaturalStrengthBlockParser({
      legacyExercises,
      naturalExercises,
      naturalBlockParse,
    })
  ) {
    return naturalExercises;
  }

  return legacyExercises;
}

export function getStrengthTrainingBlockParseDiagnostics(text) {
  const normalizedText = normalizeNumberWords(normalizeSetLineMetadata(normalizeTrainingTextInput(text)));
  const parsed = parseNaturalStrengthTrainingBlocks(normalizedText);

  return {
    recognizedExerciseMentions: parsed.recognizedExerciseMentions,
    exerciseBlocks: parsed.exerciseBlocks,
    exerciseBoundaryReasons: parsed.exerciseBoundaryReasons,
    exerciseNameRefinements: parsed.exerciseNameRefinements,
    pendingExerciseBackfills: parsed.pendingExerciseBackfills,
    sharedPrescriptionAssignments: parsed.sharedPrescriptionAssignments,
    declaredSetCountMismatches: parsed.declaredSetCountMismatches,
    canonicalExerciseCompleteness: parsed.canonicalExerciseCompleteness,
    missingEvidenceClaims: parsed.missingEvidenceClaims,
    malformedExerciseNamePrevented: parsed.malformedExerciseNamePrevented,
    implicitExerciseAnchors: parsed.implicitExerciseAnchors,
    orphanPrescriptionCandidates: parsed.orphanPrescriptionCandidates,
    exerciseBearingGrammarMatches: parsed.exerciseBearingGrammarMatches,
    numericTokenRoleAssignments: parsed.numericTokenRoleAssignments,
    pendingHeadingAttachments: parsed.pendingHeadingAttachments,
    bodyweightTrainingRoutingProtection: parsed.bodyweightTrainingRoutingProtection,
    ontologyCandidateRanking: parsed.ontologyCandidateRanking,
  };
}

export function splitStrengthTrainingExerciseClauses(text) {
  const normalizedText = normalizeNumberWords(normalizeSetLineMetadata(normalizeTrainingTextInput(text)));
  const preparedText = prepareTrainingTextForSegments(normalizedText)
    .replace(
      /\b(?:i\s+also\s+did|also\s+did|and\s+i\s+did|and\s+then\s+i\s+did|then\s+i\s+did|then\s+did|followed\s+by)\b/gi,
      ". "
    )
    .replace(
      /,\s*(?=(?:lateral|front|rear|shoulder|chest|leg|barbell|dumbbell|cable|machine|seated|standing|iso[-\s]?lateral|hip|sumo|spider|ez\s+bar|hammer|forearm|wrist|reverse|pull-?ups?|lat|triceps)\b[^,.]*,\s*\d+\s+sets?\b)/gi,
      ". "
    )
    .replace(
      /(^|[.\n]\s*)((?:lateral|front|rear|shoulder|chest|leg|barbell|dumbbell|cable|machine|seated|standing|iso[-\s]?lateral|hip|sumo|spider|ez\s+bar|hammer|forearm|wrist|reverse|pull-?ups?|lat|triceps)\b[^,.]*?),\s*(\d+\s+sets?\b)/gi,
      "$1$2 $3"
    )
    .replace(
      /,\s*(?=(?:and\s+)?(?:i\s+did\s+)?\d+\s+sets?\b)/gi,
      ". "
    )
    .replace(
      /,\s*(?=(?:lateral|front|rear|shoulder|chest|leg|barbell|dumbbell|cable|machine|seated|standing|iso[-\s]?lateral|hip|sumo|spider|ez\s+bar|hammer|forearm|wrist|reverse|pull-?ups?|lat|triceps)\b[^,.]*,\s*\d+\s+sets?\b)/gi,
      ". "
    )
    .replace(
      /,\s*(?=\d+\s+sets?\b)/gi,
      ". "
    );

  const segments = preparedText
    .split(/[.;\n]|\bthen\b/i)
    .map((segment) => cleanTrainingSegment(segment))
    .filter(Boolean);

  return segments.filter((segment, index) => {
    if (isExerciseClause(segment)) return true;
    if (isSetLine(segment)) return true;
    if (isLikelyExerciseName(segment)) return true;

    return !/\d/.test(segment) && isSetLine(segments[index + 1]);
  });
}

export function classifyStrengthTrainingClausePattern(clause) {
  const normalized = normalizeNumberWords(clause);
  if (
    /\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+(?:at|with)\s+#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)\s+(?:on|for|with)\s+/i.test(
      normalized
    )
  ) {
    return "sets_reps_weight_on_exercise";
  }
  if (
    /\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+of\s+#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)?\s+(?:on|for|with)\s+/i.test(
      normalized
    )
  ) {
    return "sets_reps_of_weight_on_exercise";
  }
  if (
    /\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+(?:on|for|with)\s+.+?\s+(?:at|with)\s+#?\d+(?:\.\d+)?/i.test(
      normalized
    )
  ) {
    return "sets_reps_on_exercise_weight";
  }
  if (
    /\d+\s+sets?,?\s+\d+(?:\s+reps?)?\s*(?:each|per\s+set)?\s+(?:on|for|with)\s+.+?\s+(?:for|at|with)\s+#?\d+(?:\.\d+)?/i.test(
      normalized
    )
  ) {
    return "sets_reps_on_exercise_for_weight";
  }
  if (/\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+of\s+/i.test(normalized)) {
    return "sets_reps_of_exercise_weight";
  }
  if (/^\d+\s*x\s*#?\d+(?:\.\d+)?/i.test(normalized)) {
    return "reps_weight_continuation";
  }
  if (
    /^(?:(?:those|these|they|that)\s*)?(?:(\d+)\s+sets?\s*)?(?:were|was|are|is)?\s*(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)$/i.test(
      normalized.trim()
    )
  ) {
    return "nearby_reps_backfill";
  }
  if (isLikelyExerciseName(normalized)) return "exercise_heading";

  return "unmatched_strength_clause";
}

function appendContinuationSetsFromText({
  exerciseMap,
  exerciseName,
  provenanceRef,
  text,
}) {
  const continuationPattern =
    /(\d+)\s+sets?\s+of\s+(\d+)(?:\s+reps?)?\s+(?:with|at)\s+#?(\d+(?:\.\d+)?)\s*(?:pound|pounds|lb|lbs|kg)?/gi;

  for (const match of String(text ?? "").matchAll(continuationPattern)) {
    appendTrainingSets({
      exerciseMap,
      exerciseName,
      provenanceRef,
      reps: Number(match[2]),
      setCount: Number(match[1]),
      unit: "lb",
      weight: Number(match[3]),
    });
  }
}

function shouldUseNaturalStrengthBlockParser(parsed, text) {
  if (!parsed || parsed.exercises.length === 0) return false;
  if (parsed.exerciseBlocks.length >= 2) return true;
  if (parsed.exerciseNameRefinements.length > 0) return true;
  if (parsed.sharedPrescriptionAssignments.length > 0) return true;
  if (parsed.pendingExerciseBackfills.length > 0) return true;
  if (parsed.missingEvidenceClaims.length > 0) return true;
  if ((parsed.implicitExerciseAnchors ?? []).length > 0) return true;
  if ((parsed.exerciseBearingGrammarMatches ?? []).length > 0) return true;
  if ((parsed.ontologyCandidateRanking ?? []).length > 0) return true;
  if (/\b(?:that\s+is|i\s+mean|actually)\b/i.test(text)) return true;
  if (/\b\d+\s+sets?[:;,]\s*\d+\s+(?:reps?\s*)?(?:at|,)\s*\d+/i.test(text)) {
    return true;
  }

  return false;
}

function shouldPreferNaturalStrengthBlockParser({
  legacyExercises = [],
  naturalBlockParse,
  naturalExercises = [],
}) {
  if (naturalExercises.length === 0) return false;
  if (legacyExercises.length === 0) return true;

  const naturalScore = getExerciseParseCompletenessScore(naturalExercises);
  const legacyScore = getExerciseParseCompletenessScore(legacyExercises);
  const naturalCompleteness =
    naturalBlockParse?.canonicalExerciseCompleteness ?? {};
  if (
    naturalCompleteness.allRecognizedExercisesSurvived === false &&
    naturalScore < legacyScore
  ) {
    return false;
  }

  return naturalScore >= legacyScore;
}

function getExerciseParseCompletenessScore(exercises = []) {
  return exercises.reduce((score, exercise) => {
    const sets = exercise.sets ?? [];
    const setsWithReps = sets.filter((set) => Number.isFinite(set.reps)).length;
    const setsWithLoad = sets.filter(
      (set) =>
        Number.isFinite(set.weight) ||
        set.load_type === "bodyweight" ||
        /body\s*weight|bodyweight/i.test(String(set.weight_unit ?? ""))
    ).length;

    return score + 20 + sets.length * 4 + setsWithReps * 2 + setsWithLoad * 2;
  }, 0);
}

function parseNaturalStrengthTrainingBlocks(text, { provenanceRef = "typed_evidence_0" } = {}) {
  const sourceText = normalizeNumberWords(normalizeTrainingTextInput(text))
    .replace(/\s+/g, " ")
    .trim();
  const mentions = getRecognizedExerciseMentions(sourceText);
  const consumedMentionIndexes = new Set();
  const blocks = [];
  const exerciseNameRefinements = [];
  const exerciseBoundaryReasons = [];
  const pendingExerciseBackfills = [];
  const malformedExerciseNamePrevented = [];
  const implicitExerciseAnchors = [];
  const orphanPrescriptionCandidates = [];
  const exerciseBearingGrammarMatches = [];
  const numericTokenRoleAssignments = [];
  const pendingHeadingAttachments = [];
  const bodyweightTrainingRoutingProtection = [];
  const ontologyCandidateRanking = [];

  const implicitBlocks = getImplicitFocusAnchorBlocks(sourceText);
  implicitBlocks.forEach((block) => {
    if (mentions.some((mention) => rangesOverlap(block.start, block.end, mention.index, mention.end))) {
      return;
    }

    const parsedSets = parseNaturalPrescriptionSets(block.sourceClause);
    const anchorBlock = {
      anchorType: "implicit_focus_default",
      canonicalExercise: block.canonicalExercise,
      declaredSetCount: parsedSets.declaredSetCount,
      exerciseMention: block.workoutFocus,
      refinements: [],
      setPairs: parsedSets.setPairs,
      sets: parsedSets.sets,
      sharedAssignments: [],
      sourceClauses: [block.sourceClause],
      prescriptionClauses: parsedSets.prescriptionClauses,
      status: parsedSets.sets.length > 0 ? "complete" : "failed",
    };

    blocks.push(anchorBlock);
    implicitExerciseAnchors.push({
      sourcePhrase: block.sourceClause,
      workoutFocus: block.workoutFocus,
      orphanPrescription: getUniformPrescriptionSummary(parsedSets),
      implicitExerciseAnchor: block.canonicalExercise,
      reason:
        "Founder Alpha chest default exercise applied to an immediately following complete strength prescription.",
      confidence: "high",
      canonicalExerciseCreated: parsedSets.sets.length > 0,
    });
    orphanPrescriptionCandidates.push({
      sourcePhrase: block.sourceClause,
      workoutFocus: block.workoutFocus,
      status: parsedSets.sets.length > 0 ? "resolved_with_implicit_anchor" : "unresolved",
    });
    numericTokenRoleAssignments.push({
      sourceClause: block.sourceClause,
      tokens: assignNumericTokenRoles(block.sourceClause),
    });
    exerciseBoundaryReasons.push({
      canonicalExercise: block.canonicalExercise,
      reason: "implicit_focus_default",
      sourceClause: block.sourceClause,
    });
  });

  getUnconfiguredFocusOrphanPrescriptionCandidates(sourceText).forEach(
    (candidate) => {
      if (
        implicitExerciseAnchors.some((anchor) =>
          anchor.sourcePhrase === candidate.sourcePhrase
        )
      ) {
        return;
      }

      orphanPrescriptionCandidates.push(candidate);
      blocks.push({
        anchorType: "unconfigured_focus_orphan_prescription",
        canonicalExercise: `${candidate.workoutFocus} prescription`,
        declaredSetCount: candidate.orphanPrescription?.set_count ?? null,
        exerciseMention: candidate.workoutFocus,
        refinements: [],
        setPairs: [],
        sets: [],
        sharedAssignments: [],
        sourceClauses: [candidate.sourcePhrase],
        prescriptionClauses: [candidate.sourcePhrase],
        status: "ambiguous",
      });
    }
  );

  const ambiguousBlocks = getAmbiguousExerciseBlocks(sourceText);
  ambiguousBlocks.forEach((block) => {
    const parsedSets = parseNaturalPrescriptionSets(block.sourceClause);
    blocks.push({
      anchorType: "ambiguous_ontology_candidate",
      canonicalExercise: block.sourcePhrase,
      declaredSetCount: parsedSets.declaredSetCount,
      exerciseMention: block.sourcePhrase,
      refinements: [],
      setPairs: parsedSets.setPairs,
      sets: [],
      sharedAssignments: [],
      sourceClauses: [block.sourceClause],
      prescriptionClauses: parsedSets.prescriptionClauses,
      status: "ambiguous",
    });
    ontologyCandidateRanking.push({
      sourcePhrase: block.sourcePhrase,
      candidates: [
        {
          exercise: "Iso-Lateral High Row",
          signals: ["user_history", "workout_focus_back"],
        },
        {
          exercise: "Lateral Raise",
          signals: ["lexical_raise_match"],
        },
      ],
      selected: null,
      reason: "Ambiguous exercise phrase requires clarification.",
    });
  });

  for (let index = 0; index < mentions.length; index += 1) {
    if (consumedMentionIndexes.has(index)) continue;

    const mention = mentions[index];
    const refinement = getExerciseRefinement({ mention, mentions, index, text: sourceText });
    const selectedMention = refinement?.refinedMention ?? mention;
    const selectedIndex = refinement?.refinedIndex ?? index;

    if (refinement) {
      consumedMentionIndexes.add(refinement.provisionalIndex);
      consumedMentionIndexes.add(refinement.refinedIndex);
      exerciseNameRefinements.push({
        provisionalExercise: refinement.provisionalMention.canonical,
        refinedExercise: refinement.refinedMention.canonical,
        refinementPhrase: refinement.refinementPhrase,
        duplicatePrevented: true,
      });
    } else {
      consumedMentionIndexes.add(index);
    }

    const blockStart = getNaturalBlockStart(
      sourceText,
      refinement?.provisionalMention.index ?? selectedMention.index
    );
    const nextMention = mentions
      .slice(selectedIndex + 1)
      .find((candidate, candidateOffset) => !consumedMentionIndexes.has(selectedIndex + 1 + candidateOffset));
    const blockEnd = nextMention
      ? getNaturalBlockStart(sourceText, nextMention.index)
      : getNaturalBlockEnd(sourceText, selectedMention.end);
    const sourceClause = sourceText.slice(blockStart, blockEnd).trim();
    const canonicalExercise = canonicalizeNaturalExerciseName(selectedMention.canonical);
    const cleanedClause = cleanNaturalExerciseClause(sourceClause);
    const parsedSets = parseNaturalPrescriptionSets(cleanedClause);
    const isExerciseBearingGrammar = /\b\d+\s+sets?\s+of\s+[a-z]/i.test(sourceClause);

    if (isExerciseBearingGrammar) {
      exerciseBearingGrammarMatches.push({
        sourceClause,
        canonicalExercise,
        grammar: "sets_of_exercise",
        declaredSetCount: parsedSets.declaredSetCount,
        loadType:
          parsedSets.sets.some((set) => set.load_type === "bodyweight")
            ? "bodyweight"
            : parsedSets.sets.some((set) => set.load_type === "external_load")
              ? "external_load"
              : null,
      });
    }
    if (/\bbody\s*weight|bodyweight\b/i.test(sourceClause)) {
      bodyweightTrainingRoutingProtection.push({
        sourceClause,
        reason:
          "Body weight appears inside a strength prescription and is treated as exercise load, not scale weight.",
      });
    }
    numericTokenRoleAssignments.push({
      sourceClause,
      tokens: assignNumericTokenRoles(sourceClause),
    });

    if (/each\s+of|reps\s+each\s+of|sets?\s+at|sets?\s+of/i.test(sourceClause)) {
      const malformed = cleanExerciseName(sourceClause);
      if (
        malformed &&
        normalizeIdentityText(malformed) !== normalizeIdentityText(canonicalExercise)
      ) {
        malformedExerciseNamePrevented.push({
          malformedExerciseName: malformed,
          canonicalExercise,
          sourceClause,
        });
      }
    }

    exerciseBoundaryReasons.push({
      canonicalExercise,
      reason: getNaturalBoundaryReason({ mention: selectedMention, sourceClause }),
      sourceClause,
    });

    if (parsedSets.pendingBackfill) {
      pendingExerciseBackfills.push({
        canonicalExercise,
        attachedPrescriptionClause: parsedSets.prescriptionClauses.join(", ") || sourceClause,
        attachmentType: "pending_exercise_set_sequence",
        consumed: true,
        headingClause: selectedMention.text,
        setPairCount: parsedSets.setPairs.length,
        sourceClause,
        reason: "Numeric-only prescription attached to nearest unresolved exercise heading.",
      });
      pendingHeadingAttachments.push({
        exercise: canonicalExercise,
        headingClause: selectedMention.text,
        attachedPrescriptionClause: parsedSets.prescriptionClauses.join(", ") || sourceClause,
        attachmentType: "pending_exercise_set_sequence",
        setPairCount: parsedSets.setPairs.length,
        consumed: true,
      });
    }

    blocks.push({
      anchorType: isExerciseBearingGrammar ? "sets_of_exercise" : "explicit",
      exerciseMention: selectedMention.text,
      canonicalExercise,
      sourceClauses: [sourceClause],
      prescriptionClauses: parsedSets.prescriptionClauses,
      declaredSetCount: parsedSets.declaredSetCount,
      setPairs: parsedSets.setPairs,
      sharedAssignments: [],
      refinements: refinement ? [exerciseNameRefinements.at(-1)] : [],
      status: parsedSets.sets.length > 0 ? "complete" : "pending",
      sets: parsedSets.sets,
    });
  }

  const sharedPrescriptionAssignments = applySharedNaturalPrescriptions({
    blocks,
    text: sourceText,
  });
  const declaredSetCountMismatches = blocks
    .filter(
      (block) =>
        Number.isFinite(Number(block.declaredSetCount)) &&
        block.setPairs.length > 1 &&
        Number(block.declaredSetCount) !== block.setPairs.length
    )
    .map((block) => ({
      canonicalExercise: block.canonicalExercise,
      declaredSetCount: block.declaredSetCount,
      extractedSetPairCount: block.setPairs.length,
    }));
  const exercises = blocks
    .filter((block) => block.sets.length > 0)
    .map((block) => createNaturalExerciseFromBlock(block, provenanceRef));
  const canonicalExercises = exercises.map((exercise) => exercise.name);
  const missingEvidenceClaims = getMissingEvidenceClaims(sourceText).map((claim) => ({
    ...claim,
    alreadyPresent: canonicalExercises.some(
      (name) => normalizeIdentityText(name) === normalizeIdentityText(claim.referencedExercise)
    ),
  }));
  const recognizedExerciseMentions = uniqueStrings(
    [
      ...mentions.map((mention) => canonicalizeNaturalExerciseName(mention.canonical)),
      ...blocks
        .filter((block) => block.anchorType !== "unconfigured_focus_orphan_prescription")
        .map((block) => block.canonicalExercise),
    ]
  );
  const unmatchedExerciseBlocks = blocks
    .filter(
      (block) =>
        block.status !== "complete" &&
        !canonicalExercises.some(
          (name) => normalizeIdentityText(name) === normalizeIdentityText(block.canonicalExercise)
        )
    )
    .map((block) => ({
      canonicalExercise: block.canonicalExercise,
      sourceClauses: block.sourceClauses,
      exerciseMention: block.exerciseMention,
      reason:
        block.anchorType === "ambiguous_ontology_candidate"
          ? `Ambiguous exercise phrase "${block.exerciseMention}" requires clarification.`
          : block.anchorType === "unconfigured_focus_orphan_prescription"
            ? `Complete ${block.exerciseMention} prescription has no configured implicit exercise anchor.`
            : "Recognized exercise did not produce canonical sets.",
    }));

  return {
    exercises,
    recognizedExerciseMentions,
    exerciseBlocks: blocks.map((block) => ({
      anchorType: block.anchorType,
      exerciseMention: block.exerciseMention,
      canonicalExercise: block.canonicalExercise,
      sourceClauses: block.sourceClauses,
      prescriptionClauses: block.prescriptionClauses,
      declaredSetCount: block.declaredSetCount,
      setPairs: block.setPairs,
      sharedAssignments: block.sharedAssignments,
      refinements: block.refinements,
      status: block.status,
    })),
    exerciseBoundaryReasons,
    exerciseNameRefinements,
    pendingExerciseBackfills,
    sharedPrescriptionAssignments,
    declaredSetCountMismatches,
    canonicalExerciseCompleteness: {
      recognizedExerciseMentions,
      canonicalExercises,
      allRecognizedExercisesSurvived: unmatchedExerciseBlocks.length === 0,
      unmatchedExerciseBlocks,
    },
    missingEvidenceClaims,
    malformedExerciseNamePrevented,
    implicitExerciseAnchors,
    orphanPrescriptionCandidates,
    exerciseBearingGrammarMatches,
    numericTokenRoleAssignments,
    pendingHeadingAttachments,
    bodyweightTrainingRoutingProtection,
    ontologyCandidateRanking,
  };
}

function getRecognizedExerciseMentions(text) {
  const patterns = getNaturalExercisePatterns();
  const mentions = [];

  patterns.forEach(({ canonical, pattern }) => {
    for (const match of text.matchAll(pattern)) {
      mentions.push({
        canonical,
        text: match[0],
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      });
    }
  });

  return removeOverlappingMentions(
    mentions.sort((a, b) => a.index - b.index || b.text.length - a.text.length)
  );
}

function getImplicitFocusAnchorBlocks(text) {
  const blocks = [];
  const chestDefaultPattern =
    /\b(?:did|trained|hit)\s+chest\s*,?\s*((?:\d+\s+sets?[^.!?]*?(?:pounds?|lbs?|lb|kg)[^.!?]*?))(?:[.!?]|$)/gi;

  for (const match of String(text ?? "").matchAll(chestDefaultPattern)) {
    const sourceClause = match[0].replace(/[.!?]$/g, "").trim();
    const prescription = match[1] ?? "";
    if (!/\b\d+\s+sets?\b/i.test(prescription)) continue;
    if (!/\b\d+\s+reps?\b/i.test(prescription)) continue;
    if (!/\b\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)\b/i.test(prescription)) continue;

    blocks.push({
      canonicalExercise: "Bench Press",
      end: (match.index ?? 0) + match[0].length,
      sourceClause,
      start: match.index ?? 0,
      workoutFocus: "Chest",
    });
  }

  return blocks;
}

function getUnconfiguredFocusOrphanPrescriptionCandidates(text) {
  const candidates = [];
  const pattern =
    /\b(?:did|trained|hit)\s+(arms|back|shoulders?|legs|biceps|triceps)\s*,?\s*((?:\d+\s+sets?[^.!?]*?(?:pounds?|lbs?|lb|kg)[^.!?]*?))(?:[.!?]|$)/gi;

  for (const match of String(text ?? "").matchAll(pattern)) {
    const sourceClause = match[0].replace(/[.!?]$/g, "").trim();
    const parsedSets = parseNaturalPrescriptionSets(sourceClause);
    if ((parsedSets.sets ?? []).length === 0) continue;

    candidates.push({
      sourcePhrase: sourceClause,
      workoutFocus: titleExerciseName(match[1]),
      orphanPrescription: getUniformPrescriptionSummary(parsedSets),
      status: "unresolved_no_configured_implicit_anchor",
      reason:
        "A complete focus-level prescription was spoken, but no configured default exercise exists for this focus.",
    });
  }

  return candidates;
}

function getAmbiguousExerciseBlocks(text) {
  const blocks = [];
  const pattern =
    /\b(?:iso[-\s]?lateral|isolateral)\s+raises?\b[^.!?]*(?:\d+\s+sets?[^.!?]*)/gi;

  for (const match of String(text ?? "").matchAll(pattern)) {
    const sourceClause = match[0].replace(/[.!?]$/g, "").trim();
    blocks.push({
      end: (match.index ?? 0) + match[0].length,
      sourceClause,
      sourcePhrase: sourceClause.match(/\b(?:iso[-\s]?lateral|isolateral)\s+raises?\b/i)?.[0] ?? "isolateral raises",
      start: match.index ?? 0,
    });
  }

  return blocks;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getUniformPrescriptionSummary(parsedSets) {
  const firstSet = parsedSets?.sets?.[0] ?? null;
  if (!firstSet) return null;

  return {
    set_count: parsedSets.sets.length,
    reps: firstSet.reps,
    weight: firstSet.weight,
    weight_unit: firstSet.weight_unit,
    load_type: firstSet.load_type,
  };
}

function assignNumericTokenRoles(text) {
  const tokens = [];
  const source = String(text ?? "");
  const patterns = [
    { role: "set_count", pattern: /\b(\d+)\s+sets?\b/gi },
    { role: "reps", pattern: /\b(\d+)\s+(?:reps?|repetitions?)(?:\s+each)?\b/gi },
    { role: "weight", pattern: /\b(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kilograms?|kg)\b/gi },
    { role: "reps", pattern: /\b(\d+)\s+each\b/gi },
  ];

  patterns.forEach(({ pattern, role }) => {
    for (const match of source.matchAll(pattern)) {
      tokens.push({
        value: Number(match[1]),
        role,
        marker: match[0].replace(String(match[1]), "").trim(),
        index: match.index ?? 0,
      });
    }
  });

  return tokens
    .sort((a, b) => a.index - b.index)
    .filter(
      (token, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.index === token.index &&
            candidate.value === token.value &&
            candidate.role === token.role
        ) === index
    )
    .map(({ index, ...token }) => token);
}

function getNaturalExercisePatterns() {
  return [
    { canonical: "Leg Press (Feet Middle)", pattern: /\bleg\s+press\s*\(\s*feet\s+middle\s*\)|\bleg\s+press\s+feet\s+middle\b/gi },
    { canonical: "Leg Press (Feet High)", pattern: /\bleg\s+press\s*\(\s*feet\s+high\s*\)|\bleg\s+press\s+feet\s+high\b/gi },
    { canonical: "Leg Press (Feet Low)", pattern: /\bleg\s+press\s*\(\s*feet\s+low\s*\)|\bleg\s+press\s+feet\s+low\b/gi },
    { canonical: "Bulgarian Split Squat (Smith Machine)", pattern: /\bbulgarian\s+split\s+squats?\s*\(\s*smith\s+machine\s*\)|\bsmith\s+machine\s+bulgarian\s+split\s+squats?\b/gi },
    { canonical: "Pendulum Squat Machine", pattern: /\bpendulum\s+squats?\s+machines?\b|\bpendulum\s+machines?\s+squats?\b/gi },
    { canonical: "Bulgarian Split Squat", pattern: /\bbulgarian\s+split\s+squats?\b/gi },
    { canonical: "Pendulum Squat", pattern: /\bpendulum\s+squats?\b/gi },
    { canonical: "Leg Extension", pattern: /\bleg\s+extensions?(?:\s+machines?)?\b/gi },
    { canonical: "Leg Press, high and narrow feet", pattern: /\bleg\s+press\b[^.!?]{0,45}\b(?:feet\s+)?high\b[^.!?]{0,45}\bnarrow\b/gi },
    { canonical: "Straight Bar Cable Pushdown", pattern: /\b(?:straight\s+bar\s+cable|cable\s+straight\s+bar)\s+push\s*downs?\b/gi },
    { canonical: "Incline Dumbbell Press", pattern: /\b(?:incline\s+dumbbell|dumbbell\s+incline)\s+press(?:es)?\b/gi },
    { canonical: "Incline Bench Press", pattern: /\b(?:(?:barbell\s+)?incline\s+(?:barbell\s+)?bench\s+press|incline\s+barbell\s+press)\b/gi },
    { canonical: "Shoulder Press Machine", pattern: /\b(?:shoulder\s+press\s+machine|machine\s+shoulder\s+press|shoulder\s+press\s+on\s+the\s+machine|shoulder\s+press\s+machine)\b/gi },
    { canonical: "Chest Fly Machine", pattern: /\bchest\s+(?:fly|flies)\s+machine\b/gi },
    { canonical: "Hanging Leg Raise", pattern: /\bhanging\s+leg\s+raises?\b/gi },
    { canonical: "Seated Cable Row", pattern: /\bseated\s+cable\s+rows?\b/gi },
    { canonical: "Cable Pushdown", pattern: /\bcable\s+push\s*downs?\b/gi },
    { canonical: "Cable Crunch", pattern: /\bcable\s+crunch(?:es)?\b/gi },
    { canonical: "Pull-Up", pattern: /\bpull[-\s]?ups?\b/gi },
    { canonical: "Bench Press", pattern: /\b(?:chest\s+)?bench\s+press\b/gi },
    { canonical: "Hack Squat", pattern: /\bhack\s+squats?\b/gi },
    { canonical: "Lateral Raise", pattern: /\blateral\s+raises?\b/gi },
    { canonical: "Leg Press", pattern: /\bleg\s+press\b/gi },
    { canonical: "Leg Raise", pattern: /\bleg\s+raises?\b/gi },
    { canonical: "Shoulder Press", pattern: /\bshoulder\s+press\b/gi },
    { canonical: "Cable Row", pattern: /\bcable\s+rows?\b/gi },
  ];
}

function removeOverlappingMentions(mentions) {
  const selected = [];

  mentions.forEach((mention) => {
    const overlappingIndex = selected.findIndex(
      (candidate) => mention.index < candidate.end && mention.end > candidate.index
    );

    if (overlappingIndex === -1) {
      selected.push(mention);
      return;
    }

    const existing = selected[overlappingIndex];
    if (mention.text.length > existing.text.length) {
      selected[overlappingIndex] = mention;
    }
  });

  return selected.sort((a, b) => a.index - b.index);
}

function getExerciseRefinement({ mention, mentions, index, text }) {
  const nextMention = mentions[index + 1];
  if (!nextMention) return null;

  const windowText = text.slice(mention.index, Math.min(text.length, nextMention.end + 45));
  const between = text.slice(mention.end, nextMention.index);
  const after = text.slice(nextMention.end, Math.min(text.length, nextMention.end + 35));
  const isRefinement =
    /^\s*,\s*$/i.test(between) &&
    /\b(that\s+is|actually|i\s+mean)\b/i.test(`${between} ${after}`);

  if (!isRefinement) return null;

  return {
    provisionalIndex: index,
    refinedIndex: index + 1,
    provisionalMention: mention,
    refinedMention: nextMention,
    refinementPhrase:
      windowText.match(/\b(that\s+is|actually|i\s+mean)\b/i)?.[1] ?? "refinement",
  };
}

function getNaturalBlockStart(text, mentionIndex) {
  const prefix = text.slice(0, mentionIndex);
  const matches = [...prefix.matchAll(/(?:^|[.!?]\s+|,\s*(?:and\s+)?(?:then\s+)?|(?:and\s+then|then|followed\s+by|and)\s+)/gi)];
  const selected = matches.at(-1);
  if (!selected) return 0;

  return (selected.index ?? 0) + selected[0].length;
}

function getNaturalBlockEnd(text, mentionEnd) {
  const suffix = text.slice(mentionEnd);
  const terminal = suffix.search(/\b(?:then\s+i\s+went\s+home|then\s+went\s+home|went\s+home|burger|lunch|dinner|breakfast|workout\s+effort|you\s+didn'?t\s+get)\b/i);
  if (terminal >= 0) return mentionEnd + terminal;

  return text.length;
}

function cleanNaturalExerciseClause(value) {
  return String(value ?? "")
    .replace(/\b(?:i\s+did|did|worked|workout|anyways?|then|and\s+then|followed\s+by)\b/gi, " ")
    .replace(/\b(that\s+is|actually|i\s+mean)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNaturalPrescriptionSets(sourceClause) {
  const text = String(sourceClause ?? "");
  const declaredSetCount = Number(text.match(/\b(\d+)\s+sets?\b/i)?.[1]);
  const setCount = Number.isFinite(declaredSetCount) ? declaredSetCount : null;
  const bodyweightMatch = text.match(
    /\b(\d+)\s+sets?\b[\s\S]*?\b(?:of\s+[^,.!?]+?\s+)?(?:at|for|,)?\s*(\d+)\s+reps?\b[\s\S]*?\b(?:body\s*weight|bodyweight|bw)\b/i
  );
  if (bodyweightMatch) {
    return {
      declaredSetCount: Number(bodyweightMatch[1]),
      prescriptionClauses: [bodyweightMatch[0]],
      setPairs: [],
      sets: createRepeatedNaturalSets({
        reps: Number(bodyweightMatch[2]),
        setCount: Number(bodyweightMatch[1]),
        unit: "bodyweight",
        weight: null,
      }),
      pendingBackfill: false,
    };
  }

  const setPairs = extractNaturalRepLoadPairs(text);
  if (setPairs.length > 1) {
    return {
      declaredSetCount: setCount,
      prescriptionClauses: setPairs.map((pair) => pair.source),
      setPairs,
      sets: setPairs.map((pair) => createNaturalSet(pair)),
      pendingBackfill:
        /^\s*\d+\s+sets?/i.test(text) || /\bset\s+\d+\b/i.test(text),
    };
  }

  if (setPairs.length === 1 && setCount && setCount > 1) {
    return {
      declaredSetCount: setCount,
      prescriptionClauses: [setPairs[0].source],
      setPairs,
      sets: createRepeatedNaturalSets({
        reps: setPairs[0].reps,
        setCount,
        unit: setPairs[0].unit,
        weight: setPairs[0].weight,
      }),
      pendingBackfill: false,
    };
  }

  const uniformWeightMatch = text.match(
    /\b(\d+)\s+sets?\b[\s\S]*?\b(\d+)\s+reps?\b[\s\S]*?\b(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?\b/i
  );
  if (uniformWeightMatch) {
    return {
      declaredSetCount: Number(uniformWeightMatch[1]),
      prescriptionClauses: [uniformWeightMatch[0]],
      setPairs: [
        {
          reps: Number(uniformWeightMatch[2]),
          weight: Number(uniformWeightMatch[3]),
          unit: uniformWeightMatch[4] ?? "lb",
          source: uniformWeightMatch[0],
        },
      ],
      sets: createRepeatedNaturalSets({
        reps: Number(uniformWeightMatch[2]),
        setCount: Number(uniformWeightMatch[1]),
        unit: uniformWeightMatch[4] ?? "lb",
        weight: Number(uniformWeightMatch[3]),
      }),
      pendingBackfill: false,
    };
  }

  const repsAndWeightMatch = text.match(
    /\b(\d+)\s+sets?\b[\s\S]*?\b(\d+)\s+reps?\b[\s\S]*?\band\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b/i
  );
  if (repsAndWeightMatch) {
    return {
      declaredSetCount: Number(repsAndWeightMatch[1]),
      prescriptionClauses: [repsAndWeightMatch[0]],
      setPairs: [
        {
          reps: Number(repsAndWeightMatch[2]),
          weight: Number(repsAndWeightMatch[3]),
          unit: repsAndWeightMatch[4] ?? "lb",
          source: repsAndWeightMatch[0],
        },
      ],
      sets: createRepeatedNaturalSets({
        reps: Number(repsAndWeightMatch[2]),
        setCount: Number(repsAndWeightMatch[1]),
        unit: repsAndWeightMatch[4] ?? "lb",
        weight: Number(repsAndWeightMatch[3]),
      }),
      pendingBackfill: false,
    };
  }

  const loadBeforeRepsMatch =
    text.match(
      /\b(\d+)\s+sets?\b[\s\S]*?(?:at|with|,)\s*#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b[\s\S]*?\b(\d+)\s+reps?(?:\s+each)?\b/i
    ) ??
    text.match(
      /\b(\d+)\s+sets?\b[\s\S]*?\b#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b[\s\S]*?\b(?:for\s+)?(\d+)\s+reps?(?:\s+each)?\b/i
    );
  if (loadBeforeRepsMatch) {
    return {
      declaredSetCount: Number(loadBeforeRepsMatch[1]),
      prescriptionClauses: [loadBeforeRepsMatch[0]],
      setPairs: [
        {
          reps: Number(loadBeforeRepsMatch[4]),
          weight: Number(loadBeforeRepsMatch[2]),
          unit: loadBeforeRepsMatch[3] ?? "lb",
          source: loadBeforeRepsMatch[0],
        },
      ],
      sets: createRepeatedNaturalSets({
        reps: Number(loadBeforeRepsMatch[4]),
        setCount: Number(loadBeforeRepsMatch[1]),
        unit: loadBeforeRepsMatch[3] ?? "lb",
        weight: Number(loadBeforeRepsMatch[2]),
      }),
      pendingBackfill: false,
    };
  }

  const weightFirstSetCountMatch = text.match(
    /\b#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b[\s\S]*?\b(?:for\s+)?(\d+)\s+sets?\s+of\s+(\d+)\b/i
  );
  if (weightFirstSetCountMatch) {
    return {
      declaredSetCount: Number(weightFirstSetCountMatch[3]),
      prescriptionClauses: [weightFirstSetCountMatch[0]],
      setPairs: [
        {
          reps: Number(weightFirstSetCountMatch[4]),
          weight: Number(weightFirstSetCountMatch[1]),
          unit: weightFirstSetCountMatch[2] ?? "lb",
          source: weightFirstSetCountMatch[0],
        },
      ],
      sets: createRepeatedNaturalSets({
        reps: Number(weightFirstSetCountMatch[4]),
        setCount: Number(weightFirstSetCountMatch[3]),
        unit: weightFirstSetCountMatch[2] ?? "lb",
        weight: Number(weightFirstSetCountMatch[1]),
      }),
      pendingBackfill: false,
    };
  }

  const eachAtWeightMatch = text.match(
    /\b(\d+)\s+sets?\b[\s\S]*?\b(\d+)\s+each\b[\s\S]*?\b(?:at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?\b/i
  );
  if (eachAtWeightMatch) {
    return {
      declaredSetCount: Number(eachAtWeightMatch[1]),
      prescriptionClauses: [eachAtWeightMatch[0]],
      setPairs: [
        {
          reps: Number(eachAtWeightMatch[2]),
          weight: Number(eachAtWeightMatch[3]),
          unit: eachAtWeightMatch[4] ?? "lb",
          source: eachAtWeightMatch[0],
        },
      ],
      sets: createRepeatedNaturalSets({
        reps: Number(eachAtWeightMatch[2]),
        setCount: Number(eachAtWeightMatch[1]),
        unit: eachAtWeightMatch[4] ?? "lb",
        weight: Number(eachAtWeightMatch[3]),
      }),
      pendingBackfill: false,
    };
  }

  const noWeightMatch = text.match(
    /\b(\d+)\s+sets?\b(?!\s+at\s+\d+\s*(?:pounds?|lbs?|lb|kg)\b)[\s\S]*?\b(\d+)(?:\s+reps?)?\b/i
  );
  if (noWeightMatch) {
    return {
      declaredSetCount: Number(noWeightMatch[1]),
      prescriptionClauses: [noWeightMatch[0]],
      setPairs: [],
      sets: createRepeatedNaturalSets({
        reps: Number(noWeightMatch[2]),
        setCount: Number(noWeightMatch[1]),
        unit: null,
        weight: null,
      }),
      pendingBackfill: false,
    };
  }

  return {
    declaredSetCount: setCount,
    prescriptionClauses: [],
    setPairs,
    sets: [],
    pendingBackfill: false,
  };
}

function extractNaturalRepLoadPairs(text) {
  const pairs = [];
  const seen = new Set();
  const patterns = [
    { pattern: /(\d+)\s+reps?\s*(?:at|@|,)\s*#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?/gi, repsIndex: 1, weightIndex: 2, unitIndex: 3 },
    { pattern: /(\d+)\s*(?:at|@)\s*#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?/gi, repsIndex: 1, weightIndex: 2, unitIndex: 3 },
    { pattern: /(\d+)\s+reps?\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?/gi, repsIndex: 1, weightIndex: 2, unitIndex: 3 },
    { pattern: /(\d+(?:\.\d+)?)\s*(p|pounds?|lbs?|lb|kg)\s+(\d+)\s*r(?:eps?)?/gi, repsIndex: 3, weightIndex: 1, unitIndex: 2 },
    { pattern: /(\d+(?:\.\d+)?)\s+(\d+)(?:\s*r(?:eps?)?)?(?=\s|$)/gi, repsIndex: 2, weightIndex: 1, unitIndex: null },
  ];

  patterns.forEach(({ pattern, repsIndex, unitIndex, weightIndex }) => {
    for (const match of text.matchAll(pattern)) {
      const key = `${match.index}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        reps: Number(match[repsIndex]),
        weight: Number(match[weightIndex]),
        unit: unitIndex ? match[unitIndex] ?? "lb" : "lb",
        source: match[0],
        index: match.index ?? 0,
      });
    }
  });

  return pairs.sort((a, b) => a.index - b.index);
}

function createRepeatedNaturalSets({ reps, setCount, unit, weight }) {
  return Array.from({ length: setCount }, () =>
    createNaturalSet({ reps, unit, weight })
  );
}

function createNaturalSet({ reps, unit, weight }) {
  const normalizedUnit = normalizeWeightUnit(unit);
  const isBodyweight = normalizedUnit === "bodyweight";
  const finiteWeight =
    weight === null || weight === undefined || weight === ""
      ? null
      : Number.isFinite(Number(weight))
        ? Number(weight)
        : null;
  const finiteReps =
    reps === null || reps === undefined || reps === ""
      ? null
      : Number.isFinite(Number(reps))
        ? Number(reps)
        : null;

  return {
    reps: finiteReps,
    weight: isBodyweight ? null : finiteWeight,
    weight_unit: isBodyweight ? "bodyweight" : finiteWeight !== null ? normalizedUnit : null,
    load_type: isBodyweight ? "bodyweight" : finiteWeight !== null ? "external_load" : null,
    measurement_type: isBodyweight ? "bodyweight_reps" : "weighted_reps",
    set_type: isBodyweight ? "bodyweight_reps" : "weighted_reps",
    volume: finiteReps !== null && finiteWeight !== null ? finiteReps * finiteWeight : null,
  };
}

function applySharedNaturalPrescriptions({ blocks, text }) {
  const sharedWeightMatch =
    text.match(/\b(?:both\s+exercises|they\s+were\s+both|both\s+were)\s+(?:at\s+|were\s+)?#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b/i) ??
    text.match(/\bi\s+used\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\s+for\s+both\b/i) ??
    text.match(/\b#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\s+on\s+both\s+exercises\b/i) ??
    text.match(/\bboth\s+(?:the\s+)?[^.]+?\s+were\s+(?:at\s+)?#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b/i);

  if (!sharedWeightMatch) return [];

  const weight = Number(sharedWeightMatch[1]);
  const unit = sharedWeightMatch[2] ?? "lb";
  const targetBlocks = blocks
    .filter(
      (block) =>
        /push\s*down/i.test(block.canonicalExercise) &&
        (block.sets ?? []).length > 0
    )
    .slice(-2);
  const appliedTo = [];

  targetBlocks.forEach((block) => {
    block.sets = block.sets.map((set) => {
      if (set.weight !== null && set.weight !== undefined && Number.isFinite(Number(set.weight))) return set;
      const reps = Number(set.reps);
      appliedTo.push(block.canonicalExercise);
      return {
        ...set,
        load_type: "external_load",
        measurement_type: "weighted_reps",
        set_type: "weighted_reps",
        volume: Number.isFinite(reps) ? reps * weight : null,
        weight,
        weight_unit: normalizeWeightUnit(unit),
      };
    });
    block.sharedAssignments.push({
      sharedField: "weight",
      value: weight,
      unit: normalizeWeightUnit(unit),
    });
  });

  return appliedTo.length > 0
    ? [
        {
          sharedField: "weight",
          value: weight,
          unit: normalizeWeightUnit(unit),
          appliedTo: uniqueStrings(appliedTo),
        },
      ]
    : [];
}

function createNaturalExerciseFromBlock(block, provenanceRef) {
  return {
    id: createExerciseId(block.canonicalExercise),
    name: block.canonicalExercise,
    ...inferExerciseMetadata(block.canonicalExercise),
    provenance_ref: provenanceRef,
    provenance: {
      source_artifact_refs: [provenanceRef],
    },
    sets: block.sets.map((set) => ({
      ...set,
      provenance_ref: provenanceRef,
    })),
  };
}

function canonicalizeNaturalExerciseName(name) {
  const resolved = resolveTrainingExerciseIdentity(name);
  if (
    resolved.resolutionStatus === "resolved_high_confidence" &&
    resolved.exercise?.body_region === "Lower Body"
  ) {
    return resolved.canonicalExerciseName;
  }
  if (/^hanging\s+leg\s+raises?$/i.test(name)) return "Hanging Leg Raise";
  if (/^cable\s+crunch(?:es)?$/i.test(name)) return "Cable Crunch";
  if (/^cable\s+push\s*downs?$/i.test(name)) return "Cable Pushdown";
  if (/^pull[-\s]?ups?$/i.test(name)) return "Pull-Up";
  if (/^straight\s+bar\s+cable\s+push\s*downs?$/i.test(name)) {
    return "Straight Bar Cable Pushdown";
  }
  if (/^hack\s+squats?$/i.test(name)) return "Hack Squat";

  return name;
}

function getNaturalBoundaryReason({ mention, sourceClause }) {
  if (/\b(?:then|and\s+then|followed\s+by|jumped\s+over)\b/i.test(sourceClause)) {
    return "explicit_transition";
  }
  if (sourceClause.slice(0, Math.max(0, mention.index)).includes(",")) {
    return "comma_sibling_exercise_boundary";
  }
  if (/^\d+\s+sets?/i.test(sourceClause)) return "pending_heading_numeric_backfill";

  return "recognized_exercise_mention";
}

function getMissingEvidenceClaims(text) {
  return [...String(text ?? "").matchAll(/\byou\s+(?:did\s+not|didn'?t)\s+get\s+my\s+([^.!?]+?)\s+workout\b/gi)]
    .map((match) => ({
      claim: match[0],
      referencedExercise: canonicalizeNaturalExerciseName(
        cleanExerciseName(match[1]) ?? titleExerciseName(match[1])
      ),
    }));
}

function applyRepsToExistingExerciseSets({
  exerciseMap,
  expectedSetCount = null,
  exerciseName,
  reps,
}) {
  const exercise = exerciseMap.get(exerciseName);
  if (!exercise || !Number.isFinite(Number(reps))) return false;

  const sets = exercise.sets ?? [];
  if (
    Number.isFinite(Number(expectedSetCount)) &&
    sets.length !== Number(expectedSetCount)
  ) {
    return false;
  }

  let applied = false;
  exercise.sets = sets.map((set) => {
    if (set.reps !== null && set.reps !== undefined && Number.isFinite(Number(set.reps))) {
      return set;
    }

    applied = true;
    const weight = Number(set.weight);

    return {
      ...set,
      reps: Number(reps),
      volume: Number.isFinite(weight) ? Number(reps) * weight : null,
    };
  });

  return applied;
}

function isLikelyExerciseName(value) {
  return /curl|press|row|squat|deadlift|bench|extension|raise|pulldown|push\s*downs?|pushdowns?|pull-?up|leg|fly|flies|lunge|triceps|biceps|calf|shrug|abduction|thrust|crunch|plank/i.test(
    String(value ?? "")
  );
}

function isSetLine(value) {
  const text = String(value ?? "").trim();

  if (getTimedSetContinuationMatch(text)) return true;

  if (
    /^(\d+)(?:\s*[x×]\s*|\s*@\s*|\s+reps?\s*(?:@|at)?\s*)@?\s*(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)$/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    /^(\d+)\s*r(?:eps?)?\s+(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)$/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    /^(\d+)\s+sets?,?\s+#?(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|lb|kg)?,?\s+(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)?$/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    /^(\d+(?:\.\d+)?)\s*(?:p|lbs?|pounds?|kg)\s+(\d+)\s*r(?:eps?)?$/i.test(text) ||
    /^(\d+(?:\.\d+)?)\s+(\d+)(?:\s*r(?:eps?)?)?$/i.test(text)
  ) {
    return true;
  }

  return (
    /^(\d+)(?:\s*[x×]\s*@?\s*#?|\s*@\s*#?|\s+reps?\s*(?:@|at)?\s*#?)(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|kg)?$/i.test(text) ||
    /^(\d+)\s*r(?:eps?)?\s+(\d+(?:\.\d+)?)\s*(p|lbs?|pounds?|kg)?$/i.test(text) ||
    /^(\d+)(?:\s*[x×]\s*|\s*@\s*|\s+reps?\s*(?:@|at)?\s*)(?:body\s*weight|bodyweight|bw)$/i.test(text)
  );
}

function hasAnySetLine(value) {
  return normalizeTrainingTextInput(value)
    .split(/\n|[.;]|\bthen\b/i)
    .map((segment) => cleanTrainingSegment(segment))
    .some((segment) => isSetLine(segment));
}

function isExerciseClause(value) {
  const text = String(value ?? "");

  if (getTimedSetContinuationMatch(text)) return true;

  if (
    /\d+\s*[x×]\s*(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)\b|\d+\s*(?:reps?)?\s*@\s*(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)\b|\d+\s+reps?\s*(?:with|at|@)?\s*(?:body\s*weight|bodyweight|body-weight|bw|own\s+body\s+weight)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (/\d+\s+sets?,?\s+\d+(?:\s+reps?)?/i.test(text)) {
    return true;
  }

  if (/\d+\s+sets?,?\s+#?\d+(?:\.\d+)?\s*(?:p|pounds?|lbs?|lb|kg)?,?\s+\d+(?:\s+reps?)?\s*(?:each|per\s+set)?/i.test(text)) {
    return true;
  }

  if (
    /^(?:(?:those|these|they|that)\s*)?(?:(\d+)\s+sets?\s*)?(?:were|was|are|is)?\s*(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)$/i.test(
      text.trim()
    )
  ) {
    return true;
  }

  if (
    /\d+\s*[xÃ—]\s*(?:body\s*weight|bodyweight|bw)\b|\d+\s*(?:reps?)?\s*@\s*(?:body\s*weight|bodyweight|bw)\b|\d+\s+reps?\s*(?:with|at|@)?\s*(?:body\s*weight|bodyweight|bw)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return /\d+\s+sets?\s+of\s+\d+|\d+\s*[x×]\s*@?\s*#?\d+|\d+\s*@\s*#?\d+|\d+\s*r(?:eps?)?\s+\d+(?:\.\d+)?\s*(?:p|pounds?|lbs?|kg)?\b|\d+\s+reps?\s+(?:with|at|@)?\s*#?\d+|#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|kg)\s+(?:per\s+set|each)/i.test(
    String(value ?? "")
  );
}

export function normalizeTrainingExercises(exercises) {
  return (Array.isArray(exercises) ? exercises : [])
    .map((exercise) => {
      const name = cleanText(exercise.name);
      if (!name) return null;

      const sets = normalizeTrainingSets(exercise.sets ?? []);
      if (sets.length === 0) return null;

      return {
        id: exercise.id ?? exercise.exercise_id ?? createExerciseId(name),
        name,
        ...normalizeExerciseMetadata(exercise, name),
        sets,
        provenance_ref: exercise.provenance_ref ?? sets[0]?.provenance_ref ?? "unknown",
        provenance: {
          source_artifact_refs:
            exercise.provenance?.source_artifact_refs ??
            [
              exercise.provenance_ref ??
                sets[0]?.provenance_ref ??
                "unknown",
            ],
        },
      };
    })
    .filter(Boolean);
}

export function normalizeTrainingSets(sets) {
  return (Array.isArray(sets) ? sets : [])
    .map((set, index) => {
      const reps = set.reps === null || set.reps === undefined ? null : Number(set.reps);
      const weight =
        set.weight === null || set.weight === undefined ? null : Number(set.weight);
      const durationSeconds =
        set.duration_seconds === null || set.duration_seconds === undefined
          ? null
          : Number(set.duration_seconds);
      const hasReps = Number.isFinite(reps);
      const hasWeight = Number.isFinite(weight);
      const hasDurationSeconds = Number.isFinite(durationSeconds);
      const normalizedWeightUnit = normalizeWeightUnit(set.weight_unit);
      const loadType =
        set.load_type ??
        (normalizedWeightUnit === "bodyweight"
          ? "bodyweight"
          : hasWeight
            ? "external_load"
            : null);
      const setType =
        set.set_type ??
        set.measurement_type ??
        (hasDurationSeconds
          ? "duration"
          : loadType === "bodyweight"
            ? "bodyweight_reps"
            : "weighted_reps");

      if (!hasReps && !hasWeight && !hasDurationSeconds) return null;

      return {
        duration_seconds: hasDurationSeconds ? durationSeconds : null,
        load_type: loadType,
        measurement_type: set.measurement_type ?? setType,
        set_number: Number(set.set_number) || index + 1,
        set_type: setType,
        reps: hasReps ? reps : null,
        weight: hasWeight ? weight : null,
        weight_unit:
          hasWeight || normalizedWeightUnit === "bodyweight"
            ? normalizedWeightUnit
            : null,
        volume:
          hasReps && hasWeight
            ? Number.isFinite(Number(set.volume)) && Number(set.volume) > 0
            ? Number(set.volume)
            : reps * weight
            : null,
        provenance_ref: set.provenance_ref ?? "typed_evidence_0",
      };
    })
    .filter(Boolean)
    .map((set, index) => ({
      ...set,
      set_number: index + 1,
    }));
}

export function createTrainingHierarchyValue(exercises, {
  provenanceRef = "typed_evidence_0",
} = {}) {
  return {
    name: "strength_exercises",
    label: "Exercises",
    value: JSON.stringify({
      model: "strength_training_hierarchy_v1",
      schema: TRAINING_SESSION_SCHEMA_VERSION,
      exercises: normalizeTrainingExercises(exercises),
    }),
    unit: null,
    value_type: "text",
    confidence: "high",
    provenance_ref: provenanceRef,
    caveats: [],
  };
}

export function replaceTrainingHierarchyValue(values, exercises) {
  return removeTrainingHierarchyValues(values);
}

export function removeTrainingHierarchyValues(values = []) {
  return (values ?? []).filter((value) => value.name !== "strength_exercises");
}

export function createExerciseId(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function appendTrainingSets({
  exerciseMap,
  exerciseName,
  equipment,
  provenanceRef,
  reps,
  setCount,
  unit,
  weight,
}) {
  if (!exerciseMap.has(exerciseName)) {
    exerciseMap.set(exerciseName, {
      id: createExerciseId(exerciseName),
      name: exerciseName,
      ...inferExerciseMetadata(exerciseName, { equipment }),
      provenance_ref: provenanceRef,
      provenance: {
        source_artifact_refs: [provenanceRef],
      },
      sets: [],
    });
  }

  const exercise = exerciseMap.get(exerciseName);

  for (let index = 0; index < setCount; index += 1) {
    const normalizedWeightUnit = normalizeWeightUnit(unit);
    const isBodyweight = normalizedWeightUnit === "bodyweight";
    exercise.sets.push({
      load_type: isBodyweight ? "bodyweight" : Number.isFinite(weight) ? "external_load" : null,
      measurement_type: isBodyweight ? "bodyweight_reps" : "weighted_reps",
      provenance_ref: provenanceRef,
      reps,
      set_type: isBodyweight ? "bodyweight_reps" : "weighted_reps",
      volume: Number.isFinite(reps) && Number.isFinite(weight) ? reps * weight : null,
      weight,
      weight_unit: normalizedWeightUnit,
    });
  }
}

function appendTimedTrainingSets({
  durationSeconds,
  exerciseMap,
  exerciseName,
  provenanceRef,
  setCount,
}) {
  if (!exerciseMap.has(exerciseName)) {
    exerciseMap.set(exerciseName, {
      id: createExerciseId(exerciseName),
      name: exerciseName,
      ...inferExerciseMetadata(exerciseName),
      provenance_ref: provenanceRef,
      provenance: {
        source_artifact_refs: [provenanceRef],
      },
      sets: [],
    });
  }

  const exercise = exerciseMap.get(exerciseName);

  for (let index = 0; index < setCount; index += 1) {
    exercise.sets.push({
      duration_seconds: durationSeconds,
      load_type: null,
      measurement_type: "duration",
      provenance_ref: provenanceRef,
      reps: null,
      set_type: "duration",
      volume: null,
      weight: null,
      weight_unit: null,
    });
  }
}

function getTimedSetContinuationMatch(value) {
  const text = String(value ?? "").trim();
  const minuteSecondThenCount = text.match(/^(\d+):(\d{1,2})s?\s*[x×]\s*(\d+)$/i);
  if (minuteSecondThenCount) {
    return {
      durationSeconds:
        Number(minuteSecondThenCount[1]) * 60 + Number(minuteSecondThenCount[2]),
      setCount: Number(minuteSecondThenCount[3]),
    };
  }

  const countThenMinuteSecond = text.match(/^(\d+)\s*[x×]\s*(\d+):(\d{1,2})s?$/i);
  if (countThenMinuteSecond) {
    return {
      durationSeconds:
        Number(countThenMinuteSecond[2]) * 60 + Number(countThenMinuteSecond[3]),
      setCount: Number(countThenMinuteSecond[1]),
    };
  }

  const secondsThenCount = text.match(/^(\d+)\s*(?:s|sec|secs|seconds)\s*[x×]\s*(\d+)$/i);
  if (secondsThenCount) {
    return {
      durationSeconds: Number(secondsThenCount[1]),
      setCount: Number(secondsThenCount[2]),
    };
  }

  const minuteWordsThenCount = text.match(
    /^(\d+)\s*(?:min|mins|minute|minutes)\s+(\d+)\s*(?:s|sec|secs|second|seconds)\s*[x×]\s*(\d+)$/i
  );
  if (minuteWordsThenCount) {
    return {
      durationSeconds:
        Number(minuteWordsThenCount[1]) * 60 + Number(minuteWordsThenCount[2]),
      setCount: Number(minuteWordsThenCount[3]),
    };
  }

  return null;
}

function applyWeightToExistingExerciseSets({
  exerciseMap,
  exerciseName,
  unit,
  weight,
}) {
  const exercise = exerciseMap.get(exerciseName);
  if (!exercise || !Number.isFinite(weight)) return;

  exercise.sets = exercise.sets.map((set) => {
    const reps = Number(set.reps);
    const nextUnit = normalizeWeightUnit(unit);

    return {
      ...set,
      load_type: nextUnit === "bodyweight" ? "bodyweight" : "external_load",
      measurement_type:
        nextUnit === "bodyweight" ? "bodyweight_reps" : "weighted_reps",
      set_type: nextUnit === "bodyweight" ? "bodyweight_reps" : "weighted_reps",
      volume: Number.isFinite(reps) ? reps * weight : null,
      weight,
      weight_unit: nextUnit,
    };
  });
}

function normalizeNumberWords(text) {
  return text.replace(/\b([a-z]+(?:-[a-z]+)?)\b/gi, (match) => {
    const value = numberWordToNumber(match);
    return value === null ? match : String(value);
  });
}

function numberWordToNumber(value) {
  const lower = String(value).toLowerCase();
  if (NUMBER_WORDS[lower] !== undefined) return NUMBER_WORDS[lower];

  const parts = lower.split("-");
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] && NUMBER_WORDS[parts[1]]) {
    return NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]];
  }

  return null;
}

function normalizeTrainingTextInput(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029\u0085]/g, "\n")
    .replace(/\u00a0/g, " ");
}

function normalizeSetLineMetadata(text) {
  return String(text ?? "")
    .replace(/^\s*set\s+\d+\s*:\s*/gim, "")
    .replace(/\s*(?:Â·|·)\s*/g, " ");
}

function cleanExerciseName(value) {
  const text = cleanText(value)
    ?.replace(/\b(for strength training|strength training|workout|today)\b/gi, "")
    .replace(/^.*?\b(?:i did|did|performed|completed)\b\s*/i, "")
    .trim();
  const resolved = resolveTrainingExerciseIdentity(text);
  if (
    resolved.resolutionStatus === "resolved_high_confidence" &&
    resolved.exercise?.body_region === "Lower Body"
  ) {
    return resolved.canonicalExerciseName;
  }
  const specificExerciseName = extractSpecificExerciseName(text);

  return specificExerciseName ?? titleExerciseName(text);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function uniqueStrings(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeIdentityText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeWeightUnit(unit) {
  if (/body\s*weight|bodyweight|\bbw\b/i.test(String(unit ?? ""))) {
    return "bodyweight";
  }

  if (/^p$/i.test(String(unit ?? ""))) return "lb";

  return /kg/i.test(String(unit ?? "")) ? "kg" : "lb";
}

function titleExerciseName(value) {
  return cleanText(value)
    ?.toLowerCase()
    .replace(/\bez\s+bar\b/g, "EZ Bar")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prepareTrainingTextForSegments(text) {
  return String(text ?? "")
    .replace(/\s*,?\s+\band\s+then\b/gi, ". ")
    .replace(getExerciseTransitionPhrasePattern(), ". ")
    .replace(/\b(?:i\s+also\s+did|also\s+did|and\s+i\s+did|and\s+then\s+i\s+did|then\s+i\s+did)\b/gi, ". ")
    .replace(
      /(\d+\s+sets?\s+of\s+[^,.]+?),\s*(\d+\s+reps?\s+(?:with|at)\s+#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|kg)?)/gi,
      "$1 $2"
    )
    .replace(
      /(\d+\s+sets?\s+of\s+[^,.]+?),\s*(\d+\s+reps?\s*(?:each|per\s+set)?\s+(?:with|at)\s+#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|kg)?)/gi,
      "$1 $2"
    )
    .replace(
      /\b((?:ez\s+bar|spider|hammer|preacher|incline|concentration|barbell|dumbbell|cable|machine|mid\s+cable|lat|hanging|pull-?ups?|triceps|biceps|chest|shoulder|leg|seated|standing|rear\s+delt|lateral|front)\s+(?:curls?|press(?:es)?|rows?|squats?|deadlifts?|extensions?|raises?|pulldowns?|pull-?ups?|flys?|flies|lunges?|shrugs?)\s+\d+\s+sets?\s+of)/gi,
      ". $1"
    );
}

function cleanTrainingSegment(segment) {
  return String(segment ?? "")
    .trim()
    .replace(/[,]+$/g, "")
    .replace(/^.*?\b(?:so\s+)?i\s+did\s+/i, "")
    .replace(/^(?:i\s+also\s+did|also\s+did|and\s+i\s+did|and\s+then\s+i\s+did|then\s+i\s+did|i\s+did|did)\s+/i, "")
    .replace(/^(?:i'?m\s+sorry|sorry|actually|make\s+that)\s+/i, "")
    .replace(getExerciseTransitionPhrasePattern(), "")
    .replace(/,?\s+and$/i, "")
    .replace(/[,]+$/g, "")
    .trim();
}

function getExerciseTransitionPhrasePattern() {
  return /\b(?:then\s+i\s+did|then\s+did|next\s+i\s+did|next\s+was|after\s+that\s+i\s+did|afterwards\s+i\s+did|moved\s+over\s+to|moved\s+to|switched\s+over\s+to|switched\s+to|went\s+over\s+to|went\s+to|jumped\s+over\s+and\s+did|jumped\s+over\s+to|jumped\s+to|finished\s+with|wrapped\s+up\s+with|ended\s+with|ended\s+on|followed\s+that\s+with|knocked\s+out|hit)\s+/gi;
}

function extractSpecificExerciseName(value) {
  const text = cleanText(value);
  if (!text) return null;

  if (/\bspider\s+curls?\b/i.test(text)) return "Spider Curls";
  if (/\bforearm\s+curls?\b/i.test(text)) return "Forearm Curls";
  if (/\breverse\s+wrist\s+curls?\b/i.test(text)) return "Reverse Wrist Curls";
  if (/\bwrist\s+curls?\b/i.test(text)) return "Wrist Curls";
  if (/\breverse\s+curls?\b/i.test(text)) return "Reverse Curls";
  if (/\bez\s+bar\s+curls?\b/i.test(text)) return "EZ Bar Curls";
  if (/\bcable\s+curls?\b/i.test(text)) return "Cable Curl";
  if (/\bcable\s+rope\s+push\s*downs?\b/i.test(text)) return "Cable Rope Pushdowns";
  if (/\bcable\s+straight\s+bar\s+push\s*downs?\b/i.test(text)) {
    return "Cable Straight Bar Pushdowns";
  }
  if (/\btricep\s+push\s*downs?\b/i.test(text)) return "Tricep Pushdown";
  if (/\btriceps\s+push\s*downs?\b/i.test(text)) return "Triceps Pushdown";
  if (/\bpush\s*downs?\b/i.test(text)) return titleExerciseName(text.replace(/\s*down(s?)\b/i, "down$1"));
  if (/\bshoulder\s+machines?\s+press(?:es)?\b/i.test(text)) return "Shoulder Press Machine";
  if (/\bmachine\s+shoulder\s+press(?:es)?\b/i.test(text)) return "Shoulder Press Machine";
  if (/\bshoulder\s+machines?\b/i.test(text)) return "Shoulder Press Machine";
  if (/\bmachine\s+press(?:es)?\b/i.test(text) && /\bshoulders?\b/i.test(text)) {
    return "Shoulder Press Machine";
  }
  if (/\bshoulder\s+press\b/i.test(text) && /\bon\s+(?:the\s+)?machine\b|\bmachine\b/i.test(text)) {
    return "Shoulder Press Machine";
  }
  if (/\bshoulder\s+press\s+machines?\b/i.test(text)) return "Shoulder Press Machine";
  if (/\bshoulder\s+press(?:es)?\b/i.test(text)) return "Shoulder Press";
  if (/\blateral\s+raises\s+machines?\b/i.test(text)) return "Lateral Raises Machine";
  if (/\blateral\s+raise\s+machines?\b/i.test(text)) return "Lateral Raise Machine";
  if (/\blateral\s+raises?\b/i.test(text)) return "Lateral Raise";
  if (/\bcable\s+machines?\s+front\s+raises?\b/i.test(text)) return "Cable Machine Front Raise";
  if (/\bdumbbell\s+front\s+raises?\b|\bdb\s+front\s+raises?\b/i.test(text)) return "Dumbbell Front Raise";
  if (/\bbarbell\s+front\s+raises?\b/i.test(text)) return "Barbell Front Raises";
  if (/\bfront\s+raises?\b/i.test(text)) return "Front Raises";
  if (/\bfront\s+rows?\b/i.test(text)) return "Front Rows";
  if (/\bseated\s+abductions?\b/i.test(text)) return "Seated Abductions";
  if (/\bhip\s+abductions?\s+machines?\b/i.test(text)) return "Hip Abduction Machine";
  if (/\bhip\s+thrusts?\b/i.test(text)) return "Hip Thrusts";
  if (/\bleg\s+press\b/i.test(text) && /\bhigh(?:er)?\b/i.test(text) && /\bnarrow|close\s+stance|feet\s+close\b/i.test(text)) {
    return "Leg Press, high and narrow feet";
  }
  if (/\bleg\s+press\b/i.test(text)) return "Leg Press";
  if (/\bhack\s+squats?\b/i.test(text)) return "Hack Squat";
  if (/\bsumo\s+squats?\s+machines?\b/i.test(text)) return "Sumo Squat Machine";
  if (/\bsumo\s+squats?\b/i.test(text)) return "Sumo Squat";
  if (/\bhanging\s+leg\s+raises?\b/i.test(text)) return "Hanging Leg Raises";
  if (/\bcable\s+crunch(?:es)?\b/i.test(text)) return "Cable Crunches";
  if (/\bplanks?\b/i.test(text)) return "Planks";
  if (/\bchest\s+fly\s+machines?\b|\bchest\s+flies\s+machines?\b/i.test(text)) {
    return "Chest Fly Machine";
  }
  if (/\bincline\s+dumbbell\s+press(?:es)?\b/i.test(text)) {
    return "Incline Dumbbell Press";
  }
  if (/\b(?:(?:barbell\s+)?incline\s+(?:barbell\s+)?bench\s+press|incline\s+barbell\s+press)\b/i.test(text)) {
    return "Incline Bench Press";
  }
  if (/\bpull-?ups?\b/i.test(text)) return "Pull-Ups";
  if (/\blat\s+pulldowns?\b/i.test(text)) return "Lat Pulldown";
  if (/\biso[-\s]?lateral\s+high\s+rows?\b/i.test(text)) {
    return "Iso-Lateral High Row";
  }
  if (/\b(?:hammer\s+strength\s+)?high\s+rows?\b/i.test(text)) {
    return titleExerciseName(text.match(/\b(?:hammer\s+strength\s+)?high\s+rows?\b/i)?.[0]);
  }
  if (/\bseated\s+(?:mid\s+)?cable\s+rows?\b/i.test(text)) {
    return "Seated Cable Row";
  }
  if (/\blow\s+cable\s+rows?\b/i.test(text)) return "Low Cable Row";
  if (/\bmid\s+cable\s+rows?\b/i.test(text)) {
    return titleExerciseName(text.match(/\bmid\s+cable\s+rows?\b/i)?.[0]);
  }
  if (/\bcable\s+rows?\b/i.test(text)) return "Cable Row";
  if (/\bbench\s+press\b/i.test(text)) return "Bench Press";

  const matches = [
    ...text.matchAll(
      /\b((?:(?:iso[-\s]?lateral|hammer\s+strength|high|low|ez\s+bar|spider|forearm|reverse\s+wrist|wrist|reverse|hammer|preacher|incline|concentration|barbell|dumbbell|cable|machine|mid\s+cable|lat|hanging|triceps|biceps|chest|shoulder|leg|seated|standing|rear\s+delt|lateral|front)\s+)?(?:(?:high|low|mid|seated|iso[-\s]?lateral|hammer\s+strength|cable|cable\s+rope|cable\s+straight\s+bar)\s+)?(?:curls?|press(?:es)?(?:\s+machines?)?|rows?|squats?|deadlifts?|extensions?|raises?|pulldowns?|push\s*downs?|pushdowns?|pull-?ups?|flys?|flies|lunges?|shrugs?))\b/gi
    ),
  ];

  if (matches.length === 0) return null;

  const specificMatches = matches.filter((match) => {
    const words = match[1].trim().split(/\s+/);
    return words.length > 1;
  });
  const selected = specificMatches.at(-1) ?? matches.at(-1);

  return selected?.[1] ?? null;
}

function normalizeExerciseMetadata(exercise, name) {
  const inferred = inferExerciseMetadata(name);

  return {
    equipment: exercise.equipment ?? inferred.equipment,
    body_region: exercise.body_region ?? inferred.body_region,
    primary_muscle_groups: Array.isArray(exercise.primary_muscle_groups)
      ? exercise.primary_muscle_groups
      : Array.isArray(exercise.muscle_groups)
        ? exercise.muscle_groups.filter((group) => group !== inferred.body_region)
        : inferred.primary_muscle_groups,
    secondary_muscle_groups: Array.isArray(exercise.secondary_muscle_groups)
      ? exercise.secondary_muscle_groups
      : inferred.secondary_muscle_groups,
    movement_pattern: exercise.movement_pattern ?? inferred.movement_pattern,
    ontology_confidence: exercise.ontology_confidence ?? inferred.ontology_confidence,
    muscle_groups: Array.isArray(exercise.muscle_groups)
      ? exercise.muscle_groups
      : [
          ...inferred.primary_muscle_groups,
          ...inferred.secondary_muscle_groups,
          inferred.body_region,
        ].filter(Boolean),
  };
}

function inferExerciseMetadata(name, overrides = {}) {
  const identity = getTrainingExerciseIdentityByName(name);
  if (identity?.body_region === "Lower Body") {
    return {
      equipment: overrides.equipment ?? identity.equipment,
      body_region: identity.body_region,
      primary_muscle_groups: identity.primary_muscle_groups,
      secondary_muscle_groups: identity.secondary_muscle_groups,
      movement_pattern: identity.movement_pattern,
      ontology_confidence: "high",
      muscle_groups: [
        ...identity.primary_muscle_groups,
        ...identity.secondary_muscle_groups,
        identity.body_region,
      ].filter(Boolean),
    };
  }

  return {
    equipment: overrides.equipment ?? inferEquipment(name),
    body_region: inferBodyRegion(name),
    primary_muscle_groups: inferPrimaryMuscleGroups(name),
    secondary_muscle_groups: inferSecondaryMuscleGroups(name),
    movement_pattern: inferMovementPattern(name),
    ontology_confidence: inferOntologyConfidence(name),
    muscle_groups: inferMuscleGroups(name),
  };
}

function inferEquipment(name) {
  const text = String(name ?? "").toLowerCase();
  if (text.includes("ez bar")) return "EZ bar";
  if (text.includes("dumbbell")) return "dumbbells";
  if (text.includes("barbell")) return "barbell";
  if (text.includes("machine")) return "machine";
  if (text.includes("cable") || text.includes("pulldown")) return "cable";
  if (text.includes("plank")) return "bodyweight";
  if (text.includes("pull-up") || text.includes("pull up") || text.includes("leg raise")) {
    return "bodyweight";
  }
  return null;
}

function inferBodyRegion(name) {
  const text = String(name ?? "").toLowerCase();
  if (/leg\s+press|squat|lunge|calf|abduction|thrust/.test(text)) return "Legs";
  if (/forearm|wrist|reverse\s+curl/.test(text)) return "Arms";
  if (/curl|biceps|triceps|extension|push\s*down|pushdown/.test(text)) return "Arms";
  if (/leg\s+raise|hanging|crunch|plank/.test(text)) return "Core";
  if (/raise|delt|shoulder/.test(text)) return "Shoulders";
  if (/row|pulldown|lat|shrug|pull-?up/.test(text)) return "Back";
  if (/press|bench|fly/.test(text)) return "Chest";
  if (/deadlift|hinge/.test(text)) return "Posterior Chain";
  return null;
}

function inferPrimaryMuscleGroups(name) {
  const text = String(name ?? "").toLowerCase();
  if (/abduction|hip\s+thrust|sumo\s+squat/.test(text)) return ["Glutes"];
  if (/leg\s+press/.test(text) && /high.*narrow|narrow.*high/.test(text)) {
    return ["Hamstrings", "Glutes"];
  }
  if (/leg\s+press/.test(text)) return ["Quads", "Glutes"];
  if (/forearm|wrist|reverse\s+curl/.test(text)) return ["Forearms"];
  if (/curl|biceps/.test(text)) return ["Biceps"];
  if (/triceps|extension|push\s*down|pushdown/.test(text)) return ["Triceps"];
  if (/leg\s+raise|hanging|crunch|plank/.test(text)) return ["Abs"];
  if (/lateral\s+raises?(?:\s+machine)?/.test(text)) return ["Shoulders", "Middle Delts"];
  if (/raise|delt|shoulder/.test(text)) return ["Shoulders"];
  if (/row|pulldown|\blat\b|pull-?up/.test(text)) return ["Back"];
  if (/press|bench|fly/.test(text)) return ["Chest"];
  if (/squat|lunge/.test(text)) return ["Quads", "Glutes"];
  if (/calf/.test(text)) return ["Calves"];
  if (/deadlift|hinge/.test(text)) return ["Hamstrings", "Glutes", "Back"];
  return [];
}

function inferSecondaryMuscleGroups(name) {
  const text = String(name ?? "").toLowerCase();
  if (/abduction|hip\s+thrust|sumo\s+squat/.test(text)) return ["Hamstrings"];
  if (/leg\s+press/.test(text)) return ["Glutes", "Hamstrings"];
  if (/forearm|wrist|reverse\s+curl/.test(text)) return ["Biceps"];
  if (/curl|biceps/.test(text)) return ["Forearms"];
  if (/lateral\s+raises?(?:\s+machine)?/.test(text)) return [];
  if (/shoulder.*press|press.*shoulder/.test(text)) return ["Triceps"];
  if (/press|bench/.test(text)) return ["Shoulders", "Triceps"];
  if (/row|pulldown|\blat\b/.test(text)) return ["Biceps", "Forearms"];
  if (/pull-?up/.test(text)) return ["Biceps", "Forearms", "Core"];
  if (/squat|lunge/.test(text)) return ["Hamstrings", "Core"];
  if (/deadlift|hinge/.test(text)) return ["Forearms", "Core"];
  return [];
}

function inferMovementPattern(name) {
  const text = String(name ?? "").toLowerCase();
  if (/abduction/.test(text)) return "Hip Abduction";
  if (/hip\s+thrust/.test(text)) return "Hip Thrust";
  if (/leg\s+press/.test(text)) return "Leg Press";
  if (/curl|biceps/.test(text)) return "Elbow Flexion";
  if (/triceps|extension|push\s*down|pushdown/.test(text)) return "Elbow Extension";
  if (/row/.test(text)) return "Horizontal Pull";
  if (/lateral\s+raises?(?:\s+machine)?/.test(text)) return "Lateral Raise";
  if (/pulldown|\blat\b|pull-?up/.test(text)) return "Vertical Pull";
  if (/leg\s+raise|hanging/.test(text)) return "Hip Flexion";
  if (/crunch/.test(text)) return "Spinal Flexion";
  if (/plank/.test(text)) return "Core Stability";
  if (/shoulder.*press|press.*shoulder/.test(text)) return "Vertical Push";
  if (/press|bench/.test(text)) return "Push";
  if (/raise/.test(text)) return "Shoulder Isolation";
  if (/squat|lunge/.test(text)) return "Squat";
  if (/deadlift|hinge/.test(text)) return "Hip Hinge";
  return null;
}

function inferOntologyConfidence(name) {
  const text = String(name ?? "").toLowerCase();
  if (/front\s+rows?/.test(text)) return "low";

  return "high";
}

function inferMuscleGroups(name) {
  const text = String(name ?? "").toLowerCase();
  if (/abduction|hip\s+thrust|sumo\s+squat/.test(text)) return ["Legs", "Glutes", "Hamstrings"];
  if (/leg\s+press/.test(text) && /high.*narrow|narrow.*high/.test(text)) {
    return ["Legs", "Hamstrings", "Glutes"];
  }
  if (/leg\s+press/.test(text)) return ["Legs", "Quads", "Glutes"];
  if (/forearm|wrist|reverse\s+curl/.test(text)) {
    return ["Forearms", "Biceps", "Arms"];
  }
  if (/curl|biceps/.test(text)) return ["Biceps", "Forearms", "Arms"];
  if (/triceps|extension|push\s*down|pushdown/.test(text)) return ["Triceps", "Arms"];
  if (/leg\s+raise|hanging|crunch|plank/.test(text)) return ["Core", "Abs"];
  if (/lateral\s+raises?(?:\s+machine)?/.test(text)) return ["Shoulders", "Middle Delts"];
  if (/shoulder.*press|press.*shoulder|raise|delt|shoulder/.test(text)) {
    return ["Shoulders", "Triceps"];
  }
  if (/row|pulldown|\blat\b|pull-?up/.test(text)) return ["Back", "Biceps", "Forearms"];
  if (/press|bench|fly/.test(text)) return ["Chest", "Shoulders", "Triceps"];
  if (/squat|lunge|leg/.test(text)) return ["Legs", "Quads", "Glutes"];
  if (/deadlift|hinge/.test(text)) return ["Posterior Chain", "Back", "Legs"];
  return [];
}

function withoutEmptyValues(object) {
  return Object.fromEntries(
    Object.entries(object ?? {}).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}
