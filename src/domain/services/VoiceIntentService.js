export function detectVoiceIntent(transcript = "") {
  const intents = detectVoiceIntents(transcript);
  const primary = intents[0];

  if (primary) return primary;

  return createIntent({
    confidence: "low",
    evidenceType: "unknown",
    intent: "unknown",
    reason: "No transcript was available.",
  });
}

export function detectVoiceIntents(transcript = "") {
  const text = String(transcript ?? "").trim();
  const normalized = text.toLowerCase();
  const intents = [];
  const suppressBodyWeightIntent =
    /\bi\s+already\s+gave\s+you\s+the\s+weight\b/.test(normalized) ||
    (/\bbody\s*weight|bodyweight\b/.test(normalized) &&
      /\b(workout|worked|trained|training|sets?|reps?|exercise|hanging|leg\s+raises?|pull[-\s]?ups?|dips?|squats?)\b/.test(
        normalized
      ));

  if (!text) {
    return [createIntent({
      confidence: "low",
      evidenceType: "unknown",
      intent: "unknown",
      reason: "No transcript was available.",
    })];
  }

  if (/\b(schedule(?:d)?|book(?:ed)?|appointment|upcoming|getting|having)\b/.test(normalized)) {
    if (/\bdexa|scan|bodyspec\b/.test(normalized)) {
      intents.push(createIntent({
        confidence: "high",
        evidenceType: "upcoming_event",
        intent: "upcoming_event",
        reason: "Transcript describes a scheduled DEXA-related event.",
        slots: {
          event_type: "DEXA",
          date: extractSpokenDate(text),
        },
      }));
    } else {
      intents.push(createIntent({
        confidence: "moderate",
        evidenceType: "upcoming_event",
        intent: "upcoming_event",
        reason: "Transcript describes a scheduled event.",
        slots: {
          date: extractSpokenDate(text),
        },
      }));
    }
  }

  if (
    /\bvisible abs|goal|trying to|aim(?:ing)? to|focus(?:ed)? on\b/.test(
      normalized
    ) ||
    /\bwant\s+(?:visible|abs|to\s+(?:lose|gain|build|cut|bulk|maintain))\b/.test(
      normalized
    )
  ) {
    if (/\bvisible abs\b/.test(normalized)) {
      intents.push(createIntent({
        confidence: "high",
        evidenceType: "goal_update",
        intent: "goal_update",
        reason: "Transcript describes the visible abs goal.",
        slots: {
          goal: "Visible abs",
        },
      }));
    } else {
      intents.push(createIntent({
        confidence: "moderate",
        evidenceType: "goal_update",
        intent: "goal_update",
        reason: "Transcript describes a goal-related update.",
      }));
    }
  }

  if (
    !suppressBodyWeightIntent &&
    (/\b(weight|weighed|weigh|scale|weigh-in|weigh in)\b/.test(normalized) ||
      /\bwoke\s+up\s+\d{2,3}(?:\.\d+)?\b/.test(normalized))
  ) {
    intents.push(createIntent({
      confidence: /\d{2,3}(?:\.\d+)?/.test(normalized) ? "high" : "moderate",
      evidenceType: "morning_weight",
      intent: "weight",
      reason: "Transcript contains a body-weight measurement.",
    }));
  }

  if (hasNutritionIntent(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "nutrition",
      intent: "nutrition",
      reason: "Transcript describes food or a meal.",
      slots: {
        meal: extractMealName(text),
        food_detail_known: hasFoodDetails(text),
      },
    }));
  }

  if (/\b(run|ran|jog)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "training",
      intent: "cardio_workout",
      reason: "Transcript describes a run.",
      slots: {
        activity_type: "Run",
        modality: "cardio",
      },
    }));
  }

  if (
    /\b(walk|walked)\b/.test(normalized) &&
    !isIncidentalWalkHome(normalized)
  ) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "training",
      intent: "cardio_workout",
      reason: "Transcript describes a walk.",
      slots: {
        activity_type: "Outdoor Walk",
        modality: "cardio",
      },
    }));
  }

  if (/\bstair\s+stepper\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "training",
      intent: "cardio_workout",
      reason: "Transcript describes Stair Stepper cardio.",
      slots: {
        activity_type: "Stair Stepper",
        modality: "cardio",
      },
    }));
  }

  if (/\b(pain|hurt|hurts|ache|sore|symptom|injury|ill|bothering|barking|feeling well|felt well|felt better|feels better)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "health_symptom",
      intent: "symptom",
      reason: "Transcript describes a symptom or injury.",
      slots: {
        body_location: extractBodyLocation(text),
      },
    }));
  }

  if (/\b(looked|looking|looks|fuller|leaner|tighter|softer|flatter|pumped|visual|physique)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "moderate",
      evidenceType: "observation",
      intent: "observation",
      reason: "Transcript describes a body or progress observation.",
      slots: {
        body_location: extractBodyLocation(text),
      },
    }));
  }

  const hasStrengthTrainingContext =
    /\b(worked out|workout|trained|training|lifted|strength|weights?)\b/.test(
      normalized
    ) ||
    (/\b(chest|back|shoulders?|arms?|legs?|biceps|triceps)\b/.test(normalized) &&
      /\b(day|workout|trained|training|lifted|sets?|reps?)\b/.test(normalized)) ||
    (/\bsets?|reps?\b/.test(normalized) &&
      /\b(curl|press|row|squat|deadlift|bench|extension|raise|raises|pulldown|pull-?up|leg|abduction|thrust)\b/.test(
        normalized
      ));

  if (
    hasStrengthTrainingContext &&
    !/\b(looked|looking|looks|fuller|leaner|tighter|softer|flatter)\b/.test(normalized)
  ) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "training",
      intent: "strength_workout",
      reason: "Transcript describes resistance training.",
      slots: {
        activity_type: "Traditional Strength Training",
        modality: "resistance",
        workout_focus: extractWorkoutFocus(text),
      },
    }));
  }

  if (/\b(took|injected|dose|dosed|forgot|missed)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "protocol_completion",
      intent: /\bforgot|missed\b/.test(normalized)
        ? "protocol_missed"
        : "protocol_completion",
      reason: "Transcript describes protocol adherence.",
      slots: {
        completion_status: /\bforgot|missed\b/.test(normalized)
          ? "missed"
          : "completed",
      },
    }));
  }

  if (/\bskipped\s+(?:cardio|workout|training|walk|run)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "skipped_activity",
      intent: "skipped_activity",
      reason: "Transcript describes a skipped activity.",
      slots: {
        activity_type: extractSkippedActivity(text),
      },
    }));
  }

  if (
    /\bpr\b|personal record|personal best|hit\s+a\s+pr\b/.test(normalized) ||
    /\bhit\s+\d+(?:\.\d+)?\s*(?:lb|lbs|pounds?)?\s+for\s+\d+\s+on\s+/i.test(normalized)
  ) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "performance_record",
      intent: "performance_record",
      reason: "Transcript describes a performance record.",
    }));
  }

  if (/\b(sleep|slept|recovery|hrv|readiness)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "moderate",
      evidenceType: "recovery_day",
      intent: "recovery",
      reason: "Transcript describes sleep or recovery.",
    }));
  }

  if (/\b(protocol|dose|supplement|medication|plan)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "moderate",
      evidenceType: "protocol",
      intent: "protocol",
      reason: "Transcript describes protocol information.",
    }));
  }

  if (/\b(travel|traveling|travelling|out of town|won'?t be working out)\b/.test(normalized)) {
    intents.push(createIntent({
      confidence: "high",
      evidenceType: "upcoming_event",
      intent: "upcoming_event",
      reason: "Transcript describes upcoming travel or schedule disruption.",
      slots: {
        event_type: "Travel",
        date: extractRelativeDateRange(text),
      },
    }));
  }

  if (intents.length === 0) {
    intents.push(createIntent({
      confidence: "low",
      evidenceType: "observation",
      intent: "observation",
      reason: "Transcript was captured as a general observation.",
    }));
  }

  return dedupeIntents(intents).sort(compareIntents);
}

function isIncidentalWalkHome(normalized = "") {
  if (!/\b(?:walked?\s+home|went\s+home|came\s+home|got\s+home|walked?\s+over|went\s+over|headed\s+home|drove\s+home)\b/.test(normalized)) return false;

  return !/\b(\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|miles?|mi|km|kilometers?)|burned|calories|cals|workout|cardio|outdoor\s+walk)\b/.test(
    normalized
  );
}

function dedupeIntents(intents = []) {
  const byKey = new Map();

  intents.forEach((intent) => {
    const key = `${intent.detectedPrimaryIntent}:${intent.evidenceType}`;
    const existing = byKey.get(key);

    if (!existing || getConfidenceScore(intent.intentConfidence) > getConfidenceScore(existing.intentConfidence)) {
      byKey.set(key, intent);
    }
  });

  return [...byKey.values()];
}

function compareIntents(left, right) {
  return getConfidenceScore(right.intentConfidence) - getConfidenceScore(left.intentConfidence);
}

function getConfidenceScore(confidence) {
  return { high: 3, moderate: 2, low: 1 }[confidence] ?? 0;
}

function createIntent({ confidence, evidenceType, intent, reason, slots = {} }) {
  return {
    detectedPrimaryIntent: intent,
    evidenceType,
    intentConfidence: confidence,
    reason,
    slots,
  };
}

function hasNutritionIntent(normalized = "") {
  const foodWords =
    "breakfast|lunch|dinner|snack|meal|food|chipotle|bowl|rice|beans|chicken|beef|burger|cheeseburger|yogurt|greek yogurt|whey|eggs?|protein|carbs?|fat|fiber";
  const hasFoodActionOrMeal =
    new RegExp(`\\b(ate|eat|eating|${foodWords})\\b`).test(normalized) ||
    new RegExp(`\\bhad\\s+(?:a\\s+|an\\s+|the\\s+|some\\s+|my\\s+)?(?:${foodWords})\\b`).test(
      normalized
    );
  const hasCalorieEatingContext =
    /\b(?:ate|eaten|had|consumed)\s+(?:about|around)?\s*\d[\d,]*\s*(?:calories|cals|cal)\b/.test(
      normalized
    ) ||
    /\b\d[\d,]*\s*(?:calories|cals|cal)\s+(?:for|at|with)\s+(?:breakfast|lunch|dinner|snack|meal)\b/.test(
      normalized
    );

  return hasFoodActionOrMeal || hasCalorieEatingContext;
}

function extractMealName(text) {
  const match = String(text).match(/\b(breakfast|lunch|dinner|snack|snacks)\b/i);

  return match?.[1] ? titleCase(match[1]) : null;
}

function hasFoodDetails(text) {
  const foodPhrase =
    String(text).match(/\b(?:ate|had)\s+([^,.]+)/i)?.[1] ??
    String(text).match(/\b(breakfast|lunch|dinner|snack|snacks|meal)\b/i)?.[1] ??
    String(text);
  const withoutMealOnly = String(foodPhrase)
    .replace(/\b(i|ate|had|for|my|a|the|breakfast|lunch|dinner|snack|meal)\b/gi, "")
    .trim();

  return withoutMealOnly.length > 2;
}

function extractWorkoutFocus(text) {
  if (/\bshoulders?|delts?\b/i.test(text)) return "Shoulders";
  if (/\bback|lats?\b/i.test(text)) return "Back";
  if (/\bchest|pecs?\b/i.test(text)) return "Chest";
  if (/\barms?|biceps|triceps\b/i.test(text)) return "Arms";
  if (/\blegs?|quads?|hamstrings?|glutes?\b/i.test(text)) return "Legs";

  return null;
}

function extractSpokenDate(text) {
  const match = String(text).match(
    /\b(?:on|for)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i
  );

  if (!match) return null;

  return `${titleCase(match[1])} ${match[2]}`;
}

function extractRelativeDateRange(text) {
  const value = String(text ?? "");
  const match = value.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+through\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);

  if (match) return `next ${match[1]} through ${match[2]}`;

  return extractSpokenDate(value);
}

function extractSkippedActivity(text) {
  const match = String(text ?? "").match(/\bskipped\s+(cardio|workout|training|walk|run)\b/i);

  return match?.[1] ? titleCase(match[1]) : "Activity";
}

function extractBodyLocation(text) {
  const rotatorCuffMatch = String(text ?? "").match(
    /\b(left|right)?\s*rotator\s+cuff\b/i
  );
  if (rotatorCuffMatch) {
    return titleCase(`${rotatorCuffMatch[1] ?? ""} Rotator Cuff`.trim());
  }

  const match = String(text ?? "").match(/\b(left|right)?\s*(shoulders?|knees?|back|hips?|elbows?|wrists?|ankles?|chest)\b/i);

  if (!match) return null;

  return [match[1], match[2]?.replace(/s$/i, "")]
    .filter(Boolean)
    .map(titleCase)
    .join(" ");
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
