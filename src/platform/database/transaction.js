export function createPostgresTransactionRunner({
  pool,
  createContext = (context) => context,
  onComplete = null,
  clock = () => performance.now(),
}) {
  if (!pool?.connect) throw new Error("A PostgreSQL pool is required.");
  return Object.freeze({
    async run(work, metadata = null) {
      const startedAt = clock();
      const diagnostics = { queryCount: 0, queryDurationMs: 0, maxQueryMs: 0, stages: {} };
      let client;
      let outcome = "rolled_back";
      let poolWaitMs = 0;
      let beginMs = 0;
      let workMs = 0;
      let commitMs = 0;
      let rollbackMs = 0;
      try {
        const poolStartedAt = clock();
        client = await pool.connect();
        poolWaitMs = elapsed(clock, poolStartedAt);
        const beginStartedAt = clock();
        await client.query("BEGIN");
        beginMs = elapsed(clock, beginStartedAt);
        const workStartedAt = clock();
        let result;
        try {
          result = await work(createContext(createTransactionContext(client, diagnostics, clock)));
        } finally {
          workMs = elapsed(clock, workStartedAt);
        }
        const commitStartedAt = clock();
        await client.query("COMMIT");
        commitMs = elapsed(clock, commitStartedAt);
        outcome = "committed";
        return result;
      } catch (error) {
        if (client) {
          const rollbackStartedAt = clock();
          await client.query("ROLLBACK");
          rollbackMs = elapsed(clock, rollbackStartedAt);
        }
        throw error;
      } finally {
        client?.release();
        safelyReport(onComplete, Object.freeze({
          operation: typeof metadata?.operation === "string" ? metadata.operation : "unspecified",
          outcome,
          elapsedMs: elapsed(clock, startedAt),
          poolWaitMs,
          beginMs,
          workMs,
          commitMs,
          rollbackMs,
          queryCount: diagnostics.queryCount,
          queryDurationMs: roundMilliseconds(diagnostics.queryDurationMs),
          maxQueryMs: roundMilliseconds(diagnostics.maxQueryMs),
          stages: Object.freeze({ ...diagnostics.stages }),
        }));
      }
    },
  });
}

function createTransactionContext(client, diagnostics, clock) {
  return Object.freeze({
    async query(text, values) {
      const startedAt = clock();
      try {
        return await client.query(text, values);
      } finally {
        const durationMs = elapsed(clock, startedAt);
        diagnostics.queryCount += 1;
        diagnostics.queryDurationMs += durationMs;
        diagnostics.maxQueryMs = Math.max(diagnostics.maxQueryMs, durationMs);
      }
    },
    client,
    diagnostics,
  });
}

function elapsed(clock, startedAt) {
  return roundMilliseconds(Math.max(0, clock() - startedAt));
}

function roundMilliseconds(value) {
  return Math.round(Number(value) * 10) / 10;
}

function safelyReport(onComplete, event) {
  if (typeof onComplete !== "function") return;
  try {
    const result = onComplete(event);
    result?.catch?.(() => {});
  } catch {
    // Diagnostics must never change transaction behavior.
  }
}
