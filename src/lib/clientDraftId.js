let fallbackCounter = 0;

export function createClientDraftId(prefix = "draft", options = {}) {
  const cryptoSource = options.cryptoSource === undefined ? globalThis.crypto : options.cryptoSource;
  const safePrefix = normalizePrefix(prefix);

  if (typeof cryptoSource?.randomUUID === "function") {
    return `${safePrefix}_${cryptoSource.randomUUID()}`;
  }

  if (typeof cryptoSource?.getRandomValues === "function") {
    const values = new Uint32Array(4);
    cryptoSource.getRandomValues(values);
    return `${safePrefix}_${[...values].map((value) => value.toString(36).padStart(7, "0")).join("")}`;
  }

  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Number(options.now?.() ?? Date.now()).toString(36);
  const randomValue = Number(options.random?.() ?? Math.random());
  const randomSuffix = Number.isFinite(randomValue)
    ? Math.floor(Math.abs(randomValue % 1) * 0x100000000).toString(36).padStart(7, "0")
    : "0000000";

  return `${safePrefix}_${timestamp}_${fallbackCounter.toString(36)}_${randomSuffix}`;
}

function normalizePrefix(value) {
  const normalized = String(value ?? "draft")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "draft";
}
