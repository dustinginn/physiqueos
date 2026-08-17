// Typed presentation model for Confidence explanations. The canonical Confidence assessment
// carries structured reasoning objects (remainingUncertainty.items, nextConfidenceBuildingEvidence,
// narrativeExplanation) — none of that is prose. Rendering surfaces must never interpolate those
// objects directly (String(object)/join on an array of objects/implicit coercion all collapse to
// "[object Object]"); this module is the one sanctioned place that turns them into coaching-voice
// strings. Every field this module returns is guaranteed to be a string (or an array of strings).

const UNCERTAINTY_KIND_COPY = Object.freeze({
  measurement_pending: "A direct outcome measurement hasn't confirmed this yet.",
  energy_calibration_uncertain: "It isn't yet clear whether intake and activity are calibrated correctly for this phase.",
  goal_semantics_missing: "One of the Guardrails doesn't have a complete threshold defined yet.",
  recovery_evidence_missing: "Recovery evidence is limited right now.",
});

const EVIDENCE_CAPABILITY_COPY = Object.freeze({
  dexa_body_composition: "The next DEXA scan will help confirm this directly.",
});

const MATERIALITY_RANK = Object.freeze({ high: 0, moderate: 1, low: 2 });

// Known internal phrasing that occasionally reaches a narrative sentence verbatim (baked into
// an already-published, immutable historical record) — translated here at render time rather
// than by rewriting stored text. Generic pattern match, not a Founder-specific string swap.
const INTERNAL_PHRASE_TRANSLATIONS = Object.freeze([
  [/\bdirect goal confirmation remains pending\.?/gi,
    "A direct measurement hasn't confirmed this yet."],
  [/\bdirect goal confirmation remains unresolved\.?/gi,
    "a direct measurement hasn't confirmed this yet"],
]);

export function translateConfidenceProse(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  return INTERNAL_PHRASE_TRANSLATIONS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  ).trim();
}

function describeUncertaintyItem(item) {
  return UNCERTAINTY_KIND_COPY[item?.kind] ?? null;
}

function summarizeUncertaintyItems(items = []) {
  const seen = new Map();
  for (const item of [...items].sort((a, b) =>
    (MATERIALITY_RANK[a?.materiality] ?? 3) - (MATERIALITY_RANK[b?.materiality] ?? 3))) {
    const description = describeUncertaintyItem(item);
    if (!description || seen.has(description)) continue;
    seen.set(description, true);
    if (seen.size >= 4) break;
  }
  return [...seen.keys()];
}

function describeNextEvidence(next) {
  if (!next || next.status !== "identified") return [];
  const description = EVIDENCE_CAPABILITY_COPY[next.evidenceCapability];
  return description ? [description] : [];
}

function describeSupport({ narrativeText, movement, uncertaintyReduction }) {
  const reduced = uncertaintyReduction?.status === "forecast_identified_reduction_factors" &&
    (uncertaintyReduction.factorCodes?.length ?? 0) > 0;
  if (reduced) return ["A previously uncertain factor was resolved by recent evidence."];
  if (movement === "increase" && narrativeText) return [firstSentence(narrativeText)];
  if (movement === "no_meaningful_change" && narrativeText) return [firstSentence(narrativeText)];
  return [];
}

function firstSentence(text) {
  const match = /^[^.!?]*[.!?]/.exec(text.trim());
  return (match ? match[0] : text).trim();
}

// Builds the typed detail rendered by the Confidence explanation modal (and any other
// surface that explains a canonical Confidence assessment). Accepts either the current V2
// canonical shape or a legacy-shaped object with pre-built string arrays — legacy input
// passes straight through untouched so older callers keep working unmodified.
export function buildConfidenceExplanationDetail({
  qualitativeLevel = null,
  narrativeText = null,
  movement = null,
  uncertaintyReduction = null,
  remainingUncertaintyItems = null,
  nextConfidenceBuildingEvidence = null,
  legacySupportingFactors = null,
  legacyLimitingFactors = null,
  legacyClarifyingFactors = null,
  legacyUncertaintyStatement = null,
} = {}) {
  const isLegacy = remainingUncertaintyItems === null && narrativeText === null;
  if (isLegacy) {
    return {
      qualitativeLevel,
      supportingFactors: asStringArray(legacySupportingFactors),
      limitingFactors: asStringArray(legacyLimitingFactors),
      clarifyingFactors: asStringArray(legacyClarifyingFactors),
      uncertaintyStatement: typeof legacyUncertaintyStatement === "string" ? legacyUncertaintyStatement : "",
    };
  }
  const translatedNarrative = translateConfidenceProse(narrativeText ?? "");
  return {
    qualitativeLevel,
    supportingFactors: describeSupport({ narrativeText: translatedNarrative, movement, uncertaintyReduction }),
    limitingFactors: summarizeUncertaintyItems(remainingUncertaintyItems ?? []),
    clarifyingFactors: describeNextEvidence(nextConfidenceBuildingEvidence),
    uncertaintyStatement: translatedNarrative || "Confidence reflects the latest evidence reviewed.",
  };
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}
