// Founder-facing product language belongs at this boundary. Domain identifiers may be
// retained beside presentation text for machine use, but callers must never interpolate
// them into narrative copy.

const PRODUCT_LABELS = Object.freeze({
  activity: "Activity",
  build_lean_mass: "Build Lean Mass",
  confidence: "Confidence",
  developing: "Developing",
  dexa: "DEXA",
  dexa_body_composition: "DEXA",
  dexa_event: "DEXA Event",
  energy: "Energy",
  body_composition_anchor: "Body-composition anchor",
  evidence_alignment: "Evidence alignment",
  final_stretch: "Final stretch",
  fluctuation_resolution: "Fluctuation resolved",
  forecast_shift: "Forecast shift",
  goal: "Goal",
  high: "High",
  midweek: "Midweek",
  midweek_briefing: "Midweek Briefing",
  moderate: "Moderate",
  monthly: "Monthly",
  monthly_briefing: "Monthly Briefing",
  nutrition: "Nutrition",
  new_low: "New low",
  operating_plan: "Operating Plan",
  phase: "Phase",
  photo_event: "Photo Event",
  photo_interpreter: "Photo interpretation",
  photo_led_golden: "Photo-led progress",
  performance_preservation: "Performance preservation",
  progress_photos: "Progress Photos",
  recovery: "Recovery",
  training: "Training",
  training_progression: "Training",
  trend_confirmation: "Trend confirmation",
  stabilization: "Stabilization",
  steady_execution: "Steady execution",
  visible_abs: "Visible Abs",
  visual_update: "Visual update",
  weekly: "Weekly",
  weekly_briefing: "Weekly Briefing",
  weight: "Weight",
  weight_update: "Weight update",
});

const NARRATIVE_LABELS = Object.freeze({
  confidence: "confidence",
  developing: "developing",
  energy: "energy",
  goal: "goal",
  guardrail: "guardrail",
  high: "high",
  low: "low",
  moderate: "moderate",
  phase: "phase",
  recovery: "recovery",
  strategy: "strategy",
  training: "training",
  very_high: "very high",
  very_low: "very low",
  weight: "weight",
});

const BAND_LABELS = Object.freeze({
  very_low: "Very Low",
  low: "Low",
  developing: "Developing",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High",
});

const MOVEMENT_LABELS = Object.freeze({
  increase: "Increased",
  increased: "Increased",
  decrease: "Decreased",
  decreased: "Decreased",
  no_meaningful_change: "No meaningful change",
  held: "No meaningful change",
  initial: "Initial assessment",
});

export function productLabel(token, { context = "label", fallback = null } = {}) {
  if (context === "narrative") {
    return NARRATIVE_LABELS[token] ?? PRODUCT_LABELS[token] ?? fallback;
  }
  return PRODUCT_LABELS[token] ?? fallback;
}

export function confidenceBandLabel(value, { context = "label" } = {}) {
  if (context === "narrative") {
    return NARRATIVE_LABELS[value] ?? "available";
  }
  return BAND_LABELS[value] ?? "Confidence available";
}

export function confidenceMovementLabel(value) {
  return MOVEMENT_LABELS[value] ?? "Movement unavailable";
}

// Dynamic Goal/objective identities are suffixes, not presentation semantics. Preserve the
// original code in machine lineage while resolving only its stable semantic prefix here.
export function confidenceSemanticCode(rawCode) {
  if (typeof rawCode !== "string" || !rawCode.trim()) return null;
  const head = rawCode.trim().split(/[|:]/u, 1)[0];
  const knownPrefix = [
    "objective_feasible",
    "objective_ahead",
    "objective_on_track",
    "objective_uncertain",
    "objective_at_risk",
    "objective_unlikely",
    "objective_behind",
    "objective_contradicted",
    "attainability_ahead",
    "attainability_on_expected_trajectory",
    "attainability_quantitative_progress_unavailable",
    "attainability_positive_but_behind",
    "attainability_stalled",
    "attainability_regressing",
    "attainability_unassessable",
    "attainability_authorized_expected_trajectory_unavailable",
    "attainability_goal_progress_unavailable",
    "attainability_phase_progress_baseline_unavailable",
    "attainability_completion_timing_not_firm",
    "attainability_remaining_gap_exceeds_authorized_expected_envelope",
    "milestone_supported",
    "milestone_due_unresolved",
    "milestone_overdue_unresolved",
    "milestone_contradicted",
  ].find((prefix) => head === prefix || head.startsWith(`${prefix}_`));
  return knownPrefix ?? head;
}

export const FOUNDER_PRESENTATION_DENYLIST = Object.freeze([
  /\b[a-z]+(?:_[a-z0-9]+)+\b/u,
  /\bcanonical[_A-Za-z0-9]*\b/u,
  /\buser_[A-Za-z0-9_]+\b/u,
  /\b(?:assessment|confidence|schema|model)_[A-Za-z0-9_]*(?:v\d+)?\b/u,
  /\b(?:goal|phase|training|energy|recovery|photo|dexa)_[A-Za-z0-9_]+\b/u,
  /\b(?:provider-authoritative|postgres-canonical)\b/iu,
  /\b[a-z]+[A-Z][A-Za-z0-9]*\b/u,
  /\b(?:predecessor|supportive domain signal|signal agreement|assessment window|direct outcome confirmation|material contradiction|materially more conclusive|independent weekly periods|coverage limited|durability period|semantic band|forecast uncertain|movement ceiling|bounded target|partial-week evidence|completed-week change)\b/iu,
  /\b(?:[Tt]he|[Tt]his|[Cc]urrent)\s+(?:Goal|Phase|Guardrail|Strategy)\b/u,
  /\b(?:Energy calibration|Recovery coverage)\b/u,
  /\bConfidence remains (?:Very Low|Low|Developing|Moderate|High|Very High)\b/u,
]);

export function findFounderPresentationLeaks(value) {
  const strings = collectPresentationStrings(value);
  const leaks = [];
  for (const text of strings) {
    for (const pattern of FOUNDER_PRESENTATION_DENYLIST) {
      pattern.lastIndex = 0;
      const match = text.match(pattern);
      if (match) leaks.push({ text, token: match[0] });
    }
  }
  return leaks;
}

export function assertFounderPresentationSafe(value) {
  const leaks = findFounderPresentationLeaks(value);
  if (leaks.length) {
    const error = new Error("Founder-facing Confidence text contains an internal presentation token.");
    error.code = "FOUNDER_CONFIDENCE_PRESENTATION_TOKEN_LEAK";
    error.leaks = leaks;
    throw error;
  }
  return value;
}

function collectPresentationStrings(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return [
    value.summary,
    value.bandLabel,
    value.movementLabel,
    value.evidenceContextNote,
    value.historicalContext?.text,
    value.movementExplanation?.text,
    ...(value.supportingFactors ?? []).map((item) => item?.text),
    ...(value.limitingFactors ?? []).map((item) => item?.text),
    ...(value.nextDecisiveEvidence ?? []).map((item) => item?.text),
  ].filter((item) => typeof item === "string" && item.trim());
}
