// Plain-language realization of structured V3 uncertainty. The vocabulary is
// keyed by uncertainty type and reason code, never by a particular week or
// person, so the same structured ambiguity reads the same on every surface.

const HIGH_INTAKE_CODES = new Set([
  "intake_partial_subtotal", "intake_source_conflict", "intake_totals_missing",
]);

export const ENERGY_AMBIGUITY_CLAUSES_V3 = Object.freeze({
  energy_intake_uncertainty: (item) => item.reasons.some((code) => HIGH_INTAKE_CODES.has(code))
    ? "some days do not have a reliable full-day calorie total"
    : "calorie totals come from logged meals rather than a confirmed full-day total",
  energy_wearable_estimate: () => "active calories are a wearable estimate",
  energy_pairing_incomplete: (item) => {
    const counts = item.reasons.map((code) => /^paired_days_(\d+)_of_(\d+)$/u.exec(code)).find(Boolean);
    return counts ? `food and activity were both recorded on ${counts[1]} of ${counts[2]} days`
      : "food and activity were not both recorded every day";
  },
  energy_estimate_outcome_tension: () =>
    "the calorie estimate and the scale are not moving the way the estimate implies",
});

// A short user-facing statement for any V3 uncertainty item.
export function describeUncertaintyV3(item, { vocabulary = null } = {}) {
  const energy = ENERGY_AMBIGUITY_CLAUSES_V3[item.type];
  if (energy) return sentenceCase(energy(item));
  switch (item.type) {
    case "persistence":
      return "One more confirming result is still needed before the current result is treated as settled.";
    case "causal_attribution":
      return "It is not fully clear how much of the progress comes from the current plan.";
    case "guardrail": {
      const names = item.reasons.map((code) => /^unassessed:(.+)$/u.exec(code)?.[1]).filter(Boolean)
        .map((id) => vocabulary?.guardrails?.[id]?.displayName).filter(Boolean);
      return names.length
        ? `${sentenceCase(names.join(" and "))} could not be assessed this period.`
        : "A safeguard could not be assessed this period.";
    }
    case "measurement_coverage":
      return "Some evidence was incomplete this period, so those areas are not part of the conclusion.";
    case "measurement":
      return "A direct measurement carries a stated limitation.";
    case "strategy_feasibility":
      return "It is too early to say whether the current plan is producing the intended result.";
    case "objective_measurement":
      return "The main result has not been measured recently enough to update.";
    default:
      return "Some evidence carries an open limitation.";
  }
}

function sentenceCase(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  const capitalized = `${text[0].toLocaleUpperCase("en-US")}${text.slice(1)}`;
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
}
