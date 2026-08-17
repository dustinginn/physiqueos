// Semantic presentation model for Confidence explanations. The canonical Confidence assessment
// carries structured internal-reasoning data (remainingUncertainty.items, a movement rationale
// code, nextConfidenceBuildingEvidence, a raw narrative sentence written in Confidence-engine
// vocabulary) — none of that is coaching copy. This module is the one sanctioned place that
// turns that reasoning into plain, specific, coaching-voice sentences. Typing the output as
// strings only solves serialization ([object Object]); this module is what solves the meaning —
// every internal factor/kind/rationale code is classified and re-expressed in the user's terms,
// never echoed or lightly edited. Unrecognized internal shapes are either mapped to a safe,
// honest, generic sentence or omitted — they are never stringified as-is.

const SUPPORT_RATIONALE_COPY = Object.freeze({
  proxy_support_repeated_increase: "supportive",
  proxy_support_sustained_increase: "supportive",
  uncertainty_reduced_increase: "resolved",
  proxy_support_emerging_hold: "emerging",
});

const CAPABILITY_SUPPORT_COPY = Object.freeze({
  training: "Training has continued moving forward, which supports confidence that the plan is working.",
  nutrition: "Nutrition and intake trends have continued to hold up, which supports confidence that the plan is working.",
  weight: "Weight trends have continued to hold up, which supports confidence that the plan is working.",
  recovery: "Recovery has continued to hold up, which supports confidence that the plan is working.",
  activity: "Activity trends have continued to hold up, which supports confidence that the plan is working.",
});
const GENERIC_SUPPORT_COPY = "Recent evidence has continued to support the current plan.";

const CAPABILITY_KEYWORDS = Object.freeze([
  ["training", /\btraining\b/i],
  ["nutrition", /\b(nutrition|intake|calorie)/i],
  ["weight", /\bweight\b/i],
  ["recovery", /\brecovery\b/i],
  ["activity", /\bactivity\b/i],
]);

// Each uncertainty "kind" is a small, closed enum from the Confidence engine — not
// Founder-specific data. `goal_semantics_missing` (a Guardrail record missing a configured
// threshold) is deliberately omitted: it's a data-completeness detail about the system's own
// configuration, not something meaningful or actionable for the user, so it provides no
// value if surfaced and is safely dropped rather than translated.
const UNCERTAINTY_KIND_COPY = Object.freeze({
  measurement_pending: "There hasn't yet been enough direct body-composition evidence to confirm the desired outcome.",
  energy_calibration_uncertain: "There isn't yet enough time under the current calorie and activity targets to know how the body is responding.",
  recovery_evidence_missing: "Recovery evidence is limited right now.",
});

const EVIDENCE_CAPABILITY_COPY = Object.freeze({
  dexa_body_composition: "The next DEXA/body-composition measurement can directly confirm how this is progressing.",
});

const MATERIALITY_RANK = Object.freeze({ high: 0, moderate: 1, low: 2 });

// Known internal phrasing that occasionally reaches a narrative sentence verbatim (baked into
// an already-published, immutable historical record) — translated here at render time rather
// than by rewriting stored text. Generic pattern match, not a Founder-specific string swap.
// Retained for any remaining legacy callers that still render raw narrative text directly.
const INTERNAL_PHRASE_TRANSLATIONS = Object.freeze([
  [/\bdirect goal confirmation remains pending\.?/gi,
    "a direct measurement hasn't confirmed this yet"],
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

function detectCapability(text) {
  const value = String(text ?? "");
  for (const [key, pattern] of CAPABILITY_KEYWORDS) if (pattern.test(value)) return key;
  return null;
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

// Classifies *why* confidence moved using the engine's small closed rationale-code enum
// (never Founder-specific), then expresses that reason in the user's terms. The raw
// narrative sentence is only ever consulted to guess which capability (training, nutrition,
// weight, recovery, activity) is being referenced — never echoed.
function describeSupport({ narrativeText, movement, movementRationaleCode, uncertaintyReduction }) {
  const reduced = uncertaintyReduction?.status === "forecast_identified_reduction_factors" &&
    (uncertaintyReduction.factorCodes?.length ?? 0) > 0;
  if (reduced) return ["A previously uncertain factor was resolved by recent evidence."];

  const classification = SUPPORT_RATIONALE_COPY[movementRationaleCode] ??
    (movement === "increase" ? "supportive" : null);
  if (!classification) return [];

  if (classification === "resolved") return ["A previously uncertain factor was resolved by recent evidence."];
  if (classification === "emerging") {
    return ["An early positive signal is showing, though it's still too soon to be fully confident in it."];
  }
  const capability = detectCapability(narrativeText);
  return [CAPABILITY_SUPPORT_COPY[capability] ?? GENERIC_SUPPORT_COPY];
}

// Builds the typed detail rendered by the Confidence explanation modal (and any other
// surface that explains a canonical Confidence assessment). Accepts either the current V2
// canonical shape or a legacy-shaped object with pre-built string arrays — legacy input
// passes straight through untouched so older callers keep working unmodified.
export function buildConfidenceExplanationDetail({
  qualitativeLevel = null,
  narrativeText = null,
  movement = null,
  movementRationaleCode = null,
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
  // The bottom summary paragraph is intentionally left empty for the real (V2) path: once
  // supports/limits/clearer carry the actual translated meaning, a fourth paragraph built
  // from the same raw narrative text would only repeat it — in Confidence-engine vocabulary,
  // not the user's. A future summary is welcome here if it can synthesize something the
  // three lists genuinely don't already say; echoing the narrative sentence doesn't qualify.
  return {
    qualitativeLevel,
    supportingFactors: describeSupport({ narrativeText, movement, movementRationaleCode, uncertaintyReduction }),
    limitingFactors: summarizeUncertaintyItems(remainingUncertaintyItems ?? []),
    clarifyingFactors: describeNextEvidence(nextConfidenceBuildingEvidence),
    uncertaintyStatement: "",
  };
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}
