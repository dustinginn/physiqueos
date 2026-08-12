import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  MIGRATION_CONTROL_SCHEMA_VERSION,
  applyMigrationControlTransition,
  createInitialMigrationControlState,
  migrationCommandFingerprint,
  validateMigrationControlState,
} from "./migrationControlState.js";

const ENVELOPE_VERSION = "production-migration-control-envelope-v1";

export function createDurableMigrationControlStore({
  filePath = resolveMigrationControlPath(),
  now = () => new Date(),
  lockTimeoutMs = 1000,
} = {}) {
  const resolvedPath = path.resolve(/* turbopackIgnore: true */ filePath);
  return Object.freeze({
    filePath: resolvedPath,
    initialize(input) {
      return withExclusiveLock(resolvedPath, lockTimeoutMs, () => {
        if (fs.existsSync(resolvedPath)) {
          const existing = readEnvelope(resolvedPath);
          if (existing.state.environment !== input.environment) {
            throw storeError("MIGRATION_CONTROL_ENVIRONMENT_CONFLICT", "Existing migration-control environment does not match initialization input.");
          }
          return Object.freeze({ state: existing.state, audit: existing.audit, outcome: "already-initialized" });
        }
        const timestamp = now().toISOString();
        const state = createInitialMigrationControlState({ ...input, now: timestamp });
        const audit = [createAuditRecord({
          sequence: 1,
          timestamp,
          command: {
            commandId: input.commandId,
            correlationId: input.correlationId,
            operator: input.operator,
            reason: "Migration control initialized.",
            action: "initialized",
          },
          previous: null,
          next: state,
          result: "committed",
        })];
        writeEnvelope(resolvedPath, { state, audit });
        return Object.freeze({ state, audit: Object.freeze(audit), outcome: "initialized" });
      });
    },
    read() {
      const envelope = readEnvelope(resolvedPath);
      return Object.freeze({ state: envelope.state, audit: envelope.audit });
    },
    transition(command) {
      return withExclusiveLock(resolvedPath, lockTimeoutMs, () => {
        const envelope = readEnvelope(resolvedPath);
        const fingerprint = migrationCommandFingerprint(command);
        const prior = envelope.audit.find((entry) => entry.commandId === command.commandId);
        if (prior) {
          if (prior.commandFingerprint !== fingerprint) {
            throw storeError("MIGRATION_CONTROL_COMMAND_REUSED", "Migration-control command ID was reused with different inputs.");
          }
          if (prior.result === "failed") {
            throw storeError(prior.errorCode ?? "MIGRATION_CONTROL_COMMAND_FAILED", "The prior migration-control command failed and was not reapplied.");
          }
          return Object.freeze({ state: envelope.state, audit: envelope.audit, outcome: "idempotent-replay" });
        }
        const timestamp = now().toISOString();
        let next;
        try {
          next = applyMigrationControlTransition(envelope.state, command, { now: timestamp });
        } catch (error) {
          const audit = [...envelope.audit, createAuditRecord({
            sequence: envelope.audit.length + 1,
            timestamp,
            command,
            previous: envelope.state,
            next: envelope.state,
            result: "failed",
            commandFingerprint: fingerprint,
            errorCode: error.code ?? "MIGRATION_CONTROL_COMMAND_FAILED",
          })];
          writeEnvelope(resolvedPath, { state: envelope.state, audit });
          throw error;
        }
        const audit = [...envelope.audit, createAuditRecord({
          sequence: envelope.audit.length + 1,
          timestamp,
          command,
          previous: envelope.state,
          next,
          result: "committed",
          commandFingerprint: fingerprint,
        })];
        writeEnvelope(resolvedPath, { state: next, audit });
        return Object.freeze({ state: next, audit: Object.freeze(audit), outcome: "committed" });
      });
    },
  });
}

export function resolveMigrationControlPath({ cwd = process.cwd(), env = process.env } = {}) {
  const configured = env.PHYSIQUEOS_MIGRATION_CONTROL_PATH;
  return path.resolve(/* turbopackIgnore: true */ cwd, configured ?? path.join("private", "founder", "migration-control.json"));
}

export function readMigrationControlStatus(options = {}) {
  return createDurableMigrationControlStore(options).read().state;
}

function readEnvelope(filePath) {
  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    throw storeError("MIGRATION_CONTROL_UNAVAILABLE", `Migration control is unavailable at ${filePath}.`, error);
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw storeError("MIGRATION_CONTROL_CORRUPT", "Migration-control JSON is invalid.", error);
  }
  if (parsed?.envelopeVersion !== ENVELOPE_VERSION || parsed?.state?.schemaVersion !== MIGRATION_CONTROL_SCHEMA_VERSION || !Array.isArray(parsed.audit)) {
    throw storeError("MIGRATION_CONTROL_CORRUPT", "Migration-control envelope is invalid.");
  }
  const expectedDigest = digestEnvelopePayload(parsed.state, parsed.audit);
  if (parsed.digest !== expectedDigest) {
    throw storeError("MIGRATION_CONTROL_CORRUPT", "Migration-control integrity digest does not match.");
  }
  validateMigrationControlState(parsed.state);
  validateAudit(parsed.audit, parsed.state);
  return Object.freeze({ state: Object.freeze(parsed.state), audit: Object.freeze(parsed.audit.map(Object.freeze)) });
}

function writeEnvelope(filePath, { state, audit }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const envelope = {
    envelopeVersion: ENVELOPE_VERSION,
    state,
    audit,
    digest: digestEnvelopePayload(state, audit),
  };
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(envelope)}\n`, { flag: "wx", mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    throw storeError("MIGRATION_CONTROL_PERSIST_FAILED", "Migration-control transition could not be persisted atomically.", error);
  }
}

function withExclusiveLock(filePath, timeoutMs, operation) {
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let descriptor = null;
  while (descriptor == null) {
    try {
      descriptor = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
    } catch (error) {
      if (error?.code !== "EEXIST" || Date.now() >= deadline) {
        throw storeError("MIGRATION_CONTROL_LOCK_UNAVAILABLE", "Migration-control lock is unavailable.", error);
      }
      sleepSync(20);
    }
  }
  try {
    return operation();
  } finally {
    try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

function createAuditRecord({ sequence, timestamp, command, previous, next, result, commandFingerprint = null, errorCode = null }) {
  return Object.freeze({
    sequence,
    operationId: next?.migrationOperationId ?? command.migrationOperationId ?? null,
    fenceId: next?.fenceId ?? null,
    commandId: command.commandId ?? null,
    correlationId: command.correlationId ?? null,
    commandFingerprint,
    operator: command.operator,
    timestamp,
    action: command.action,
    previousState: previous?.fenceState ?? null,
    nextState: next?.fenceState ?? null,
    expectedEpoch: command.expectedCanonicalStoreEpoch ?? null,
    actualEpoch: next?.canonicalStoreEpoch ?? null,
    previousComposition: previous?.compositionMode ?? null,
    nextComposition: next?.compositionMode ?? null,
    buildIdentity: next?.sourceIdentity ?? null,
    reason: command.reason,
    result,
    errorCode,
  });
}

function validateAudit(audit, state) {
  if (audit.length === 0 || audit.some((entry, index) => entry.sequence !== index + 1)) {
    throw storeError("MIGRATION_CONTROL_CORRUPT", "Migration-control audit sequence is invalid.");
  }
  const last = audit.at(-1);
  if (last.nextState !== state.fenceState || last.actualEpoch !== state.canonicalStoreEpoch) {
    throw storeError("MIGRATION_CONTROL_CORRUPT", "Migration-control audit does not terminate at current state.");
  }
}

function digestEnvelopePayload(state, audit) {
  return createHash("sha256").update(stableJson({ state, audit })).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sleepSync(milliseconds) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, milliseconds);
}

function storeError(code, message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
