// Phase A (shadow): structured, direction-aware guardrail evaluation.
//
// Built from the typed V3 guardrail contract (`evaluation.allowedRange` and
// `severityBands`), never from guardrail prose. The goal archetype decides which
// side of the range is unsafe and which side only warrants coaching: during a
// lean-mass build, above the body-fat range is unsafe while below it is coached
// and monitored first.

import { createStructuredGuardrail, GuardrailBoundMeaning } from "./GoalAdaptationContracts.js";
import { GOAL_ADAPTATION_POLICY_V1 } from "./GoalAdaptationPolicyV1.js";

const METRIC_KEYS = Object.freeze({
  "body_composition.body_fat_percentage": "body_fat_percentage",
  "body_composition.lean_mass": "lean_mass",
  "body_weight.morning_weight": "body_weight",
});

export function structureV3Guardrail(v3Guardrail, { archetype, policy = GOAL_ADAPTATION_POLICY_V1 } = {}) {
  const range = v3Guardrail?.evaluation?.mode === "allowed_range" ? v3Guardrail.evaluation.allowedRange : null;
  if (!range) return null;
  const capability = String(v3Guardrail.metricCapability?.capabilityId ?? v3Guardrail.metricCapability ?? "");
  const metric = METRIC_KEYS[capability] ?? capability;
  const directions = policy.archetypes[archetype]?.guardrailDirections?.[metric] ?? {};
  return {
    structured: createStructuredGuardrail({
      guardrailId: v3Guardrail.guardrailId,
      metric,
      unit: metric === "body_fat_percentage" ? "%" : ["lean_mass", "body_weight"].includes(metric) ? "lb" : null,
      lower: range.min,
      upper: range.max,
      lowerMeaning: directions.lower ?? GuardrailBoundMeaning.UNSAFE,
      upperMeaning: directions.upper ?? GuardrailBoundMeaning.UNSAFE,
      approximate: range.approximate === true,
      source: "v3_allowed_range",
    }),
    severityBands: [...(v3Guardrail.severityBands ?? [])].sort((a, b) => b.minimumDeviation - a.minimumDeviation),
  };
}

// Either a measured `value`, or (for persisted history where only the position
// is kept) a `position` with its `deviation`.
export function evaluateStructuredGuardrail(guardrail, { value = null, position = null, deviation = null } = {}) {
  if (!guardrail?.structured) return Object.freeze({ status: "not_assessed", position: null, meaning: GuardrailBoundMeaning.NONE });
  const { structured, severityBands } = guardrail;
  const span = structured.lower != null && structured.upper != null ? Math.round((structured.upper - structured.lower) * 1000) / 1000 : null;
  let side = position;
  let distance = deviation;
  if (value != null && Number.isFinite(Number(value))) {
    const current = Number(value);
    side = structured.lower != null && current < structured.lower ? "below" : structured.upper != null && current > structured.upper ? "above" : "within";
    distance = side === "below" ? structured.lower - current : side === "above" ? current - structured.upper : 0;
  }
  if (!side) return Object.freeze({ status: "not_assessed", position: null, meaning: GuardrailBoundMeaning.NONE, span });
  if (side === "within") return Object.freeze({ status: "clear", position: "within", deviation: 0, meaning: GuardrailBoundMeaning.NONE, severity: "clear", span, unsafePressure: false, unsafeBreach: false });
  const severity = severityBands.find((band) => Number(distance) >= band.minimumDeviation)?.status ?? "watch";
  const meaning = side === "below" ? structured.lowerMeaning : structured.upperMeaning;
  return Object.freeze({
    status: severity,
    position: side,
    deviation: distance == null ? null : Math.round(Number(distance) * 1000) / 1000,
    span,
    meaning,
    severity,
    unsafePressure: meaning === GuardrailBoundMeaning.UNSAFE && ["pressured", "breached"].includes(severity),
    unsafeBreach: meaning === GuardrailBoundMeaning.UNSAFE && severity === "breached",
  });
}
