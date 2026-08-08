import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const FOUNDER_STORE_MUTATION_LOCK_VERSION = "founder_store_mutation_lock_v1";
export const FounderStoreMutationLockErrorCode = Object.freeze({
  BUSY: "FOUNDER_STORE_MUTATION_LOCK_BUSY",
  TIMEOUT: "FOUNDER_STORE_MUTATION_LOCK_TIMEOUT",
  OWNERSHIP_MISMATCH: "FOUNDER_STORE_MUTATION_LOCK_OWNERSHIP_MISMATCH",
  METADATA_INVALID: "FOUNDER_STORE_MUTATION_LOCK_METADATA_INVALID",
  OTHER_HOST: "FOUNDER_STORE_MUTATION_LOCK_OTHER_HOST",
  LIVE_OWNER: "FOUNDER_STORE_MUTATION_LOCK_LIVE_OWNER",
  STALE_NOT_RECOVERABLE: "FOUNDER_STORE_MUTATION_LOCK_STALE_NOT_RECOVERABLE",
  ACQUISITION_FAILED: "FOUNDER_STORE_MUTATION_LOCK_ACQUISITION_FAILED",
  RELEASE_FAILED: "FOUNDER_STORE_MUTATION_LOCK_RELEASE_FAILED",
});

export class FounderStoreMutationLockError extends Error {
  constructor(code, message, details = {}) {
    super(message, { cause: details.cause });
    this.name = "FounderStoreMutationLockError";
    this.code = code;
    this.details = Object.freeze({
      lockPath: details.lockPath ?? null,
      owner: details.owner ?? null,
      operation: details.operation ?? null,
      goalId: details.goalId ?? null,
      decisionId: details.decisionId ?? null,
    });
  }
}

export function createFounderStoreMutationLockService({
  storePath,
  lockPath = `${path.resolve(storePath)}.mutation.lock`,
  diagnosticsPath = `${path.resolve(storePath)}.mutation-lock-diagnostics.json`,
  hostname = os.hostname(),
  pid = process.pid,
  now = () => new Date(),
  monotonicNow = () => performance.now(),
  createToken = () => randomUUID(),
  isPidAlive = defaultPidAlive,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  defaultTimeoutMs = 750,
  retryIntervalMs = 50,
  defaultMaxHoldMs = 120_000,
  maxDiagnostics = 100,
} = {}) {
  if (!storePath) throw new TypeError("Founder-store mutation lock requires storePath.");
  const canonicalStorePath = path.resolve(storePath);
  const canonicalLockPath = path.resolve(lockPath);
  const recoveryPath = `${canonicalLockPath}.recovery`;

  return Object.freeze({
    version: FOUNDER_STORE_MUTATION_LOCK_VERSION,
    storePath: canonicalStorePath,
    lockPath: canonicalLockPath,
    diagnosticsPath: path.resolve(diagnosticsPath),

    inspect() {
      return inspectLock(canonicalLockPath);
    },

    assertOwnership(ownership) {
      const current = inspectLock(canonicalLockPath);
      if (!current.exists || !current.valid ||
          current.metadata.tokenHash !== hashToken(ownership?.token)) {
        throw lockError("OWNERSHIP_MISMATCH", "Founder-store mutation lock ownership is invalid.", {
          lockPath: canonicalLockPath, owner: safeOwner(current.metadata),
        });
      }
      return true;
    },

    acquireSync(input = {}) {
      const request = normalizeRequest(input, { defaultTimeoutMs: 0, defaultMaxHoldMs });
      const ownership = tryAcquire(request);
      if (ownership) return ownership;
      throw busyError(request, inspectLock(canonicalLockPath), false, {
        hostname, isPidAlive, lockPath: canonicalLockPath });
    },

    async acquire(input = {}) {
      const request = normalizeRequest(input, { defaultTimeoutMs, defaultMaxHoldMs });
      const started = monotonicNow();
      let first = true;
      while (first || monotonicNow() - started <= request.timeoutMs) {
        first = false;
        const ownership = tryAcquire(request);
        if (ownership) return ownership;
        if (request.timeoutMs === 0) break;
        const elapsed = monotonicNow() - started;
        if (elapsed >= request.timeoutMs) break;
        await sleep(Math.min(retryIntervalMs, request.timeoutMs - elapsed));
      }
      throw busyError(request, inspectLock(canonicalLockPath), true, {
        hostname, isPidAlive, lockPath: canonicalLockPath });
    },

    releaseSync(ownership, result = {}) {
      return release(ownership, result);
    },

    async release(ownership, result = {}) {
      return release(ownership, result);
    },
  });

  function tryAcquire(request) {
    if (fs.existsSync(recoveryPath)) return null;
    fs.mkdirSync(path.dirname(canonicalLockPath), { recursive: true });
    const token = createToken();
    const tokenHash = hashToken(token);
    const acquiredAt = now().toISOString();
    const metadata = {
      schemaVersion: FOUNDER_STORE_MUTATION_LOCK_VERSION,
      namespace: "founder_runtime_store_whole_file_writer",
      storePath: canonicalStorePath,
      tokenHash,
      safeIdentifier: tokenHash.slice(0, 16),
      pid,
      hostname,
      acquiredAt,
      expiresAt: new Date(Date.parse(acquiredAt) + request.maxHoldMs).toISOString(),
      maxHoldMs: request.maxHoldMs,
      operation: request.operation,
      goalId: request.goalId,
      decisionId: request.decisionId,
      requestId: request.requestId,
    };
    let handle = null;
    try {
      handle = fs.openSync(canonicalLockPath, "wx", 0o600);
      fs.writeFileSync(handle, `${JSON.stringify(metadata)}\n`, "utf8");
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      recordDiagnostic({ event: "acquired", outcome: "owned", metadata });
      return Object.freeze({ token, tokenHash, safeIdentifier: metadata.safeIdentifier,
        metadata: deepFreeze(structuredClone(metadata)) });
    } catch (cause) {
      if (handle !== null) {
        try { fs.closeSync(handle); } catch {}
        try { fs.unlinkSync(canonicalLockPath); } catch {}
      }
      if (cause?.code !== "EEXIST") {
        throw lockError("ACQUISITION_FAILED", "Founder-store mutation lock acquisition failed.", {
          cause, lockPath: canonicalLockPath, operation: request.operation,
          goalId: request.goalId, decisionId: request.decisionId,
        });
      }
    }
    const current = inspectLock(canonicalLockPath);
    if (attemptStaleRecovery(current, request)) return tryAcquire(request);
    return null;
  }

  function attemptStaleRecovery(initial, request) {
    const eligibility = staleEligibility(initial);
    if (!eligibility.recoverable) return false;
    const recoveryToken = createToken();
    const recoveryHash = hashToken(recoveryToken);
    let handle = null;
    try {
      handle = fs.openSync(recoveryPath, "wx", 0o600);
      fs.writeFileSync(handle, `${JSON.stringify({
        schemaVersion: FOUNDER_STORE_MUTATION_LOCK_VERSION,
        kind: "stale_recovery_claim",
        tokenHash: recoveryHash,
        safeIdentifier: recoveryHash.slice(0, 16),
        pid, hostname, acquiredAt: now().toISOString(),
        expiresAt: new Date(now().getTime() + 10_000).toISOString(),
      })}\n`, "utf8");
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
    } catch (cause) {
      if (handle !== null) try { fs.closeSync(handle); } catch {}
      if (cause?.code === "EEXIST") return false;
      throw lockError("ACQUISITION_FAILED", "Stale-lock recovery claim failed.", {
        cause, lockPath: canonicalLockPath, operation: request.operation,
      });
    }
    try {
      const current = inspectLock(canonicalLockPath);
      const currentEligibility = staleEligibility(current);
      if (!currentEligibility.recoverable ||
          current.metadata?.tokenHash !== initial.metadata?.tokenHash) return false;
      const abandoned = `${canonicalLockPath}.abandoned.${current.metadata.safeIdentifier}.${recoveryHash.slice(0, 8)}`;
      fs.renameSync(canonicalLockPath, abandoned);
      fs.unlinkSync(abandoned);
      recordDiagnostic({ event: "stale_recovered", outcome: "recovered",
        metadata: current.metadata, errorCode: null });
      return true;
    } catch (cause) {
      if (cause?.code === "ENOENT") return false;
      throw lockError("STALE_NOT_RECOVERABLE", "Stale Founder-store lock could not be recovered safely.", {
        cause, lockPath: canonicalLockPath, owner: safeOwner(initial.metadata),
      });
    } finally {
      removeRecoveryClaim(recoveryHash);
    }
  }

  function staleEligibility(inspection) {
    if (!inspection.exists || !inspection.valid) return { recoverable: false, reason: "invalid_metadata" };
    const metadata = inspection.metadata;
    if (metadata.hostname !== hostname) return { recoverable: false, reason: "other_host" };
    if (Date.parse(metadata.expiresAt) > now().getTime()) return { recoverable: false, reason: "not_expired" };
    if (isPidAlive(metadata.pid)) return { recoverable: false, reason: "live_pid" };
    if (activeCommitTemps(canonicalStorePath).length) return { recoverable: false, reason: "commit_in_progress" };
    return { recoverable: true, reason: "expired_dead_same_host" };
  }

  function release(ownership, result) {
    const current = inspectLock(canonicalLockPath);
    const expectedHash = hashToken(ownership?.token);
    if (!current.exists || !current.valid || current.metadata.tokenHash !== expectedHash) {
      throw lockError("OWNERSHIP_MISMATCH", "Only the current lock owner may release the Founder store.", {
        lockPath: canonicalLockPath, owner: safeOwner(current.metadata),
      });
    }
    try {
      fs.unlinkSync(canonicalLockPath);
    } catch (cause) {
      throw lockError("RELEASE_FAILED", "Founder-store mutation lock release failed.", {
        cause, lockPath: canonicalLockPath, owner: safeOwner(current.metadata),
      });
    }
    const releasedAt = now().toISOString();
    recordDiagnostic({ event: "released", outcome: result.outcome ?? "released",
      metadata: current.metadata, releasedAt,
      startingStoreRevision: result.startingStoreRevision ?? null,
      endingStoreRevision: result.endingStoreRevision ?? null,
      errorCode: result.errorCode ?? null });
    return Object.freeze({ released: true, safeIdentifier: current.metadata.safeIdentifier,
      releasedAt });
  }

  function removeRecoveryClaim(expectedHash) {
    try {
      const raw = JSON.parse(fs.readFileSync(recoveryPath, "utf8"));
      if (raw.tokenHash === expectedHash) fs.unlinkSync(recoveryPath);
    } catch {}
  }

  function recordDiagnostic({ event, outcome, metadata, releasedAt = null,
    startingStoreRevision = null, endingStoreRevision = null, errorCode = null }) {
    const entry = {
      schemaVersion: FOUNDER_STORE_MUTATION_LOCK_VERSION,
      event,
      operation: metadata?.operation ?? null,
      safeIdentifier: metadata?.safeIdentifier ?? null,
      pid: metadata?.pid ?? null,
      hostname: metadata?.hostname ?? null,
      acquiredAt: metadata?.acquiredAt ?? null,
      releasedAt,
      outcome,
      goalId: metadata?.goalId ?? null,
      decisionId: metadata?.decisionId ?? null,
      requestId: metadata?.requestId ?? null,
      startingStoreRevision,
      endingStoreRevision,
      errorCode,
    };
    try {
      const target = path.resolve(diagnosticsPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      let entries = [];
      try { entries = JSON.parse(fs.readFileSync(target, "utf8")).entries ?? []; } catch {}
      entries = [...entries.slice(-(maxDiagnostics - 1)), entry];
      const temp = `${target}.${pid}.${randomUUID()}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify({ schemaVersion: 1, entries })}\n`, { flag: "wx" });
      fs.renameSync(temp, target);
    } catch {
      // Diagnostics are bounded best-effort and never weaken lock ownership.
    }
  }
}

function inspectLock(lockPath) {
  try {
    const bytes = fs.readFileSync(lockPath);
    const metadata = JSON.parse(bytes.toString("utf8"));
    const valid = metadata?.schemaVersion === FOUNDER_STORE_MUTATION_LOCK_VERSION &&
      metadata.namespace === "founder_runtime_store_whole_file_writer" &&
      typeof metadata.tokenHash === "string" && metadata.tokenHash.length === 64 &&
      Number.isSafeInteger(metadata.pid) && metadata.pid > 0 &&
      typeof metadata.hostname === "string" && metadata.hostname.length > 0 &&
      Number.isFinite(Date.parse(metadata.acquiredAt)) &&
      Number.isFinite(Date.parse(metadata.expiresAt)) &&
      typeof metadata.operation === "string" && metadata.operation.length > 0;
    return deepFreeze({ exists: true, valid, metadata: valid ? metadata : null,
      byteFingerprint: sha256(bytes) });
  } catch (cause) {
    if (cause?.code === "ENOENT") return Object.freeze({ exists: false, valid: false,
      metadata: null, byteFingerprint: null });
    return Object.freeze({ exists: true, valid: false, metadata: null,
      byteFingerprint: null });
  }
}

function normalizeRequest(input, { defaultTimeoutMs, defaultMaxHoldMs }) {
  const operation = required(input.operation, "operation");
  const timeoutMs = boundedInteger(input.timeoutMs ?? defaultTimeoutMs, "timeoutMs", 0, 5_000);
  const maxHoldMs = boundedInteger(input.maxHoldMs ?? defaultMaxHoldMs,
    "maxHoldMs", 1_000, 10 * 60_000);
  return { operation, timeoutMs, maxHoldMs,
    goalId: nullable(input.goalId), decisionId: nullable(input.decisionId),
    requestId: nullable(input.requestId) };
}
function busyError(request, inspection, timedOut, environment) {
  const owner = safeOwner(inspection.metadata);
  let code = timedOut ? "TIMEOUT" : "BUSY";
  if (inspection.valid && inspection.metadata.hostname !== environment.hostname) code = "OTHER_HOST";
  else if (inspection.valid && environment.isPidAlive(inspection.metadata.pid)) code = "LIVE_OWNER";
  else if (inspection.exists && !inspection.valid) code = "METADATA_INVALID";
  return lockError(code, timedOut
    ? "Founder-store mutation lock acquisition timed out."
    : "Founder-store mutation lock is busy.", {
    lockPath: environment.lockPath, owner, operation: request.operation,
    goalId: request.goalId, decisionId: request.decisionId,
  });
}
function activeCommitTemps(storePath) {
  try {
    const directory = path.dirname(storePath);
    const prefix = `${path.basename(storePath)}.`;
    return fs.readdirSync(directory).filter((name) => name.startsWith(prefix) && name.endsWith(".tmp"));
  } catch { return ["inspection_failed"]; }
}
function safeOwner(metadata) {
  if (!metadata) return null;
  return { safeIdentifier: metadata.safeIdentifier ?? null, pid: metadata.pid ?? null,
    hostname: metadata.hostname ?? null, acquiredAt: metadata.acquiredAt ?? null,
    expiresAt: metadata.expiresAt ?? null, operation: metadata.operation ?? null,
    goalId: metadata.goalId ?? null, decisionId: metadata.decisionId ?? null };
}
function defaultPidAlive(pid) {
  try { process.kill(Number(pid), 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}
function hashToken(token) { return typeof token === "string" && token
  ? sha256(Buffer.from(token)) : ""; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function lockError(shortCode, message, details) { return new FounderStoreMutationLockError(
  FounderStoreMutationLockErrorCode[shortCode] ?? shortCode, message, details); }
function required(value, field) { if (typeof value !== "string" || !value.trim())
  throw new TypeError(`${field} is required.`); return value.trim(); }
function nullable(value) { return value == null || value === "" ? null : required(value, "identifier"); }
function boundedInteger(value, field, min, max) { const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new TypeError(`${field} must be an integer from ${min} through ${max}.`); return parsed; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
