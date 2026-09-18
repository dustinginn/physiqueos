import { createHash } from "node:crypto";

export const V3_SCHEMA = Object.freeze({
  goalContract: "goal_contract_v3",
  evidenceObservation: "evidence_observation_v3",
  strategicInterpretation: "strategic_interpretation_v3",
  coachingState: "coaching_state_v3",
  confidence: "confidence_assessment_v3",
  narrativePlan: "narrative_plan_v3",
  calibrationResult: "confidence_narrative_v3_calibration_result_v1",
});

export const QUALITY_ORDER = Object.freeze({
  insufficient: 0,
  limited: 1,
  adequate: 2,
  robust: 3,
});

export const AUTHORITY_ORDER = Object.freeze({
  contextual: 0,
  supporting: 1,
  material: 2,
  decisive: 3,
});

export const SIGNIFICANCE_ORDER = Object.freeze({
  none: 0,
  minor: 1,
  meaningful: 2,
  major: 3,
});

export function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

export function optionalTimestamp(value, field) {
  if (value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

export function requiredTimestamp(value, field) {
  const timestamp = optionalTimestamp(value, field);
  if (!timestamp) throw new Error(`${field} is required.`);
  return timestamp;
}

export function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function semanticFingerprint(value) {
  return `sha256_${createHash("sha256").update(stableSerialize(value)).digest("hex")}`;
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

export function round(value, precision = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function capabilityId(value) {
  if (typeof value === "string") return requiredText(value, "capabilityId");
  const namespace = requiredText(value?.namespace, "capability.namespace");
  const key = requiredText(value?.key, "capability.key");
  return `${namespace}.${key}`;
}

export function matchesCapability(pattern, candidate) {
  if (pattern.endsWith(".*")) return candidate.startsWith(pattern.slice(0, -1));
  return pattern === candidate;
}

export function getPath(value, path) {
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

export function evaluateDeclarativePredicate(context, predicate = {}) {
  if (predicate.version !== "declarative_predicate_v1") {
    throw new Error("Only declarative_predicate_v1 is supported.");
  }
  const actual = getPath(context, requiredText(predicate.path, "predicate.path"));
  switch (predicate.operator) {
    case "eq": return actual === predicate.value;
    case "neq": return actual !== predicate.value;
    case "in": return Array.isArray(predicate.values) && predicate.values.includes(actual);
    case "not_in": return Array.isArray(predicate.values) && !predicate.values.includes(actual);
    case "gte": return Number.isFinite(Number(actual)) && Number(actual) >= Number(predicate.value);
    case "lte": return Number.isFinite(Number(actual)) && Number(actual) <= Number(predicate.value);
    case "between": return Number.isFinite(Number(actual)) &&
      Number(actual) >= Number(predicate.min) && Number(actual) <= Number(predicate.max);
    case "exists": return actual != null;
    default: throw new Error(`Unsupported declarative predicate operator: ${predicate.operator}.`);
  }
}

export function allPredicates(context, predicates = []) {
  return predicates.length > 0 && predicates.every((predicate) =>
    evaluateDeclarativePredicate(context, predicate));
}
