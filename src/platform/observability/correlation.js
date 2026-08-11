import { createUuidV7 } from "../../contracts/v1/identifiers.js";

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveCorrelationId(value, options = {}) {
  const candidate = String(value ?? "").trim();
  return SAFE_CORRELATION_ID.test(candidate) ? candidate : createUuidV7(options);
}
