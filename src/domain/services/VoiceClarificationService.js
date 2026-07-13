import { detectVoiceIntent } from "./VoiceIntentService";

export function getVoiceClarificationPlan({
  completionPhraseDetectedInOriginalTranscript = null,
  detectedEvidenceIntents = [],
  evidenceObjects = [],
  numericResilience = null,
  primaryIntent = null,
  resolvedClarificationIds = [],
  transcript = "",
} = {}) {
  const intent = primaryIntent ?? detectVoiceIntent(transcript);
  const resolved = new Set(resolvedClarificationIds);
  const candidates = getClarificationCandidates({
    evidenceObjects,
    intent,
    numericResilience,
    transcript,
  });
  const skippedCandidates = candidates.filter((candidate) => candidate.skip);
  const discardedCandidates = candidates.filter(
    (candidate) => !candidate.skip && candidate.clarificationScore < 50
  );
  const eligibleOpportunities = candidates
    .filter((candidate) => !candidate.skip)
    .filter((candidate) => candidate.clarificationScore >= 50)
    .sort((a, b) => b.clarificationScore - a.clarificationScore)
    .slice(0, 4)
    .map(({ skip, ...opportunity }) => ({
      ...opportunity,
      queueTargetKey: createQueueTargetKey(opportunity),
      topic: getClarificationTopic(opportunity),
    }));
  const evidenceClarificationQueue = eligibleOpportunities.map((opportunity, index) =>
    createClarificationQueueItem({ index, opportunity, resolved })
  );
  const opportunities = eligibleOpportunities.filter(
    (opportunity) =>
      !resolved.has(opportunity.id) &&
      !resolved.has(`${opportunity.id}_narrative_expansion`) &&
      !resolved.has(opportunity.queueTargetKey)
  );
  const goodEnoughToSave =
    evidenceObjects.length > 0 ||
    ["goal_update", "upcoming_event", "observation"].includes(
      intent.detectedPrimaryIntent
    );
  const userEndedInteraction =
    Boolean(completionPhraseDetectedInOriginalTranscript?.detected) &&
    goodEnoughToSave;
  const nextQuestion = userEndedInteraction
    ? null
    : getNextQuestion({
        evidenceObjects,
        goodEnoughToSave,
        intent,
        opportunities,
        resolved,
        transcript,
      });
  const visibleEvidenceClarificationQueue =
    userEndedInteraction
      ? []
      : nextQuestion?.isMixedEvidenceUmbrella
        ? [
            createClarificationQueueItem({
              index: 0,
              opportunity: nextQuestion,
              resolved,
            }),
          ]
        : evidenceClarificationQueue;
  const skippedQueueTargets = [
    ...skippedCandidates.map((candidate) => createQueueTargetKey(candidate)),
    ...discardedCandidates.map((candidate) => createQueueTargetKey(candidate)),
    ...(nextQuestion?.mixedPromptSuppressedNarrowPrompt
      ? opportunities.map((opportunity) => opportunity.queueTargetKey)
      : []),
  ];

  return {
    detectedPrimaryIntent: intent.detectedPrimaryIntent,
    detectedEvidenceIntents,
    intentConfidence: intent.intentConfidence,
    intentReason: intent.reason,
    status: nextQuestion ? "clarifying" : "review",
    goodEnoughToSave,
    userEndedInteraction,
    nextQuestion,
    mixedEvidenceUmbrellaPromptUsed: Boolean(
      nextQuestion?.mixedEvidenceUmbrellaPromptUsed
    ),
    mixedTopicSelectionPromptUsed: Boolean(
      nextQuestion?.mixedTopicSelectionPromptUsed ??
        nextQuestion?.mixedEvidenceUmbrellaPromptUsed
    ),
    availableExpansionTopics: nextQuestion?.availableExpansionTopics ?? [],
    promptCoveredEvidenceTypes: nextQuestion?.promptCoveredEvidenceTypes ?? [],
    mixedPromptSuppressedNarrowPrompt:
      nextQuestion?.mixedPromptSuppressedNarrowPrompt ?? false,
    narrowPromptSuppressedReason:
      nextQuestion?.narrowPromptSuppressedReason ?? null,
    symptomPromptSuppressedInMixedEvidence: skippedCandidates.some(
      (candidate) =>
        candidate.evidence_type === "health_symptom" &&
        /mixed evidence symptom/i.test(candidate.skipReason ?? "")
    ),
    opportunities,
    evidenceClarificationQueue: visibleEvidenceClarificationQueue,
    currentQueueIndex: nextQuestion
      ? visibleEvidenceClarificationQueue.findIndex(
          (item) =>
            item.id === nextQuestion.id ||
            item.id === nextQuestion.originalClarificationId
        )
      : -1,
    currentQueueTarget: nextQuestion
      ? {
          evidence_type: nextQuestion.evidence_type,
          questionId: nextQuestion.id,
          queueTargetKey:
            nextQuestion.queueTargetKey ?? createQueueTargetKey(nextQuestion),
          targetEvidenceObjectId: nextQuestion.targetEvidenceObjectId,
          topic: nextQuestion.topic ?? getClarificationTopic(nextQuestion),
        }
      : null,
    resolvedQueueTargets: visibleEvidenceClarificationQueue
      .filter((item) => item.status === "resolved")
      .map((item) => item.queueTargetKey),
    skippedQueueTargets: uniqueStrings(skippedQueueTargets),
    whyNextTargetWasChosen: nextQuestion
      ? `Selected ${nextQuestion.evidence_type} because "${nextQuestion.question}" has the highest remaining clarification value for its unresolved evidence target.`
      : userEndedInteraction
        ? "The user ended the interaction with a completion phrase, so current evidence is ready to save."
      : goodEnoughToSave
        ? "No remaining clarification would materially improve the current evidence."
        : "No clarification target is available.",
    whyOtherTargetsWereSkipped: [
      ...skippedCandidates.map((candidate) => ({
        id: candidate.id,
        question: candidate.question,
        reason: candidate.skipReason,
        targetEvidenceObjectId: candidate.targetEvidenceObjectId,
      })),
      ...discardedCandidates.map((candidate) => ({
        id: candidate.id,
        question: candidate.question,
        reason:
          "Skipped because another unresolved target has higher expected evidence value.",
        targetEvidenceObjectId: candidate.targetEvidenceObjectId,
      })),
    ],
    clarificationCandidates: candidates.map(({ skip, ...candidate }) => candidate),
    discardedClarifications: discardedCandidates.map((candidate) => ({
      id: candidate.id,
      question: candidate.question,
      reason: "Skipped because this question would not materially improve canonical evidence.",
      clarificationReason: candidate.clarificationReason,
      clarificationScore: candidate.clarificationScore,
      evidence_type: candidate.evidence_type,
      targetEvidenceObjectId: candidate.targetEvidenceObjectId,
    })),
    currentClarificationTarget: nextQuestion
      ? {
          evidence_type: nextQuestion.evidence_type,
          questionId: nextQuestion.id,
          targetEvidenceObjectId: nextQuestion.targetEvidenceObjectId,
        }
      : null,
    goodBetterBestLevel: getGoodBetterBestLevel({
      evidenceObjects,
      nextQuestion,
      opportunities,
    }),
    whyHigherPriorityQuestionsWereSkipped: skippedCandidates.map((candidate) => ({
      id: candidate.id,
      question: candidate.question,
      reason: candidate.skipReason,
      wouldHaveAskedFor: candidate.clarificationReason,
    })),
  };
}

function createClarificationQueueItem({ index, opportunity, resolved }) {
  const queueTargetKey = opportunity.queueTargetKey ?? createQueueTargetKey(opportunity);

  return {
    id: opportunity.id,
    evidence_type: opportunity.evidence_type,
    queueIndex: index,
    queueTargetKey,
    question: opportunity.question,
    score: opportunity.clarificationScore,
    status:
      resolved.has(opportunity.id) ||
      resolved.has(`${opportunity.id}_narrative_expansion`) ||
      resolved.has(queueTargetKey)
        ? "resolved"
        : "unresolved",
    targetEvidenceObjectId: opportunity.targetEvidenceObjectId,
    topic: opportunity.topic ?? getClarificationTopic(opportunity),
  };
}

function createQueueTargetKey(opportunity) {
  const topic = getClarificationTopic(opportunity);

  if (opportunity.evidence_type === "training") {
    return `training:session:${topic}`;
  }
  if (opportunity.evidence_type === "nutrition") {
    return `nutrition:meal:${topic}`;
  }
  if (opportunity.evidence_type === "health_symptom") {
    return `health_symptom:symptom:${topic}`;
  }
  if (opportunity.evidence_type === "morning_weight") {
    return `morning_weight:entry:${topic}`;
  }

  return [opportunity.evidence_type, "evidence", topic].join(":");
}

function getClarificationTopic(opportunity = {}) {
  const id = String(opportunity.id ?? "");
  const suffix = id.split("_").at(-1);

  if (/exercises/i.test(id)) return "exercises";
  if (/sets_reps/i.test(id)) return "sets_reps";
  if (/meal_contents|foods/i.test(id)) return "foods";
  if (/portion/i.test(id)) return "portion";
  if (/severity/i.test(id)) return "severity";
  if (/duration/i.test(id)) return "duration";
  if (/distance/i.test(id)) return "distance";
  if (/calories/i.test(id)) return "calories";
  if (/heart_rate/i.test(id)) return "heart_rate";
  if (/pace/i.test(id)) return "pace";
  if (/effort/i.test(id)) return "effort";

  return suffix || "details";
}

export function isVoiceCompletionPhrase(value) {
  return /^(no|nope|no thanks|not now|nothing else|that'?s it|thats it|that is it|that'?s all for today|thats all for today|that is all for today|i'?m good|i am good|we'?re good|we are good|all good|good|good to go|save|save it|log it|done|all done|finished|skip|skip it|don'?t ask|do not ask|no more|move on|leave it|save as-is|save as is|fine as is|that'?s all|thats all|that is all)$/i.test(
    String(value ?? "").trim()
  );
}

function getNextQuestion({
  evidenceObjects = [],
  goodEnoughToSave,
  intent,
  opportunities = [],
  resolved = new Set(),
  transcript = "",
}) {
  const topOpportunity = opportunities[0] ?? null;
  const userFacingEvidenceObjects = getUserFacingEvidenceObjectsForUmbrella(
    evidenceObjects
  );

  if (!topOpportunity) {
    if (
      shouldUseMixedEvidenceUmbrella({
        goodEnoughToSave,
        resolved,
        topOpportunity,
        userFacingEvidenceObjects,
      })
    ) {
      return createMixedEvidenceUmbrellaQuestion({
        evidenceObjects: userFacingEvidenceObjects,
        topOpportunity: createMixedEvidenceUmbrellaOpportunity(),
        transcript,
      });
    }

    return null;
  }
  if (topOpportunity.id?.startsWith("numeric_")) return topOpportunity;
  if (
    shouldUseMixedEvidenceUmbrella({
      goodEnoughToSave,
      resolved,
      topOpportunity,
      userFacingEvidenceObjects,
    })
  ) {
    return createMixedEvidenceUmbrellaQuestion({
      evidenceObjects: userFacingEvidenceObjects,
      topOpportunity: topOpportunity ?? createMixedEvidenceUmbrellaOpportunity(),
      transcript,
    });
  }
  if (!goodEnoughToSave) return topOpportunity;

  return createNarrativeExpansionQuestion({
    evidenceObject: findEvidenceObjectForOpportunity({
      evidenceObjects,
      opportunity: topOpportunity,
    }),
    intent,
    opportunities,
    opportunity: topOpportunity,
  });
}

function shouldUseMixedEvidenceUmbrella({
  goodEnoughToSave,
  resolved,
  topOpportunity,
  userFacingEvidenceObjects = [],
}) {
  if (!goodEnoughToSave) return false;
  if (userFacingEvidenceObjects.length <= 1) return false;
  if (resolved.has("mixed:evidence:umbrella")) return false;
  if (topOpportunity?.id?.startsWith("numeric_")) return false;
  if (
    (topOpportunity?.clarificationScore ?? 0) >= 100 &&
    !hasMixedSymptomTrainingNutrition(userFacingEvidenceObjects)
  ) {
    return false;
  }

  return true;
}

function hasMixedSymptomTrainingNutrition(evidenceObjects = []) {
  const types = new Set(evidenceObjects.map((object) => object.evidence_type));

  return (
    types.has("health_symptom") &&
    types.has("training") &&
    types.has("nutrition")
  );
}

function getUserFacingEvidenceObjectsForUmbrella(evidenceObjects = []) {
  const umbrellaTypes = new Set([
    "training",
    "nutrition",
    "health_symptom",
    "morning_weight",
    "protocol_completion",
    "skipped_activity",
    "performance_record",
    "upcoming_event",
    "goal_update",
  ]);

  return evidenceObjects.filter((object) => umbrellaTypes.has(object.evidence_type));
}

function createMixedEvidenceUmbrellaOpportunity() {
  return {
    id: "mixed_evidence_umbrella",
    evidence_type: "mixed",
    targetEvidenceObjectId: "mixed:evidence",
    clarificationReason:
      "Multiple evidence objects are good enough; only optional expansion remains.",
    clarificationScore: 60,
  };
}

function createMixedEvidenceUmbrellaQuestion({
  evidenceObjects = [],
  topOpportunity,
  transcript = "",
}) {
  const evidenceTypes = uniqueStrings(
    evidenceObjects.map((object) => object.evidence_type)
  );

  return {
    ...topOpportunity,
    id: "mixed_evidence_umbrella_narrative_expansion",
    evidence_type: "mixed",
    isMixedEvidenceUmbrella: true,
    isNarrativeExpansion: true,
    mixedEvidenceUmbrellaPromptUsed: true,
    mixedTopicSelectionPromptUsed: true,
    originalClarificationId: topOpportunity.id,
    availableExpansionTopics: createMixedEvidenceExpansionTopics(
      evidenceTypes,
      transcript
    ),
    promptCoveredEvidenceTypes: evidenceTypes,
    mixedPromptSuppressedNarrowPrompt:
      topOpportunity.evidence_type !== "mixed" ||
      hasMixedSymptomTrainingNutrition(evidenceObjects),
    narrowPromptSuppressedReason:
      topOpportunity.evidence_type !== "mixed"
        ? `A mixed evidence topic prompt was more useful than the narrower ${topOpportunity.evidence_type} prompt "${topOpportunity.question ?? topOpportunity.id}".`
        : hasMixedSymptomTrainingNutrition(evidenceObjects)
          ? "A mixed evidence topic prompt was more useful than returning to a narrow symptom, workout, or nutrition expansion prompt."
        : null,
    queueTargetKey: "mixed:evidence:umbrella",
    topic: "umbrella",
    question: createMixedEvidenceUmbrellaCopy({
      evidenceObjects,
      evidenceTypes,
      transcript,
    }),
    quickResponses: createMixedEvidenceTopicResponses(evidenceTypes, transcript),
    clarificationReason:
      "Optional umbrella expansion across multiple good-enough evidence objects.",
    clarificationScore: Math.max(50, topOpportunity.clarificationScore - 10),
  };
}

function createMixedEvidenceExpansionTopics(evidenceTypes = [], transcript = "") {
  const topics = [];

  if (evidenceTypes.includes("health_symptom")) topics.push("injury");
  if (evidenceTypes.includes("training")) topics.push("workout");
  if (evidenceTypes.includes("nutrition")) {
    topics.push(/\blunch\b/i.test(transcript) ? "lunch" : "meal");
  }

  return topics;
}

function createMixedEvidenceTopicResponses(evidenceTypes = [], transcript = "") {
  const responses = [];

  if (evidenceTypes.includes("health_symptom")) responses.push("Injury");
  if (evidenceTypes.includes("training")) responses.push("Workout");
  if (evidenceTypes.includes("nutrition")) {
    responses.push(/\blunch\b/i.test(transcript) ? "Lunch" : "Meal");
  }

  return [...responses, "Keep speaking", "Save"];
}

function createMixedEvidenceUmbrellaCopy({
  evidenceObjects = [],
  evidenceTypes = [],
  transcript = "",
}) {
  const hasSymptom = evidenceTypes.includes("health_symptom");
  const hasTraining = evidenceTypes.includes("training");
  const hasNutrition = evidenceTypes.includes("nutrition");
  const mealLabel = /\blunch\b/i.test(transcript)
    ? "lunch"
    : /\bdinner\b/i.test(transcript)
      ? "dinner"
      : /\bbreakfast\b/i.test(transcript)
        ? "breakfast"
        : "meal";

  if (hasSymptom && hasTraining && hasNutrition) {
    const examples = getMixedEvidenceUmbrellaExamples({
      evidenceObjects,
      mealLabel,
    });

    return `Logged your shoulder issue, workout, and ${mealLabel}. Want to add anything else? You can share more about ${formatUmbrellaExamples(examples)}.`;
  }
  if (hasTraining && hasNutrition) {
    const examples = getMixedEvidenceUmbrellaExamples({
      evidenceObjects,
      mealLabel,
    }).filter((example) => !/shoulder|injury|issue/i.test(example));

    return `Logged your workout and ${mealLabel}. Want to add anything else? You can share more about ${formatUmbrellaExamples(examples)}.`;
  }
  if (hasTraining) {
    return "Workout logged. Want to add anything else? Exercises, sets, reps, weights, effort, or anything else worth capturing.";
  }
  if (hasSymptom) {
    return "Got it. Want to add anything else about the issue? Severity, how long it's been happening, what triggered it, or what movements affect it.";
  }

  return "Logged. Want to add anything else worth capturing?";
}

function getMixedEvidenceUmbrellaExamples({
  evidenceObjects = [],
  mealLabel = "meal",
} = {}) {
  const examples = [];
  const symptom = evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const training = evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );

  if (symptom) {
    examples.push(getSymptomUmbrellaExample(symptom));
  }

  if (training && !trainingHasCompleteExercisePrescriptions(training)) {
    examples.push("sets, reps, or weights for the workout");
  }

  if (nutrition) {
    if (!nutritionHasKnownFoodAndMacros(nutrition)) {
      examples.push(`calories/macros for ${mealLabel}`);
    } else {
      examples.push(`${mealLabel} details`);
    }
  }

  examples.push("anything else worth capturing");

  return uniqueStrings(examples);
}

function formatUmbrellaExamples(examples = []) {
  const visibleExamples = examples.filter(Boolean);

  if (visibleExamples.length === 0) return "anything else worth capturing";
  if (visibleExamples.length === 1) return visibleExamples[0];
  if (visibleExamples.length === 2) {
    return `${visibleExamples[0]} or ${visibleExamples[1]}`;
  }

  return `${visibleExamples.slice(0, -1).join(", ")}, or ${visibleExamples.at(
    -1
  )}`;
}

function getSymptomUmbrellaExample(symptom = {}) {
  const location = String(symptom.metadata?.body_location ?? "").toLowerCase();

  if (location.includes("shoulder")) return "the shoulder";
  if (location) return `the ${location}`;

  return "the issue";
}

function trainingHasCompleteExercisePrescriptions(training = {}) {
  const exercises = training.exercises ?? [];
  if (exercises.length === 0) return false;

  return exercises.every((exercise) =>
    (exercise.sets ?? []).some(
      (set) =>
        Number.isFinite(Number(set.reps)) &&
        Number.isFinite(Number(set.weight))
    )
  );
}

function nutritionHasKnownFoodAndMacros(nutrition = {}) {
  const foods = nutrition.meals?.flatMap((meal) => meal.foods ?? []) ?? [];
  const totals = nutrition.daily_totals ?? {};

  return (
    foods.length > 0 &&
    hasFiniteMetric(totals.calories) &&
    hasFiniteMetric(totals.protein_g)
  );
}

function createNarrativeExpansionQuestion({
  evidenceObject,
  intent,
  opportunities = [],
  opportunity,
}) {
  const evidenceType = opportunity.evidence_type;
  const expansion = getNarrativeExpansionCopy({
    evidenceObject,
    evidenceType,
    intent,
    opportunities,
  });

  return {
    ...opportunity,
    id: `${opportunity.id}_narrative_expansion`,
    isNarrativeExpansion: true,
    originalClarificationId: opportunity.id,
    queueTargetKey: opportunity.queueTargetKey ?? createQueueTargetKey(opportunity),
    topic: opportunity.topic ?? getClarificationTopic(opportunity),
    question: expansion.question,
    quickResponses: expansion.quickResponses,
    clarificationReason:
      `Optional narrative expansion based on: ${opportunity.clarificationReason}`,
    clarificationScore: Math.max(50, opportunity.clarificationScore - 10),
  };
}

function findEvidenceObjectForOpportunity({ evidenceObjects = [], opportunity } = {}) {
  if (!opportunity?.targetEvidenceObjectId) return null;

  return (
    evidenceObjects.find(
      (object) => object.id === opportunity.targetEvidenceObjectId
    ) ?? null
  );
}

function getNarrativeExpansionCopy({
  evidenceObject = null,
  evidenceType,
  intent,
  opportunities = [],
}) {
  if (evidenceType === "training") {
    if (intent.detectedPrimaryIntent === "cardio_workout") {
      const remaining = getCardioNarrativeFields({
        evidenceObject,
        opportunities,
      });
      const detailText = formatRemainingDetailList(remaining);

      return {
        question: detailText
          ? `Run logged. Anything else worth capturing? ${detailText}.`
          : "Run logged. Anything else worth capturing?",
        quickResponses: ["Moderate pace", "Done", "No thanks", "Save"],
      };
    }

    const remaining = getStrengthNarrativeFields({ evidenceObject, opportunities });
    const detailText = formatRemainingDetailList(remaining);

    return {
      question: detailText
        ? `Workout logged. Anything else worth capturing? ${detailText}.`
        : "Workout logged. Anything else worth capturing?",
      quickResponses: ["Bodyweight only", "Hard effort", "Done", "No thanks"],
    };
  }

  if (evidenceType === "nutrition") {
    const remaining = getNutritionNarrativeFields({ evidenceObject, opportunities });
    const detailText = formatRemainingDetailList(remaining);

    return {
      question: detailText
        ? `Meal logged. Anything else worth capturing? ${detailText}.`
        : "Meal logged. Anything else worth capturing?",
      quickResponses: ["Meal only", "Done", "No thanks", "Save"],
    };
  }

  if (evidenceType === "health_symptom") {
    const remaining = getSymptomNarrativeFields({ evidenceObject, opportunities });
    const detailText = formatRemainingDetailList(remaining);

    return {
      question: detailText
        ? `Got it. Anything else about the issue worth capturing? ${detailText}.`
        : "Got it. Anything else about the issue worth capturing?",
      quickResponses: ["Mild", "Moderate", "Done", "No thanks"],
    };
  }

  return {
    question: "Got it. Anything else worth capturing?",
    quickResponses: ["Done", "No thanks", "Save"],
  };
}

function getCardioNarrativeFields({ evidenceObject = {}, opportunities = [] }) {
  const metadata = evidenceObject?.metadata ?? {};
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  const fields = [];

  if (!hasFiniteMetric(metadata.distance) && hasOpportunity(opportunityIds, "distance")) {
    fields.push("distance");
  }
  if (!hasFiniteMetric(metadata.duration_seconds) && hasOpportunity(opportunityIds, "duration")) {
    fields.push("duration");
  }
  if (!metadata.average_pace && !metadata.effort_level && hasOpportunity(opportunityIds, "pace")) {
    fields.push("pace");
  }
  if (!hasFiniteMetric(metadata.active_calories) && hasOpportunity(opportunityIds, "calories")) {
    fields.push("calories");
  }
  if (!hasFiniteMetric(metadata.average_heart_rate) && hasOpportunity(opportunityIds, "heart_rate")) {
    fields.push("heart rate");
  }
  if (fields.some((field) => ["calories", "heart rate"].includes(field))) {
    fields.push("route");
  }

  return uniqueStrings(fields);
}

function getStrengthNarrativeFields({ evidenceObject = {}, opportunities = [] }) {
  evidenceObject = evidenceObject ?? {};
  const metadata = evidenceObject?.metadata ?? {};
  const exercises = evidenceObject?.exercises ?? [];
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  const exerciseCompleteness =
    evidenceObject.voice_interpretation?.canonicalExerciseCompleteness ??
    evidenceObject.voice_interpretation?.canonical_exercise_completeness ??
    null;
  const missingExerciseNames = (
    exerciseCompleteness?.unmatchedExerciseBlocks ?? []
  )
    .map((block) => block.canonicalExercise)
    .filter(Boolean);
  const fields = [];

  if (hasOpportunity(opportunityIds, "exercises")) {
    if (missingExerciseNames.length > 0) {
      fields.push(`review ${missingExerciseNames.join(", ")}`);
    } else if (exercises.length === 0) {
      fields.push("exercises");
    }
  }
  if (
    exercises.some((exercise) => (exercise.sets ?? []).length === 0) &&
    hasOpportunity(opportunityIds, "sets_reps")
  ) {
    fields.push("sets and reps");
  }
  if (!hasFiniteMetric(metadata.duration_seconds) && hasOpportunity(opportunityIds, "duration")) {
    fields.push("duration");
  }
  if (!metadata.effort_level && hasOpportunity(opportunityIds, "effort")) {
    fields.push("effort");
  }

  return uniqueStrings(fields);
}

function getNutritionNarrativeFields({ evidenceObject = {}, opportunities = [] }) {
  const meals = evidenceObject?.meals ?? [];
  const foods = meals.flatMap((meal) => meal.foods ?? []);
  const totals = evidenceObject?.daily_totals ?? {};
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  const fields = [];

  if (foods.length === 0 && hasOpportunity(opportunityIds, "meal_contents")) {
    fields.push("foods");
  }
  if (hasOpportunity(opportunityIds, "portion_size")) fields.push("portions");
  if (!hasFiniteMetric(totals.calories)) fields.push("calories");
  if (!hasFiniteMetric(totals.protein_g)) fields.push("macros");

  return uniqueStrings(fields);
}

function getSymptomNarrativeFields({ evidenceObject = {}, opportunities = [] }) {
  const metadata = evidenceObject?.metadata ?? {};
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  const fields = [];

  if (!metadata.severity && hasOpportunity(opportunityIds, "severity")) {
    fields.push("severity");
  }
  if (!metadata.duration && hasOpportunity(opportunityIds, "duration")) {
    fields.push("how long it has been happening");
  }
  if (!metadata.trigger_context) fields.push("what triggered it");

  return uniqueStrings(fields);
}

function hasOpportunity(opportunityIds, suffix) {
  return [...opportunityIds].some((id) => id.endsWith(`_${suffix}`));
}

function formatRemainingDetailList(fields = []) {
  if (fields.length === 0) return "";
  if (fields.length === 1) return `Maybe ${fields[0]}`;
  if (fields.length === 2) return `Maybe ${fields[0]} or ${fields[1]}`;

  return `Maybe ${fields.slice(0, -1).join(", ")}, or ${fields.at(-1)}`;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function hasFiniteMetric(value) {
  if (value === null || value === undefined || value === "") return false;

  return Number.isFinite(Number(value));
}

function getClarificationCandidates({
  evidenceObjects,
  intent,
  numericResilience,
  transcript,
}) {
  const numericCandidates = getNumericClarifications({ numericResilience });
  const intentCandidates = getIntentOnlyClarifications({ intent, transcript });
  const objectCandidates = evidenceObjects.flatMap((evidenceObject) =>
    getClarificationOpportunitiesForObject({
      evidenceObject,
      evidenceObjects,
      intent,
      transcript,
    })
  );

  return suppressRedundantNutritionIntentClarifications({
    candidates: [...numericCandidates, ...intentCandidates, ...objectCandidates],
    evidenceObjects,
  });
}

function suppressRedundantNutritionIntentClarifications({
  candidates = [],
  evidenceObjects = [],
} = {}) {
  const nutritionEvidence = evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const foods =
    nutritionEvidence?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];
  const totals = nutritionEvidence?.daily_totals ?? {};
  const hasKnownFoodAndMacros =
    foods.length > 0 &&
    hasFiniteMetric(totals.calories) &&
    hasFiniteMetric(totals.protein_g);

  if (!hasKnownFoodAndMacros) return candidates;

  return candidates.map((candidate) => {
    if (
      candidate.evidence_type !== "nutrition" ||
      !/foods|meal_contents/i.test(candidate.id ?? "")
    ) {
      return candidate;
    }

    return {
      ...candidate,
      skip: true,
      skipReason:
        "Skipped because food, calories, and protein are already known.",
    };
  });
}

function getNumericClarifications({ numericResilience } = {}) {
  return (numericResilience?.numericAmbiguities ?? [])
    .filter((ambiguity) => ambiguity.needsClarification)
    .map((ambiguity) =>
      createOpportunity({
        id: `numeric_${ambiguity.field}_${ambiguity.alternatives.join("_")}`,
        evidenceType: ambiguity.evidence_type ?? "training",
        question: ambiguity.question,
        quickResponses: ambiguity.quickResponses,
        reason: ambiguity.reason,
        score: ambiguity.clarificationScore ?? 118,
        targetEvidenceObjectId:
          ambiguity.targetEvidenceObjectId ??
          `numeric:${ambiguity.evidence_type ?? "training"}:${ambiguity.field}`,
      })
    );
}

function getIntentOnlyClarifications({ intent }) {
  if (intent.detectedPrimaryIntent === "goal_update") {
    return [
      createOpportunity({
        id: "goal_update_goal_role",
        evidenceType: "goal_update",
        question: "How should this goal be used?",
        quickResponses: ["Primary goal", "Secondary goal", "Reaffirm existing goal"],
        reason:
          "Goal intent was recognized, but the user's intended goal role is the highest-value missing detail.",
        score: 95,
      }),
    ];
  }

  if (intent.detectedPrimaryIntent === "upcoming_event") {
    return [
      createOpportunity({
        id: "upcoming_event_confirmation",
        evidenceType: "upcoming_event",
        question: "Should this be saved as an upcoming event?",
        quickResponses: ["Yes", "Add reminder", "Not now"],
        reason:
          "Upcoming event intent was recognized; confirmation is needed before future scheduling support saves it.",
        score: 80,
      }),
    ];
  }

  if (intent.detectedPrimaryIntent === "nutrition") {
    return [
      createOpportunity({
        id: "nutrition_foods_from_meal_intent",
        evidenceType: "nutrition",
        question: "What foods were included?",
        quickResponses: ["Add foods", "Meal only", "Skip"],
        reason:
          "Meal intent was recognized, and food names are the highest-value missing detail.",
        score: 100,
        skip: Boolean(intent.slots?.food_detail_known),
        skipReason: "Skipped because the transcript already includes food detail.",
      }),
    ];
  }

  if (intent.detectedPrimaryIntent === "performance_record") {
    return [
      createOpportunity({
        id: "performance_record_details",
        evidenceType: "performance_record",
        question:
          "Performance noted. Anything else worth capturing? Exercise, load, reps, set count, or why it felt like a PR.",
        quickResponses: ["Add load and reps", "Save note", "No thanks"],
        reason:
          "Performance intent was recognized, and load or reps would make the record more useful.",
        score: 90,
      }),
    ];
  }

  return [];
}

function getClarificationOpportunitiesForObject({
  evidenceObject,
  evidenceObjects = [],
  intent,
  transcript,
}) {
  if (!evidenceObject) return [];

  const attachTarget = (opportunities) =>
    opportunities.map((opportunity) => ({
      ...opportunity,
      targetEvidenceObjectId:
        !opportunity.targetEvidenceObjectId ||
        /^intent:/.test(String(opportunity.targetEvidenceObjectId))
          ? evidenceObject.id ?? opportunity.targetEvidenceObjectId ?? null
          : opportunity.targetEvidenceObjectId,
    }));

  if (evidenceObject.evidence_type === "training") {
    return attachTarget(
      getTrainingClarifications({ evidenceObject, intent, transcript })
    );
  }

  if (evidenceObject.evidence_type === "nutrition") {
    return attachTarget(
      getNutritionClarifications({ evidenceObject, intent, transcript })
    );
  }

  if (evidenceObject.evidence_type === "morning_weight") {
    return attachTarget(getWeightClarifications(evidenceObject));
  }

  if (evidenceObject.evidence_type === "health_symptom") {
    return attachTarget(
      getSymptomClarifications({
        evidenceObject,
        isMixedEvidenceContext:
          getUserFacingEvidenceObjectsForUmbrella(evidenceObjects).length > 1,
        transcript,
      })
    );
  }

  return [];
}

function getTrainingClarifications({ evidenceObject, intent, transcript }) {
  const opportunities = [];
  const activityType = evidenceObject.metadata?.activity_type;
  const exercises = evidenceObject.exercises ?? [];
  const isCardioIntent =
    intent.detectedPrimaryIntent === "cardio_workout" ||
    /run|walk|cycling|outdoor walk|cardio/i.test(activityType ?? "");
  const isStrengthIntent =
    intent.detectedPrimaryIntent === "strength_workout" ||
    /strength|resistance|lifting|weights?/i.test(activityType ?? "");
  const exerciseCompleteness =
    evidenceObject.voice_interpretation?.canonicalExerciseCompleteness ??
    evidenceObject.voice_interpretation?.canonical_exercise_completeness ??
    null;
  const missingExerciseBlocks =
    exerciseCompleteness?.unmatchedExerciseBlocks ?? [];
  const hasIncompleteRecognizedExercises =
    exerciseCompleteness?.allRecognizedExercisesSurvived === false ||
    missingExerciseBlocks.length > 0;
  const missingExerciseNames = missingExerciseBlocks
    .map((block) => block.canonicalExercise)
    .filter(Boolean);

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_workout_type`,
      evidenceType: "training",
      question: "Workout type?",
      quickResponses: ["Strength", "Cardio", "Walk"],
      reason:
        "Workout type would only be useful when the transcript does not already imply strength or cardio.",
      score: 60,
      skip: Boolean(activityType && !/^workout$/i.test(activityType)) || isStrengthIntent || isCardioIntent,
      skipReason:
        "Skipped because the transcript or canonical object already implies the workout type.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_calories`,
      evidenceType: "training",
      question: "Calories burned?",
      quickResponses: ["Skip", "No thanks", "Save"],
      reason:
        "Workout calories improve cardio/activity evidence when they are available.",
      score: 62,
      skip:
        !isCardioIntent ||
        hasFiniteMetric(evidenceObject.metadata?.active_calories),
      skipReason: !isCardioIntent
        ? "Skipped because calories are most useful here for cardio evidence."
        : "Skipped because workout calories are already known.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_heart_rate`,
      evidenceType: "training",
      question: "Average heart rate?",
      quickResponses: ["Skip", "No thanks", "Save"],
      reason:
        "Heart rate improves cardio intensity context when it is available.",
      score: 58,
      skip:
        !isCardioIntent ||
        hasFiniteMetric(evidenceObject.metadata?.average_heart_rate),
      skipReason: !isCardioIntent
        ? "Skipped because heart rate is most useful here for cardio evidence."
        : "Skipped because heart rate is already known.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_effort`,
      evidenceType: "training",
      question: "Effort?",
      quickResponses: ["Easy", "Moderate", "Hard"],
      reason:
        "Effort can add useful training context when the workout is otherwise logged.",
      score: 45,
      skip: Boolean(evidenceObject.metadata?.effort_level),
      skipReason: "Skipped because effort is already known.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_exercises`,
      evidenceType: "training",
      question:
        hasIncompleteRecognizedExercises && missingExerciseNames.length > 0
          ? `I heard ${missingExerciseNames.join(", ")}, but they were not fully captured. Want to review those exercises?`
          : isStrengthIntent &&
        exercises.length === 0 &&
        hasExerciseLikeLanguage(transcript)
          ? "The workout is logged, but the exercise details didn't parse cleanly. Want to review them?"
          : "What exercises did you perform?",
      quickResponses:
        hasIncompleteRecognizedExercises
          ? ["Review details", "Save as-is", "No thanks"]
          : isStrengthIntent &&
        exercises.length === 0 &&
        hasExerciseLikeLanguage(transcript)
          ? ["Review details", "Save as-is", "No thanks"]
          : ["Add exercises", "Bodyweight only", "No details"],
      reason:
        hasIncompleteRecognizedExercises
          ? "Some recognized exercise mentions did not survive canonical exercise construction."
          : isStrengthIntent &&
        exercises.length === 0 &&
        hasExerciseLikeLanguage(transcript)
          ? "Exercise-like language was present, but no canonical exercises were parsed cleanly."
          : "Exercise names provide the largest confidence gain for a strength workout.",
      score: 110,
      skip:
        !isStrengthIntent ||
        (exercises.length > 0 && !hasIncompleteRecognizedExercises),
      skipReason: !isStrengthIntent
        ? "Skipped because this appears to be cardio, not resistance training."
        : hasIncompleteRecognizedExercises
          ? "Not skipped because recognized exercise mentions are missing from canonical exercises."
          : "Skipped because exercises are already present.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_distance`,
      evidenceType: "training",
      question: "Distance?",
      quickResponses: ["1 mile", "3 miles", "4 miles"],
      reason:
        "Distance is a high-value detail for run or walk evidence when it is missing.",
      score: 90,
      skip:
        !isCardioIntent ||
        hasFiniteMetric(evidenceObject.metadata?.distance),
      skipReason: !isCardioIntent
        ? "Skipped because distance is primarily useful for cardio evidence."
        : "Skipped because distance is already known.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_duration`,
      evidenceType: "training",
      question: "Duration?",
      quickResponses: ["30 min", "45 min", "60+ min"],
      reason:
        "Duration improves training confidence when no duration is available.",
      score: isCardioIntent ? 85 : 45,
      skip:
        hasFiniteMetric(evidenceObject.metadata?.duration_seconds) ||
        (isStrengthIntent && exercises.length > 0),
      skipReason:
        isStrengthIntent && exercises.length > 0
          ? "Skipped because the strength exercises already make this evidence useful enough to review."
          : "Skipped because duration is already known.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_pace`,
      evidenceType: "training",
      question: "Pace?",
      quickResponses: ["Easy", "Moderate", "Hard"],
      reason:
        "Pace or intensity can improve cardio interpretation after distance and duration.",
      score: 55,
      skip: !isCardioIntent || Boolean(evidenceObject.metadata?.average_pace),
      skipReason: !isCardioIntent
        ? "Skipped because pace is not useful for this training intent."
        : "Skipped because pace is already known.",
    })
  );

  opportunities.push(
    createOpportunity({
      id: `${evidenceObject.id ?? "training"}_sets_reps`,
      evidenceType: "training",
      question: "Sets and reps?",
      quickResponses: ["Add sets", "Same as last time", "Skip"],
      reason:
        "Sets and reps improve strength evidence only when an exercise was identified without set detail.",
      score: 70,
      skip: !exercises.some((exercise) => (exercise.sets ?? []).length === 0),
      skipReason:
        "Skipped because no exercise is waiting for missing set and rep details.",
    })
  );

  return opportunities;
}

function hasExerciseLikeLanguage(transcript = "") {
  return /\b\d+\s+sets?\b/i.test(transcript) &&
    /\b(curl|press|row|squat|deadlift|bench|extension|raise|raises|pulldown|pull-?up|leg|abduction|thrust)\b/i.test(
      transcript
    );
}

function getNutritionClarifications({ evidenceObject, intent, transcript }) {
  const meals = evidenceObject.meals ?? [];
  const foods = meals.flatMap((meal) => meal.foods ?? []);
  const totals = evidenceObject.daily_totals ?? {};
  const hasKnownFoodAndMacros =
    foods.length > 0 &&
    hasFiniteMetric(totals.calories) &&
    hasFiniteMetric(totals.protein_g);
  const mealKnown = Boolean(intent.slots?.meal) || /\b(breakfast|lunch|dinner|snack)\b/i.test(transcript);

  return [
    createOpportunity({
      id: `${evidenceObject.id ?? "nutrition"}_meal_contents`,
      evidenceType: "nutrition",
      question: "What foods were included?",
      quickResponses: ["Add foods", "Meal only", "Skip"],
      reason:
        "Food names are the highest-value missing detail for meal evidence.",
      score: 100,
      skip: foods.length > 0,
      skipReason: "Skipped because food details are already present.",
    }),
    createOpportunity({
      id: `${evidenceObject.id ?? "nutrition"}_meal_timing`,
      evidenceType: "nutrition",
      question: "Which meal was this?",
      quickResponses: ["Breakfast", "Lunch", "Dinner"],
      reason:
        "Meal timing is only useful when the transcript does not already name the meal.",
      score: 50,
      skip: mealKnown || hasKnownFoodAndMacros,
      skipReason: hasKnownFoodAndMacros
        ? "Skipped because food, calories, and protein are already known."
        : "Skipped because the transcript already names the meal.",
    }),
    createOpportunity({
      id: `${evidenceObject.id ?? "nutrition"}_portion_size`,
      evidenceType: "nutrition",
      question: "Portion size?",
      quickResponses: ["Small", "Normal", "Large"],
      reason:
        "Portion size is useful after foods are known, but less useful than identifying the foods first.",
      score: 45,
      skip: foods.length === 0 || hasPortionDetails(transcript) || hasKnownFoodAndMacros,
      skipReason:
        foods.length === 0
          ? "Skipped until food names are known."
          : hasKnownFoodAndMacros
            ? "Skipped because stated calories and protein make portion detail low-value for this voice meal."
          : "Skipped because portion detail is already present.",
    }),
  ];
}

function getWeightClarifications() {
  return [
    createOpportunity({
      id: "weight_morning_context",
      evidenceType: "morning_weight",
      question: "Was this a morning weigh-in?",
      quickResponses: ["Yes", "No", "Unsure"],
      reason:
        "Morning context is useful only when it materially changes the evidence.",
      score: 20,
      skip: true,
      skipReason:
        "Skipped because a stated body weight is already sufficient to capture the evidence.",
    }),
  ];
}

function getSymptomClarifications({
  evidenceObject,
  isMixedEvidenceContext = false,
  transcript = "",
} = {}) {
  const metadata = evidenceObject.metadata ?? {};
  const mildResolved = isMildResolvedSymptom(metadata);
  const mixedGoodEnough =
    isMixedEvidenceContext &&
    isGoodEnoughNonRedFlagSymptomInMixedEvidence({ metadata, transcript });

  return [
    createOpportunity({
      id: `${evidenceObject.id ?? "symptom"}_body_location`,
      evidenceType: "health_symptom",
      question: "Where is it bothering you?",
      quickResponses: ["Shoulder", "Back", "Knee"],
      reason: "Body location is the highest-value missing detail for symptoms.",
      score: 95,
      skip: Boolean(metadata.body_location),
      skipReason: "Skipped because body location is already known.",
    }),
    createOpportunity({
      id: `${evidenceObject.id ?? "symptom"}_duration`,
      evidenceType: "health_symptom",
      question: "How long has this been happening?",
      quickResponses: ["Today", "This week", "Longer"],
      reason: "Duration helps determine whether the symptom is acute or recurring.",
      score: 65,
      skip: Boolean(metadata.duration) || mildResolved || mixedGoodEnough,
      skipReason: mixedGoodEnough
        ? "Skipped because this mixed evidence symptom has a body location and present status without red flags."
        : mildResolved
        ? "Skipped because a mild symptom with location, severity, and status is already resolved enough for review."
        : "Skipped because duration is already known.",
    }),
    createOpportunity({
      id: `${evidenceObject.id ?? "symptom"}_severity`,
      evidenceType: "health_symptom",
      question: "Severity?",
      quickResponses: ["Mild", "Moderate", "Severe"],
      reason: "Severity can help prioritize follow-up when location and duration are known.",
      score: 55,
      skip: Boolean(metadata.severity) || mixedGoodEnough,
      skipReason: mixedGoodEnough
        ? "Skipped because this mixed evidence symptom is useful enough without forcing a severity prompt."
        : "Skipped because severity is already known.",
    }),
  ];
}

function isGoodEnoughNonRedFlagSymptomInMixedEvidence({
  metadata = {},
  transcript = "",
} = {}) {
  if (!metadata.body_location) return false;
  if (!metadata.status) return false;

  return !hasSymptomRedFlag({ metadata, transcript });
}

function hasSymptomRedFlag({ metadata = {}, transcript = "" } = {}) {
  const text = `${metadata.status ?? ""} ${metadata.severity ?? ""} ${transcript ?? ""}`;

  return /\b(severe|sharp|worsening|worse|can'?t\s+move|cannot\s+move|acute\s+injury|numb(?:ness)?|swelling|tingling|lost\s+strength|loss\s+of\s+strength|pop(?:ped)?)\b/i.test(
    text
  );
}

function isMildResolvedSymptom(metadata = {}) {
  if (metadata.severity !== "mild") return false;
  if (!metadata.body_location) return false;
  if (!metadata.status) return false;

  return !/(severe|worse|worsening|recurring|again|sharp|can'?t|cannot)/i.test(
    String(metadata.status)
  );
}

function createOpportunity({
  evidenceType,
  id,
  question,
  quickResponses,
  reason,
  score,
  skip = false,
  skipReason = null,
  targetEvidenceObjectId = null,
}) {
  return {
    id,
    evidence_type: evidenceType,
    targetEvidenceObjectId:
      targetEvidenceObjectId ?? `intent:${evidenceType}:${id}`,
    priority: score >= 85 ? "high" : score >= 55 ? "medium" : "low",
    question,
    quickResponses,
    clarificationReason: reason,
    clarificationScore: score,
    skip,
    skipReason,
  };
}

function getGoodBetterBestLevel({
  evidenceObjects = [],
  nextQuestion = null,
  opportunities = [],
}) {
  if (evidenceObjects.length === 0) return "needs_evidence";
  if (!nextQuestion) return "good";

  const bestAvailable = opportunities.some(
    (opportunity) => opportunity.clarificationScore >= 90
  );
  if (bestAvailable) return "good_better_available";

  return "good";
}

function hasPortionDetails(transcript) {
  return /\b(\d+|one|two|three|cup|cups|oz|ounce|ounces|serving|servings|grams?|g|scoops?)\b/i.test(
    transcript
  );
}
