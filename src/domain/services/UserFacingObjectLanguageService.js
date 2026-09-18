export const USER_FACING_OBJECT_MODES = Object.freeze({
  EXACT_LABEL: "exact_label",
  SENTENCE_REFERENCE: "sentence_reference",
  COACHING_REFERENCE: "coaching_reference",
  AGGREGATE_REFERENCE: "aggregate_reference",
});

export function resolveUserFacingObjectLanguage({
  objectType,
  canonicalId = null,
  displayName,
  aliases = [],
  narrativeContext = null,
  specificity = "specific",
  aggregateHint = null,
  operationalSpecificity = false,
} = {}) {
  const exactLabel = clean(displayName);
  const type = normalizeType(objectType);
  const normalized = normalizers[type]?.({
    exactLabel,
    canonicalId,
    aliases,
    narrativeContext,
    aggregateHint,
    operationalSpecificity,
  }) ?? fallback(exactLabel, aggregateHint);
  const selectedMode = specificity === "exact"
    ? USER_FACING_OBJECT_MODES.EXACT_LABEL
    : specificity === "aggregate"
      ? USER_FACING_OBJECT_MODES.AGGREGATE_REFERENCE
      : specificity === "coaching"
        ? USER_FACING_OBJECT_MODES.COACHING_REFERENCE
        : USER_FACING_OBJECT_MODES.SENTENCE_REFERENCE;
  return Object.freeze({
    objectType: type,
    canonicalId,
    exactLabel,
    sentenceReference: normalized.sentenceReference,
    coachingReference: normalized.coachingReference,
    aggregateReference: normalized.aggregateReference,
    normalizedCase: normalized.sentenceReference,
    grammaticalNumber: normalized.grammaticalNumber ?? "singular",
    agreement: agreement(normalized.grammaticalNumber),
    selectedMode,
    selectedReference: select(normalized, exactLabel, selectedMode),
    provenance: {
      transformed: exactLabel !== normalized.sentenceReference,
      reason: normalized.reason ?? "sentence_case_normalization",
      canonicalNamePreserved: true,
    },
  });
}

export function userFacingObjectReference(input, mode = null) {
  const resolved = resolveUserFacingObjectLanguage({
    ...input,
    specificity: mode ?? input?.specificity,
  });
  return resolved.selectedReference;
}

export function auditNarrativeObjectLanguage({
  narration = [],
  canonicalObjects = [],
} = {}) {
  const texts = flatten(narration);
  const leaks = [];
  for (const object of canonicalObjects) {
    const resolved = resolveUserFacingObjectLanguage(object);
    if (!resolved.exactLabel ||
        resolved.exactLabel === resolved.sentenceReference) continue;
    for (const text of texts) {
      if (text.includes(resolved.exactLabel)) {
        leaks.push({
          text,
          objectType: resolved.objectType,
          canonicalId: resolved.canonicalId,
          exactLabel: resolved.exactLabel,
          expectedReference: resolved.sentenceReference,
        });
      }
    }
  }
  return {
    passes: leaks.length === 0,
    leaks,
    inspectedNarration: texts,
  };
}

const ORDINARY_NARRATIVE_OBJECT_TERMS = Object.freeze([
  "Goal", "Phase", "Guardrail", "Evidence", "Strategy", "Confidence",
  "Training", "Nutrition", "Energy", "Activity", "Weight", "Recovery",
  "Photos", "Forecast", "Review", "Baseline", "Trajectory", "Protocol",
]);

const DEFAULT_INTENTIONAL_CAPITALIZATION = Object.freeze([
  "Goal Confidence", "Operating Plan", "Current Goal Phase",
]);

const PRESENTATION_LABEL_KEYS = new Set([
  "eyebrow", "heading", "label", "recommendationLabel", "displayName",
  "exactLabel", "name",
]);

// This boundary is deliberately presentation-only. It never changes canonical
// object names or engine state; it prevents TitleCase backend concepts from
// becoming ordinary English nouns merely because their source type was named
// Goal, Phase, Energy, and so on.
export function naturalizeUserFacingNarrativeText(value, {
  preserveTerms = [],
} = {}) {
  const text = String(value ?? "");
  if (!text) return text;
  const protectedRanges = exactTermRanges(text, [
    ...DEFAULT_INTENTIONAL_CAPITALIZATION,
    ...preserveTerms,
  ]);
  const pattern = new RegExp(`\\b(?:${ORDINARY_NARRATIVE_OBJECT_TERMS.join("|")})\\b`, "gu");
  return text.replace(pattern, (term, offset) => {
    if (rangeContains(protectedRanges, offset) || isSentenceInitial(text, offset)) {
      return term;
    }
    return term.toLocaleLowerCase("en-US");
  });
}

export function naturalizeUserFacingNarrativeProjection(value, options = {},
  key = null) {
  if (typeof value === "string") {
    return PRESENTATION_LABEL_KEYS.has(key)
      ? value
      : naturalizeUserFacingNarrativeText(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item) => naturalizeUserFacingNarrativeProjection(
      item, options, key));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey,
    naturalizeUserFacingNarrativeProjection(child, options, childKey),
  ]));
}

export function findBackendObjectCasingLeaks(value, options = {}, key = null) {
  if (typeof value === "string") {
    if (PRESENTATION_LABEL_KEYS.has(key)) return [];
    const normalized = naturalizeUserFacingNarrativeText(value, options);
    return normalized === value ? [] : [{ key, text: value, normalized }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => findBackendObjectCasingLeaks(
      item, options, key));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([childKey, child]) =>
    findBackendObjectCasingLeaks(child, options, childKey));
}

export function configuredNarrativeCapitalizationTerms(goalContract = {}) {
  return [...new Set([
    goalContract.goalLabel,
    goalContract.phase?.label,
    goalContract.phase?.nextPhaseLabel,
    goalContract.strategy?.label,
    goalContract.vocabulary?.goal?.displayName,
    goalContract.vocabulary?.phase?.displayName,
    goalContract.vocabulary?.strategy?.displayName,
    ...Object.values(goalContract.vocabulary?.evidence?.requests ?? {})
      .map((item) => item?.displayName),
  ].map(clean).filter(Boolean))];
}

function exactTermRanges(text, terms) {
  const ranges = [];
  for (const term of [...new Set(terms.map(clean).filter(Boolean))]) {
    let offset = text.indexOf(term);
    while (offset >= 0) {
      ranges.push([offset, offset + term.length]);
      offset = text.indexOf(term, offset + term.length);
    }
  }
  return ranges;
}

function rangeContains(ranges, offset) {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

function isSentenceInitial(text, offset) {
  const before = text.slice(0, offset);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  if (!/[\p{L}\p{N}]/u.test(line)) return true;
  return /[.!?][\s"'’”)}\]]*$/u.test(before);
}

function normalizeExercise({ exactLabel, aggregateHint }) {
  const known = new Map([
    ["lateral raises machine", "machine lateral raises"],
    ["pull-ups", "pull-ups"],
    ["pull ups", "pull-ups"],
    ["single-leg leg press", "single-leg leg press"],
    ["ez bar curls", "EZ-bar curls"],
    ["ez-bar curls", "EZ-bar curls"],
    ["bulgarian split squat", "Bulgarian split squats"],
  ]);
  const key = exactLabel.toLowerCase();
  const sentenceReference = known.get(key) ?? normalizeExerciseCase(exactLabel);
  const grammaticalNumber = exerciseNumber(sentenceReference);
  return {
    sentenceReference,
    coachingReference: sentenceReference,
    aggregateReference: aggregateHint || exerciseAggregate(exactLabel),
    grammaticalNumber,
    reason: known.has(key)
      ? "known_spoken_exercise_form"
      : "exercise_sentence_case",
  };
}

function normalizeGoal({ exactLabel }) {
  if (/build lean mass|lean.?mass gain|build muscle/i.test(exactLabel)) {
    return natural("building muscle", "your muscle-building phase", "muscle building");
  }
  if (/visible abs|fat loss|\bcut\b/i.test(exactLabel)) {
    return natural("reaching visible abs", "your cut", "fat loss");
  }
  return natural(sentenceCase(exactLabel), "your goal", "your goal");
}

function normalizePhase({ exactLabel }) {
  if (/establish maintenance|maintenance/i.test(exactLabel)) {
    return natural("finding your maintenance intake", "settling into maintenance", "this phase");
  }
  if (/build lean mass|muscle/i.test(exactLabel)) {
    return natural("your muscle-building phase", "this phase", "this phase");
  }
  if (/visible abs|fat loss|\bcut\b/i.test(exactLabel)) {
    return natural("your cut", "your cut", "this phase");
  }
  return natural(sentenceCase(exactLabel), "this phase", "this phase");
}

function normalizeStrategy({ exactLabel }) {
  if (/establish maintenance|maintenance/i.test(exactLabel)) {
    return natural("finding your maintenance intake", "settling into maintenance", "your nutrition strategy");
  }
  return natural(sentenceCase(exactLabel), "your current strategy", "your strategy");
}

function normalizeProtocol({ exactLabel, operationalSpecificity }) {
  if (operationalSpecificity) return exact(exactLabel, "operational_identity_required");
  if (/morning weigh-?in/i.test(exactLabel)) {
    return natural("your morning weigh-in", "your morning weigh-in", "your check-in routine");
  }
  if (/progress photos/i.test(exactLabel)) {
    return natural("progress photos", "your progress photos", "body-composition tracking");
  }
  if (/tesamorelin/i.test(exactLabel)) {
    return natural("tesamorelin", "your tesamorelin protocol", "your peptide protocol");
  }
  return natural(sentenceCase(exactLabel), "your protocol", "your protocol");
}

function normalizeEvent({ exactLabel }) {
  if (/photo event/i.test(exactLabel)) {
    return natural("your latest progress photos", "your progress photos", "progress photos");
  }
  if (/dexa event/i.test(exactLabel)) {
    return natural("your latest DEXA", "the latest scan", "body-composition evidence");
  }
  if (/goal completion/i.test(exactLabel)) {
    return natural("finishing the goal", "finishing your goal", "your accomplishment");
  }
  if (/_v\d+\b|\w+_\w+/.test(exactLabel)) {
    return natural("the latest update", "your latest update", "the latest evidence");
  }
  return natural(sentenceCase(exactLabel), "the latest update", "the latest evidence");
}

function normalizeBriefing({ exactLabel }) {
  return natural(sentenceCase(exactLabel), "your update", "your progress update");
}

function normalizeConfidence() {
  return natural("confidence", "how certain we can be", "certainty");
}

const normalizers = {
  exercise: normalizeExercise,
  goal: normalizeGoal,
  phase: normalizePhase,
  strategy: normalizeStrategy,
  protocol: normalizeProtocol,
  evidence_event: normalizeEvent,
  briefing: normalizeBriefing,
  cadence: normalizeBriefing,
  confidence: normalizeConfidence,
};

function natural(sentenceReference, coachingReference, aggregateReference) {
  return {
    sentenceReference,
    coachingReference,
    aggregateReference,
    grammaticalNumber: "singular",
    reason: "semantic_narrative_translation",
  };
}

function exact(exactLabel, reason) {
  return {
    sentenceReference: exactLabel,
    coachingReference: exactLabel,
    aggregateReference: exactLabel,
    grammaticalNumber: exerciseNumber(exactLabel),
    reason,
  };
}

function fallback(exactLabel, aggregateHint) {
  const sentenceReference = sentenceCase(exactLabel);
  return {
    sentenceReference,
    coachingReference: sentenceReference,
    aggregateReference: aggregateHint || sentenceReference,
    grammaticalNumber: "singular",
    reason: "fallback_sentence_case",
  };
}

function select(normalized, exactLabel, mode) {
  if (mode === USER_FACING_OBJECT_MODES.EXACT_LABEL) return exactLabel;
  if (mode === USER_FACING_OBJECT_MODES.COACHING_REFERENCE) {
    return normalized.coachingReference;
  }
  if (mode === USER_FACING_OBJECT_MODES.AGGREGATE_REFERENCE) {
    return normalized.aggregateReference;
  }
  return normalized.sentenceReference;
}

function agreement(number) {
  const plural = number === "plural";
  return Object.freeze({
    be: plural ? "are" : "is",
    have: plural ? "have" : "has",
    pronoun: plural ? "they" : "it",
    objectPronoun: plural ? "them" : "it",
  });
}

function normalizeExerciseCase(value) {
  return String(value)
    .split(/\s+/)
    .map((token) => {
      if (/^(EZ|RDL|TRX)$/i.test(token)) return token.toUpperCase();
      if (/^(Romanian|Bulgarian|Smith|Nordic|Arnold|Hack)$/i.test(token)) {
        return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
      }
      return token.toLowerCase();
    })
    .join(" ")
    .replace(/^EZ bar\b/, "EZ-bar");
}

function exerciseNumber(value) {
  return /\b(?:raises|curls|pull-ups|push-ups|flyes|flies|extensions|squats|lunges)\b/i.test(value)
    ? "plural"
    : "singular";
}

function exerciseAggregate(value) {
  if (/lateral raise|shoulder/i.test(value)) return "shoulder isolation work";
  if (/pull-up|row|lat/i.test(value)) return "upper-body pulling";
  if (/leg press|squat|deadlift|lunge|calf|glute|hamstring|quad/i.test(value)) {
    return "lower-body training";
  }
  if (/curl|tricep|pushdown/i.test(value)) return "arm training";
  return "your training";
}

function sentenceCase(value) {
  if (!value) return "";
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function normalizeType(value) {
  const type = String(value ?? "").toLowerCase();
  if (["movement", "exercise_movement"].includes(type)) return "exercise";
  if (["event", "evidence", "event_type"].includes(type)) return "evidence_event";
  return type || "unknown";
}

function clean(value) {
  return String(value ?? "").trim();
}

function flatten(values) {
  const stack = Array.isArray(values) ? [...values] : [values];
  const result = [];
  while (stack.length) {
    const value = stack.shift();
    if (Array.isArray(value)) stack.unshift(...value);
    else if (typeof value === "string" && value.trim()) result.push(value.trim());
  }
  return result;
}
