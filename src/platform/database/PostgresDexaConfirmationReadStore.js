import { assertKnownPhase4Collection } from "../migration/phase4DomainCollections.js";

const DEXA_TYPES = Object.freeze(["dexa", "dexa_scan", "body_composition"]);

export function createPostgresDexaConfirmationReadStore({ pool, ownerUserId } = {}) {
  if (!pool?.query || !String(ownerUserId ?? "").trim()) {
    throw new Error("Bounded DEXA confirmation reads require a PostgreSQL pool and owner.");
  }

  return Object.freeze({
    async getRecords(collection, recordIds) {
      const table = assertKnownPhase4Collection(collection);
      const ids = uniqueBoundedIds(recordIds);
      if (ids.length === 0) return [];
      const result = await pool.query(
        `SELECT record_id,payload,version FROM physiqueos.${table}
          WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=ANY($3::text[])
          ORDER BY record_id`,
        [ownerUserId, collection, ids],
      );
      const byId = new Map(result.rows.map((row) => [
        String(row.record_id),
        Object.freeze({ ...row.payload, version: Number(row.version) }),
      ]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    },

    async listCanonicalDexaHistory({ limit = 64 } = {}) {
      const boundedLimit = boundedLimitValue(limit);
      const result = await pool.query(
        `SELECT payload,version FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
            AND COALESCE(payload->>'evidence_type',payload#>>'{payload,evidence_type}')=ANY($2::text[])
          ORDER BY COALESCE(occurrence_date,DATE(observed_at)) DESC NULLS LAST,record_id DESC
          LIMIT $3`,
        [ownerUserId, DEXA_TYPES, boundedLimit],
      );
      return result.rows.reverse().map(record);
    },

    async listLegacyDexaHistory({ limit = 64 } = {}) {
      const boundedLimit = boundedLimitValue(limit);
      const result = await pool.query(
        `SELECT payload,version FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='dexaScans'
          ORDER BY COALESCE(occurrence_date,DATE(observed_at)) DESC NULLS LAST,record_id DESC
          LIMIT $2`,
        [ownerUserId, boundedLimit],
      );
      return result.rows.reverse().map(record);
    },

    async readRecoveryInputs({ reviewId, packageId } = {}) {
      const safeReviewId = String(reviewId ?? "").trim();
      const safePackageId = String(packageId ?? "").trim();
      if (!safeReviewId || !safePackageId) {
        throw new Error("DEXA recovery reads require review and package identities.");
      }
      const [canonical, briefing] = await Promise.all([
        pool.query(
          `SELECT payload,version FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
              AND (
                provenance @> $2::jsonb
                OR payload#>'{provenance,evidence_package_ids}' @> $3::jsonb
              )
            ORDER BY record_id LIMIT 16`,
          [ownerUserId, JSON.stringify({ evidence_package_ids: [safePackageId] }), JSON.stringify([safePackageId])],
        ),
        pool.query(
          `SELECT payload,version FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='briefingReconciliationWorkItems'
              AND (
                payload->>'sourceEvidencePackageId'=$2
                OR payload->>'sourceReviewId'=$3
              )
            ORDER BY record_id LIMIT 16`,
          [ownerUserId, safePackageId, safeReviewId],
        ),
      ]);
      return Object.freeze({
        canonicalEvidenceObjects: Object.freeze(canonical.rows.map(record)),
        briefingReconciliationWorkItems: Object.freeze(briefing.rows.map(record)),
      });
    },
  });
}

function record(row) {
  return Object.freeze({ ...row.payload, version: Number(row.version) });
}

function uniqueBoundedIds(values) {
  const ids = [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (ids.length > 64) throw new Error("A bounded DEXA read accepts at most 64 record identities.");
  return ids;
}

function boundedLimitValue(value) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 128) {
    throw new Error("A bounded DEXA history limit must be between 1 and 128.");
  }
  return result;
}
