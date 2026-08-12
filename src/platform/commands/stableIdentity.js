import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";

export function createSourceIdentity({ ownerUserId, namespace, sourceId }) {
  requirePart(ownerUserId, "ownerUserId");
  requirePart(namespace, "namespace");
  requirePart(sourceId, "sourceId");
  return Object.freeze({ ownerUserId, namespace, sourceId, key: createPayloadHash({ ownerUserId, namespace, sourceId }) });
}

export function createOccurrenceGenerationKey({ ownerUserId, sourceType, sourceId, sourceVersion, localDate, slotKey }) {
  [ownerUserId, sourceType, sourceId, sourceVersion, localDate, slotKey].forEach((value, index) => requirePart(value, `part${index}`));
  return createPayloadHash({ ownerUserId, sourceType, sourceId, sourceVersion: String(sourceVersion), localDate, slotKey });
}

function requirePart(value, name) {
  if (String(value ?? "").trim().length === 0) throw new Error(`${name} is required.`);
}
