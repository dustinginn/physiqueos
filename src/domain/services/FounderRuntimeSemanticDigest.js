import { createHash } from "node:crypto";

export function createFounderRuntimeSemanticDigest(value) {
  return createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .toUpperCase();
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
