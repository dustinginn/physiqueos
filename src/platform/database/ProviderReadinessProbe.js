const DEFAULT_QUERY_TIMEOUT_MS = 3_000;

export function createPostgresProviderReadinessProbe({ pool, ownerUserId } = {}) {
  if (!pool?.query) throw new Error("Provider readiness requires a PostgreSQL pool.");
  if (!String(ownerUserId ?? "").trim()) throw new Error("Provider readiness requires an owner identity.");

  return Object.freeze({
    async healthCheck({ queryTimeoutMs = DEFAULT_QUERY_TIMEOUT_MS } = {}) {
      const timeout = boundedTimeout(queryTimeoutMs);
      const result = await pool.query({
        text: `SELECT current_database() AS database,
          EXISTS (
            SELECT 1 FROM physiqueos.canonical_user_records
             WHERE owner_user_id=$1 AND collection_name='user' AND payload->>'id'=$1
          ) AS owner_present`,
        values: [ownerUserId],
        query_timeout: timeout,
      });
      return Object.freeze({
        reachable: true,
        databaseName: String(result.rows[0]?.database ?? ""),
        ownerPresent: result.rows[0]?.owner_present === true,
      });
    },
  });
}

function boundedTimeout(value) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 10_000) {
    throw new Error("Provider readiness query timeout is invalid.");
  }
  return timeout;
}
