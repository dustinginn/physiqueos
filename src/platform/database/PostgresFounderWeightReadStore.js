import { canonicalWeightEntries } from "../../domain/weight/canonicalWeight.js";

export function createPostgresFounderWeightReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Founder Weight reads require a PostgreSQL pool and owner.");
  return Object.freeze({
    async getLatest() {
      const startedAt = performance.now();
      const result = await pool.query(
        `WITH scoped AS (
           SELECT payload,version,
                  left(COALESCE(payload->>'measuredAt',occurrence_date::text,''),10) AS measurement_date
             FROM physiqueos.canonical_checkin_records
            WHERE owner_user_id=$1 AND collection_name='weightEntries'
         ), latest AS (
           SELECT max(measurement_date) AS measurement_date FROM scoped
         )
         SELECT payload,version FROM scoped,latest
          WHERE scoped.measurement_date=latest.measurement_date
          ORDER BY COALESCE(payload->>'updatedAt',payload->>'createdAt',''),payload->>'id'`,
        [ownerUserId],
      );
      const entries = result.rows.map((row) => Object.freeze({
        ...row.payload,
        userId: row.payload?.userId ?? ownerUserId,
        version: Number(row.version),
      }));
      const latest = canonicalWeightEntries(entries).at(-1) ?? null;
      onComplete?.({
        readModel: "native.weight-summary.v1",
        queryCount: 1,
        rowCount: result.rows.length,
        payloadBytes: Buffer.byteLength(JSON.stringify(result.rows)),
        compatibilityRuntimeLoadCount: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
        pool: { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount },
      });
      return latest;
    },
  });
}
