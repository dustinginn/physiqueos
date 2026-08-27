import { createHash } from "node:crypto";

export function canonicalJson(value) {
  return JSON.stringify(normalizeCanonicalValue(value, "$"));
}

export function createPayloadHash(value) {
  const hash = createHash("sha256");
  updateCanonicalHash(hash, value, "$");
  return hash.digest("hex");
}

function updateCanonicalHash(hash, value, path) {
  if (value === null) {
    hash.update("null");
    return;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    hash.update(JSON.stringify(value));
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers.`);
    hash.update(JSON.stringify(Object.is(value, -0) ? 0 : value));
    return;
  }
  if (Array.isArray(value)) {
    hash.update("[");
    value.forEach((entry, index) => {
      if (index) hash.update(",");
      updateCanonicalHash(hash, entry, `${path}[${index}]`);
    });
    hash.update("]");
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only JSON objects.`);
    }
    hash.update("{");
    Object.keys(value).sort().forEach((key, index) => {
      const entry = value[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
        throw new TypeError(`${path}.${key} is not JSON serializable.`);
      }
      if (index) hash.update(",");
      hash.update(JSON.stringify(key));
      hash.update(":");
      updateCanonicalHash(hash, entry, `${path}.${key}`);
    });
    hash.update("}");
    return;
  }
  throw new TypeError(`${path} is not JSON serializable.`);
}

function normalizeCanonicalValue(value, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeCanonicalValue(entry, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only JSON objects.`);
    }
    return Object.keys(value).sort().reduce((result, key) => {
      const entry = value[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
        throw new TypeError(`${path}.${key} is not JSON serializable.`);
      }
      result[key] = normalizeCanonicalValue(entry, `${path}.${key}`);
      return result;
    }, {});
  }
  throw new TypeError(`${path} is not JSON serializable.`);
}
