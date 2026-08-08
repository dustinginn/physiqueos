import { createHash } from "node:crypto";

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
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

export function requiredTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

export function assertEnum(value, allowed, field) {
  if (!allowed.has(value)) throw new Error(`Unsupported ${field}: ${String(value)}.`);
  return value;
}

export function dateOnly(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export function compareDates(left, right) {
  if (!left || !right) return null;
  return String(left).localeCompare(String(right));
}
