export function createPostgresPhotoEventReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Photo Event storage requires a PostgreSQL pool and owner.");
  }

  return Object.freeze({
    async loadInputs({ userId, sessionId }) {
      if (userId !== ownerUserId) {
        const error = new Error("Photo Event owner does not match provider authority.");
        error.code = "PHOTO_EVENT_OWNER_MISMATCH";
        throw error;
      }
      const eventDate = sessionDate(sessionId);
      const windowStart = shiftDate(eventDate, -6);
      let queryCount = 0;
      let rowCount = 0;
      let payloadBytes = 0;
      const startedAt = performance.now();
      const query = async (text, values) => {
        queryCount += 1;
        const result = await pool.query(text, values);
        rowCount += result.rows.length;
        payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
        return result.rows;
      };
      const payloads = (rows) => rows.map((row) => Object.freeze({
        ...row.payload,
        version: Number(row.version),
      }));

      try {
        const [evidenceRows, weightRows, goalRows, executionRows,
          confidenceRows, briefingRows, metadataRows] = await Promise.all([
          query(
            `SELECT collection_name,record_id,payload,version
               FROM physiqueos.canonical_evidence_records
              WHERE owner_user_id=$1 AND (
                collection_name IN ('progressPhotos','dexaScans')
                OR (collection_name='canonicalEvidenceObjects' AND (
                  COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')
                    IN ('photo_session','progress_photo')
                  OR (
                    occurrence_date BETWEEN $2::date AND $3::date
                    AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')
                      IN ('training','activity_day','nutrition')
                  )
                ))
              ) ORDER BY collection_name,record_id`,
            [ownerUserId, windowStart, eventDate],
          ),
          query(
            `SELECT payload,version FROM physiqueos.canonical_checkin_records
              WHERE owner_user_id=$1 AND collection_name='weightEntries'
              ORDER BY occurrence_date,record_id`,
            [ownerUserId],
          ),
          query(
            `SELECT collection_name,payload,version FROM physiqueos.canonical_goal_records
              WHERE owner_user_id=$1 AND collection_name IN (
                'goals','goalTransitionDrafts','phaseReviewDecisions',
                'phaseStrategies','phaseExpectedTrajectories'
              ) ORDER BY collection_name,record_id`,
            [ownerUserId],
          ),
          query(
            `SELECT payload,version FROM physiqueos.canonical_execution_records
              WHERE owner_user_id=$1 AND collection_name='executionItems'
              ORDER BY record_id`,
            [ownerUserId],
          ),
          query(
            `SELECT collection_name,payload,version FROM physiqueos.canonical_confidence_records
              WHERE owner_user_id=$1 AND (
                collection_name IN ('goalConfidenceSnapshots','goalConfidenceHistory',
                  'confidenceInitializationArtifacts')
                OR (collection_name='analyses' AND (
                  payload::text LIKE '%progress_photo%'
                  OR payload::text LIKE '%photo_session%'
                  OR payload#>>'{metadata,canonicalPhotoId}' IS NOT NULL
                  OR payload#>>'{metadata,photoSessionSynthesis}' IS NOT NULL
                ))
              ) ORDER BY collection_name,record_id`,
            [ownerUserId],
          ),
          query(
            `SELECT payload,version FROM physiqueos.canonical_briefing_records
              WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
                AND record_id=$2 ORDER BY record_id`,
            [ownerUserId, `event_briefing_progress_photo_${sessionId}`],
          ),
          query(
            `SELECT runtime_version,revision,last_command_id,updated_at,imported_at
               FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1`,
            [ownerUserId],
          ),
        ]);

        const byCollection = (rows, name) => payloads(rows.filter((row) =>
          row.collection_name === name));
        const canonicalObjects = byCollection(evidenceRows, "canonicalEvidenceObjects");
        const legacyPhotos = byCollection(evidenceRows, "progressPhotos");
        const dexaScans = byCollection(evidenceRows, "dexaScans");
        const goals = byCollection(goalRows, "goals");
        const goal = goals.find((item) => item.userId === ownerUserId && item.primary) ?? null;
        const analyses = byCollection(confidenceRows, "analyses");
        const artifacts = payloads(briefingRows);
        const metadata = metadataRows[0] ?? {};
        const publicationStore = Object.freeze({
          version: metadata.runtime_version ?? "founder-seed-v2",
          revision: Number(metadata.revision ?? 0),
          lastCommitId: metadata.last_command_id ?? null,
          importedAt: iso(metadata.imported_at),
          updatedAt: iso(metadata.updated_at),
          dailyBriefings: artifacts,
          goalConfidenceSnapshots: byCollection(confidenceRows, "goalConfidenceSnapshots"),
          goalConfidenceHistory: byCollection(confidenceRows, "goalConfidenceHistory"),
          confidenceInitializationArtifacts: byCollection(confidenceRows,
            "confidenceInitializationArtifacts"),
          phaseStrategies: byCollection(goalRows, "phaseStrategies"),
          phaseExpectedTrajectories: byCollection(goalRows, "phaseExpectedTrajectories"),
          goalTransitionDrafts: byCollection(goalRows, "goalTransitionDrafts"),
          phaseReviewDecisions: byCollection(goalRows, "phaseReviewDecisions"),
          dexaScans,
        });
        return Object.freeze({
          canonicalObjects,
          legacyPhotos,
          weights: payloads(weightRows),
          analyses,
          goal,
          goals,
          executionItems: payloads(executionRows),
          dexaScans,
          artifacts,
          publicationStore,
        });
      } finally {
        onComplete?.({
          readModel: "photo-event",
          sessionId,
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
  });
}

function sessionDate(sessionId) {
  const match = String(sessionId ?? "").match(/(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})/);
  if (!match) {
    const error = new Error("Canonical PhotoSession identity has no effective date.");
    error.code = "PHOTO_EVENT_SESSION_DATE_REQUIRED";
    throw error;
  }
  return match[1];
}

function shiftDate(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function iso(value) {
  return value?.toISOString?.() ?? value ?? new Date(0).toISOString();
}
