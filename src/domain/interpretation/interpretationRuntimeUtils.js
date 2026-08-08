import { createHash } from "node:crypto";

export function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function semanticHash(value) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function uniqueStrings(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}

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
  const result = optionalTimestamp(value, field);
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

export function assertEnum(value, allowed, field) {
  if (!allowed.has(value)) throw new Error(`Unsupported ${field}: ${String(value)}.`);
  return value;
}

export function evaluatePredicate(value, predicate) {
  if (value == null || !predicate || typeof predicate !== "object") return null;
  const operator = predicate.operator;
  const number = typeof value === "number" ? value : Number(value);
  if (["gt", "gte", "lt", "lte", "between", "outside"].includes(operator) &&
      !Number.isFinite(number)) return null;
  if (operator === "gt") return number > Number(predicate.value);
  if (operator === "gte") return number >= Number(predicate.value);
  if (operator === "lt") return number < Number(predicate.value);
  if (operator === "lte") return number <= Number(predicate.value);
  if (operator === "between") {
    return number >= Number(predicate.min) && number <= Number(predicate.max);
  }
  if (operator === "outside") {
    return number < Number(predicate.min) || number > Number(predicate.max);
  }
  if (operator === "eq") return value === predicate.value;
  if (operator === "neq") return value !== predicate.value;
  return null;
}

export function latestMeasurement(evidenceDescriptors, evidenceRefs, metric) {
  return evidenceDescriptors
    .filter((item) => evidenceRefs.includes(item.id))
    .flatMap((item) => (item.measurements ?? []).map((measurement) => ({
      ...measurement,
      evidenceRef: item.id,
      observedAt: measurement.observedAt ?? item.observedAt ?? null,
    })))
    .filter((item) => item.metric === metric && item.value != null)
    .sort((left, right) =>
      String(right.observedAt ?? "").localeCompare(String(left.observedAt ?? "")) ||
      String(right.evidenceRef).localeCompare(String(left.evidenceRef))
    )[0] ?? null;
}

export function relationRef(type, id) {
  return `${type}:${id}`;
}

export function normalizeMachine(value, fallback = "unknown") {
  const normalized = String(value ?? "").trim().toLowerCase()
    .replaceAll("-", "_").replace(/\s+/g, "_");
  return normalized || fallback;
}
