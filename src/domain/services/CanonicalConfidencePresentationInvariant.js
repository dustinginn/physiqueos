const INCREASE_LANGUAGE = /\b(increas(?:e|ed|es|ing)|improv(?:e|ed|es|ing)|higher|rose|risen|rising|stronger|strengthened|grew|grown|gaining|gained)\b/iu;
const DECREASE_LANGUAGE = /\b(decreas(?:e|ed|es|ing)|declin(?:e|ed|es|ing)|lower|fell|fallen|falling|weaker|weakened|dropp(?:ed|ing)|lost)\b/iu;

export function assertCanonicalConfidencePresentation(confidence) {
  if (!confidence) return confidence;
  const primary = normalize(confidence.primaryReason);
  const presentation = normalize(confidence.presentationExplanation);
  const structured = normalize(confidence.explanationModel?.summary);
  if (confidence.explanationModel && (
    confidence.explanationModel.score !== confidence.score ||
    confidence.explanationModel.band !== confidence.band ||
    normalizedMovement(confidence.explanationModel.movement) !==
      confidence.movementDirection
  )) {
    throw invariantError("STRUCTURED_IDENTITY_MISMATCH",
      "The shared Confidence explanation must describe the displayed assessment.");
  }
  if (structured && presentation && structured !== presentation) {
    throw invariantError("MIXED_SOURCE", "Confidence presentation must use the shared structured explanation.");
  }
  if (!structured && primary && presentation && primary !== presentation) {
    throw invariantError("MIXED_SOURCE", "Legacy Confidence presentation cannot replace its published explanation.");
  }
  const explanation = structured || presentation || primary;
  if (!explanation) {
    throw invariantError("MISSING_EXPLANATION", "Canonical published confidence requires its published explanation.");
  }
  const hasIncrease = INCREASE_LANGUAGE.test(explanation);
  const hasDecrease = DECREASE_LANGUAGE.test(explanation);
  const movement = confidence.movementDirection;
  if (movement === "held" && (hasIncrease || hasDecrease)) {
    throw invariantError("HELD_DIRECTION_CONTRADICTION", "Held confidence cannot communicate an increase or decrease.");
  }
  if (movement === "increased" && (!hasIncrease || hasDecrease)) {
    throw invariantError("INCREASE_DIRECTION_CONTRADICTION", "Increased confidence must communicate only an increase.");
  }
  if (movement === "decreased" && (!hasDecrease || hasIncrease)) {
    throw invariantError("DECREASE_DIRECTION_CONTRADICTION", "Decreased confidence must communicate only a decrease.");
  }
  const delta = confidence.delta;
  if (movement === "held" && delta != null && Number(delta) !== 0) {
    throw invariantError("HELD_DELTA_CONTRADICTION", "Held confidence requires a zero delta.");
  }
  if (movement === "increased" && !(Number(delta) > 0)) {
    throw invariantError("INCREASE_DELTA_CONTRADICTION", "Increased confidence requires a positive delta.");
  }
  if (movement === "decreased" && !(Number(delta) < 0)) {
    throw invariantError("DECREASE_DELTA_CONTRADICTION", "Decreased confidence requires a negative delta.");
  }
  return confidence;
}

export function canonicalConfidenceExplanation(confidence) {
  const canonical = assertCanonicalConfidencePresentation(confidence);
  return normalize(canonical?.explanationModel?.summary) ||
    normalize(canonical?.presentationExplanation) || normalize(canonical?.primaryReason);
}

function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedMovement(value) {
  return ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[value] ?? value;
}

function invariantError(code, message) {
  const error = new Error(`[CanonicalConfidencePresentation:${code}] ${message}`);
  error.code = `CANONICAL_CONFIDENCE_PRESENTATION_${code}`;
  return error;
}
