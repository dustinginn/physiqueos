import { createHash } from "node:crypto";

export function createFounderRuntimeSemanticDigest(value) {
  return createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .toUpperCase();
}

const COACHING_UPDATES_CONCURRENCY_COLLECTIONS = Object.freeze([
  "dexaScans",
  "evidenceReviews",
  "executionItems",
  "goals",
  "protocolVersions",
  "protocols",
  "reminders",
  "progressPhotos",
]);

export function createCoachingUpdatesSemanticDigest(value) {
  return createFounderRuntimeSemanticDigest(Object.fromEntries(
    COACHING_UPDATES_CONCURRENCY_COLLECTIONS.map((key) => [key, value?.[key] ?? null]),
  ));
}

export function createProgressPhotosScheduleSemanticDigest(value) {
  return createFounderRuntimeSemanticDigest({
    executionItems: value?.executionItems ?? null,
    protocolVersions: value?.protocolVersions ?? null,
    protocols: value?.protocols ?? null,
    reminders: value?.reminders ?? null,
  });
}

export function createFounderRuntimeFileHash(raw) {
  return createHash("sha256").update(raw).digest("hex").toUpperCase();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
