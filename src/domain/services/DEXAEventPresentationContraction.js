// DEXA Event: say each conclusion once.
//
// The DEXA Event shows the V3 hero, the DEXA interpretation and Coach's
// Insight together. The interpretation was composed before V3 and restated
// what the hero and Coach already say (the lean-tissue change, the body-fat
// status, the measurement caveat, the next-scan preparation), and two of its
// fields repeated two others verbatim for older readers. Using the claim each
// sentence makes (DEXAEventNarrativeService `interpretationClaims`) and the
// claims the V3 presentation roles already carry, a sentence is kept only in
// its home: once in the hero or Coach's Insight, otherwise once in the
// interpretation. Nothing is rewritten or truncated; a field whose every
// sentence is said elsewhere becomes empty and every reader omits it.

// Claims a V3 presentation role covers, expressed as interpretation claims.
const ROLE_COVERAGE = Object.freeze({
  objective_movement: ["objective_movement"],
  guardrail_status: ["guardrail_status"],
  preserve_routine_and_comparability: ["comparable_next_check"],
  comparable_next_check: ["comparable_next_check"],
});

// Interpretation claims with a dedicated home field: said there, not elsewhere.
const CLAIM_HOME = Object.freeze({ measurement_uncertainty: "uncertainty" });

// The order every reader renders the interpretation in.
const RENDER_ORDER = Object.freeze([
  "opening", "fatLoss", "leanMass", "regional", "phaseMeaning", "stoodOut",
  "goalProgress", "guardrailStatus", "supportingEvidence", "uncertainty",
]);
const OPTIONAL_NULLABLE = new Set(["phaseMeaning", "stoodOut", "goalProgress", "guardrailStatus"]);

export function contractDexaEventInterpretation({ interpretation, interpretationClaims, roleClaims } = {}) {
  if (!interpretation || !interpretationClaims || !roleClaims) return interpretation;
  const covered = new Set(Object.values(roleClaims).flat()
    .flatMap((claim) => ROLE_COVERAGE[claim] ?? []));
  const result = { ...interpretation };
  const said = new Set(covered);
  const present = (field) => typeof interpretation[field] === "string" && interpretation[field].trim() !== "";
  for (const field of RENDER_ORDER) {
    if (!present(field)) continue;
    const parts = interpretationClaims[field];
    if (!Array.isArray(parts) || parts.length === 0) continue;
    if (parts.every((part) => part.claim === "alias")) {
      if (parts.every((part) => present(part.of))) result[field] = emptyValue(field);
      continue;
    }
    const resolved = parts.length === 1 && parts[0].text == null
      ? [{ ...parts[0], text: interpretation[field] }]
      : parts;
    // Only act when the tagged sentences are exactly the stored text, so an
    // artifact whose prose was edited elsewhere is never altered.
    if (resolved.map((part) => part.text).join(" ") !== interpretation[field]) continue;
    const kept = resolved.filter((part) => {
      if (said.has(part.claim)) return false;
      const home = CLAIM_HOME[part.claim];
      return !(home && home !== field && present(home));
    });
    kept.forEach((part) => said.add(part.claim));
    result[field] = kept.length ? kept.map((part) => part.text).join(" ") : emptyValue(field);
  }
  return result;
}

function emptyValue(field) {
  return OPTIONAL_NULLABLE.has(field) ? null : "";
}
