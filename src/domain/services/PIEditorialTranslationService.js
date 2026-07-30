import {
  resolveUserFacingObjectLanguage,
} from "./UserFacingObjectLanguageService";

export const PI_EDITORIAL_TRANSLATION_VERSION = "pi_editorial_translation_v1";

const INTERNAL_PRODUCT_LANGUAGE = [
  /\bBuild Lean Mass\b/,
  /\bVisible Abs(?: at Rest)?\b/,
  /\bGoal Transition\b/i,
  /\b(?:Photo|DEXA) Event\b/i,
  /\bGoal Completion\b/i,
  /\bConfidence Engine\b/i,
  /\bEvidence Coverage\b/i,
  /\bEnergy Balance\b/i,
  /\bMovement Areas\b/i,
  /\bGoal Window\b/i,
  /\bObserved Coverage\b/i,
  /\bCalibration\b/i,
  /\bContinuation\b/i,
  /\bReference Window\b/i,
  /\bStory Candidate\b/i,
  /\bCanonical Record\b/i,
  /\bSupporting Signal\b/i,
  /\bEvidence Completeness\b/i,
  /\binterpreted domains\b/i,
  /\benergy coverage\b/i,
  /\bcalibration conclusion\b/i,
  /\bdomain weighting\b/i,
  /\bnew volume-load record\b/i,
];

const UNNATURAL_AI_LANGUAGE = [
  /\bforward signal\b/i,
  /\bvisual thread\b/i,
  /\bearned patience\b/i,
  /\bobserved coverage\b/i,
  /\bmovement areas\b/i,
  /\bnew assignment\b/i,
  /\bcheckpoint\b/i,
  /\bconstructive\b/i,
  /\bviable\b/i,
  /\bpaired energy\b/i,
  /\breference window\b/i,
  /\bperformance direction\b/i,
  /\bprogression story\b/i,
  /\bobservation window\b/i,
  /\bsupporting role\b/i,
  /\bcalibration signal\b/i,
  /\bconstructive signal\b/i,
];

const SYSTEM_CENTERED_LANGUAGE = [
  /\b(?:the|this) (?:report|preview|briefing|engine|analysis|story|evidence pipeline|rendering)\b/i,
  /\bthe continuation\b/i,
  /\bthe system (?:sees|believes|thinks|shows|found|observed|interprets)\b/i,
  /\bPhysiqueOS (?:sees|believes|thinks|shows|found|observed|interprets)\b/i,
];

const ROLE_ORDER = [
  "observation",
  "interpretation",
  "whyItMatters",
  "forwardImplication",
];

export function translatePIEditorialNarrative({
  reasoning = null,
  paragraphs = [],
} = {}) {
  const translatedParagraphs = paragraphs
    .map(translateParagraph)
    .filter(Boolean);
  const audit = auditPIEditorialVoice(
    translatedParagraphs.flatMap((paragraph) => [
      paragraph.observation,
      paragraph.interpretation,
      paragraph.whyItMatters,
      paragraph.forwardImplication,
      paragraph.text,
    ])
  );
  if (!audit.passes) {
    throw new Error(
      `PI editorial translation rejected user-facing narration: ${audit.issues
        .map((issue) => `${issue.category}: ${issue.text}`)
        .join(" | ")}`
    );
  }
  return {
    version: PI_EDITORIAL_TRANSLATION_VERSION,
    reasoning,
    paragraphs: translatedParagraphs,
  };
}

export function composePIEditorialParagraph(paragraph = {}) {
  return translatePIEditorialNarrative({ paragraphs: [paragraph] })
    .paragraphs[0]?.text ?? null;
}

export function describeMissingInformationNaturally({
  known,
  missing,
  consequence,
  nextStep,
} = {}) {
  return composePIEditorialParagraph({
    observation: known,
    interpretation: missing,
    whyItMatters: consequence,
    forwardImplication: nextStep,
  });
}

export function auditPIEditorialVoice(values = [], { internalObjectNames = [] } = {}) {
  const narration = flattenNarration(values);
  const issues = narration.flatMap((text) => [
    ...matches(text, INTERNAL_PRODUCT_LANGUAGE, "internal_product_language"),
    ...matches(text, UNNATURAL_AI_LANGUAGE, "unnatural_ai_language"),
    ...matches(text, SYSTEM_CENTERED_LANGUAGE, "system_centered_language"),
    ...matchesInternalObjectNames(text, internalObjectNames),
  ]);
  return {
    passes: issues.length === 0,
    issues,
    inspectedNarration: narration,
  };
}

export function coachMovementLanguage(value, {
  muscleGroup = null,
  exactMovementMatters = false,
} = {}) {
  return resolveUserFacingObjectLanguage({
    objectType: "exercise",
    displayName: value,
    aggregateHint: muscleGroup ? `${String(muscleGroup).toLowerCase()} training` : null,
    specificity: exactMovementMatters ? "specific" : "aggregate",
  }).selectedReference;
}

export function coachGoalLanguage(value, { phase = false } = {}) {
  return resolveUserFacingObjectLanguage({
    objectType: phase ? "phase" : "goal",
    displayName: value,
    specificity: "specific",
  }).selectedReference;
}

function translateParagraph(value = {}) {
  const paragraph = Object.fromEntries(
    ROLE_ORDER.map((role) => [role, normalizeSentence(value[role])])
  );
  const sentences = ROLE_ORDER.map((role) => paragraph[role])
    .filter(Boolean)
    .filter((sentence, index, all) =>
      all.findIndex((candidate) => semanticKey(candidate) === semanticKey(sentence)) === index
    );
  if (!sentences.length) return null;
  return {
    ...paragraph,
    text: sentences.join(" "),
  };
}

function flattenNarration(values) {
  const stack = Array.isArray(values) ? [...values] : [values];
  const narration = [];
  while (stack.length) {
    const value = stack.shift();
    if (Array.isArray(value)) {
      stack.unshift(...value);
    } else if (typeof value === "string" && value.trim()) {
      narration.push(value.trim());
    }
  }
  return narration;
}

function matches(text, patterns, category) {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => ({ category, text, pattern: pattern.source }));
}

function matchesInternalObjectNames(text, names) {
  return names
    .map((name) => String(name ?? "").trim())
    .filter((name) => name.length >= 4 &&
      text.toLowerCase().includes(name.toLowerCase()))
    .map((name) => ({
      category: "internal_object_language",
      text,
      pattern: name,
    }));
}

function normalizeSentence(value) {
  const text = typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
  if (!text) return null;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function semanticKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .sort()
    .join("|");
}
