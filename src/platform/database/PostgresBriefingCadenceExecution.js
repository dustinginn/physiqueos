import { randomUUID } from "node:crypto";

export const BRIEFING_CADENCE_OPERATION_TYPE = "briefing.cadence.occurrence";
export const BRIEFING_CADENCE_EXECUTION_STATE_VERSION =
  "briefing_cadence_execution_state_v1";

export function createPostgresBriefingCadenceExecutionStore({
  pool,
  ownerUserId,
  now = () => new Date(),
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("PostgreSQL briefing cadence execution store requires a pool and owner.");
  }
  return Object.freeze({
    createExecutionId: () => randomUUID(),
    async getRetryState({ cadenceKey, expectedArtifactId }) {
      if (!expectedArtifactId) return emptyRetryState();
      const operationId = occurrenceOperationId({
        ownerUserId,
        cadenceKey,
        expectedArtifactId,
      });
      const result = await pool.query(
        `SELECT result, problem
           FROM physiqueos.operations
          WHERE id=$1 AND user_id=$2 AND operation_type=$3`,
        [operationId, ownerUserId, BRIEFING_CADENCE_OPERATION_TYPE],
      );
      const state = result.rows[0]?.result?.retry ?? null;
      return state ? normalizeRetryState(state) : emptyRetryState();
    },
    async record(record) {
      if (!record?.expectedArtifactId || record.eligibilityResult !== "eligible") {
        return null;
      }
      const operationId = occurrenceOperationId({ ...record, ownerUserId });
      const existing = await pool.query(
        `SELECT result
           FROM physiqueos.operations
          WHERE id=$1 AND user_id=$2 AND operation_type=$3`,
        [operationId, ownerUserId, BRIEFING_CADENCE_OPERATION_TYPE],
      );
      const priorRetry = normalizeRetryState(
        existing.rows[0]?.result?.retry ?? emptyRetryState()
      );
      const retry = nextRetryState(priorRetry, record, now());
      const status = operationStatus(record.resultStatus);
      const result = jsonSafe({
        schemaVersion: BRIEFING_CADENCE_EXECUTION_STATE_VERSION,
        occurrenceId: operationId,
        cadenceKey: record.cadenceKey,
        expectedArtifactId: record.expectedArtifactId,
        evidenceWindowId: record.evidenceWindowId ?? null,
        localBriefingDate: record.localBriefingDate ?? null,
        latest: record,
        retry,
      });
      const problem = status === "failed"
        ? jsonSafe({
            code: record.failureCategory ?? record.resultStatus,
            message: record.errorSummary ?? record.skipReason ??
              "Briefing cadence occurrence did not complete.",
            retryable: record.retryability !== false,
          })
        : null;
      await pool.query(
        `INSERT INTO physiqueos.operations
           (id,user_id,operation_type,status,result,problem)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           status=EXCLUDED.status,
           result=EXCLUDED.result,
           problem=EXCLUDED.problem,
           version=physiqueos.operations.version+1,
           updated_at=now()
         WHERE physiqueos.operations.user_id=EXCLUDED.user_id
           AND physiqueos.operations.operation_type=EXCLUDED.operation_type`,
        [operationId, ownerUserId, BRIEFING_CADENCE_OPERATION_TYPE,
          status, result, problem],
      );
      return result;
    },
  });
}

export function createPostgresBriefingCadenceExecutionLock({
  pool,
  ownerUserId,
} = {}) {
  if (!pool?.connect || !ownerUserId) {
    throw new Error("PostgreSQL briefing cadence execution lock requires a pool and owner.");
  }
  const lockIdentity = `physiqueos:briefing-cadence:${ownerUserId}`;
  return Object.freeze({
    async acquire() {
      const client = await pool.connect();
      let released = false;
      const result = await client.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
        [lockIdentity],
      );
      if (result.rows[0]?.acquired !== true) {
        client.release();
        return Object.freeze({
          acquired: false,
          reason: "executor_lock_active",
          async release() {},
        });
      }
      const release = async () => {
        if (released) return;
        released = true;
        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0))",
            [lockIdentity],
          );
        } finally {
          client.release();
        }
      };
      return Object.freeze({
        acquired: true,
        reason: null,
        release,
        releaseAfter(operation) {
          void Promise.resolve(operation).then(release, release);
        },
      });
    },
  });
}

export function occurrenceOperationId({
  ownerUserId,
  cadenceKey,
  expectedArtifactId,
}) {
  return `briefing-cadence:${ownerUserId}:${cadenceKey}:${expectedArtifactId}`;
}

function nextRetryState(prior, record, observedAt) {
  if (["generation_completed", "already_completed"].includes(record.resultStatus)) {
    return emptyRetryState();
  }
  if (record.resultStatus === "terminal_failure") {
    return {
      terminalFailure: true,
      consecutiveTransientFailures: prior.consecutiveTransientFailures,
      lastFailureAt: observedAt.toISOString(),
      lastFailureCategory: record.failureCategory ?? "terminal_failure",
    };
  }
  if (record.resultStatus === "transient_failure") {
    return {
      terminalFailure: false,
      consecutiveTransientFailures: prior.consecutiveTransientFailures + 1,
      lastFailureAt: observedAt.toISOString(),
      lastFailureCategory: record.failureCategory ?? "transient_failure",
    };
  }
  return prior;
}

function operationStatus(resultStatus) {
  if (["generation_completed", "already_completed"].includes(resultStatus)) {
    return "succeeded";
  }
  if (["transient_failure", "terminal_failure"].includes(resultStatus)) {
    return "failed";
  }
  return "running";
}

function emptyRetryState() {
  return {
    terminalFailure: false,
    consecutiveTransientFailures: 0,
    lastFailureAt: null,
    lastFailureCategory: null,
  };
}

function normalizeRetryState(value) {
  return {
    terminalFailure: value?.terminalFailure === true,
    consecutiveTransientFailures:
      Number(value?.consecutiveTransientFailures) || 0,
    lastFailureAt: value?.lastFailureAt ?? null,
    lastFailureCategory: value?.lastFailureCategory ?? null,
  };
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
