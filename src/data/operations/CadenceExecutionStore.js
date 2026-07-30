import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MAX_RECORDS = 500;
const MAX_LOG_BYTES = 1024 * 1024;
const STALE_LOCK_MS = 5 * 60_000;

export function createCadenceExecutionStore({
  rootDirectory = path.join(process.cwd(), "logs"),
  now = () => new Date(),
} = {}) {
  const recordsDirectory = path.join(rootDirectory, "briefing-cadence-runs");
  const logPath = path.join(rootDirectory, "briefing-cadence.log");
  return {
    createExecutionId: () => crypto.randomUUID(),
    async record(record) {
      fs.mkdirSync(recordsDirectory, { recursive: true });
      const timestamp = now().toISOString().replaceAll(":", "-");
      const suffix = crypto.randomUUID();
      const target = path.join(recordsDirectory, `${timestamp}_${suffix}.json`);
      const temporary = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      fs.renameSync(temporary, target);
      appendOperationalLog(logPath, record);
      prune(recordsDirectory);
      return record;
    },
    async list({ limit = MAX_RECORDS } = {}) {
      if (!fs.existsSync(recordsDirectory)) return [];
      return fs.readdirSync(recordsDirectory)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .slice(-Math.max(1, Math.min(limit, MAX_RECORDS)))
        .map((name) => {
          try {
            return JSON.parse(
              fs.readFileSync(path.join(recordsDirectory, name), "utf8")
            );
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },
    async getRetryState({ cadenceKey, expectedArtifactId }) {
      const relevant = (await this.list()).filter((record) =>
        record.cadenceKey === cadenceKey &&
        record.expectedArtifactId === expectedArtifactId &&
        ["transient_failure", "terminal_failure"].includes(record.resultStatus)
      ).sort((left, right) =>
        String(right.invokedAt).localeCompare(String(left.invokedAt))
      );
      const last = relevant[0] ?? null;
      let consecutiveTransientFailures = 0;
      for (const record of relevant) {
        if (record.resultStatus !== "transient_failure") break;
        consecutiveTransientFailures += 1;
      }
      return {
        terminalFailure: last?.resultStatus === "terminal_failure",
        consecutiveTransientFailures,
        lastFailureAt: last?.invokedAt ?? null,
        lastFailureCategory: last?.failureCategory ?? null,
      };
    },
  };
}

export function createCadenceExecutionLock({
  rootDirectory = path.join(process.cwd(), "logs"),
  now = () => new Date(),
  staleAfterMs = STALE_LOCK_MS,
} = {}) {
  const lockPath = path.join(rootDirectory, "briefing-cadence.lock");
  return {
    async acquire(metadata) {
      fs.mkdirSync(rootDirectory, { recursive: true });
      let recoveredStaleLock = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const handle = fs.openSync(lockPath, "wx");
          fs.writeFileSync(handle, JSON.stringify({
            ...metadata,
            pid: process.pid,
            acquiredAt: now().toISOString(),
          }));
          fs.closeSync(handle);
          let released = false;
          return {
            acquired: true,
            reason: recoveredStaleLock ? "stale_lock_recovered" : null,
            async release() {
              if (released) return;
              released = true;
              try { fs.unlinkSync(lockPath); } catch {}
            },
          };
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
          const stale = isStale(lockPath, now(), staleAfterMs);
          if (!stale || attempt > 0) {
            return {
              acquired: false,
              reason: stale ? "stale_lock_recovery_failed" : "executor_lock_active",
              async release() {},
            };
          }
          try {
            fs.unlinkSync(lockPath);
            recoveredStaleLock = true;
          } catch {
            return {
              acquired: false,
              reason: "stale_lock_recovery_failed",
              async release() {},
            };
          }
        }
      }
      return { acquired: false, reason: "executor_lock_active", async release() {} };
    },
  };
}

function appendOperationalLog(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
    const archive = `${logPath}.1`;
    try { fs.rmSync(archive, { force: true }); } catch {}
    fs.renameSync(logPath, archive);
  }
  const level = record.operationalWarning ? "WARNING" : "INFO";
  const values = [
    `${record.invokedAt} ${level}`,
    `cadence=${record.cadenceKey}`,
    `local=${record.localBriefingDate}T${record.localTime ?? "unknown"}`,
    `timezone=${record.timezone}`,
    `eligibility=${record.eligibilityResult}`,
    `window=${record.evidenceWindowId ?? "none"}`,
    `artifact=${record.expectedArtifactId ?? "none"}`,
    `outcome=${record.resultStatus}`,
    record.failureCategory ? `failure=${record.failureCategory}` : null,
    record.operationalWarning ? `warning=${record.operationalWarning}` : null,
  ].filter(Boolean);
  fs.appendFileSync(logPath, `${values.join(" ")}\n`, "utf8");
}

function prune(recordsDirectory) {
  const files = fs.readdirSync(recordsDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const name of files.slice(0, Math.max(0, files.length - MAX_RECORDS))) {
    try { fs.rmSync(path.join(recordsDirectory, name), { force: true }); } catch {}
  }
}

function isStale(lockPath, current, staleAfterMs) {
  try {
    const metadata = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    const acquiredAt = new Date(metadata.acquiredAt).valueOf();
    const baseline = Number.isFinite(acquiredAt)
      ? acquiredAt
      : fs.statSync(lockPath).mtimeMs;
    return current.valueOf() - baseline > staleAfterMs;
  } catch {
    return false;
  }
}
