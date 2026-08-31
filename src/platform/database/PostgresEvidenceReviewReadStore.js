export function createPostgresEvidenceReviewReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Evidence Review storage requires a PostgreSQL pool and owner.");
  }
  let queryCount = 0;
  let rowCount = 0;
  let payloadBytes = 0;

  const queryPayloads = async (text, values) => {
    queryCount += 1;
    const result = await pool.query(text, values);
    rowCount += result.rows.length;
    payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
    return result.rows.map((row) => Object.freeze({
      ...row.payload,
      version: Number(row.version),
    }));
  };

  return Object.freeze({
    async run(readModel, callback) {
      queryCount = 0;
      rowCount = 0;
      payloadBytes = 0;
      const startedAt = performance.now();
      try {
        return await callback();
      } finally {
        onComplete?.({
          readModel,
          queryCount,
          rowCount,
          payloadBytes,
          compatibilityRuntimeLoadCount: 0,
          elapsedMs: Math.round(performance.now() - startedAt),
          pool: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
          },
        });
      }
    },
    getOwnerUserId: async () => ownerUserId,
    async getReview(reviewId) {
      const rows = await queryPayloads(
        `SELECT payload,version FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='evidenceReviews' AND record_id=$2
          LIMIT 1`,
        [ownerUserId, reviewId],
      );
      return rows[0] ?? null;
    },
    async getPackage(packageId) {
      if (!packageId) return null;
      const rows = await queryPayloads(
        `SELECT payload,version FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='evidencePackages' AND record_id=$2
          LIMIT 1`,
        [ownerUserId, packageId],
      );
      return rows[0] ?? null;
    },
    async listRelevantCanonicalObjects({ packageId, nutritionDates = [] } = {}) {
      if (!packageId && nutritionDates.length === 0) return [];
      return queryPayloads(
        `SELECT payload,version FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
            AND (
              ($2::text IS NOT NULL AND (provenance::text LIKE ('%' || $2 || '%') OR payload::text LIKE ('%' || $2 || '%')))
              OR (
                cardinality($3::text[]) > 0
                AND COALESCE(payload->>'evidence_type',payload#>>'{payload,evidence_type}')='nutrition'
                AND COALESCE(payload->>'lastObservedAt',payload#>>'{payload,observed_at}',payload#>>'{payload,date}')=ANY($3::text[])
              )
            )
          ORDER BY record_id`,
        [ownerUserId, packageId || null, nutritionDates],
      );
    },
  });
}

export function createRepositoryEvidenceReviewReadStore({ repositories } = {}) {
  let user;
  const getUser = async () => {
    user ??= await repositories.users.getCurrentUser();
    return user;
  };
  return Object.freeze({
    run: (_readModel, callback) => callback(),
    getOwnerUserId: async () => (await getUser())?.id ?? null,
    getReview: (reviewId) => repositories.evidenceReviews.getReviewById(reviewId),
    getPackage: (packageId) => packageId
      ? repositories.evidencePackages.getEvidencePackageById(packageId)
      : null,
    async listRelevantCanonicalObjects({ packageId, nutritionDates = [] } = {}) {
      const review = packageId
        ? (await repositories.evidenceReviews.listReviews()).find(
            (item) => item.interpretedEvidence?.package_id === packageId,
          )
        : null;
      const userId = review?.userId;
      const canonical = userId
        ? await repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId)
        : [];
      return canonical.filter((item) => {
        if (packageId && JSON.stringify(item?.provenance ?? item?.source ?? {}).includes(packageId)) return true;
        const payload = item?.payload ?? item;
        const date = payload?.observed_at ?? payload?.date ?? item?.lastObservedAt;
        return payload?.evidence_type === "nutrition" && nutritionDates.includes(date);
      });
    },
  });
}
