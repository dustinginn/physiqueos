import { createActivityDayEvidenceObject } from "../models/activityDayEvidence";
import {
  createNutritionDayEvidenceFromText,
  createNutritionDayEvidenceObject,
} from "../models/nutritionDayEvidence";
import {
  classifyStrengthTrainingClausePattern,
  createTrainingSessionEvidenceFromText,
  createTrainingSessionEvidenceObject,
  getStrengthTrainingBlockParseDiagnostics,
  parseStrengthTrainingText,
  splitStrengthTrainingExerciseClauses,
} from "../models/trainingSessionEvidence";
import { resolveVoiceEntities } from "../services/VoiceEntityResolutionService";
import { detectVoiceIntent, detectVoiceIntents } from "../services/VoiceIntentService";

export function interpretVoiceEvidence(evidence = {}) {
  const rawTranscript = normalizeTranscript(evidence.transcript);
  const terminalCompletion =
    detectTerminalCompletionPhraseInOriginalTranscript(rawTranscript);
  const transcriptForEvidence = terminalCompletion.detected
    ? terminalCompletion.evidenceTranscript
    : rawTranscript;
  const narrativeDeduplication =
    dedupeRepeatedNarrativeFragments(transcriptForEvidence);
  const transcript = narrativeDeduplication.dedupedNarrative;
  const conversationalResolution = resolveConversationalCorrections(transcript);
  const resolvedTranscript = conversationalResolution.resolvedTranscript;
  const entityResolution = resolveVoiceEntities(resolvedTranscript, {
    userHistory: evidence.userHistory,
  });
  const detectedEvidenceIntents = detectVoiceIntents(resolvedTranscript);
  const clauseSegmentation = segmentVoiceTranscriptByEvidenceType(resolvedTranscript);
  const narrativeGlueSuppressed = hasNarrativeGlueSuppression(resolvedTranscript);
  const primaryIntent =
    detectedEvidenceIntents[0] ?? detectVoiceIntent(resolvedTranscript);
  const expectedEvidenceType = evidence.expectedEvidenceType ?? evidence.evidenceType ?? "auto";
  const provenanceRef = evidence.provenanceRef ?? "voice_transcript_0";
  const sourceArtifactRefs = evidence.sourceArtifactRefs ?? [provenanceRef];
  const capturedAt = evidence.capturedAt ?? null;
  const observedAt = resolveObservedDate({
    capturedAt,
    observedAt: evidence.observedAt ?? evidence.measuredAt ?? null,
    transcript: resolvedTranscript,
  });
  const relativeDateResolution = getRelativeDateResolution({
    baseObservedAt: evidence.observedAt ?? evidence.measuredAt ?? capturedAt,
    resolvedObservedAt: observedAt,
    transcript: resolvedTranscript,
  });
  const hasIntent = (intentName) =>
    detectedEvidenceIntents.some(
      (intent) => intent.detectedPrimaryIntent === intentName
    );
  const hasEvidenceType = (evidenceType) =>
    detectedEvidenceIntents.some((intent) => intent.evidenceType === evidenceType);
  const shouldParseTraining =
    shouldParseEvidenceType(expectedEvidenceType, "training") &&
    (hasEvidenceType("training") || expectedEvidenceType === "training");
  const shouldParseNutrition =
    shouldParseEvidenceType(expectedEvidenceType, "nutrition") &&
    (hasEvidenceType("nutrition") || expectedEvidenceType === "nutrition");
  const shouldParseActivity =
    shouldParseEvidenceType(expectedEvidenceType, "activity_day") &&
    (hasIntent("cardio_workout") || hasEvidenceType("activity_day"));
  const shouldParseWeight =
    shouldParseEvidenceType(expectedEvidenceType, "morning_weight") &&
    (hasEvidenceType("morning_weight") || expectedEvidenceType === "morning_weight");
  const interpreterOutputs = [];
  const trainingSession = shouldParseTraining
    ? recordInterpreterOutput(interpreterOutputs, "Training Interpreter", createVoiceTrainingSession({
        capturedAt,
        detectedEvidenceIntents,
        evidenceId: evidence.id,
        observedAt,
        provenanceRef,
        conversationalResolution,
        resolvedTranscript,
        sourceArtifactRefs,
        transcript,
      }))
    : null;
  const nutritionDay = shouldParseNutrition
    ? recordInterpreterOutput(interpreterOutputs, "Nutrition Interpreter", createVoiceNutritionDay({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        provenanceRef,
        sourceArtifactRefs,
        transcript: clauseSegmentation.clausesConsumedByInterpreter.nutrition.join(" ") || resolvedTranscript,
      }))
    : null;
  const activityDay = shouldParseActivity
    ? recordInterpreterOutput(interpreterOutputs, "Activity Interpreter", createVoiceActivityDay({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        provenanceRef,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const morningWeight = shouldParseWeight
    ? recordInterpreterOutput(interpreterOutputs, "Morning Weight Interpreter", createVoiceMorningWeight({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        provenanceRef,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const recoveryDay = hasEvidenceType("recovery_day")
    ? recordInterpreterOutput(interpreterOutputs, "Recovery Interpreter", createVoiceRecoveryDay({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const protocolCompletion = hasEvidenceType("protocol_completion")
    ? recordInterpreterOutput(interpreterOutputs, "Protocol Interpreter", createVoiceProtocolCompletion({
        capturedAt,
        entityResolution,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const skippedActivity = hasEvidenceType("skipped_activity")
    ? recordInterpreterOutput(interpreterOutputs, "Skipped Activity Interpreter", createVoiceSkippedActivity({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const symptom = hasEvidenceType("health_symptom")
    ? recordInterpreterOutput(interpreterOutputs, "Symptom Interpreter", createVoiceSymptom({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const performanceRecord = hasEvidenceType("performance_record")
    ? recordInterpreterOutput(interpreterOutputs, "Performance Interpreter", createVoicePerformanceRecord({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const upcomingEvent = hasEvidenceType("upcoming_event")
    ? recordInterpreterOutput(interpreterOutputs, "Upcoming Event Interpreter", createVoiceUpcomingEvent({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const goalUpdate = hasEvidenceType("goal_update")
    ? recordInterpreterOutput(interpreterOutputs, "Goal Interpreter", createVoiceGoalUpdate({
        capturedAt,
        evidenceId: evidence.id,
        observedAt,
        sourceArtifactRefs,
        transcript: resolvedTranscript,
      }))
    : null;
  const observation =
    detectedEvidenceIntents.some((intent) => intent.evidenceType === "observation") ||
    (symptom && /felt better|better than yesterday/i.test(resolvedTranscript))
      ? recordInterpreterOutput(interpreterOutputs, "Observation Interpreter", createVoiceObservation({
          capturedAt,
          evidenceId: evidence.id,
          observedAt,
          sourceArtifactRefs,
          transcript: resolvedTranscript,
        }))
      : null;
  const evidenceObjects = [
    morningWeight,
    recoveryDay,
    protocolCompletion,
    nutritionDay,
    activityDay,
    trainingSession,
    skippedActivity,
    symptom,
    performanceRecord,
    upcomingEvent,
    goalUpdate,
    observation,
  ]
    .filter(Boolean)
    .map((object) =>
      attachTranscriptProvenance({
        conversationalResolution,
        object,
        resolvedTranscript,
        sourceArtifactRefs,
        transcript: rawTranscript,
      })
    );
  const mergedEvidenceObjects = mergeVoiceEvidenceObjects(evidenceObjects);
  const numericResilience = analyzeVoiceNumericResilience({
    clauseSegmentation,
    conversationalResolution,
    evidenceObjects: mergedEvidenceObjects,
    resolvedTranscript,
    transcript: rawTranscript,
    dedupedNarrative: transcript,
    repeatedFollowUpFragments: narrativeDeduplication.repeatedFollowUpFragments,
    repeatedNarrativeClauses: narrativeDeduplication.repeatedNarrativeClauses,
    repetitionDedupingApplied: narrativeDeduplication.repetitionDedupingApplied,
    semanticClauseDedupingApplied:
      narrativeDeduplication.semanticClauseDedupingApplied,
    semanticClauseDedupingReason:
      narrativeDeduplication.semanticClauseDedupingReason,
    narrativeDeduplication,
  });

  return {
    sourceId: evidence.id ?? "",
    sourceType: "voice",
    transcript: rawTranscript,
    dedupedNarrative: transcript,
    completionPhraseDetectedInOriginalTranscript: terminalCompletion,
    completionPhraseStrippedFromEvidenceTranscript:
      terminalCompletion.detected &&
      terminalCompletion.evidenceTranscript !== rawTranscript,
    userEndedInteraction: terminalCompletion.detected,
    conversationState: terminalCompletion.detected ? "saved" : "interpreted",
    repeatedFollowUpFragments: narrativeDeduplication.repeatedFollowUpFragments,
    repeatedNarrativeClauses: narrativeDeduplication.repeatedNarrativeClauses,
    repetitionDedupingApplied: narrativeDeduplication.repetitionDedupingApplied,
    semanticClauseDedupingApplied:
      narrativeDeduplication.semanticClauseDedupingApplied,
    semanticClauseDedupingReason:
      narrativeDeduplication.semanticClauseDedupingReason,
    narrativeDeduplication,
    primaryIntent,
    detectedEvidenceIntents,
    clauseSegmentation,
    narrativeGlueSuppressed,
    falseActivityFromWalkedHomeSuppressed: narrativeGlueSuppressed,
    detectedPrimaryIntent: primaryIntent.detectedPrimaryIntent,
    intentConfidence: primaryIntent.intentConfidence,
    entityResolution,
    relativeDateResolution,
    resolvedTranscript,
    conversationalResolution,
    facts: rawTranscript ? [rawTranscript] : [],
    evidenceObjects: mergedEvidenceObjects,
    numericAmbiguities: numericResilience.numericAmbiguities,
    suspiciousNumericValues: numericResilience.suspiciousNumericValues,
    domainPlausibilityChecks: numericResilience.domainPlausibilityChecks,
    acceptedNumericCorrections: numericResilience.acceptedNumericCorrections,
    rejectedNumericValues: numericResilience.rejectedNumericValues,
    activePromptContextApplied: numericResilience.activePromptContextApplied,
    activePromptContextRejected: numericResilience.activePromptContextRejected,
    strongDomainAnchorOverrodeActivePromptContext:
      numericResilience.strongDomainAnchorOverrodeActivePromptContext,
    transcriptionConfidenceNotes: numericResilience.transcriptionConfidenceNotes,
    numericResilience,
    interpreterOutputs,
    mergedEvidenceObjects,
    observations: [],
    recommendations: [],
    clarificationOpportunities: [],
    confidence: mergedEvidenceObjects.length > 0 ? "moderate" : "pending",
    evidenceLifetime: getEvidenceLifetimeSummary(mergedEvidenceObjects),
    status: mergedEvidenceObjects.length > 0 ? "structured" : "stub",
  };
}

function recordInterpreterOutput(outputs, interpreter, evidenceObject) {
  outputs.push({
    interpreter,
    evidence_type: evidenceObject?.evidence_type ?? null,
    object_id: evidenceObject?.id ?? null,
    status: evidenceObject ? "created" : "no_object",
  });

  return evidenceObject;
}

function createVoiceTrainingSession({
  capturedAt,
  conversationalResolution,
  evidenceId,
  observedAt,
  provenanceRef,
  resolvedTranscript,
  sourceArtifactRefs,
  transcript,
}) {
  const trainingSession = createTrainingSessionEvidenceFromText({
    capturedAt,
    id: evidenceId ? `${evidenceId}_training_session` : "voice_training_session",
    observedAt,
    provenanceRef,
    sourceArtifactRefs,
    sourceModality: "voice",
    text: normalizeVoiceStrengthSetPhrases(resolvedTranscript),
  });

  if (trainingSession) {
    const sentenceExercises = parseVoiceTrainingExerciseSentences(resolvedTranscript, {
      provenanceRef,
    });
    return enrichVoiceTrainingSession({
      ...trainingSession,
      exercises: sortTrainingExercisesByTranscript(mergeTrainingExercisesByIdentity([
        ...(trainingSession.exercises ?? []),
        ...sentenceExercises,
      ]), resolvedTranscript),
    }, {
      conversationalResolution,
      transcript: resolvedTranscript,
    });
  }
  if (!hasTrainingIntent(resolvedTranscript)) return null;

  const activityType = inferVoiceActivityType(resolvedTranscript);
  const fallbackTrainingSession = createTrainingSessionEvidenceObject({
    capturedAt,
    confidence: {
      extraction: "low",
      interpretation: "moderate",
    },
    id: evidenceId ? `${evidenceId}_training_session` : "voice_training_session",
    metadata: {
      activity_type: activityType,
      active_calories: extractActiveCalories(resolvedTranscript),
      distance: extractDistance(resolvedTranscript)?.value ?? null,
      distance_unit: extractDistance(resolvedTranscript)?.unit ?? null,
      duration_seconds: extractDurationSeconds(resolvedTranscript),
      effort_level: extractEffortLevel(resolvedTranscript),
      average_pace:
        activityType === "Traditional Strength Training"
          ? null
          : extractPaceDescriptor(resolvedTranscript),
      workout_focus: inferWorkoutFocus(resolvedTranscript),
    },
    observedAt,
    quality: {
      status: "partial",
      limitations: [
        "Voice evidence captured a workout, but exercise details were not provided.",
      ],
    },
    source: {
      modality: "voice",
      application: "Voice",
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
  });

  return enrichVoiceTrainingSession(fallbackTrainingSession, {
    conversationalResolution,
    transcript: resolvedTranscript,
  });
}

function parseVoiceTrainingExerciseSentences(transcript, { provenanceRef }) {
  return transcript
    .split(/[.!?]+/)
    .flatMap((sentence) =>
      parseStrengthTrainingText(normalizeVoiceStrengthSetPhrases(sentence), {
        provenanceRef,
      })
    );
}

function mergeTrainingExercisesByIdentity(exercises) {
  const byId = new Map();
  exercises.forEach((exercise) => {
    const key = exercise.id ?? exercise.name;
    const existing = byId.get(key);
    if (!existing || (exercise.sets ?? []).length > (existing.sets ?? []).length) {
      byId.set(key, exercise);
    }
  });
  return [...byId.values()];
}

function sortTrainingExercisesByTranscript(exercises, transcript) {
  const normalized = transcript.toLowerCase().replace(/-/g, " ");
  return [...exercises].sort((left, right) => {
    const leftIndex = findExerciseMentionIndex(normalized, left.name);
    const rightIndex = findExerciseMentionIndex(normalized, right.name);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

function findExerciseMentionIndex(transcript, name) {
  const normalizedName = name.toLowerCase().replace(/-/g, " ");
  const exact = transcript.indexOf(normalizedName);
  return exact >= 0 ? exact : transcript.indexOf(`${normalizedName}s`);
}

function normalizeVoiceStrengthSetPhrases(transcript = "") {
  const normalizedPairs = transcript.replace(
    /\b(\d+)\s+at\s+(\d+(?:\.\d+)?)(?=\s*(?:,|\.|and\b|$))/gi,
    "$1 reps at $2"
  );

  return normalizedPairs.replace(
    /\b(iso[-\s]?lateral\s+high\s+rows?)\s*,?\s*([^.]*)/gi,
    (_match, _exercise, prescription) => {
      const sets = [...prescription.matchAll(/(\d+)\s+reps?\s+at\s+(\d+(?:\.\d+)?)/gi)]
        .map((set) => `${set[1]} x #${set[2]}`);

      return sets.length >= 2
        ? `\n\nIso-Lateral High Row\n${sets.join("\n")}\n\n`
        : _match;
    }
  );
}

function createVoiceNutritionDay({
  capturedAt,
  evidenceId,
  observedAt,
  provenanceRef,
  sourceArtifactRefs,
  transcript,
}) {
  const foodCleanup = cleanVoiceFoodPhraseForExtraction(transcript);
  const foods = extractVoiceFoods(transcript, { provenanceRef });
  const macroContext = extractNutritionMacrosFromMealContext(transcript);
  const macrosKnown = hasKnownNutritionMacros(macroContext.totals);
  const foodKnown = foods.length > 0;
  const nutritionDay = createNutritionDayEvidenceFromText({
    capturedAt,
    date: observedAt,
    id: evidenceId ? `${evidenceId}_nutrition_day` : "voice_nutrition_day",
    provenanceRef,
    sourceArtifactRefs,
    sourceModality: "voice",
    text: transcript,
  });

  if (nutritionDay) {
    return enrichVoiceNutritionDay({
      foods,
      macroContext,
      nutritionDay,
      provenanceRef,
      transcript,
    });
  }

  if (foods.length === 0) return null;

  const fallbackNutritionDay = createNutritionDayEvidenceObject({
    capturedAt,
    dailyTotals: macroContext.totals,
    date: observedAt,
    id: evidenceId ? `${evidenceId}_nutrition_day` : "voice_nutrition_day",
    meals: [
      {
        id: "voice_meal",
        name: inferMealName(transcript),
        completeness: "partial",
        foods,
        totals: macroContext.totals,
        provenance_ref: provenanceRef,
      },
    ],
    metadata: {
      completeness: "partial",
      nutrition_food_clause_cleaned: hasNutritionFoodClauseCleanup(transcript),
      nutrition_food_phrase_cleaned_from: foodCleanup.cleanedFrom,
      nutrition_food_phrase_cleaned_to: foodCleanup.cleanedTo,
      nutritionFoodPhraseCleanedFrom: foodCleanup.cleanedFrom,
      nutritionFoodPhraseCleanedTo: foodCleanup.cleanedTo,
      nutrition_macros_extracted_from_meal_context: macroContext.extracted,
      nutrition_prompt_suppressed_because_food_known: foodKnown,
      nutritionPromptSuppressedBecauseFoodKnown: foodKnown,
      nutrition_prompt_suppressed_because_macros_known:
        foodKnown && macrosKnown,
      nutritionPromptSuppressedBecauseMacrosKnown:
        foodKnown && macrosKnown,
    },
    quality: {
      status: "partial",
      limitations: [
        "Voice nutrition evidence captured foods without full daily totals.",
      ],
    },
    source: {
      modality: "voice",
      application: "Voice",
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
    confidence: {
      extraction: macroContext.approximate ? "moderate" : "high",
      interpretation: "moderate",
    },
  });

  return {
    ...fallbackNutritionDay,
    voice_interpretation: {
      nutrition_food_clause_cleaned: hasNutritionFoodClauseCleanup(transcript),
      nutrition_food_phrase_cleaned_from: foodCleanup.cleanedFrom,
      nutrition_food_phrase_cleaned_to: foodCleanup.cleanedTo,
      nutritionFoodPhraseCleanedFrom: foodCleanup.cleanedFrom,
      nutritionFoodPhraseCleanedTo: foodCleanup.cleanedTo,
      nutrition_prompt_suppressed_because_food_known: foodKnown,
      nutritionPromptSuppressedBecauseFoodKnown: foodKnown,
      nutrition_prompt_suppressed_because_macros_known:
        foodKnown && macrosKnown,
      nutritionPromptSuppressedBecauseMacrosKnown:
        foodKnown && macrosKnown,
      macro_context_protected_from_activity:
        hasMealMacroContext(transcript) &&
        isNutritionMacroClauseWithoutActivityContext(transcript),
      macroContextProtectedFromActivity:
        hasMealMacroContext(transcript) &&
        isNutritionMacroClauseWithoutActivityContext(transcript),
      false_activity_from_walked_home_suppressed: hasIncidentalWalkHome(transcript),
    },
  };
}

function enrichVoiceNutritionDay({
  foods = [],
  macroContext,
  nutritionDay,
  provenanceRef,
  transcript,
}) {
  const foodCleanup = cleanVoiceFoodPhraseForExtraction(transcript);
  const mergedTotals = {
    ...(nutritionDay.daily_totals ?? {}),
    ...macroContext.totals,
  };
  const hasMealFoods =
    (nutritionDay.meals ?? []).flatMap((meal) => meal.foods ?? []).length > 0;
  const shouldUseCleanedVoiceFoods =
    foods.length > 0 && hasNutritionFoodClauseCleanup(transcript);
  const meals =
    shouldUseCleanedVoiceFoods
      ? [
          {
            id: "voice_meal",
            name: inferMealName(transcript),
            completeness: "partial",
            foods,
            totals: macroContext.totals,
            provenance_ref: provenanceRef,
          },
        ]
      : hasMealFoods || foods.length === 0
        ? nutritionDay.meals
        : [
          ...(nutritionDay.meals ?? []),
          {
            id: "voice_meal",
            name: inferMealName(transcript),
            completeness: "partial",
            foods,
            totals: macroContext.totals,
            provenance_ref: provenanceRef,
          },
        ];
  const nutritionPromptSuppressedBecauseMacrosKnown =
    foods.length > 0 && hasKnownNutritionMacros(macroContext.totals);
  const nutritionPromptSuppressedBecauseFoodKnown = foods.length > 0;

  return {
    ...nutritionDay,
    daily_totals: {
      ...(nutritionDay.daily_totals ?? {}),
      ...macroContext.totals,
    },
    meals,
    metadata: {
      ...(nutritionDay.metadata ?? {}),
      food_count: Math.max(
        nutritionDay.metadata?.food_count ?? 0,
        foods.length
      ),
      meal_count: meals.length,
      nutrition_macros_extracted_from_meal_context: macroContext.extracted,
      nutrition_food_phrase_cleaned_from: foodCleanup.cleanedFrom,
      nutrition_food_phrase_cleaned_to: foodCleanup.cleanedTo,
      nutritionFoodPhraseCleanedFrom: foodCleanup.cleanedFrom,
      nutritionFoodPhraseCleanedTo: foodCleanup.cleanedTo,
      nutrition_prompt_suppressed_because_food_known:
        nutritionPromptSuppressedBecauseFoodKnown,
      nutritionPromptSuppressedBecauseFoodKnown:
        nutritionPromptSuppressedBecauseFoodKnown,
      nutrition_prompt_suppressed_because_macros_known:
        nutritionPromptSuppressedBecauseMacrosKnown,
      nutritionPromptSuppressedBecauseMacrosKnown:
        nutritionPromptSuppressedBecauseMacrosKnown,
    },
    voice_interpretation: {
      ...(nutritionDay.voice_interpretation ?? {}),
      nutrition_food_clause_cleaned: hasNutritionFoodClauseCleanup(transcript),
      nutrition_food_phrase_cleaned_from: foodCleanup.cleanedFrom,
      nutrition_food_phrase_cleaned_to: foodCleanup.cleanedTo,
      nutritionFoodPhraseCleanedFrom: foodCleanup.cleanedFrom,
      nutritionFoodPhraseCleanedTo: foodCleanup.cleanedTo,
      nutrition_macros_extracted_from_meal_context: macroContext.extracted,
      nutrition_prompt_suppressed_because_macros_known:
        nutritionPromptSuppressedBecauseMacrosKnown,
      nutritionPromptSuppressedBecauseMacrosKnown:
        nutritionPromptSuppressedBecauseMacrosKnown,
      nutrition_prompt_suppressed_because_food_known:
        nutritionPromptSuppressedBecauseFoodKnown,
      nutritionPromptSuppressedBecauseFoodKnown:
        nutritionPromptSuppressedBecauseFoodKnown,
      macro_context_protected_from_activity:
        hasMealMacroContext(transcript) &&
        isNutritionMacroClauseWithoutActivityContext(transcript),
      macroContextProtectedFromActivity:
        hasMealMacroContext(transcript) &&
        isNutritionMacroClauseWithoutActivityContext(transcript),
      false_activity_from_walked_home_suppressed: hasIncidentalWalkHome(transcript),
    },
  };
}

function hasKnownNutritionMacros(totals = {}) {
  return (
    Number.isFinite(Number(totals.calories)) &&
    Number.isFinite(Number(totals.protein_g))
  );
}

function hasNutritionFoodClauseCleanup(transcript) {
  return (
    /\bcame home|went home|got home|headed home|drove home\b/i.test(transcript) ||
    /\bfor\s+(?:breakfast|lunch|dinner|snack)\b/i.test(transcript) ||
    /\bthe\s+(?:burger|meal|food)\s+was\b/i.test(transcript)
  );
}

function createVoiceActivityDay({
  capturedAt,
  evidenceId,
  observedAt,
  provenanceRef,
  sourceArtifactRefs,
  transcript,
}) {
  const durationSeconds = extractDurationSeconds(transcript);
  const activeCalories = extractActiveCalories(transcript);

  if (!hasActivityIntent(transcript) && !durationSeconds && !activeCalories) {
    return null;
  }

  const exerciseMinutes = durationSeconds
    ? Math.round(durationSeconds / 60)
    : null;

  return createActivityDayEvidenceObject({
    capturedAt,
    confidence: {
      extraction: "moderate",
      interpretation: "moderate",
    },
    dailyActivity: {
      exercise_minutes: exerciseMinutes,
      move_calories: activeCalories,
    },
    date: observedAt,
    derivedMetrics: {
      workout_active_calories: 0,
      non_workout_active_calories: activeCalories,
      training_sessions_referenced: 0,
    },
    id: evidenceId ? `${evidenceId}_activity_day` : "voice_activity_day",
    metadata: {
      confidence: "moderate",
    },
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
    quality: {
      status: "partial",
      limitations: [
        "Voice activity evidence captured daily movement without a connected activity source.",
      ],
    },
    references: {
      training_session_ids: [],
    },
    source: {
      modality: "voice",
      application: "Voice",
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
  });
}

function createVoiceMorningWeight({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  const weight = extractMorningWeight(transcript);
  if (!weight) return null;

  return {
    id: evidenceId ? `${evidenceId}_morning_weight` : "voice_morning_weight",
    evidence_type: "morning_weight",
    observed_at: observedAt,
    captured_at: capturedAt,
    source: {
      modality: "voice",
      application: "Voice",
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
    metadata: {
      measurement_context: /morning|this morning|weighed in/i.test(transcript)
        ? "morning"
        : "unspecified",
      value: weight.value,
      unit: weight.unit,
    },
    weight: {
      value: weight.value,
      unit: weight.unit,
    },
    confidence: {
      extraction: "high",
      interpretation: /morning|this morning|weighed in/i.test(transcript)
        ? "high"
        : "moderate",
    },
    quality: {
      status: "partial",
      limitations: /morning|this morning|weighed in/i.test(transcript)
        ? []
        : ["Voice evidence captured a weight without explicit morning context."],
    },
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
  };
}

function createVoiceProtocolCompletion({
  capturedAt,
  entityResolution,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  const entity = entityResolution?.resolved_entities?.[0] ?? null;
  const status = /\b(forgot|missed|skipped)\b/i.test(transcript)
    ? "missed"
    : "completed";
  const protocolEntity =
    entity?.accepted_canonical_name ?? extractProtocolEntityName(transcript);

  if (!protocolEntity) return null;

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: entity
      ? { extraction: "high", interpretation: "high" }
      : { extraction: "moderate", interpretation: "moderate" },
    evidenceId: evidenceId
      ? `${evidenceId}_protocol_completion`
      : "voice_protocol_completion",
    evidenceLifetime: "ephemeral",
    evidenceType: "protocol_completion",
    metadata: {
      protocol_entity: protocolEntity,
      original_entity_language: entity?.original_language ?? protocolEntity,
      status,
      entity_resolution: entity,
    },
    observedAt,
    quality: {
      status: entity ? "complete" : "partial",
      limitations: entity
        ? []
        : ["Voice evidence named a protocol item without a high-confidence canonical match."],
    },
    sourceArtifactRefs,
  });
}

function createVoiceSkippedActivity({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  const activity = extractSkippedActivityName(transcript);
  if (!activity) return null;

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: { extraction: "high", interpretation: "high" },
    evidenceId: evidenceId ? `${evidenceId}_skipped_activity` : "voice_skipped_activity",
    evidenceLifetime: "ephemeral",
    evidenceType: "skipped_activity",
    metadata: {
      activity,
      status: "skipped",
    },
    observedAt,
    quality: {
      status: "complete",
      limitations: [],
    },
    sourceArtifactRefs,
  });
}

function createVoiceRecoveryDay({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  const sleepDurationSeconds = extractDurationSeconds(transcript);
  if (!sleepDurationSeconds && !/\b(sleep|slept|recovery|hrv|readiness)\b/i.test(transcript)) {
    return null;
  }

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: sleepDurationSeconds
      ? { extraction: "high", interpretation: "moderate" }
      : { extraction: "moderate", interpretation: "low" },
    evidenceId: evidenceId ? `${evidenceId}_recovery_day` : "voice_recovery_day",
    evidenceLifetime: "persistent_narrative",
    evidenceType: "recovery_day",
    metadata: {
      sleep_duration_seconds: sleepDurationSeconds,
      sleep_hours: sleepDurationSeconds
        ? Math.round((sleepDurationSeconds / 3600) * 10) / 10
        : null,
    },
    observedAt,
    quality: {
      status: sleepDurationSeconds ? "partial" : "limited",
      limitations: sleepDurationSeconds
        ? []
        : ["Voice evidence mentioned recovery without a clear duration."],
    },
    sourceArtifactRefs,
  });
}

function createVoiceSymptom({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  if (!/\b(bothering|hurt|hurts|pain|sore|ache|aching|barking|feeling well|felt well|felt better|better than yesterday)\b/i.test(transcript)) {
    return null;
  }

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: { extraction: "high", interpretation: "moderate" },
    evidenceId: evidenceId ? `${evidenceId}_symptom` : "voice_symptom",
    evidenceLifetime: "persistent_narrative",
    evidenceType: "health_symptom",
    metadata: {
      body_location: extractBodyLocation(transcript),
      duration: extractSymptomDuration(transcript),
      duration_inferred_from_today: hasTodaySymptomContext(transcript),
      severity: extractSymptomSeverity(transcript),
      status: /felt better|better than yesterday|improving/i.test(transcript)
        ? "improving"
        : "present",
      trigger_context: extractSymptomTrigger(transcript),
      trigger_context_unknown: hasUnknownTriggerContext(transcript),
    },
    observedAt,
    quality: {
      status: extractBodyLocation(transcript) ? "partial" : "limited",
      limitations: extractBodyLocation(transcript)
        ? []
        : ["Voice evidence captured a symptom without a clear body location."],
    },
    sourceArtifactRefs,
  });
}

function createVoicePerformanceRecord({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  const record = extractPerformanceRecord(transcript);
  if (!record) return null;

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: { extraction: "high", interpretation: "high" },
    evidenceId: evidenceId
      ? `${evidenceId}_performance_record`
      : "voice_performance_record",
    evidenceLifetime: "permanent",
    evidenceType: "performance_record",
    metadata: record,
    observedAt,
    quality: {
      status: "complete",
      limitations: [],
    },
    sourceArtifactRefs,
  });
}

function createVoiceUpcomingEvent({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  if (!/\b(scheduled|appointment|traveling|travel|trip|next\s+\w+|through\s+\w+)\b/i.test(transcript)) {
    return null;
  }

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: { extraction: "moderate", interpretation: "moderate" },
    evidenceId: evidenceId ? `${evidenceId}_upcoming_event` : "voice_upcoming_event",
    evidenceLifetime: "active",
    evidenceType: "upcoming_event",
    metadata: {
      event_type: /dexa/i.test(transcript)
        ? "DEXA"
        : /travel|trip/i.test(transcript)
          ? "Travel"
          : "Upcoming Event",
      date_phrase: extractDatePhrase(transcript),
      expected_training_impact: /won'?t\s+be\s+working\s+out|skip|miss/i.test(transcript)
        ? "training_interruption"
        : null,
    },
    observedAt,
    quality: {
      status: "partial",
      limitations: ["Voice evidence captured an upcoming event before scheduling support is complete."],
    },
    sourceArtifactRefs,
  });
}

function createVoiceGoalUpdate({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  const goal = extractGoalName(transcript);
  if (!goal) return null;

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: { extraction: "high", interpretation: "moderate" },
    evidenceId: evidenceId ? `${evidenceId}_goal_update` : "voice_goal_update",
    evidenceLifetime: "permanent",
    evidenceType: "goal_update",
    metadata: {
      goal,
      status: "expressed",
    },
    observedAt,
    quality: {
      status: "partial",
      limitations: ["Goal role may need confirmation before changing the active goal stack."],
    },
    sourceArtifactRefs,
  });
}

function createVoiceObservation({
  capturedAt,
  evidenceId,
  observedAt,
  sourceArtifactRefs,
  transcript,
}) {
  if (!transcript) return null;

  return createSimpleVoiceEvidenceObject({
    capturedAt,
    confidence: { extraction: "moderate", interpretation: "moderate" },
    evidenceId: evidenceId ? `${evidenceId}_observation` : "voice_observation",
    evidenceLifetime: "persistent_narrative",
    evidenceType: "observation",
    metadata: {
      observation: transcript,
      body_location: extractBodyLocation(transcript),
    },
    observedAt,
    quality: {
      status: "partial",
      limitations: [],
    },
    sourceArtifactRefs,
  });
}

function createSimpleVoiceEvidenceObject({
  capturedAt,
  confidence,
  evidenceId,
  evidenceLifetime,
  evidenceType,
  metadata,
  observedAt,
  quality,
  sourceArtifactRefs,
}) {
  return {
    id: evidenceId,
    evidence_type: evidenceType,
    evidence_lifetime: evidenceLifetime,
    observed_at: observedAt,
    captured_at: capturedAt,
    source: {
      modality: "voice",
      application: "Voice",
      integration: null,
      source_artifact_refs: sourceArtifactRefs,
    },
    metadata: {
      ...(metadata ?? {}),
      evidence_lifetime: evidenceLifetime,
    },
    confidence,
    quality,
    provenance: {
      source_artifact_refs: sourceArtifactRefs,
    },
  };
}

function enrichVoiceTrainingSession(
  trainingSession,
  { conversationalResolution, transcript }
) {
  const workoutFocus =
    trainingSession.metadata?.workout_focus ?? inferWorkoutFocus(transcript);
  const focusedExercises = applyVoiceWorkoutFocusToExercises(
    trainingSession.exercises ?? [],
    { workoutFocus }
  );
  const focusedTrainingSession = {
    ...trainingSession,
    exercises: focusedExercises,
  };
  const focusedParserDebug = createVoiceTrainingParserDebug({
    conversationalResolution,
    trainingSession: focusedTrainingSession,
    transcript,
  });

  return {
    ...focusedTrainingSession,
    metadata: {
      ...(focusedTrainingSession.metadata ?? {}),
      effort_level:
        focusedTrainingSession.metadata?.effort_level ?? extractEffortLevel(transcript),
      workout_focus: workoutFocus,
    },
    voice_interpretation: {
      conversational_resolution: conversationalResolution,
      correction_resolution_by_clause: focusedParserDebug.correctionResolutionByClause,
      dropped_or_overwritten_exercises: [],
      dropped_clauses: focusedParserDebug.droppedClauses,
      exercise_ontology_match: focusedParserDebug.exerciseOntologyMatch,
      exercise_ontology_matches: focusedParserDebug.exerciseOntologyMatches,
      exercise_alias_matched: focusedParserDebug.exerciseAliasMatched,
      exercise_alias_canonicalized_to:
        focusedParserDebug.exerciseAliasCanonicalizedTo,
      exerciseAliasMatched: focusedParserDebug.exerciseAliasMatched,
      exerciseAliasCanonicalizedTo:
        focusedParserDebug.exerciseAliasCanonicalizedTo,
      exercise_created_from_alias_clause:
        focusedParserDebug.exerciseCreatedFromAliasClause,
      exerciseCreatedFromAliasClause:
        focusedParserDebug.exerciseCreatedFromAliasClause,
      exercise_prescription_pattern_matched:
        focusedParserDebug.exercisePrescriptionPatternMatched,
      exercisePrescriptionPatternMatched:
        focusedParserDebug.exercisePrescriptionPatternMatched,
      exercise_numeric_details_attached:
        focusedParserDebug.exerciseNumericDetailsAttached,
      exerciseNumericDetailsAttached:
        focusedParserDebug.exerciseNumericDetailsAttached,
      exercise_prescription_hydration:
        focusedParserDebug.exercisePrescriptionHydration,
      exercisePrescriptionHydration:
        focusedParserDebug.exercisePrescriptionHydration,
      exercise_prescription_fields_survived:
        focusedParserDebug.exercisePrescriptionFieldsSurvived,
      exercisePrescriptionFieldsSurvived:
        focusedParserDebug.exercisePrescriptionFieldsSurvived,
      exercise_parse_failed: focusedParserDebug.exerciseParseFailed,
      exercise_transition_phrase_detected:
        focusedParserDebug.exerciseTransitionPhraseDetected,
      exerciseTransitionPhraseDetected:
        focusedParserDebug.exerciseTransitionPhraseDetected,
      exercise_transition_phrase: focusedParserDebug.exerciseTransitionPhrase,
      exerciseTransitionPhrase: focusedParserDebug.exerciseTransitionPhrase,
      exercise_block_started_from_transition:
        focusedParserDebug.exerciseBlockStartedFromTransition,
      exerciseBlockStartedFromTransition:
        focusedParserDebug.exerciseBlockStartedFromTransition,
      transition_exercise_canonicalized_to:
        focusedParserDebug.transitionExerciseCanonicalizedTo,
      transitionExerciseCanonicalizedTo:
        focusedParserDebug.transitionExerciseCanonicalizedTo,
      numeric_prescription_attached_to_transition_exercise:
        focusedParserDebug.numericPrescriptionAttachedToTransitionExercise,
      numericPrescriptionAttachedToTransitionExercise:
        focusedParserDebug.numericPrescriptionAttachedToTransitionExercise,
      exercise_prescription_source_clauses:
        focusedParserDebug.exercisePrescriptionSourceClauses,
      exercisePrescriptionSourceClauses:
        focusedParserDebug.exercisePrescriptionSourceClauses,
      sets_reps_of_weight_pattern_matched:
        focusedParserDebug.setsRepsOfWeightPatternMatched,
      setsRepsOfWeightPatternMatched:
        focusedParserDebug.setsRepsOfWeightPatternMatched,
      weight_recovered_from_unusual_order:
        focusedParserDebug.weightRecoveredFromUnusualOrder,
      weightRecoveredFromUnusualOrder:
        focusedParserDebug.weightRecoveredFromUnusualOrder,
      inferred_exercise_details_from_nearby_clause:
        focusedParserDebug.inferredExerciseDetailsFromNearbyClause,
      clause_split_strategy: focusedParserDebug.clauseSplitStrategy,
      matched_parser_patterns: focusedParserDebug.matchedParserPatterns,
      nearest_exercise_backfill_applied:
        focusedParserDebug.nearestExerciseBackfillApplied,
      recognized_exercise_mentions:
        focusedParserDebug.recognizedExerciseMentions,
      recognizedExerciseMentions:
        focusedParserDebug.recognizedExerciseMentions,
      exercise_blocks: focusedParserDebug.exerciseBlocks,
      exerciseBlocks: focusedParserDebug.exerciseBlocks,
      exercise_boundary_reasons:
        focusedParserDebug.exerciseBoundaryReasons,
      exerciseBoundaryReasons:
        focusedParserDebug.exerciseBoundaryReasons,
      exercise_name_refinements:
        focusedParserDebug.exerciseNameRefinements,
      exerciseNameRefinements:
        focusedParserDebug.exerciseNameRefinements,
      pending_exercise_backfills:
        focusedParserDebug.pendingExerciseBackfills,
      pendingExerciseBackfills:
        focusedParserDebug.pendingExerciseBackfills,
      pending_heading_attachments:
        focusedParserDebug.pendingHeadingAttachments,
      pendingHeadingAttachments:
        focusedParserDebug.pendingHeadingAttachments,
      shared_prescription_assignments:
        focusedParserDebug.sharedPrescriptionAssignments,
      sharedPrescriptionAssignments:
        focusedParserDebug.sharedPrescriptionAssignments,
      declared_set_count_mismatches:
        focusedParserDebug.declaredSetCountMismatches,
      declaredSetCountMismatches:
        focusedParserDebug.declaredSetCountMismatches,
      canonical_exercise_completeness:
        focusedParserDebug.canonicalExerciseCompleteness,
      canonicalExerciseCompleteness:
        focusedParserDebug.canonicalExerciseCompleteness,
      exercise_completeness:
        focusedParserDebug.exerciseCompleteness,
      exerciseCompleteness:
        focusedParserDebug.exerciseCompleteness,
      missing_evidence_claims:
        focusedParserDebug.missingEvidenceClaims,
      missingEvidenceClaims:
        focusedParserDebug.missingEvidenceClaims,
      malformed_exercise_name_prevented:
        focusedParserDebug.malformedExerciseNamePrevented,
      malformedExerciseNamePrevented:
        focusedParserDebug.malformedExerciseNamePrevented,
      implicit_exercise_anchors:
        focusedParserDebug.implicitExerciseAnchors,
      implicitExerciseAnchors:
        focusedParserDebug.implicitExerciseAnchors,
      orphan_prescription_candidates:
        focusedParserDebug.orphanPrescriptionCandidates,
      orphanPrescriptionCandidates:
        focusedParserDebug.orphanPrescriptionCandidates,
      exercise_bearing_grammar_matches:
        focusedParserDebug.exerciseBearingGrammarMatches,
      exerciseBearingGrammarMatches:
        focusedParserDebug.exerciseBearingGrammarMatches,
      numeric_token_role_assignments:
        focusedParserDebug.numericTokenRoleAssignments,
      numericTokenRoleAssignments:
        focusedParserDebug.numericTokenRoleAssignments,
      bodyweight_training_routing_protection:
        focusedParserDebug.bodyweightTrainingRoutingProtection,
      bodyweightTrainingRoutingProtection:
        focusedParserDebug.bodyweightTrainingRoutingProtection,
      ontology_candidate_ranking:
        focusedParserDebug.ontologyCandidateRanking,
      ontologyCandidateRanking:
        focusedParserDebug.ontologyCandidateRanking,
      focused_exercise_clarification_reason:
        focusedParserDebug.focusedExerciseClarificationReason,
      focusedExerciseClarificationReason:
        focusedParserDebug.focusedExerciseClarificationReason,
      parsed_exercise_clauses: focusedParserDebug.parsedExerciseClauses,
      parser_pattern_matched: focusedParserDebug.parserPatternMatched,
      pronoun_exercise_backfill_applied:
        focusedParserDebug.pronounExerciseBackfillApplied,
      exercise_heading_backfill_applied:
        focusedParserDebug.exerciseHeadingBackfillApplied,
      raw_exercise_clauses: focusedParserDebug.rawExerciseClauses,
      unmatched_clauses: focusedParserDebug.unmatchedClauses,
      effort_phrase_mapped: Boolean(extractEffortPhraseSource(transcript)),
      effort_phrase_source: extractEffortPhraseSource(transcript),
      macro_context_protected_from_activity: hasMealMacroContext(transcript),
      false_activity_from_walked_home_suppressed: hasIncidentalWalkHome(transcript),
      narrative_glue_suppressed: hasNarrativeGlueSuppression(transcript),
      narrativeGlueSuppressed: hasNarrativeGlueSuppression(transcript),
    },
  };
}

function createVoiceTrainingParserDebug({
  conversationalResolution,
  trainingSession,
  transcript,
}) {
  const firstExercise = trainingSession.exercises?.[0] ?? null;
  const blockDiagnostics = getStrengthTrainingBlockParseDiagnostics(transcript);
  const rawExerciseClauses = getVoiceExerciseClauses(transcript);
  const parsedExerciseClauses = getParsedExerciseClauses({
    exercises: trainingSession.exercises ?? [],
    rawExerciseClauses,
    transcript,
  });
  const unmatchedClauses = rawExerciseClauses
    .filter(
      (clause) =>
        !parsedExerciseClauses.some((parsedClause) => parsedClause.clause === clause) &&
        !isNumericPrescriptionOnlyClause(clause) &&
        !isClauseConsumedByStrengthBlockDiagnostics(clause, blockDiagnostics)
    )
    .map((clause) => ({
      clause,
      reason: "No parsed exercise matched this clause.",
    }));
  const hasSetsRepsOnExercise = /\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+(?:on|for|with)\s+/i.test(
    normalizeNumberWords(transcript)
  );
  const hasSetsRepsWeightOnExercise = /\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+(?:at|with)\s+\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)\s+(?:on|for|with)\s+/i.test(
    normalizeNumberWords(transcript)
  );
  const hasSetsRepsOfWeightOnExercise = /\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+of\s+\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)?\s+(?:on|for|with)\s+/i.test(
    normalizeNumberWords(transcript)
  );
  const hasAcceptedLoad = conversationalResolution.accepted_values?.some(
    (value) => value.applies_to === "shoulder press machine load"
  );
  const exerciseOntologyMatches = (trainingSession.exercises ?? []).map(
    (exercise) => ({
      body_region: exercise.body_region,
      exercise: exercise.name,
      movement_pattern: exercise.movement_pattern,
      ontology_confidence: exercise.ontology_confidence ?? "high",
      primary_muscle_groups: exercise.primary_muscle_groups ?? [],
      secondary_muscle_groups: exercise.secondary_muscle_groups ?? [],
    })
  );
  const matchedParserPatterns = parsedExerciseClauses.map((clause) => ({
    clause: clause.clause,
    exercise: clause.exercise,
    pattern: clause.pattern,
  }));
  const exerciseAliasCanonicalization =
    detectExerciseAliasCanonicalization(transcript);
  const transition = detectExerciseTransitionPhrase(transcript);
  const transitionExercise = transition
    ? (trainingSession.exercises ?? []).find((exercise) =>
        clauseMentionsExercise(transition.followingText, exercise.name)
      ) ?? null
    : null;
  const inferredExerciseDetailsFromNearbyClause =
    getInferredExerciseDetailsFromNearbyClause({
      exercises: trainingSession.exercises ?? [],
      rawExerciseClauses,
      transcript,
    });
  const exercisePrescriptionHydration = getExercisePrescriptionHydration({
    exercises: trainingSession.exercises ?? [],
    parsedExerciseClauses,
  });
  const weightedPrescriptionHydration = exercisePrescriptionHydration.filter(
    (entry) => Number.isFinite(entry.parsed_prescription?.weight)
  );
  const exercisePrescriptionFieldsSurvived =
    exercisePrescriptionHydration.length === 0
      ? null
      : exercisePrescriptionHydration.every(
          (entry) => entry.all_parsed_fields_survived
        );

  return {
    clauseSplitStrategy:
      "strength_training_prescription_clauses_v1",
    correctionResolutionByClause: getCorrectionResolutionByClause({
      conversationalResolution,
      transcript,
    }),
    droppedClauses: [],
    exerciseParseFailed:
      rawExerciseClauses.length > 0 && (trainingSession.exercises ?? []).length === 0
        ? rawExerciseClauses.map((clause) => ({
            clause,
            reason: "Exercise-like language was present but did not produce a TrainingSession exercise.",
          }))
        : [],
    exerciseTransitionPhraseDetected: Boolean(transition),
    exerciseTransitionPhrase: transition?.phrase ?? null,
    exerciseBlockStartedFromTransition:
      Boolean(transition) && (trainingSession.exercises ?? []).length > 0,
    transitionExerciseCanonicalizedTo:
      transitionExercise?.name ?? null,
    numericPrescriptionAttachedToTransitionExercise:
      Boolean(transitionExercise) &&
      (transitionExercise.sets ?? []).some(
        (set) =>
          Number.isFinite(Number(set.reps)) &&
          (Number.isFinite(Number(set.weight)) ||
            Number.isFinite(Number(set.duration_seconds)))
      ),
    exercisePrescriptionSourceClauses: parsedExerciseClauses.map((clause) => ({
      exercise: clause.exercise,
      source_clause: clause.clause,
      pattern: clause.pattern,
    })),
    setsRepsOfWeightPatternMatched: /sets?\s+of\s+\d+(?:\s+reps?)?\s+of\s+\d+.*(?:pounds?|lbs?|lb|kg)/i.test(
      normalizeNumberWords(transcript)
    ),
    weightRecoveredFromUnusualOrder:
      /sets?\s+of\s+\d+(?:\s+reps?)?\s+of\s+\d+.*(?:pounds?|lbs?|lb|kg)/i.test(
        normalizeNumberWords(transcript)
      ) &&
      (trainingSession.exercises ?? []).some((exercise) =>
        (exercise.sets ?? []).some((set) => Number.isFinite(Number(set.weight)))
      ),
    exerciseOntologyMatch: firstExercise
      ? {
          body_region: firstExercise.body_region,
          exercise: firstExercise.name,
          movement_pattern: firstExercise.movement_pattern,
          ontology_confidence: firstExercise.ontology_confidence ?? "high",
          primary_muscle_groups: firstExercise.primary_muscle_groups ?? [],
          secondary_muscle_groups: firstExercise.secondary_muscle_groups ?? [],
        }
      : null,
    exerciseOntologyMatches,
    exerciseAliasMatched: exerciseAliasCanonicalization?.matched ?? null,
    exerciseAliasCanonicalizedTo:
      exerciseAliasCanonicalization?.canonicalizedTo ?? null,
    exerciseCreatedFromAliasClause:
      Boolean(exerciseAliasCanonicalization?.matched) &&
      (trainingSession.exercises ?? []).some(
        (exercise) => exercise.name === exerciseAliasCanonicalization.canonicalizedTo
      ),
      exercisePrescriptionPatternMatched:
      matchedParserPatterns.find((match) =>
        /sets_reps_of_weight_on_exercise|sets_reps_on_exercise_for_weight|sets_reps_on_exercise_weight|strength_training_text/i.test(
          match.pattern ?? ""
        )
      )?.pattern ?? null,
    exerciseNumericDetailsAttached:
      weightedPrescriptionHydration.length > 0
        ? weightedPrescriptionHydration.every(
            (entry) => entry.all_parsed_fields_survived
          )
        : (trainingSession.exercises ?? []).some((exercise) =>
            (exercise.sets ?? []).some(
              (set) =>
                Number.isFinite(Number(set.reps)) &&
                Number.isFinite(Number(set.weight))
            )
          ),
    exercisePrescriptionHydration,
    exercisePrescriptionFieldsSurvived,
    matchedParserPatterns,
    inferredExerciseDetailsFromNearbyClause,
    recognizedExerciseMentions: blockDiagnostics.recognizedExerciseMentions,
    exerciseBlocks: blockDiagnostics.exerciseBlocks,
    exerciseBoundaryReasons: blockDiagnostics.exerciseBoundaryReasons,
    exerciseNameRefinements: blockDiagnostics.exerciseNameRefinements,
    pendingExerciseBackfills: blockDiagnostics.pendingExerciseBackfills,
    pendingHeadingAttachments: blockDiagnostics.pendingHeadingAttachments,
    sharedPrescriptionAssignments:
      blockDiagnostics.sharedPrescriptionAssignments,
    declaredSetCountMismatches: blockDiagnostics.declaredSetCountMismatches,
    canonicalExerciseCompleteness:
      blockDiagnostics.canonicalExerciseCompleteness,
    exerciseCompleteness: blockDiagnostics.canonicalExerciseCompleteness,
    missingEvidenceClaims: blockDiagnostics.missingEvidenceClaims,
    malformedExerciseNamePrevented:
      blockDiagnostics.malformedExerciseNamePrevented,
    implicitExerciseAnchors: blockDiagnostics.implicitExerciseAnchors,
    orphanPrescriptionCandidates: blockDiagnostics.orphanPrescriptionCandidates,
    exerciseBearingGrammarMatches: blockDiagnostics.exerciseBearingGrammarMatches,
    numericTokenRoleAssignments: blockDiagnostics.numericTokenRoleAssignments,
    bodyweightTrainingRoutingProtection:
      blockDiagnostics.bodyweightTrainingRoutingProtection,
    ontologyCandidateRanking: blockDiagnostics.ontologyCandidateRanking,
    focusedExerciseClarificationReason:
      blockDiagnostics.canonicalExerciseCompleteness?.unmatchedExerciseBlocks?.[0]
        ?.reason ?? null,
    nearestExerciseBackfillApplied:
      inferredExerciseDetailsFromNearbyClause.length > 0,
    pronounExerciseBackfillApplied:
      rawExerciseClauses.some((clause) =>
        /\bsets?\s+of\s+(?:those|that|that\s+exercise|those\s+sets)\b/i.test(
          clause
        )
      ) && (trainingSession.exercises ?? []).length > 0,
    exerciseHeadingBackfillApplied:
      rawExerciseClauses.some((clause, index) =>
        index > 0 &&
        /\b\d+\s+sets?\s+of\s+\d+(?:\s+reps?)?\s+(?:at|with)\b/i.test(clause)
      ) && (trainingSession.exercises ?? []).length > 0,
    parsedExerciseClauses,
    parserPatternMatched: hasAcceptedLoad
      ? "conversational_correction_weight_override"
      : hasSetsRepsOfWeightOnExercise
        ? "sets_reps_of_weight_on_exercise"
      : hasSetsRepsWeightOnExercise
        ? "sets_reps_weight_on_exercise"
      : hasSetsRepsOnExercise
        ? "sets_reps_on_exercise_weight"
        : firstExercise
          ? "strength_training_text"
          : null,
    rawExerciseClauses,
    unmatchedClauses,
  };
}

function isClauseConsumedByStrengthBlockDiagnostics(clause, blockDiagnostics) {
  const normalizedClause = normalizeIdentityText(clause);
  if (!normalizedClause) return false;

  const consumedClauses = [
    ...(blockDiagnostics.pendingHeadingAttachments ?? []).flatMap((entry) => [
      entry.attachedPrescriptionClause,
      entry.headingClause,
    ]),
    ...(blockDiagnostics.exerciseBlocks ?? []).flatMap((block) => [
      ...(block.sourceClauses ?? []),
      ...(block.prescriptionClauses ?? []),
    ]),
  ];

  return consumedClauses.some((candidate) => {
    const normalizedCandidate = normalizeIdentityText(candidate);
    return (
      normalizedCandidate &&
      (normalizedCandidate.includes(normalizedClause) ||
        normalizedClause.includes(normalizedCandidate))
    );
  });
}

function getExercisePrescriptionHydration({
  exercises = [],
  parsedExerciseClauses = [],
}) {
  return (parsedExerciseClauses ?? [])
    .filter((parsedClause) => parsedClause?.exercise)
    .map((parsedClause) => {
      const exercise = (exercises ?? []).find(
        (candidate) =>
          normalizeIdentityText(candidate.name) ===
          normalizeIdentityText(parsedClause.exercise)
      );
      const parsedPrescription = getParsedPrescriptionFromClause(
        parsedClause.clause
      );
      const canonicalHydration = getCanonicalSetHydration(exercise);
      const lostFields = [];

      if (
        Number.isFinite(parsedPrescription.set_count) &&
        parsedPrescription.set_count !== canonicalHydration.set_count
      ) {
        lostFields.push("set_count");
      }

      if (
        Number.isFinite(parsedPrescription.reps) &&
        canonicalHydration.reps !== parsedPrescription.reps
      ) {
        lostFields.push("reps");
      }

      if (
        Number.isFinite(parsedPrescription.weight) &&
        canonicalHydration.weight !== parsedPrescription.weight
      ) {
        lostFields.push("weight");
      }

      if (
        parsedPrescription.unit &&
        canonicalHydration.weight_unit !== parsedPrescription.unit
      ) {
        lostFields.push("unit");
      }

      return {
        all_parsed_fields_survived: lostFields.length === 0,
        canonical_hydration: canonicalHydration,
        clause: parsedClause.clause,
        exercise: parsedClause.exercise,
        lost_fields: lostFields,
        parsed_prescription: parsedPrescription,
        pattern: parsedClause.pattern,
      };
    });
}

function getParsedPrescriptionFromClause(clause) {
  const text = normalizeNumberWords(String(clause ?? ""));
  const setCountMatch = text.match(/\b(\d+)\s+sets?\b/i);
  const repsMatch =
    text.match(/\bsets?,?\s+(?:of\s+)?(\d+)(?:\s+reps?)?\b/i) ??
    text.match(/\b(\d+)\s+reps?\b/i);
  const weightWithUnitMatches = [
    ...text.matchAll(
      /(?:for|at|with)\s+#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b/gi
    ),
  ];
  const bareWeightWithUnitMatches = [
    ...text.matchAll(/\b#?(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\b/gi),
  ].filter((match) => !/\breps?\b/i.test(text.slice(match.index + match[0].length, match.index + match[0].length + 8)));
  const weightWithoutUnitMatch = text.match(
    /(?:for|at|with)\s+#?(\d+(?:\.\d+)?)(?!\s*reps?\b)/i
  );
  const weightMatch =
    weightWithUnitMatches.at(-1) ??
    bareWeightWithUnitMatches.at(-1) ??
    weightWithoutUnitMatch;
  const unit = normalizePrescriptionUnit(weightMatch?.[2]);

  return {
    reps: repsMatch ? Number(repsMatch[1]) : null,
    set_count: setCountMatch ? Number(setCountMatch[1]) : null,
    unit,
    weight: weightMatch ? Number(weightMatch[1]) : null,
  };
}

function getCanonicalSetHydration(exercise) {
  const sets = exercise?.sets ?? [];
  const finiteReps = uniqueFiniteNumbers(sets.map((set) => Number(set.reps)));
  const finiteWeights = uniqueFiniteNumbers(sets.map((set) => Number(set.weight)));
  const weightUnits = uniqueStrings(sets.map((set) => set.weight_unit));
  const loadTypes = uniqueStrings(sets.map((set) => set.load_type));
  const volumes = uniqueFiniteNumbers(sets.map((set) => Number(set.volume)));

  return {
    load_type: loadTypes.length === 1 ? loadTypes[0] : null,
    reps: finiteReps.length === 1 ? finiteReps[0] : null,
    set_count: sets.length,
    volume_per_set: volumes.length === 1 ? volumes[0] : null,
    weight: finiteWeights.length === 1 ? finiteWeights[0] : null,
    weight_unit: weightUnits.length === 1 ? weightUnits[0] : null,
  };
}

function uniqueFiniteNumbers(values = []) {
  return [...new Set(values.filter(Number.isFinite))];
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value))
    ),
  ];
}

function normalizePrescriptionUnit(unit) {
  if (!unit) return null;
  return /kg/i.test(String(unit)) ? "kg" : "lb";
}

function detectExerciseAliasCanonicalization(transcript) {
  const text = String(transcript ?? "");
  const aliases = [
    {
      canonicalizedTo: "Shoulder Press Machine",
      pattern: /\bshoulder\s+machines?\s+press(?:es)?\b/i,
    },
    {
      canonicalizedTo: "Shoulder Press Machine",
      pattern: /\bmachine\s+shoulder\s+press(?:es)?\b/i,
    },
    {
      canonicalizedTo: "Shoulder Press Machine",
      pattern: /\bshoulder\s+press\s+(?:on\s+the\s+)?machines?\b/i,
    },
    {
      canonicalizedTo: "Shoulder Press Machine",
      pattern: /\bshoulder\s+machines?\b/i,
    },
  ];

  const match = aliases
    .map((alias) => ({
      canonicalizedTo: alias.canonicalizedTo,
      matched: text.match(alias.pattern)?.[0] ?? null,
    }))
    .find((alias) => alias.matched);

  return match ?? null;
}

function getInferredExerciseDetailsFromNearbyClause({
  exercises = [],
  rawExerciseClauses = [],
  transcript = "",
}) {
  const normalizedTranscript = normalizeNumberWords(transcript);
  const nearbyRepClauses = rawExerciseClauses.filter((clause) =>
    /^(?:(?:those|these|they|that)\s*)?(?:(\d+)\s+sets?\s*)?(?:were|was|are|is)?\s*(\d+)(?:\s+reps?)?\s*(?:each|per\s+set)$/i.test(
      clause
    )
  );
  const impliedInlineBackfill =
    /,\s*\d+\s+reps?\s*(?:each|per\s+set)\b/i.test(normalizedTranscript);

  if (nearbyRepClauses.length === 0 && !impliedInlineBackfill) return [];

  return exercises
    .filter((exercise) =>
      (exercise.sets ?? []).some(
        (set) =>
          set.reps !== null &&
          set.reps !== undefined &&
          Number.isFinite(Number(set.reps)) &&
          Number.isFinite(Number(set.weight))
      )
    )
    .map((exercise) => ({
      exercise: exercise.name,
      inferred_fields: ["reps"],
      source_clauses: nearbyRepClauses,
      reason:
        "A nearby reps-per-set clause was applied to the nearest preceding exercise with missing reps.",
    }));
}

function segmentVoiceTranscriptByEvidenceType(transcript) {
  const clauses = splitVoiceNarrativeClauses(transcript);
  const consumed = {
    training: [],
    nutrition: [],
    health_symptom: [],
    activity_day: [],
    morning_weight: [],
    protocol_completion: [],
  };

  clauses.forEach((clause) => {
    const normalized = clause.toLowerCase();
    let consumedByAny = false;

    if (/\b(ate|had|made|meal|breakfast|lunch|dinner|snack|chipotle|burger|bowl|rice|beans|chicken|food|protein|macros?)\b/.test(normalized)) {
      consumed.nutrition.push(clause);
      consumedByAny = true;
    }
    if (/\b(worked out|workout|trained|training|lifted|strength|sets?|reps?|press|raise|row|curl|squat|bench|pull-?up|run|ran|walked|walk)\b/.test(normalized)) {
      consumed.training.push(clause);
      consumedByAny = true;
    }
    if (
      /\b(run|ran|walked|walk|burned|active calories|calories|minutes?|miles?|mi\b)\b/.test(normalized) &&
      !isNarrativeGlueOnlyClause(clause) &&
      !isNutritionMacroClauseWithoutActivityContext(clause)
    ) {
      consumed.activity_day.push(clause);
      consumedByAny = true;
    }
    if (/\b(pain|hurt|hurts|sore|ache|bothering|barking|feeling well|felt well|mild|moderate|severe|doesn'?t hurt that bad)\b/.test(normalized)) {
      consumed.health_symptom.push(clause);
      consumedByAny = true;
    }
    if (
      /\b(weight|weighed|weigh|scale|woke up)\b/.test(normalized) &&
      !isBodyweightTrainingClause(clause)
    ) {
      consumed.morning_weight.push(clause);
      consumedByAny = true;
    }
    if (/\b(took|injected|dose|dosed|forgot|missed|tesamorelin|retatrutide)\b/.test(normalized)) {
      consumed.protocol_completion.push(clause);
      consumedByAny = true;
    }

    if (!consumedByAny) {
      // Keep generic clauses available in diagnostics without assigning them to an interpreter.
    }
  });

  const consumedClauseSet = new Set(Object.values(consumed).flat());

  return {
    clauseSegmentationStrategy: "voice_evidence_clause_segmentation_v1",
    clauses,
    clausesConsumedByInterpreter: consumed,
    narrativeGlueSuppressed: clauses.some((clause) =>
      isNarrativeGlueOnlyClause(clause)
    ),
    falseActivityFromWalkedHomeSuppressed: clauses.some((clause) =>
      isNarrativeGlueOnlyClause(clause)
    ),
    activityMacroClauseSuppressed: clauses.some((clause) =>
      isNutritionMacroClauseWithoutActivityContext(clause)
    ),
    unconsumedClauses: clauses.filter((clause) => !consumedClauseSet.has(clause)),
    nutritionClauseContamination: detectNutritionClauseContamination(consumed.nutrition),
  };
}

function isNarrativeGlueOnlyClause(clause) {
  const text = String(clause ?? "");
  if (!hasNarrativeGluePhrase(text)) return false;

  return !hasExplicitActivityMetrics(text);
}

function dedupeRepeatedNarrativeFragments(transcript) {
  const original = normalizeTranscript(transcript);
  const fragments = original
    .split(/(?<=[.!?])\s+|[;\n]+/g)
    .map((fragment) => fragment.trim())
    .filter(Boolean);
  const seen = new Set();
  const dedupedFragments = [];
  const repeatedFollowUpFragments = [];

  fragments.forEach((fragment) => {
    if (hasExplicitRepeatMarker(fragment)) {
      dedupedFragments.push(fragment);
      return;
    }

    const key = normalizeNarrativeFragmentForDedupe(fragment);
    if (!key) return;

    if (seen.has(key)) {
      repeatedFollowUpFragments.push(fragment);
      return;
    }

    seen.add(key);
    dedupedFragments.push(fragment);
  });

  const dedupedNarrative = dedupedFragments.join(" ").trim() || original;

  return {
    dedupedNarrative,
    repeatedNarrativeClauses: repeatedFollowUpFragments,
    repeatedFollowUpFragments,
    repetitionDedupingApplied: repeatedFollowUpFragments.length > 0,
    semanticClauseDedupingApplied: repeatedFollowUpFragments.length > 0,
    semanticClauseDedupingReason:
      repeatedFollowUpFragments.length > 0
        ? "Adjacent or repeated clauses shared the same normalized action and entity without explicit repeat markers."
        : null,
  };
}

function detectTerminalCompletionPhraseInOriginalTranscript(transcript) {
  const original = normalizeTranscript(transcript);
  const match = original.match(
    /(?:^|[\s,.;!?])((?:but\s+)?(?:no,\s*)?(?:that'?s\s+all\s+for\s+today|thats\s+all\s+for\s+today|that\s+is\s+all\s+for\s+today|that'?s\s+all|thats\s+all|that\s+is\s+all|that'?s it|thats it|that is it|done|all done|no thanks|nothing else|save|save it|log it|finished|good|good to go))[\s.!?]*$/i
  );

  if (!match) {
    return {
      detected: false,
      phrase: null,
      evidenceTranscript: original,
    };
  }

  return {
    detected: true,
    phrase: match[1].replace(/^but\s+/i, ""),
    evidenceTranscript: original.slice(0, match.index).trim().replace(/[,\s]+$/g, ""),
  };
}

function normalizeNarrativeFragmentForDedupe(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\bit'?s\b/g, "it is")
    .replace(/\bdoesn'?t\b/g, "does not")
    .replace(/\bno big deal\b/g, "not a big deal")
    .replace(/\bnot that bad\b/g, "mild")
    .replace(/\bdoes not hurt that bad\b/g, "mild")
    .replace(/^(?:and\s+)?(?:i\s+)?(?:went|came|got|headed)\s+home\s+and\s+/i, "")
    .replace(/^(?:and\s+)?(?:i\s+)?(?:made|had|ate|did)\s+/i, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasExplicitRepeatMarker(value) {
  return /\b(?:another|again|second\s+round|two\s+more\s+sets?|another\s+round|repeat(?:ed)?)\b/i.test(
    String(value ?? "")
  );
}

function splitVoiceNarrativeClauses(transcript) {
  return normalizeNumberWords(String(transcript ?? ""))
    .replace(/\b(?:and\s+then|then|after\s+that)\b/gi, ". ")
    .split(/[.;\n]|,\s+(?=(?:but\s+)?(?:i\s+)?(?:did|had|ate|trained|worked|walked|ran|my|it)\b)/i)
    .map((clause) => clause.trim().replace(/^but\s+/i, ""))
    .filter(Boolean);
}

function detectNutritionClauseContamination(nutritionClauses = []) {
  return nutritionClauses
    .filter((clause) =>
      /\b(sets?|reps?|press|raise|row|curl|squat|bench|workout|trained|pain|hurt|sore)\b/i.test(
        clause
      )
    )
    .map((clause) => ({
      clause,
      reason: "Nutrition-owned clause contains non-food workout or symptom language.",
    }));
}

function analyzeVoiceNumericResilience({
  clauseSegmentation,
  conversationalResolution,
  evidenceObjects = [],
  resolvedTranscript,
  transcript,
} = {}) {
  const acceptedNumericCorrections =
    conversationalResolution?.accepted_values ?? [];
  const rejectedNumericValues =
    conversationalResolution?.rejected_values ?? [];
  const numericAmbiguities = detectNumericAmbiguities({
    evidenceObjects,
    resolvedTranscript,
    transcript,
  });
  const plausibility = detectDomainPlausibilityChecks({
    evidenceObjects,
    resolvedTranscript,
  });
  const activePromptContextApplied = detectActivePromptContextApplied({
    evidenceObjects,
    resolvedTranscript,
  });
  const activePromptContextRejected = detectActivePromptContextRejected({
    evidenceObjects,
    resolvedTranscript,
  });
  const transcriptionConfidenceNotes = [
    ...numericAmbiguities.map((ambiguity) => ({
      code: "numeric_ambiguity",
      message: ambiguity.reason,
      field: ambiguity.field,
      alternatives: ambiguity.alternatives,
    })),
    ...plausibility
      .filter((check) => check.status === "flagged")
      .map((check) => ({
        code: "domain_plausibility",
        message: check.reason,
        field: check.field,
        value: check.value,
      })),
  ];

  return {
    numericAmbiguities,
    suspiciousNumericValues: plausibility
      .filter((check) => check.status === "flagged")
      .map((check) => ({
        evidence_type: check.evidence_type,
        field: check.field,
        reason: check.reason,
        suggestedAlternatives: check.suggestedAlternatives ?? [],
        unit: check.unit,
        value: check.value,
      })),
    domainPlausibilityChecks: plausibility,
    acceptedNumericCorrections,
    rejectedNumericValues,
    activePromptContextApplied,
    activePromptContextRejected,
    strongDomainAnchorOverrodeActivePromptContext:
      activePromptContextRejected.length > 0,
    transcriptionConfidenceNotes,
    clauseSegmentationStrategy: clauseSegmentation?.clauseSegmentationStrategy ?? null,
  };
}

function detectNumericAmbiguities({
  evidenceObjects = [],
  resolvedTranscript,
  transcript,
} = {}) {
  const normalized = normalizeNumberWords(String(resolvedTranscript ?? transcript ?? ""));
  const ambiguities = [];
  const hasExplicitCorrection =
    /\b(i\s+mean|i\s+meant|actually|make\s+that|instead|not)\b/i.test(
      normalized
    );
  const training = evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  for (const pattern of NUMERIC_AMBIGUITY_PATTERNS) {
    if (!pattern.regex.test(normalized)) continue;

    ambiguities.push({
      evidence_type: pattern.evidenceType,
      field: pattern.field,
      alternatives: pattern.alternatives,
      units: pattern.unit,
      question: pattern.question,
      quickResponses: pattern.quickResponses,
      reason: pattern.reason,
      needsClarification: !hasExplicitCorrection,
      clarificationScore: pattern.score,
      targetEvidenceObjectId: training?.id ?? null,
    });
  }

  return ambiguities;
}

const NUMERIC_AMBIGUITY_PATTERNS = [
  {
    regex: /\b(?:50|fifty)\s*(?:or|versus|vs\.?)\s*(?:15|fifteen)\s*(?:minutes?|mins?)\b|\b(?:15|fifteen)\s*(?:or|versus|vs\.?)\s*(?:50|fifty)\s*(?:minutes?|mins?)\b/i,
    evidenceType: "training",
    field: "duration_seconds",
    alternatives: [50, 15],
    unit: "minutes",
    question: "Just confirming - was that 50 minutes or 15 minutes?",
    quickResponses: ["50 minutes", "15 minutes", "Not sure"],
    reason:
      "Duration contains a 50 versus 15 minute ambiguity that materially changes training evidence.",
    score: 125,
  },
  {
    regex: /\b(?:30|thirty)\s*(?:or|versus|vs\.?)\s*(?:3|three)\s*(?:miles?|mi)\b|\b(?:3|three)\s*(?:or|versus|vs\.?)\s*(?:30|thirty)\s*(?:miles?|mi)\b/i,
    evidenceType: "training",
    field: "distance",
    alternatives: [30, 3],
    unit: "mi",
    question: "Did you mean 3 miles or 30 miles?",
    quickResponses: ["3 miles", "30 miles", "Not sure"],
    reason:
      "Distance contains a 3 versus 30 mile ambiguity that materially changes cardio evidence.",
    score: 125,
  },
];

function detectDomainPlausibilityChecks({
  evidenceObjects = [],
  resolvedTranscript,
} = {}) {
  const checks = [];
  const normalized = normalizeNumberWords(String(resolvedTranscript ?? ""));
  const training = evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const metadata = training?.metadata ?? {};
  const distance = Number(metadata.distance);
  const durationSeconds = Number(metadata.duration_seconds);
  const activeCalories = Number(metadata.active_calories);
  const isCardio =
    training &&
    /\b(run|outdoor walk|walk|cycling|cardio)\b/i.test(
      metadata.activity_type ?? normalized
    );

  if (isCardio && Number.isFinite(distance) && Number.isFinite(durationSeconds)) {
    const durationMinutes = durationSeconds / 60;
    if (distance >= 20 && durationMinutes <= 90) {
      checks.push({
        check: "cardio_distance_duration_plausibility",
        evidence_type: "training",
        field: "distance",
        status: "flagged",
        value: distance,
        unit: metadata.distance_unit ?? "mi",
        comparedTo: {
          duration_minutes: Math.round(durationMinutes),
        },
        reason:
          "Cardio distance is implausibly high for the recorded duration; this may be a transcription number error.",
        suggestedAlternatives: [distance / 10].filter((value) => value >= 1),
        targetEvidenceObjectId: training.id,
      });
    } else {
      checks.push({
        check: "cardio_distance_duration_plausibility",
        evidence_type: "training",
        field: "distance",
        status: "passed",
        value: distance,
        unit: metadata.distance_unit ?? "mi",
        targetEvidenceObjectId: training.id,
      });
    }
  }

  if (isCardio && Number.isFinite(activeCalories)) {
    checks.push({
      check: "workout_calorie_context",
      evidence_type: "training",
      field: "active_calories",
      status: "passed",
      value: activeCalories,
      unit: "cal",
      reason:
        "Calories were attached to workout/activity context instead of nutrition.",
      targetEvidenceObjectId: training.id,
    });
  }

  return checks;
}

function detectActivePromptContextApplied({
  evidenceObjects = [],
  resolvedTranscript,
} = {}) {
  const normalized = normalizeNumberWords(String(resolvedTranscript ?? ""));
  const clauses = splitVoiceNarrativeClauses(normalized);
  if (clauses.length < 2) return [];

  const lastClause = clauses.at(-1) ?? "";
  const priorText = clauses.slice(0, -1).join(". ");
  const training = evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const metadata = training?.metadata ?? {};
  const contexts = [];
  const hasPriorTrainingContext = /\b(run|ran|walk|walked|workout|trained|training)\b/i.test(
    priorText
  );

  if (!training || !hasPriorTrainingContext) return contexts;
  if (isNutritionMacroClauseWithoutActivityContext(lastClause)) return contexts;

  const appliedFields = [];
  if (/\b(?:for|every)?\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/i.test(lastClause)) {
    appliedFields.push("duration_seconds");
  }
  if (/\b(?:around|about)?\s*\d+(?:\.\d+)?\s*(?:miles?|mi|kilometers?|km)\b/i.test(lastClause)) {
    appliedFields.push("distance");
  }
  if (/\b\d[\d,]*\s*(?:active\s*)?(?:calories|cals|cal)\b/i.test(lastClause)) {
    appliedFields.push("active_calories");
  }
  if (/\b(easy|moderate|steady|hard)\s*(?:pace|effort)?\b/i.test(lastClause)) {
    appliedFields.push("average_pace");
  }

  if (appliedFields.length > 0) {
    contexts.push({
      context: metadata.activity_type ?? "training",
      evidence_type: "training",
      fields: [...new Set(appliedFields)],
      reason:
        "Short follow-up answer inherited the active training context from the prior narrative.",
      sourceClause: lastClause,
      targetEvidenceObjectId: training.id,
    });
  }

  return contexts;
}

function detectActivePromptContextRejected({
  evidenceObjects = [],
  resolvedTranscript,
} = {}) {
  const normalized = normalizeNumberWords(String(resolvedTranscript ?? ""));
  const clauses = splitVoiceNarrativeClauses(normalized);
  if (clauses.length < 2) return [];

  const lastClause = clauses.at(-1) ?? "";
  const priorText = clauses.slice(0, -1).join(". ");
  const training = evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  if (!training) return [];
  if (!/\b(run|ran|walk|walked|workout|trained|training|sets?|reps?|press|raises?)\b/i.test(priorText)) {
    return [];
  }
  if (!isNutritionMacroClauseWithoutActivityContext(lastClause)) return [];

  return [
    {
      context: training.metadata?.activity_type ?? "training",
      evidence_type: "training",
      fields: ["active_calories"],
      reason:
        "Strong nutrition macro language overrode the active training prompt context.",
      sourceClause: lastClause,
      targetEvidenceObjectId: training.id,
    },
  ];
}

function attachTranscriptProvenance({
  conversationalResolution,
  object,
  resolvedTranscript,
  sourceArtifactRefs,
  transcript,
}) {
  return {
    ...object,
    provenance: {
      ...(object.provenance ?? {}),
      source_artifact_refs:
        object.provenance?.source_artifact_refs ?? sourceArtifactRefs,
      original_transcript: transcript,
      resolved_transcript: resolvedTranscript,
      conversational_resolution:
        conversationalResolution.rejected_values.length > 0 ||
        conversationalResolution.accepted_values.length > 0
          ? conversationalResolution
          : undefined,
    },
  };
}

function mergeVoiceEvidenceObjects(evidenceObjects = []) {
  const byKey = new Map();

  evidenceObjects.forEach((object) => {
    const key = object.id ?? `${object.evidence_type}-${object.observed_at}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, object);
      return;
    }

    byKey.set(key, {
      ...existing,
      ...object,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(object.metadata ?? {}),
      },
      provenance: mergeProvenance(existing.provenance, object.provenance),
    });
  });

  return [...byKey.values()];
}

function mergeProvenance(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    source_artifact_refs: [
      ...new Set([
        ...(left.source_artifact_refs ?? []),
        ...(right.source_artifact_refs ?? []),
      ]),
    ],
  };
}

function getEvidenceLifetimeSummary(evidenceObjects = []) {
  return evidenceObjects.map((object) => ({
    evidence_type: object.evidence_type,
    id: object.id,
    lifetime:
      object.evidence_lifetime ??
      object.metadata?.evidence_lifetime ??
      "permanent",
  }));
}

function resolveConversationalCorrections(transcript) {
  const originalTranscript = normalizeTranscript(transcript);
  const normalizedTranscript = normalizeNumberWords(originalTranscript);
  const rejectedValues = [];
  const acceptedValues = [];
  const notes = [];
  let resolvedTranscript = normalizedTranscript;

  const acceptedBeforeNotPattern =
    /(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\s*(?:per\s+set|each)?\s*,?\s+not\s+(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?/gi;

  for (const match of normalizedTranscript.matchAll(acceptedBeforeNotPattern)) {
    const acceptedValue = Number(match[1]);
    const rejectedValue = Number(match[3]);
    const unit = normalizeCorrectionUnit(match[2] ?? match[4]);

    if (!Number.isFinite(acceptedValue) || !Number.isFinite(rejectedValue)) {
      continue;
    }

    acceptedValues.push({
      value: acceptedValue,
      unit,
      applies_to: inferCorrectionTarget(normalizedTranscript),
      reason: `user stated ${acceptedValue} ${unit} per set`,
    });
    rejectedValues.push({
      value: rejectedValue,
      unit,
      reason: `user corrected: not ${rejectedValue} ${unit}`,
    });
    notes.push(`Resolved ${rejectedValue} ${unit} to ${acceptedValue} ${unit}.`);
  }

  const replacementPattern =
    /(?:actually|make\s+that|i\s+meant|instead)\s+(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?/gi;
  const previousValueReplacementPattern =
    /(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)\s*,?\s*(?:actually|make\s+that|i\s+meant|instead)\s+(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb|kg)?/gi;
  const distanceCorrectionPattern =
    /(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km)\s*,?\s*(?:i\s+mean|i\s+meant|actually|make\s+that|instead)\s+(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km)?/gi;

  for (const match of normalizedTranscript.matchAll(distanceCorrectionPattern)) {
    const rejectedValue = Number(match[1]);
    const acceptedValue = Number(match[3]);
    const unit = normalizeDistanceCorrectionUnit(match[4] ?? match[2]);

    if (!Number.isFinite(rejectedValue) || !Number.isFinite(acceptedValue)) {
      continue;
    }

    rejectedValues.push({
      value: rejectedValue,
      unit,
      reason: `user corrected: ${rejectedValue} ${unit} was not intended`,
    });
    acceptedValues.push({
      value: acceptedValue,
      unit,
      applies_to: "distance",
      reason: `user corrected distance to ${acceptedValue} ${unit}`,
    });
    notes.push(`Resolved ${rejectedValue} ${unit} to ${acceptedValue} ${unit}.`);
  }

  for (const match of normalizedTranscript.matchAll(previousValueReplacementPattern)) {
    const rejectedValue = Number(match[1]);
    const acceptedValue = Number(match[3]);
    const unit = normalizeCorrectionUnit(match[4] ?? match[2]);

    if (!Number.isFinite(rejectedValue) || !Number.isFinite(acceptedValue)) {
      continue;
    }

    rejectedValues.push({
      value: rejectedValue,
      unit,
      reason: `user corrected: ${rejectedValue} ${unit} was replaced`,
    });
    acceptedValues.push({
      applies_to: /shoulder\s+press/i.test(normalizedTranscript)
        ? "shoulder press machine load"
        : "training load",
      reason: `user corrected load to ${acceptedValue} ${unit}`,
      value: acceptedValue,
      unit,
    });
    resolvedTranscript = resolvedTranscript.replace(
      match[0],
      `${acceptedValue} ${unit}`
    );
    notes.push(`Resolved ${rejectedValue} ${unit} to ${acceptedValue} ${unit}.`);
  }

  const repsToSetsCorrectionPattern =
    /(\d+)\s+reps?\s*,?\s*(?:i'?m\s+sorry|sorry|actually|make\s+that)\s*,?\s*(\d+)\s+sets?/gi;
  for (const match of normalizedTranscript.matchAll(repsToSetsCorrectionPattern)) {
    const rejectedValue = Number(match[1]);
    const acceptedValue = Number(match[2]);

    if (!Number.isFinite(rejectedValue) || !Number.isFinite(acceptedValue)) {
      continue;
    }

    rejectedValues.push({
      value: rejectedValue,
      unit: "reps",
      reason: `user corrected: ${rejectedValue} reps was not intended`,
    });
    acceptedValues.push({
      value: acceptedValue,
      unit: "sets",
      applies_to: "set count",
      reason: `user corrected to ${acceptedValue} sets`,
    });
    notes.push(`Resolved ${rejectedValue} reps to ${acceptedValue} sets.`);
  }

  for (const match of normalizedTranscript.matchAll(replacementPattern)) {
    const acceptedValue = Number(match[1]);
    const unit = normalizeCorrectionUnit(match[2] ?? "lb");

    if (!Number.isFinite(acceptedValue)) continue;

    acceptedValues.push({
      value: acceptedValue,
      unit,
      applies_to: inferCorrectionTarget(normalizedTranscript),
      reason: "user provided a replacement value",
    });
    notes.push(`Accepted replacement value ${acceptedValue} ${unit}.`);
  }

  rejectedValues.forEach((rejected) => {
    const value = escapeRegExp(String(rejected.value));
    if (rejected.unit === "reps") {
      const rejectedRepsClause = new RegExp(
        `${value}\\s+reps?\\s*,?\\s*(?:i'?m\\s+sorry|sorry|actually|make\\s+that)\\s*,?\\s*`,
        "gi"
      );
      resolvedTranscript = resolvedTranscript.replace(rejectedRepsClause, "");
      return;
    }
    if (["mi", "km"].includes(rejected.unit)) {
      const rejectedDistanceClause = new RegExp(
        `${value}\\s*(?:miles?|mi|kilometers?|km)\\s*,?\\s*(?:i\\s+mean|i\\s+meant|actually|make\\s+that|instead)\\s*`,
        "gi"
      );
      resolvedTranscript = resolvedTranscript.replace(rejectedDistanceClause, "");
      return;
    }

    const rejectedNotClause = new RegExp(
      `(?:,?\\s*\\bnot\\s+${value}\\s*(?:pounds?|lbs?|lb|kg)?\\b)`,
      "gi"
    );
    const rejectedStandaloneClause = new RegExp(
      `(?:,?\\s*${value}\\s*(?:pounds?|lbs?|lb|kg)\\s*[.]?)`,
      "gi"
    );

    resolvedTranscript = resolvedTranscript
      .replace(rejectedNotClause, "")
      .replace(rejectedStandaloneClause, ".");
  });

  resolvedTranscript = resolvedTranscript
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    accepted_values: dedupeResolutionValues(acceptedValues),
    notes,
    originalTranscript,
    rejected_values: dedupeResolutionValues(rejectedValues),
    resolvedTranscript: resolvedTranscript || originalTranscript,
  };
}

function applyVoiceWorkoutFocusToExercises(exercises = [], { workoutFocus } = {}) {
  return (exercises ?? []).map((exercise) => {
    if (
      workoutFocus === "Shoulders" &&
      /^front\s+rows?$/i.test(exercise.name ?? "")
    ) {
      return {
        ...exercise,
        body_region: "Shoulders",
        primary_muscle_groups: ["Shoulders"],
        secondary_muscle_groups: ["Back"],
        movement_pattern: "Ambiguous Pull",
        muscle_groups: ["Shoulders", "Back"],
        ontology_confidence: "low",
      };
    }

    return exercise;
  });
}

function getParsedExerciseClauses({ exercises = [], rawExerciseClauses = [], transcript }) {
  const clauses = rawExerciseClauses.length > 0
    ? rawExerciseClauses
    : getVoiceExerciseClauses(transcript);

  return (exercises ?? []).map((exercise) => {
    const clause =
      clauses.find((candidate) =>
        clauseMentionsExercise(candidate, exercise.name)
      ) ?? "";

    return {
      clause,
      exercise: exercise.name,
      pattern: classifyExerciseClausePattern(clause),
    };
  });
}

function getVoiceExerciseClauses(transcript) {
  return splitStrengthTrainingExerciseClauses(transcript);
}

function detectExerciseTransitionPhrase(transcript) {
  const text = normalizeNumberWords(String(transcript ?? ""));
  const match = text.match(
    /\b(then\s+i\s+did|then\s+did|next\s+i\s+did|next\s+was|after\s+that\s+i\s+did|afterwards\s+i\s+did|moved\s+over\s+to|moved\s+to|switched\s+over\s+to|switched\s+to|went\s+over\s+to|went\s+to|jumped\s+over\s+and\s+did|jumped\s+over\s+to|jumped\s+to|finished\s+with|wrapped\s+up\s+with|ended\s+with|ended\s+on|followed\s+that\s+with|knocked\s+out|hit)\s+([^,.]+)/i
  );

  if (!match) return null;

  return {
    phrase: match[1],
    followingText: match[2],
  };
}

function isNumericPrescriptionOnlyClause(clause) {
  const text = normalizeNumberWords(String(clause ?? "")).trim();

  return (
    /^\d+\s+sets?,?\s+\d+(?:\s+reps?)?\s*(?:each|per\s+set)?,?\s*(?:at|with)?\s*#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)?$/i.test(text) ||
    /^\d+\s+sets?,?\s+#?\d+(?:\.\d+)?\s*(?:pounds?|lbs?|lb|kg)?,?\s+\d+(?:\s+reps?)?\s*(?:each|per\s+set)?$/i.test(text)
  );
}

function clauseMentionsExercise(clause, exerciseName) {
  const clauseKey = normalizeIdentityText(clause);
  const exerciseKey = normalizeIdentityText(exerciseName);
  if (clauseKey.includes(exerciseKey)) return true;

  return exerciseKey
    .split(" ")
    .filter((part) => part.length > 2)
    .every((part) => clauseKey.includes(part));
}

function classifyExerciseClausePattern(clause) {
  return classifyStrengthTrainingClausePattern(clause);
}

function getCorrectionResolutionByClause({ conversationalResolution, transcript }) {
  const clauses = getVoiceExerciseClauses(transcript);

  return clauses
    .map((clause) => {
      const normalizedClause = normalizeIdentityText(clause);
      const rejectedValues = (conversationalResolution.rejected_values ?? []).filter(
        (value) => normalizedClause.includes(String(value.value))
      );
      const acceptedValues = (conversationalResolution.accepted_values ?? []).filter(
        (value) =>
          normalizedClause.includes(String(value.value)) ||
          (value.applies_to && /sets?|load|shoulder|press/i.test(value.applies_to))
      );

      if (rejectedValues.length === 0 && acceptedValues.length === 0) return null;

      return {
        accepted_values: acceptedValues,
        clause,
        rejected_values: rejectedValues,
      };
    })
    .filter(Boolean);
}

function normalizeIdentityText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shouldParseEvidenceType(expectedEvidenceType, type) {
  return (
    expectedEvidenceType === null ||
    expectedEvidenceType === "auto" ||
    expectedEvidenceType === type ||
    (type === "activity_day" && expectedEvidenceType === "activity") ||
    (type === "morning_weight" && expectedEvidenceType === "weight")
  );
}

function resolveObservedDate({ capturedAt, observedAt, transcript }) {
  const baseDate = normalizeDateKey(observedAt) ?? normalizeDateKey(capturedAt);
  if (!baseDate) return null;

  if (/\byesterday\b/i.test(transcript)) return offsetDate(baseDate, -1);
  if (/\btomorrow\b/i.test(transcript)) return offsetDate(baseDate, 1);
  const daysAgoMatch = normalizeNumberWords(transcript).match(
    /\b(\d+)\s+days?\s+ago\b/i
  );
  if (daysAgoMatch) return offsetDate(baseDate, -Number(daysAgoMatch[1]));
  const lastWeekdayMatch = transcript.match(
    /\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (lastWeekdayMatch) {
    return resolveLastWeekday(baseDate, lastWeekdayMatch[1]);
  }

  return baseDate;
}

function getRelativeDateResolution({
  baseObservedAt,
  resolvedObservedAt,
  transcript,
}) {
  const baseDate = normalizeDateKey(baseObservedAt);
  const resolvedDate = normalizeDateKey(resolvedObservedAt);
  const normalized = normalizeNumberWords(transcript);
  const matchedPhrase =
    String(transcript ?? "").match(/\byesterday\b/i)?.[0] ??
    String(transcript ?? "").match(/\btomorrow\b/i)?.[0] ??
    normalized.match(/\b\d+\s+days?\s+ago\b/i)?.[0] ??
    String(transcript ?? "").match(
      /\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
    )?.[0] ??
    null;

  return {
    detected: Boolean(matchedPhrase),
    matchedPhrase,
    baseDate,
    resolvedDate,
    strategy: matchedPhrase ? "relative_date_from_capture_or_observed_date" : "base_date",
  };
}

function extractMorningWeight(transcript) {
  if (isBodyweightTrainingClause(transcript)) return null;

  if (
    !/\b(weight|weighed|weigh|scale|weigh-in|weigh in|woke up)\b/i.test(
      transcript
    )
  ) {
    return null;
  }

  const matches = [
    ...normalizeNumberWords(transcript).matchAll(
      /(?:weighed|weigh(?:ed)?(?:\s*in)?\s*(?:at)?|weight(?:\s*was)?|scale(?:\s*was)?|woke\s+up)\s*(?:at|was|is)?\s*(\d{2,3}(?:\.\d+)?)\s*(lb|lbs|pounds?|kg)?/gi
    ),
  ];
  const selected = matches.at(-1);

  if (!selected) return null;

  return {
    value: Number(selected[1]),
    unit: /kg/i.test(selected[2] ?? "") ? "kg" : "lb",
  };
}

function isBodyweightTrainingClause(value) {
  const text = String(value ?? "");
  return (
    /\bbody\s*weight|bodyweight|bw\b/i.test(text) &&
    /\bsets?|reps?|exercise|pull[-\s]?ups?|hanging|leg\s+raises?|dips?|squats?\b/i.test(
      text
    )
  );
}

function extractVoiceFoods(transcript, { provenanceRef }) {
  if (!/\b(ate|had|made|meal|breakfast|lunch|dinner|snack|cheeseburger|burger)\b/i.test(transcript)) {
    return [];
  }

  const { cleanedTo } = cleanVoiceFoodPhraseForExtraction(transcript);
  const foodText = cleanedTo;

  return foodText
    .split(/\band\b|,/i)
    .map((food) =>
      food
        .trim()
        .replace(/[.]+$/g, "")
        .replace(/^(?:a|an|the)\s+/i, "")
        .replace(/\s+for\s+(?:breakfast|lunch|dinner|snacks?)\b/i, "")
        .trim()
    )
    .filter(
      (food) =>
        food &&
        !/^(breakfast|lunch|dinner|snack|snacks|meal)$/i.test(food) &&
        !/\d+\s*(?:minutes?|hours?|calories|cals)/i.test(food)
    )
    .map((food, index) => ({
      id: `voice_food_${index + 1}`,
      canonical_name: titleCase(food),
      name: titleCase(food),
      brand: null,
      serving_size: null,
      servings: null,
      meal: inferMealName(transcript),
      provenance_ref: provenanceRef,
      provenance: {
        source_artifact_refs: [provenanceRef],
      },
    }));
}

function cleanVoiceFoodPhraseForExtraction(transcript) {
  const text = String(transcript ?? "");
  const knownFoodMatch = text.match(/\bdouble\s+cheeseburger\b/i);

  if (knownFoodMatch) {
    return {
      cleanedFrom: text,
      cleanedTo: "Double Cheeseburger",
    };
  }

  const raw =
    text.match(/\b(?:ate|had|made)\s+([^.!?]+)/i)?.[1] ??
    text.match(/\b(?:breakfast|lunch|dinner|snack)\b[^.!?]*/i)?.[0] ??
    text;
  const cleaned = raw
    .replace(/\b(?:myself|me)\b/gi, "")
    .replace(/^(?:a|an|the|my)\s+/i, "")
    .replace(/\bfor\s+(?:breakfast|lunch|dinner|snack)\b.*$/i, "")
    .replace(/\bthe\s+(?:burger|meal|food)\s+was\b.*$/i, "")
    .replace(/\b(?:it|that)\s+was\b.*$/i, "")
    .replace(/\bmeal detail\b.*$/i, "")
    .replace(/\b(?:usually|about|around|probably|roughly|approximately)\b.*$/i, "")
    .replace(/\b\d[\d,]*\s*(?:calories|cals|cal|grams?|g)\b.*$/i, "")
    .replace(/\b(?:protein|macros?|carbs?|fat)\b.*$/i, "")
    .replace(/\b(?:then|after that|and then|walked|trained|worked out)\b.*$/i, "")
    .replace(/\b(?:it'?s|mild|not a big deal|no big deal|doesn'?t hurt|shoulder hurts|pain|sore)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    cleanedFrom: raw.trim() || text,
    cleanedTo: titleCase(cleaned),
  };
}

function extractNutritionMacrosFromMealContext(transcript) {
  const text = normalizeNumberWords(transcript);
  const totals = {};
  const extracted = [];
  const approximate = /\b(about|around|probably|roughly|approximately|estimate|estimated)\b/i.test(
    text
  );
  const caloriesMatch = text.match(/(\d[\d,]*)\s*(?:calories|cals|cal)\b/i);
  const proteinMatch =
    text.match(/(\d[\d,]*)\s*(?:grams?|g)\s+of\s+protein\b/i) ??
    text.match(/(\d[\d,]*)\s*(?:g\s*)?protein\b/i);

  if (caloriesMatch) {
    totals.calories = Number(caloriesMatch[1].replace(/,/g, ""));
    extracted.push({
      field: "calories",
      value: totals.calories,
      unit: "calories",
      approximate,
      reason: "Calories were stated in meal context.",
    });
  }
  if (proteinMatch) {
    totals.protein_g = Number(proteinMatch[1].replace(/,/g, ""));
    extracted.push({
      field: "protein_g",
      value: totals.protein_g,
      unit: "g",
      approximate,
      reason: "Protein was stated in meal context.",
    });
  }

  return {
    approximate,
    extracted,
    totals,
  };
}

function inferMealName(transcript) {
  const match = transcript.match(/\b(breakfast|lunch|dinner|snack|snacks)\b/i);
  if (!match) return "Unspecified Meal";

  return titleCase(match[1]);
}

function hasTrainingIntent(transcript) {
  return /\b(worked out|workout|trained|training|lifted|strength|weights?|cardio|run|ran|walk|walked|cycle|bike|swim|chest|back|shoulders?|arms?|legs?|biceps|triceps)\b/i.test(
    transcript
  );
}

function hasActivityIntent(transcript) {
  if (isNutritionMacroClauseWithoutActivityContext(transcript)) return false;

  return /\b(run|ran|jog|walked|walk|steps?|active|activity|move calories|exercise minutes|burned|calories|cals)\b/i.test(
    transcript
  );
}

function inferVoiceActivityType(transcript) {
  if (/\b(strength|lifted|weights?|resistance|trained|training|chest|back|shoulders?|arms?|legs?|biceps|triceps)\b/i.test(transcript)) {
    return "Traditional Strength Training";
  }
  if (/\bstair\s+stepper\b/i.test(transcript)) return "Stair Stepper";
  if (/\bwalked|walk\b/i.test(transcript)) return "Outdoor Walk";
  if (/\brun|ran\b/i.test(transcript)) return "Run";
  if (/\bbike|cycle|cycling\b/i.test(transcript)) return "Cycling";

  return "Workout";
}

function inferWorkoutFocus(transcript) {
  const text = String(transcript ?? "");
  if (/\bshoulders?|delts?\b/i.test(text)) return "Shoulders";
  if (/\bback|lats?\b/i.test(text)) return "Back";
  if (/\bchest|pecs?\b/i.test(text)) return "Chest";
  if (/\barms?|biceps|triceps\b/i.test(text)) return "Arms";
  if (/\bcore|abs?|crunch(?:es)?|planks?|hanging\s+leg\s+raises?\b/i.test(text)) return "Core";
  if (/\blegs?|quads?|hamstrings?|glutes?\b/i.test(text)) return "Legs";

  return null;
}

function extractDurationSeconds(transcript) {
  const normalized = normalizeNumberWords(transcript);
  const halfMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s+(?:and\s+)?(?:a\s+)?half\s*(minutes?|mins?|hours?|hrs?)\b/i
  );
  if (halfMatch) {
    const value = Number(halfMatch[1]) + 0.5;
    return /h/i.test(halfMatch[2])
      ? Math.round(value * 3600)
      : Math.round(value * 60);
  }

  const match = normalized.match(
    /(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i
  );
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  return /h/i.test(match[2]) ? Math.round(value * 3600) : Math.round(value * 60);
}

function extractActiveCalories(transcript) {
  if (isNutritionMacroClauseWithoutActivityContext(transcript)) {
    return null;
  }
  if (/\bmeal detail\b/i.test(transcript)) {
    return null;
  }
  if (hasMealMacroContext(transcript) && !/\b(burned|active|workout|training|run|walk|cardio)\b/i.test(transcript)) {
    return null;
  }

  const match = normalizeNumberWords(transcript).match(
    /(\d[\d,]*)\s*(?:active\s*)?(?:calories|cals|cal)\b/i
  );

  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function extractDistance(transcript) {
  const match = normalizeNumberWords(transcript).match(
    /(?:around|about|approximately)?\s*(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km)\b/i
  );
  if (!match) return null;

  return {
    value: Number(match[1]),
    unit: /^k/i.test(match[2]) ? "km" : "mi",
  };
}

function extractEffortLevel(transcript) {
  const source = extractEffortPhraseSource(transcript);

  if (source?.level) return source.level;

  return null;
}

function extractEffortPhraseSource(transcript) {
  const text = String(transcript ?? "");

  if (/\b(not hard|easy|light|low effort|smooth|relaxed)\b/i.test(text)) {
    return { level: "easy", phrase: text.match(/\b(not hard|easy|light|low effort|smooth|relaxed)\b/i)?.[0] };
  }
  if (/\b(moderate|normal|fine|manageable|not too bad|average|steady)\b/i.test(text)) {
    return { level: "moderate", phrase: text.match(/\b(moderate|normal|fine|manageable|not too bad|average|steady)\b/i)?.[0] };
  }
  if (/\b(tough|hard|difficult|brutal|intense|challenging|pushed through|powered through|got through it|harder than usual|pretty hard|very hard)\b/i.test(text)) {
    return { level: "hard", phrase: text.match(/\b(tough|hard|difficult|brutal|intense|challenging|pushed through|powered through|got through it|harder than usual|pretty hard|very hard)\b/i)?.[0] };
  }

  return null;
}

function hasMealMacroContext(transcript) {
  return /\b(?:meal detail|meal|lunch|dinner|breakfast|ate|had|made|protein|macros?)\b/i.test(
    String(transcript ?? "")
  ) && /\b\d[\d,]*\s*(?:calories|cals|cal)\b/i.test(String(transcript ?? ""));
}

function hasIncidentalWalkHome(transcript) {
  const text = String(transcript ?? "");
  if (!hasNarrativeGluePhrase(text)) return false;

  return !hasExplicitActivityMetrics(text);
}

function hasNarrativeGlueSuppression(transcript) {
  const text = String(transcript ?? "");

  return hasNarrativeGluePhrase(text) && !hasExplicitActivityMetrics(text);
}

function hasNarrativeGluePhrase(transcript) {
  return /\b(?:went\s+home|came\s+home|got\s+home|walked?\s+home|walked?\s+over|went\s+over|headed\s+home|drove\s+home)\b/i.test(
    String(transcript ?? "")
  );
}

function hasExplicitActivityMetrics(transcript) {
  return /\b(\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|miles?|mi|km|kilometers?)|burned|active\s+calories|calories\s+burned|cals|workout|cardio|outdoor\s+walk|pace|heart\s+rate|bpm)\b/i.test(
    String(transcript ?? "")
  );
}

function isNutritionMacroClauseWithoutActivityContext(clause) {
  const text = String(clause ?? "");
  if (!/\b(calories|cals|cal|protein|macros?)\b/i.test(text)) return false;
  if (/\b(burned|active|move\s+calories|exercise\s+minutes|workout\s+calories|training|workout|run|ran|walked|walk|cardio)\b/i.test(text)) {
    return false;
  }

  return /\b(burger|cheeseburger|meal|food|lunch|dinner|breakfast|snack|ate|had|made|protein|the\s+(?:burger|meal|food)\s+was|that\s+was\s+about|it\s+was\s+about)\b/i.test(
    text
  );
}

function extractPaceDescriptor(transcript) {
  const effort = extractEffortLevel(transcript);
  if (effort) return `${effort} pace`;

  const match = String(transcript ?? "").match(
    /\b(?:pace\s+(?:was|is)?|at\s+a)\s*(easy|moderate|steady|hard)\s*pace\b/i
  );

  return match?.[1] ? `${match[1].toLowerCase()} pace` : null;
}

function extractProtocolEntityName(transcript) {
  if (/\btesamorelin\b/i.test(transcript)) return "Tesamorelin";
  if (/\bretatrutide\b/i.test(transcript)) return "Retatrutide";

  const match = String(transcript ?? "").match(
    /\b(?:took|injected|dose(?:d)?|forgot|missed)\s+([a-z][a-z\s-]{2,40}?)(?:\s+(?:this|yesterday|today|morning|night|dose)|[,.]|$)/i
  );

  return match?.[1] ? titleCase(match[1].trim()) : null;
}

function extractSkippedActivityName(transcript) {
  if (!/\b(skipped|missed|forgot)\b/i.test(transcript)) return null;
  if (/\bcardio\b/i.test(transcript)) return "Cardio";
  if (/\bworkout|training|lift(?:ing)?\b/i.test(transcript)) return "Training";
  if (/\bwalk\b/i.test(transcript)) return "Walk";

  const match = String(transcript ?? "").match(/\b(?:skipped|missed)\s+([a-z\s-]+?)(?:\s+(?:today|yesterday)|[,.]|$)/i);
  return match?.[1] ? titleCase(match[1].trim()) : null;
}

function extractBodyLocation(transcript) {
  const rotatorCuffMatch = String(transcript ?? "").match(
    /\b(left|right)?\s*rotator\s+cuff\b/i
  );
  if (rotatorCuffMatch) {
    return titleCase(`${rotatorCuffMatch[1] ?? ""} Rotator Cuff`.trim());
  }

  const matches = [
    ...String(transcript ?? "").matchAll(
      /\b(left|right)?\s*(shoulders?|knees?|hips?|back|elbows?|wrists?|ankles?|hamstrings?|quads?|chest|neck)\b/gi
    ),
  ];
  const match = matches.find((candidate) => candidate[1]) ?? matches[0];
  if (!match) return null;

  return titleCase(`${match[1] ?? ""} ${singularizeBodyLocation(match[2])}`.trim());
}

function singularizeBodyLocation(value) {
  return String(value ?? "")
    .replace(/ies$/i, "y")
    .replace(/s$/i, "");
}

function extractSymptomTrigger(transcript) {
  if (hasUnknownTriggerContext(transcript)) return "unknown";

  const match = String(transcript ?? "").match(/\bduring\s+([^,.]+?)(?:[,.]|$)/i);
  return match?.[1] ? titleCase(match[1].trim()) : null;
}

function extractSymptomDuration(transcript) {
  if (hasTodaySymptomContext(transcript)) return "today";
  if (/\bthis week\b/i.test(transcript)) return "this week";
  if (/\bfor\s+(?:a\s+)?(\d+\s+)?(?:days?|weeks?|months?)\b/i.test(transcript)) {
    return String(transcript).match(/\bfor\s+([^,.]+?)(?:[,.]|$)/i)?.[1] ?? null;
  }

  return null;
}

function hasTodaySymptomContext(transcript) {
  return /\b(?:hurt|hurts|bothering|felt off|feeling well|felt well|sore|pain|ache|aching|barking)[^,.]*\btoday\b|\btoday[^,.]*(?:hurt|hurts|bothering|felt off|feeling well|felt well|sore|pain|ache|aching|barking)\b/i.test(
    String(transcript ?? "")
  );
}

function hasUnknownTriggerContext(transcript) {
  return /\b(?:i\s+don'?t\s+know|not\s+sure|unsure|no\s+idea)(?:\s+what\s+triggered\s+it)?\b/i.test(
    String(transcript ?? "")
  );
}

function extractSymptomSeverity(transcript) {
  const text = String(transcript ?? "");
  if (/\b(severe|really bad|very bad|sharp|can'?t|cannot)\b/i.test(text)) {
    return "severe";
  }
  if (/\b(moderate|medium|noticeable)\b/i.test(text)) return "moderate";
  if (/\b(mild|doesn'?t hurt that bad|not that bad|not a big deal|no big deal|minor|slight|a little sore|little sore)\b/i.test(text)) {
    return "mild";
  }

  return null;
}

function extractPerformanceRecord(transcript) {
  const normalized = normalizeNumberWords(transcript);
  let match = normalized.match(
    /\b(?:hit|set|got)\s+(?:a\s+)?pr\s+(?:on|for)?\s*([a-z\s-]+?)\s+(?:today\s*)?,?\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)?\s*(?:for|x)\s*(\d+)\b/i
  );
  if (!match) {
    const hitLoadForRepsMatch = normalized.match(
      /\bhit\s+(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)?\s+for\s+(\d+)\s+on\s+([a-z\s-]+?)(?:\s+today|[,.]|$)/i
    );

    if (hitLoadForRepsMatch) {
      match = [
        hitLoadForRepsMatch[0],
        hitLoadForRepsMatch[3],
        hitLoadForRepsMatch[1],
        hitLoadForRepsMatch[2],
      ];
    }
  }
  if (!match) return null;

  return {
    exercise: titleCase(match[1].trim()),
    load: {
      value: Number(match[2]),
      unit: "lb",
    },
    reps: Number(match[3]),
    record_type: "performance_pr",
  };
}

function extractDatePhrase(transcript) {
  const match = String(transcript ?? "").match(
    /\b(next\s+\w+|january|february|march|april|may|june|july|august|september|october|november|december|through\s+\w+|from\s+\w+\s+through\s+\w+|july\s+\d{1,2})[^,.]*/i
  );
  return match?.[0] ? match[0].trim() : null;
}

function extractGoalName(transcript) {
  if (/\bvisible\s+abs\b/i.test(transcript)) return "Visible Abs";
  if (/\bwant\s+(?:to\s+)?(.+?)(?:[,.]|$)/i.test(transcript)) {
    const match = transcript.match(/\bwant\s+(?:to\s+)?(.+?)(?:[,.]|$)/i);
    return match?.[1] ? titleCase(match[1].trim()) : null;
  }

  return null;
}

function normalizeTranscript(value) {
  return String(value ?? "").trim();
}

function normalizeCorrectionUnit(unit) {
  return /kg/i.test(String(unit ?? "")) ? "kg" : "lb";
}

function normalizeDistanceCorrectionUnit(unit) {
  return /^k/i.test(String(unit ?? "")) ? "km" : "mi";
}

function inferCorrectionTarget(transcript) {
  if (/\bshoulder\s+press\s+machine\b/i.test(transcript)) {
    return "shoulder press machine load";
  }
  if (/\bshoulder\s+press\b/i.test(transcript)) return "shoulder press load";
  if (/\bweight|load|pounds?|lbs?|kg\b/i.test(transcript)) return "exercise load";

  return "spoken value";
}

function dedupeResolutionValues(values = []) {
  const valueMap = new Map();

  values.forEach((value) => {
    const key = `${value.value}-${value.unit}-${value.applies_to ?? ""}-${value.reason}`;
    valueMap.set(key, value);
  });

  return [...valueMap.values()];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDateKey(value) {
  const text = String(value ?? "").slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function offsetDate(dateKey, offsetDays) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function resolveLastWeekday(baseDateKey, weekdayName) {
  const weekdayIndexes = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const targetIndex = weekdayIndexes[String(weekdayName ?? "").toLowerCase()];
  if (targetIndex === undefined) return baseDateKey;

  const [year, month, day] = baseDateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const currentIndex = date.getDay();
  let delta = currentIndex - targetIndex;
  if (delta <= 0) delta += 7;

  return offsetDate(baseDateKey, -delta);
}

function normalizeNumberWords(text) {
  const numberWords = {
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

  return String(text ?? "").replace(/\b([a-z]+(?:-[a-z]+)?)\b/gi, (match) => {
    const lower = match.toLowerCase();
    if (numberWords[lower] !== undefined) return String(numberWords[lower]);

    const parts = lower.split("-");
    if (parts.length === 2 && numberWords[parts[0]] && numberWords[parts[1]]) {
      return String(numberWords[parts[0]] + numberWords[parts[1]]);
    }

    return match;
  });
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
