import { PHASE4_DOMAIN_TABLES } from "../migration/phase4DomainCollections.js";
import { createHealthKitGraduationReader } from "./HealthKitGraduationReader.js";
import {
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
} from "../../domain/services/HealthKitGraduation.js";

// Read models whose Activity / Nutrition rows may show graduated HealthKit days
// (policy-controlled, OFF by default). Morning Check-In consumes the same
// owner/date canonical projection so recovery actions cannot contradict Log.
// Every other model is untouched.
const HEALTHKIT_GRADUATED_READ_MODELS = new Set([
  "core.navigation.log",
  "core.navigation.morning-check-in",
  "core.navigation.operating-plan",
]);

export function createPostgresCoreNavigationReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Core navigation storage requires a PostgreSQL pool and owner.");
  }

  const graduation = createHealthKitGraduationReader({
    query: (text, values) => pool.query(text, values),
    ownerUserId,
  });
  return Object.freeze({
    getOwnerUserId: () => ownerUserId,
    async run(readModel, callback) {
      let queryCount = 0;
      let rowCount = 0;
      let payloadBytes = 0;
      const collectionMetrics = new Map();
      let runtimeMetadata = null;
      const startedAt = performance.now();
      const readCollections = async (collections) => {
        const requested = [...new Set(collections ?? [])];
        if (requested.length === 0) return Object.freeze({});
        // The graduation policy row rides in this same query (one provider
        // query stays one), and is removed from the result before it returns.
        const graduated = requested.includes("canonicalEvidenceObjects") && HEALTHKIT_GRADUATED_READ_MODELS.has(readModel);
        if (graduated) requested.push(HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION);
        const grouped = groupCollectionsByTable(requested);
        const values = [ownerUserId];
        const selections = [...grouped].map(([table, names], index) => {
          values.push(names);
          return `SELECT collection_name,source_ordinal,record_id,
              ${payloadExpression(readModel)} AS payload${readModel === "core.navigation.coaching-updates-detail" ? `,
              (SELECT json_build_object('revision',revision,'lastCommitId',last_command_id,'updatedAt',updated_at)
                 FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1) AS runtime_metadata` : ""}
            FROM physiqueos.${table}
            WHERE owner_user_id=$1 AND collection_name=ANY($${index + 2}::text[])
              ${canonicalEvidencePredicate(readModel)}`;
        });
        queryCount += 1;
        const result = await pool.query(
          `${selections.join(" UNION ALL ")}
           ORDER BY collection_name,source_ordinal,record_id`,
          values
        );
        rowCount += result.rows.length;
        payloadBytes += Buffer.byteLength(JSON.stringify(result.rows.map((row) => row.payload)));
        const output = Object.fromEntries(requested.map((name) => [name, []]));
        for (const row of result.rows) {
          output[row.collection_name].push(Object.freeze(row.payload));
          if (row.runtime_metadata) runtimeMetadata = Object.freeze(row.runtime_metadata);
        }
        for (const [collection, records] of Object.entries(output)) {
          const prior = collectionMetrics.get(collection) ?? { rows: 0, payloadBytes: 0 };
          collectionMetrics.set(collection, {
            rows: prior.rows + records.length,
            payloadBytes: prior.payloadBytes + Buffer.byteLength(JSON.stringify(records)),
          });
        }
        if (graduated) {
          const policyRecord = (output[HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION] ?? [])
            .find((record) => record?.id === HEALTHKIT_GRADUATION_POLICY_RECORD_ID) ?? null;
          delete output[HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION];
          const before = output.canonicalEvidenceObjects;
          // The operating plan reads Activity only; Log reads both.
          const domains = readModel === "core.navigation.operating-plan" ? ["activity"] : ["activity", "nutrition"];
          output.canonicalEvidenceObjects = await graduation.overlay(before, { policyRecord, domains });
        }
        return Object.freeze(output);
      };
      const readRuntimeMetadata = async () => {
        if (runtimeMetadata) return runtimeMetadata;
        queryCount += 1;
        const result = await pool.query(
          `SELECT revision,last_command_id,updated_at
             FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1`,
          [ownerUserId]
        );
        const row = result.rows[0];
        if (!row) throw new Error("Canonical runtime metadata is unavailable.");
        return Object.freeze({
          revision: Number(row.revision),
          lastCommitId: row.last_command_id ?? null,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        });
      };
      try {
        return await callback({ readCollections, readRuntimeMetadata });
      } finally {
        onComplete?.({
          readModel,
          queryCount,
          rowCount,
          payloadBytes,
          collections: [...collectionMetrics].map(([collection, metrics]) => ({ collection, ...metrics })),
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

export function createRepositoryCoreNavigationReadStore({
  readRuntimeStore,
  ownerUserId = null,
} = {}) {
  if (typeof readRuntimeStore !== "function") {
    throw new Error("Repository core navigation storage requires a runtime reader.");
  }
  return Object.freeze({
    getOwnerUserId() {
      const runtime = readRuntimeStore();
      return ownerUserId ?? runtime?.user?.id ?? null;
    },
    run(_readModel, callback) {
      return callback({
        readRuntimeMetadata: async () => {
          const runtime = readRuntimeStore();
          return Object.freeze({
            revision: Number(runtime?.revision ?? 0),
            lastCommitId: runtime?.lastCommitId ?? null,
            updatedAt: runtime?.updatedAt ?? null,
          });
        },
        readCollections: async (collections) => {
          const runtime = readRuntimeStore();
          return Object.freeze(Object.fromEntries((collections ?? []).map((name) => [
            name,
            normalizeCollection(runtime?.[name]),
          ])));
        },
      });
    },
  });
}

function groupCollectionsByTable(collections) {
  const grouped = new Map();
  for (const collection of collections) {
    const table = PHASE4_DOMAIN_TABLES[collection];
    if (!table) throw new Error(`Unsupported core navigation collection: ${collection}.`);
    if (!grouped.has(table)) grouped.set(table, []);
    grouped.get(table).push(collection);
  }
  return grouped;
}

function normalizeCollection(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function canonicalEvidencePredicate(readModel) {
  return `${graduationPolicyPredicate(readModel)}${evidenceTypePredicate(readModel)}${evidenceReviewStatusPredicate(readModel)}${confidenceHistoryPredicate(readModel)}`;
}

function graduationPolicyPredicate(readModel) {
  return HEALTHKIT_GRADUATED_READ_MODELS.has(readModel)
    ? `AND (collection_name<>'${HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION}' OR record_id='${HEALTHKIT_GRADUATION_POLICY_RECORD_ID}')`
    : "";
}

function evidenceTypePredicate(readModel) {
  if (["core.navigation.home", "core.navigation.goals", "core.navigation.training-logger", "core.navigation.training-my-library"].includes(readModel)) {
    return `AND (collection_name<>'canonicalEvidenceObjects' OR
      COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training')`;
  }
  if (readModel === "core.navigation.operating-plan") {
    return `AND (collection_name<>'canonicalEvidenceObjects' OR
      COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='activity_day')`;
  }
  if (readModel === "core.navigation.log") {
    return `AND (collection_name<>'canonicalEvidenceObjects' OR
      COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')=ANY(ARRAY['nutrition','activity_day','training']::text[]))`;
  }
  return "";
}

function evidenceReviewStatusPredicate(readModel) {
  if (readModel !== "core.navigation.log") return "";
  return `AND (collection_name<>'evidenceReviews' OR
    COALESCE(payload->>'status','')=ANY(ARRAY['pending','committing','commit_failed','partially_committed']::text[]))`;
}

function confidenceHistoryPredicate(readModel) {
  if (!["core.navigation.home", "core.navigation.goals"].includes(readModel)) return "";
  // These surfaces need the record selected by each current snapshot plus the
  // newest two non-superseded user-facing publications per Goal. Keeping two
  // preserves the read service's equal-chronology ambiguity detection without
  // hydrating every historical assessment into a navigation request.
  return `AND (collection_name<>'goalConfidenceHistory' OR record_id IN (
    SELECT ranked.record_id FROM (
      SELECT candidate.record_id,
        row_number() OVER (PARTITION BY candidate.payload->>'goalId' ORDER BY
          COALESCE(candidate.payload->>'persistedAt',candidate.payload#>>'{assessment,publicationTimestamp}',candidate.payload#>>'{assessment,sourceCutoff}','') DESC,
          COALESCE(candidate.payload#>>'{assessment,sourceCutoff}',candidate.payload#>>'{assessment,evidenceCutoff}','') DESC,
          COALESCE(candidate.payload->>'persistedAt','') DESC,
          COALESCE(candidate.payload#>>'{assessment,id}',candidate.payload->>'assessmentId','') DESC) AS publication_rank
      FROM physiqueos.canonical_confidence_records candidate
      WHERE candidate.owner_user_id=$1 AND candidate.collection_name='goalConfidenceHistory'
        AND COALESCE(candidate.payload->>'publisherType',candidate.payload#>>'{assessment,publisherType}','')<>'goal_initialization'
        AND NOT EXISTS (
          SELECT 1 FROM physiqueos.canonical_confidence_records replacement
          WHERE replacement.owner_user_id=$1 AND replacement.collection_name='goalConfidenceHistory'
            AND COALESCE(replacement.payload->>'publisherType',replacement.payload#>>'{assessment,publisherType}','')<>'goal_initialization'
            AND replacement.payload#>>'{assessment,replacementLineage,replacesAssessmentId}'=
              COALESCE(candidate.payload#>>'{assessment,id}',candidate.payload->>'assessmentId')
        )
    ) ranked WHERE ranked.publication_rank<=2
    UNION
    SELECT current_record.record_id
    FROM physiqueos.canonical_confidence_records current_record
    WHERE current_record.owner_user_id=$1 AND current_record.collection_name='goalConfidenceHistory'
      AND COALESCE(current_record.payload->>'assessmentId',current_record.payload#>>'{assessment,id}') IN (
        SELECT snapshot.payload->>'currentAssessmentId'
        FROM physiqueos.canonical_confidence_records snapshot
        WHERE snapshot.owner_user_id=$1 AND snapshot.collection_name='goalConfidenceSnapshots'
      )
  ))`;
}

function payloadExpression(readModel) {
  if (!["core.navigation.home", "core.navigation.goals"].includes(readModel)) {
    return "payload";
  }
  return `CASE
    WHEN collection_name='analyses' THEN ${analysisPayloadExpression()}
    WHEN collection_name='dailyBriefings' THEN ${briefingPayloadExpression()}
    WHEN collection_name='goalConfidenceHistory' THEN ${confidenceHistoryPayloadExpression()}
    ELSE payload END`;
}

function confidenceHistoryPayloadExpression() {
  // V3 embeds large write-side authoring and audit graphs that Home and
  // Goals never consume. Keep every canonical identity, validation,
  // reproducibility, and presentation field while omitting only those
  // known-heavy embedded graphs from this read projection.
  return `CASE WHEN payload#>>'{assessment,schemaVersion}'='canonical_confidence_assessment_v3'
    THEN payload || jsonb_build_object('assessment',(payload->'assessment') - ARRAY[
      'strategicInterpretation','coachingState','confidenceProjection',
      'narrativePlan','evidenceEligibility']::text[])
    ELSE payload END`;
}

function analysisPayloadExpression() {
  return `jsonb_strip_nulls(jsonb_build_object(
    'id',payload->'id',
    'createdAt',payload->'createdAt',
    'observedAt',payload->'observedAt',
    'updatedAt',payload->'updatedAt',
    'importedAt',payload->'importedAt',
    'evidenceTypes',payload->'evidenceTypes',
    'metadata',CASE WHEN payload#>'{metadata,structuredObservations}' IS NOT NULL
      THEN jsonb_build_object('structuredObservations',${analysisObservationsExpression("payload#>'{metadata,structuredObservations}'")}) END,
    'structuredObservations',CASE WHEN payload->'structuredObservations' IS NOT NULL
      THEN ${analysisObservationsExpression("payload->'structuredObservations'")} END
  ))`;
}

function analysisObservationsExpression(source) {
  return `(SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'type',observation->'type',
    'supportsGoal',observation->'supportsGoal',
    'confidence',observation->'confidence',
    'region',observation->'region'
  ))),'[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${source})='array' THEN ${source} ELSE '[]'::jsonb END) observation)`;
}

function briefingPayloadExpression() {
  return `jsonb_strip_nulls(jsonb_build_object(
    'id',payload->'id',
    'userId',payload->'userId',
    'artifactType',payload->'artifactType',
    'cadence',payload->'cadence',
    'generatedAt',payload->'generatedAt',
    'createdAt',payload->'createdAt',
    'updatedAt',payload->'updatedAt',
    'deliveryDate',payload->'deliveryDate',
    'eventDate',payload->'eventDate',
    'evidenceDate',payload->'evidenceDate',
    'preview',payload->'preview',
    'status',payload->'status',
    'evidenceWindow',payload->'evidenceWindow',
    'lifecycle',payload->'lifecycle',
    'trigger',payload->'trigger',
    'briefing',CASE WHEN payload->'briefing' IS NULL OR payload->'briefing'='null'::jsonb THEN NULL ELSE
      jsonb_strip_nulls(jsonb_build_object(
        'date',payload#>'{briefing,date}',
        'evidenceReconciliation',payload#>'{briefing,evidenceReconciliation}',
        'hero',payload#>'{briefing,hero}',
        'weeklyNarrative',CASE WHEN payload#>'{briefing,weeklyNarrative,cards,hero}' IS NOT NULL
          THEN jsonb_build_object('cards',jsonb_build_object('hero',payload#>'{briefing,weeklyNarrative,cards,hero}')) END,
        'monthlyPresentation',CASE WHEN payload#>'{briefing,monthlyPresentation,hero}' IS NOT NULL
          THEN jsonb_build_object('hero',payload#>'{briefing,monthlyPresentation,hero}') END,
        'photoEventNarrative',CASE WHEN payload#>'{briefing,photoEventNarrative}' IS NOT NULL THEN jsonb_strip_nulls(jsonb_build_object(
          'eventDate',payload#>'{briefing,photoEventNarrative,eventDate}',
          'goalCompletionHandoff',payload#>'{briefing,photoEventNarrative,goalCompletionHandoff}',
          'completionExperience',CASE WHEN payload#>'{briefing,photoEventNarrative,completionExperience,journeyComparison,final}' IS NOT NULL
            THEN jsonb_build_object('journeyComparison',jsonb_build_object('final',payload#>'{briefing,photoEventNarrative,completionExperience,journeyComparison,final}')) END,
          'cardContent',CASE WHEN payload#>'{briefing,photoEventNarrative,cardContent,progress,comparisons}' IS NOT NULL
            THEN jsonb_build_object('progress',jsonb_build_object('comparisons',payload#>'{briefing,photoEventNarrative,cardContent,progress,comparisons}')) END,
          'hero',payload#>'{briefing,photoEventNarrative,hero}'
        )) END,
        'dexaEventNarrative',CASE WHEN payload#>'{briefing,dexaEventNarrative,hero}' IS NOT NULL
          THEN jsonb_build_object('hero',payload#>'{briefing,dexaEventNarrative,hero}') END
      )) END
  ))`;
}
