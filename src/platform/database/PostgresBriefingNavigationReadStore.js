import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresBriefingNavigationReadStore({ pool, ownerUserId, onComplete = null } = {}) {
  if (!pool?.query || !ownerUserId) throw new Error("Briefing navigation storage requires a PostgreSQL pool and owner.");
  const tracked = (readModel, callback) => async (input = {}) => {
    let queryCount = 0;
    let rowCount = 0;
    let payloadBytes = 0;
    const startedAt = performance.now();
    const query = async (text, values) => {
      queryCount += 1;
      const result = await pool.query(text, values);
      rowCount += result.rows.length;
      payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
      return result;
    };
    try {
      return await callback({ input, query });
    } finally {
      onComplete?.({
        readModel,
        queryCount,
        rowCount,
        payloadBytes,
        compatibilityRuntimeLoadCount: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
        pool: { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount },
      });
    }
  };
  const context = async ({ artifact, query }) => {
    const records = createPhase4CanonicalRecordStore({ query });
    const list = (collection) => records.list({ ownerUserId, collection });
    const assessmentId = confidenceAssessmentId(artifact);
    const [users, goals, phaseReviewDecisions, dexaScans, workItems, metadata,
      confidenceHistory] = await Promise.all([
      list("user"),
      list("goals"),
      list("phaseReviewDecisions"),
      list("dexaScans"),
      list("briefingReconciliationWorkItems"),
      query(`SELECT revision FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1`, [ownerUserId]),
      assessmentId ? records.get({ ownerUserId, collection: "goalConfidenceHistory",
        recordId: `goal_confidence_history_v2|${assessmentId}` }) : null,
    ]);
    return Object.freeze({
      artifact,
      user: users.find((item) => item.id === ownerUserId) ?? users[0] ?? null,
      goals,
      phaseReviewDecisions,
      dexaScans,
      workItems,
      confidenceAssessment: confidenceHistory?.assessment ?? null,
      revision: Number(metadata.rows[0]?.revision ?? 0),
    });
  };

  return Object.freeze({
    listNativeHistory: tracked("briefing.native-history", async ({ input, query }) => {
      const limit = boundedNativeHistoryLimit(input.limit);
      const result = await query(
        `SELECT record_id,version,
                COALESCE(payload->>'id',record_id) AS artifact_id,
                payload->>'artifactType' AS artifact_type,
                payload->>'cadence' AS cadence,
                payload->>'title' AS title,
                COALESCE(payload->>'deliveryDate',payload->>'generatedAt',payload->>'createdAt',observed_at::text) AS publication_date,
                payload->>'evidenceCutoff' AS evidence_cutoff,
                payload->'evidenceWindow' AS evidence_window,
                payload->'goalContext' AS goal_context,
                payload->'confidencePublication' AS confidence_publication,
                payload->'lifecycle' AS lifecycle
           FROM physiqueos.canonical_briefing_records AS artifact
          WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
            AND ($2::text IS NULL OR (COALESCE(observed_at,'epoch'::timestamptz),record_id) < (
              SELECT COALESCE(observed_at,'epoch'::timestamptz),record_id FROM physiqueos.canonical_briefing_records
               WHERE owner_user_id=$1 AND collection_name='dailyBriefings' AND record_id=$2
            ))
          ORDER BY observed_at DESC NULLS LAST,record_id DESC
          LIMIT $3`,
        [ownerUserId, input.cursor ?? null, limit + 1],
      );
      const rows = result.rows.slice(0, limit);
      return Object.freeze({
        items: Object.freeze(rows.map(nativeBriefingSummary)),
        page: Object.freeze({
          limit,
          hasMore: result.rows.length > limit,
          nextCursor: result.rows.length > limit ? rows.at(-1)?.record_id ?? null : null,
        }),
      });
    }),
    listHistory: tracked("briefing.history", async ({ query }) => {
      const records = createPhase4CanonicalRecordStore({ query });
      const [artifacts, workItems] = await Promise.all([
        records.list({ ownerUserId, collection: "dailyBriefings" }),
        records.list({ ownerUserId, collection: "briefingReconciliationWorkItems" }),
      ]);
      return Object.freeze({ artifacts, workItems });
    }),
    getArtifact: tracked("briefing.artifact", async ({ input, query }) => {
      const records = createPhase4CanonicalRecordStore({ query });
      const artifact = await records.get({ ownerUserId, collection: "dailyBriefings", recordId: input.artifactId });
      return context({ artifact, query });
    }),
    getDexaArtifact: tracked("briefing.dexa-artifact", async ({ input, query }) => {
      const result = await query(
        `SELECT payload,version FROM physiqueos.canonical_briefing_records
          WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
            AND (payload#>>'{trigger,scanId}'=$2 OR payload#>>'{trigger,evidenceId}'=$2
              OR payload#>>'{briefing,dexaEventNarrative,scanId}'=$2)
          ORDER BY observed_at DESC NULLS LAST,record_id DESC LIMIT 1`,
        [ownerUserId, input.scanId],
      );
      const row = result.rows[0];
      const artifact = row ? Object.freeze({ ...row.payload, version: Number(row.version) }) : null;
      return context({ artifact, query });
    }),
    getAnalysis: tracked("confidence.analysis", async ({ input, query }) => {
      const records = createPhase4CanonicalRecordStore({ query });
      return records.get({ ownerUserId, collection: "analyses", recordId: input.analysisId });
    }),
    getConfidenceAssessment: tracked("confidence.explanation-assessment", async ({ input, query }) => {
      if (!input.assessmentId) return null;
      const records = createPhase4CanonicalRecordStore({ query });
      const history = await records.get({
        ownerUserId,
        collection: "goalConfidenceHistory",
        recordId: `goal_confidence_history_v2|${input.assessmentId}`,
      });
      return history?.assessment ?? null;
    }),
  });
}

export function createRepositoryBriefingNavigationReadStore({ repositories, loadRuntime } = {}) {
  const buildContext = async (artifact) => {
    const user = await repositories.users.getCurrentUser();
    const runtime = await loadRuntime();
    return Object.freeze({
      artifact,
      user,
      goals: runtime.goals ?? [],
      phaseReviewDecisions: runtime.phaseReviewDecisions ?? [],
      dexaScans: runtime.dexaScans ?? [],
      workItems: runtime.briefingReconciliationWorkItems ?? [],
      confidenceAssessment: (runtime.goalConfidenceHistory ?? []).find((item) =>
        item.assessmentId === confidenceAssessmentId(artifact))?.assessment ?? null,
      revision: Number(runtime.revision ?? 0),
    });
  };
  return Object.freeze({
    async listHistory() {
      const user = await repositories.users.getCurrentUser();
      const [artifacts, workItems] = await Promise.all([
        repositories.dailyBriefings.listDailyBriefings(user?.id),
        repositories.briefingReconciliationWorkItems.listWorkItems(user?.id),
      ]);
      return Object.freeze({ artifacts, workItems });
    },
    async getArtifact({ artifactId }) {
      const user = await repositories.users.getCurrentUser();
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(user?.id);
      return buildContext(artifacts.find((item) => item.id === artifactId) ?? null);
    },
    async getDexaArtifact({ scanId }) {
      const user = await repositories.users.getCurrentUser();
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(user?.id);
      const artifact = artifacts.find((item) => [
        item.trigger?.scanId,
        item.trigger?.evidenceId,
        item.briefing?.dexaEventNarrative?.scanId,
      ].some((value) => String(value) === String(scanId))) ?? null;
      return buildContext(artifact);
    },
    getAnalysis({ analysisId }) {
      return repositories.analyses.getAnalysisById(analysisId);
    },
    async getConfidenceAssessment({ assessmentId }) {
      const runtime = await loadRuntime();
      return (runtime.goalConfidenceHistory ?? []).find((item) =>
        item.assessmentId === assessmentId)?.assessment ?? null;
    },
  });
}

function confidenceAssessmentId(artifact) {
  return artifact?.confidencePublication?.assessmentId ??
    artifact?.briefing?.confidenceAssessmentId ??
    artifact?.briefing?.goalConfidence?.assessmentId ??
    artifact?.briefing?.weeklyNarrative?.goalConfidence?.assessmentId ??
    artifact?.briefing?.monthlyPresentation?.hero?.confidence?.assessmentId ??
    artifact?.briefing?.dexaEventNarrative?.goalConfidence?.assessmentId ??
    artifact?.briefing?.photoEventNarrative?.goalConfidence?.assessmentId ?? null;
}

function nativeBriefingSummary(row) {
  const artifactType = row.artifact_type ?? (row.cadence ? "scheduled" : null);
  const cadence = row.cadence ?? null;
  return Object.freeze({
    artifactId: row.artifact_id,
    artifactType,
    cadence,
    label: row.title ?? briefingLabel({ artifactType, cadence }),
    publicationDate: row.publication_date ?? null,
    evidenceCutoff: row.evidence_cutoff ?? null,
    evidenceWindow: boundedEvidenceWindow(row.evidence_window),
    goalContext: row.goal_context ?? null,
    confidence: row.confidence_publication ? Object.freeze({
      assessmentId: row.confidence_publication.assessmentId ?? null,
      publisherType: row.confidence_publication.publisherType ?? null,
      publicationCutoff: row.confidence_publication.publicationCutoff ?? null,
    }) : null,
    status: row.lifecycle?.status ?? row.lifecycle?.generationStatus ?? null,
    detail: Object.freeze({ resource: "briefing", artifactId: row.artifact_id }),
    version: Number(row.version),
  });
}

function boundedEvidenceWindow(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze(Object.fromEntries([
    "id", "startDate", "endDate", "briefingMonth", "deliveryDate", "timeZone", "cutoff",
  ].filter((key) => value[key] != null).map((key) => [key, value[key]])));
}

function briefingLabel({ artifactType, cadence }) {
  if (cadence === "weekly") return "Weekly Briefing";
  if (cadence === "midweek") return "Midweek Briefing";
  if (cadence === "monthly") return "Monthly Briefing";
  if (["dexa_event", "dexa-event"].includes(artifactType)) return "DEXA Event";
  if (["photo_event", "photo-event"].includes(artifactType)) return "Photo Event";
  return "Briefing";
}

function boundedNativeHistoryLimit(value) {
  const limit = Number(value ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError("Native Briefing History limit must be from 1 through 50.");
  return limit;
}
