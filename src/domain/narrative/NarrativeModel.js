import {
  CoachingDirection,
  NarrativeTranslationStatus,
  NARRATIVE_ASSESSMENT_VERSION,
  enumSet,
} from "./NarrativeRuntimeContract";
import {
  assertEnum,
  deepFreeze,
  requiredText,
  requiredTimestamp,
  semanticHash,
  stableSerialize,
} from "./narrativeRuntimeUtils";

const COACHING = enumSet(CoachingDirection);
const TRANSLATIONS = enumSet(NarrativeTranslationStatus);
const FORBIDDEN_KEY = /(presentation|jsx|html|publication|render|component|markup|className|style|card|layout|probability|percentage|score)/i;
const RAW_INPUT_KEY = /^(rawEvidence|evidenceDescriptors|sourceObservations|sourceClaims|dexa|photos|weight|training|nutrition|activity|recovery|healthMetrics)$/i;
const FORMATTED_TEXT = /<\/?[a-z][^>]*>|(^|\n)\s*(#{1,6}|[-*]\s|\d+\.\s)/i;
const TOP_LEVEL_KEYS = new Set([
  "contractVersion", "id", "goalRef", "forecastRef", "generatedAt",
  "goalContext", "forecastSummary", "confidenceExplanation",
  "primarySupportingFactors", "primaryLimitingFactors",
  "remainingUncertaintyExplanation", "nextDecisiveEvidenceExplanation",
  "recommendedCoachingDirection", "provenance",
]);

export function createNarrativeAssessment(input = {}) {
  rejectNonCanonicalOutput(input);
  const unexpected = Object.keys(input).filter((key) => !TOP_LEVEL_KEYS.has(key));
  if (unexpected.length) {
    throw new Error(`Narrative Assessment cannot contain ${unexpected.sort()[0]}.`);
  }
  const contractVersion = input.contractVersion ?? NARRATIVE_ASSESSMENT_VERSION;
  if (contractVersion !== NARRATIVE_ASSESSMENT_VERSION) {
    throw new Error("Unsupported Narrative Assessment version.");
  }
  assertEnum(input.recommendedCoachingDirection?.state, COACHING,
    "Coaching Direction");
  [...(input.primarySupportingFactors ?? []),
    ...(input.primaryLimitingFactors ?? []),
    ...(input.remainingUncertaintyExplanation?.items ?? [])]
    .forEach((item) => assertEnum(item.translationStatus, TRANSLATIONS,
      "Narrative translation status"));
  const canonical = {
    contractVersion,
    goalRef: {
      goalId: requiredText(input.goalRef?.goalId, "goalRef.goalId"),
      goalContractVersion: requiredText(
        input.goalRef?.goalContractVersion, "goalRef.goalContractVersion"),
      goalContractId: input.goalRef?.goalContractId ?? null,
    },
    forecastRef: requiredText(input.forecastRef, "forecastRef"),
    generatedAt: requiredTimestamp(input.generatedAt, "generatedAt"),
    goalContext: structuredClone(input.goalContext),
    forecastSummary: structuredClone(input.forecastSummary),
    confidenceExplanation: structuredClone(input.confidenceExplanation),
    primarySupportingFactors: structuredClone(input.primarySupportingFactors ?? []),
    primaryLimitingFactors: structuredClone(input.primaryLimitingFactors ?? []),
    remainingUncertaintyExplanation:
      structuredClone(input.remainingUncertaintyExplanation),
    nextDecisiveEvidenceExplanation:
      structuredClone(input.nextDecisiveEvidenceExplanation),
    recommendedCoachingDirection:
      structuredClone(input.recommendedCoachingDirection),
    provenance: {
      engineVersion: requiredText(
        input.provenance?.engineVersion, "provenance.engineVersion"),
      adapterVersion: requiredText(
        input.provenance?.adapterVersion, "provenance.adapterVersion"),
      shadowOnly: input.provenance?.shadowOnly === true,
      forecastFingerprint: requiredText(
        input.provenance?.forecastFingerprint,
        "provenance.forecastFingerprint"),
      inputFingerprint: requiredText(
        input.provenance?.inputFingerprint, "provenance.inputFingerprint"),
    },
  };
  const expectedId = `narrative_assessment|${semanticHash({
    ...canonical,
    generatedAt: undefined,
  })}`;
  if (input.id && input.id !== expectedId) {
    throw new Error("Narrative Assessment identity mismatch.");
  }
  return deepFreeze({ contractVersion, id: expectedId, ...canonical });
}

export function validateNarrativeAssessment(value) {
  const rebuilt = createNarrativeAssessment(value);
  if (stableSerialize(rebuilt) !== stableSerialize(value)) {
    throw new Error("Narrative Assessment is not canonical.");
  }
  return true;
}

function rejectNonCanonicalOutput(value) {
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORMATTED_TEXT.test(value)) {
      throw new Error("Narrative Assessment cannot contain formatted content.");
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key) || RAW_INPUT_KEY.test(key) ||
        ["$$typeof", "props", "children"].includes(key)) {
      throw new Error(`Narrative Assessment cannot contain ${key}.`);
    }
    if (["confidence", "numericconfidence"].includes(key.toLowerCase())) {
      throw new Error("Narrative Assessment cannot calculate numeric confidence.");
    }
    rejectNonCanonicalOutput(child);
  }
}
