import { createHash } from "node:crypto";
import { destinationFromWebHref } from "../../contracts/v1/destination.js";

const FORBIDDEN_KEYS = new Set([
  "absolutePath", "filePath", "filesystemPath", "localPath", "objectKey",
  "providerCredentials", "repository", "repositories", "runtimeStore",
  "secretAccessKey", "source_file", "source_path",
]);

export function createApplicationReadModel({
  model,
  data,
  resourceVersion = "1",
  generatedAt = new Date().toISOString(),
  freshThrough = generatedAt,
  intentionalDifferences = [],
} = {}) {
  if (!model) throw new Error("A read-model identity is required.");
  const projected = projectClientSafeValue(data);
  const result = {
    contractVersion: "1",
    model: String(model),
    resourceVersion: String(resourceVersion),
    generatedAt: new Date(generatedAt).toISOString(),
    freshThrough: new Date(freshThrough).toISOString(),
    data: projected,
    intentionalDifferences: Object.freeze([...intentionalDifferences]),
  };
  result.etag = `\"${createHash("sha256").update(JSON.stringify(result)).digest("base64url")}\"`;
  assertClientSafeReadModel(result);
  return deepFreeze(result);
}

export function projectClientSafeValue(value) {
  if (Array.isArray(value)) return value.map(projectClientSafeValue);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (key === "href" && typeof child === "string") {
      const destination = destinationFromWebHref(child);
      if (!destination) throw new Error(`Application read model contains an unmapped web destination: ${child}`);
      output.destination = destination;
      continue;
    }
    output[key] = projectClientSafeValue(child);
  }
  return output;
}

export function assertClientSafeReadModel(value, path = "readModel") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertClientSafeReadModel(item, `${path}[${index}]`));
    return value;
  }
  if (!value || typeof value !== "object") return value;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Client read model exposes ${path}.${key}.`);
    assertClientSafeReadModel(child, `${path}.${key}`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
