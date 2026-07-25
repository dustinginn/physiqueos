import { createHash } from "node:crypto";

export const GoalTransitionActivationCanonicalizationVersion =
  "goal_transition_activation_canonicalization_v1";

export function activationFingerprint(value) {
  return createHash("sha256")
    .update(stableActivationSerialize(value ?? null))
    .digest("hex");
}

export function stableActivationSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableActivationSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableActivationSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deepFreezeActivationValue(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreezeActivationValue);
  return value;
}

export function isDeeplyFrozenActivationValue(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value)
    && Object.values(value).every((child) => isDeeplyFrozenActivationValue(child, seen));
}

export function canonicalActivationClone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
