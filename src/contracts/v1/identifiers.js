import { validate as validateUuid, v7 as uuidv7, version as uuidVersion } from "uuid";

const SAFE_IDENTIFIER = /^[^\u0000-\u001f\u007f]{1,255}$/;

export function createUuidV7({ createUuid = uuidv7 } = {}) {
  const value = String(createUuid());
  if (!isUuidV7(value)) throw new Error("The platform ID generator must return a UUIDv7 value.");
  return value;
}

export function isUuidV7(value) {
  const candidate = String(value ?? "");
  return validateUuid(candidate) && uuidVersion(candidate) === 7;
}

export function preserveLegacyId(value) {
  const candidate = String(value ?? "");
  if (!SAFE_IDENTIFIER.test(candidate) || candidate.trim().length === 0) {
    throw new Error("A non-empty, control-character-free legacy ID is required.");
  }
  return candidate;
}

export function requireResourceId(value, field = "resourceId") {
  try {
    return preserveLegacyId(value);
  } catch {
    throw new Error(`${field} is invalid.`);
  }
}
