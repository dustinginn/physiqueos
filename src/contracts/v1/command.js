import { createUuidV7, isUuidV7 } from "./identifiers.js";
import { ApplicationProblem } from "./problem.js";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:\/-]{16,200}$/;
const CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function createCommandMetadata(input = {}, options = {}) {
  const commandId = input.commandId ?? createUuidV7(options);
  if (!isUuidV7(commandId)) throw validationProblem("commandId", "Command ID must be UUIDv7.");
  if (!IDEMPOTENCY_KEY.test(String(input.idempotencyKey ?? ""))) {
    throw validationProblem("idempotencyKey", "Idempotency key must be 16-200 safe characters.");
  }
  if (input.correlationId != null && !CORRELATION_ID.test(String(input.correlationId))) {
    throw validationProblem("correlationId", "Correlation ID must be 8-128 safe characters.");
  }
  return Object.freeze({
    commandId,
    idempotencyKey: String(input.idempotencyKey),
    correlationId: input.correlationId == null ? null : String(input.correlationId),
    expectedVersion: input.expectedVersion == null ? null : normalizeAggregateVersion(input.expectedVersion),
    payloadVersion: String(input.payloadVersion ?? "1"),
    clientOccurredAt: input.clientOccurredAt ?? null,
    clientTimeZone: input.clientTimeZone ?? null,
  });
}

export function normalizeAggregateVersion(value) {
  const candidate = String(value);
  if (!/^[1-9]\d*$/.test(candidate)) throw validationProblem("expectedVersion", "Aggregate version must be a positive decimal string.");
  return candidate;
}

function validationProblem(field, detail) {
  return new ApplicationProblem({
    status: 400,
    code: "CONTRACT_VALIDATION_FAILED",
    title: "The request contract is invalid.",
    fieldErrors: [{ field, code: "invalid", detail }],
  });
}
