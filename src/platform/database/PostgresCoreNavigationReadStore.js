import { PHASE4_DOMAIN_TABLES } from "../migration/phase4DomainCollections.js";
import { createHealthKitGraduationReader } from "./HealthKitGraduationReader.js";
import {
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
} from "../../domain/services/HealthKitGraduation.js";
import { getLocalDateKey, resolveLocalTimeZone } from "../../domain/utils/localDate.js";

// Read models whose Activity / Nutrition rows may show graduated HealthKit days
// (policy-controlled, OFF by default). Every other model is untouched.
const HEALTHKIT_GRADUATED_READ_MODELS = new Set(["core.navigation.log", "core.navigation.operating-plan"]);

export function createPostgresCoreNavigationReadStore({
  pool,
  ownerUserId,
  onComplete = null,
} = {}) {
  if (!pool?.query || !ownerUserId) {
    throw new Error("Core navigation storage requires a PostgreSQL pool and owner.");
  }

  return Object.freeze({
    getOwnerUserId: () => ownerUserId,
    async run(readModel, callback) {
      let queryCount = 0;
      let rowCount = 0;
      let payloadBytes = 0;
      let runtimeMetadata = null;
      const startedAt = performance.now();
      const graduation = createHealthKitGraduationReader({
        query: async (text, values) => {
          queryCount += 1;
          const result = await pool.query(text, values);
          rowCount += result.rows.length;
          payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
          return result;
        },
        ownerUserId,
      });
      const readCollections = async (collections, scope = {}) => {
        const requested = [...new Set(collections ?? [])];
        if (requested.length === 0) return Object.freeze({});
        // The graduation policy row rides in this same query (one provider
        // query stays one), and is removed from the result before it returns.
        const graduated = requested.includes("canonicalEvidenceObjects") && HEALTHKIT_GRADUATED_READ_MODELS.has(readModel);
        if (graduated) requested.push(HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION);
        const grouped = groupCollectionsByTable(requested);
        const values = [ownerUserId, scope.asOf ?? null, scope.timeZone ?? null];
        const selections = [...grouped].map(([table, names], index) => {
          values.push(names);
          return `SELECT collection_name,source_ordinal,record_id,
              ${payloadExpression(readModel)} AS payload${readModel === "core.navigation.coaching-updates-detail" ? `,
              (SELECT json_build_object('revision',revision,'lastCommitId',last_command_id,'updatedAt',updated_at)
                 FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1) AS runtime_metadata` : ""}
            FROM physiqueos.${table}
            WHERE owner_user_id=$1 AND collection_name=ANY($${index + 4}::text[])
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
        if (graduated) {
          const policyRecord = (output[HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION] ?? [])
            .find((record) => record?.id === HEALTHKIT_GRADUATION_POLICY_RECORD_ID) ?? null;
          delete output[HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION];
          const before = output.canonicalEvidenceObjects;
          // The operating plan reads Activity only; Log reads both.
          const domains = readModel === "core.navigation.operating-plan" ? ["activity"] : ["activity", "nutrition"];
          const user = output.user?.at(-1) ?? null;
          const timeZone = resolveLocalTimeZone(scope.timeZone ?? user?.timeZone ?? user?.timezone);
          const localDate = getLocalDateKey(scope.asOf ? new Date(scope.asOf) : new Date(), timeZone);
          output.canonicalEvidenceObjects = await graduation.overlay(before, {
            policyRecord,
            domains,
            dateWindow: { startDate: localDate, endDate: localDate },
          });
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
          materializedBytes: payloadBytes,
          compatibilityRuntimeLoadCount: 0,
          projection: projectionName(readModel),
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
  return `${graduationPolicyPredicate(readModel)}${evidenceTypePredicate(readModel)}`;
}

function graduationPolicyPredicate(readModel) {
  return HEALTHKIT_GRADUATED_READ_MODELS.has(readModel)
    ? `AND (collection_name<>'${HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION}' OR record_id='${HEALTHKIT_GRADUATION_POLICY_RECORD_ID}')`
    : "";
}

function evidenceTypePredicate(readModel) {
  if (readModel === "core.navigation.log") {
    return `AND (
      (collection_name='evidenceReviews' AND status IN ('pending','commit_failed','partially_committed','committing')) OR
      (collection_name IN ('canonicalEvidenceObjects','healthKitCanonicalWorkouts') AND
        COALESCE(
          occurrence_date::text,
          payload->>'localDate',payload->>'date',
          payload#>>'{payload,localDate}',payload#>>'{payload,date}',
          left(COALESCE(payload->>'observed_at',payload->>'observedAt',payload#>>'{payload,observed_at}',payload#>>'{payload,observedAt}'),10)
        ) = timezone(
          COALESCE(
            NULLIF($3,''),
            (SELECT COALESCE(identity.payload->>'timeZone',identity.payload->>'timezone')
               FROM physiqueos.canonical_user_records identity
              WHERE identity.owner_user_id=$1 AND identity.collection_name='user'
              ORDER BY identity.source_ordinal DESC LIMIT 1),
            'UTC'
          ),
          COALESCE($2::timestamptz,now())
        )::date::text) OR
      collection_name NOT IN ('evidenceReviews','canonicalEvidenceObjects','healthKitCanonicalWorkouts')
    )`;
  }
  if (["core.navigation.home", "core.navigation.goals", "core.navigation.training-logger", "core.navigation.training-my-library"].includes(readModel)) {
    return `AND (collection_name<>'canonicalEvidenceObjects' OR
      COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training')`;
  }
  if (readModel === "core.navigation.operating-plan") {
    return `AND (collection_name<>'canonicalEvidenceObjects' OR
      COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='activity_day')`;
  }
  return "";
}

function payloadExpression(readModel) {
  if (!["core.navigation.home", "core.navigation.goals"].includes(readModel)) {
    return "payload";
  }
  return `CASE
    WHEN collection_name='analyses' THEN ${analysisPayloadExpression()}
    WHEN collection_name='dailyBriefings' THEN ${briefingPayloadExpression()}
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
      THEN jsonb_build_object('structuredObservations',${compactObservationArray("payload#>'{metadata,structuredObservations}'")}) END,
    'structuredObservations',CASE WHEN payload->'structuredObservations' IS NOT NULL
      THEN ${compactObservationArray("payload->'structuredObservations'")} END
  ))`;
}

function compactObservationArray(expression) {
  return `(SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'type',observation->'type',
    'region',observation->'region',
    'confidence',observation->'confidence',
    'supportsGoal',observation->'supportsGoal'
  ))),'[]'::jsonb)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${expression})='array' THEN ${expression} ELSE '[]'::jsonb END) observation)`;
}

function projectionName(readModel) {
  if (["core.navigation.home", "core.navigation.goals"].includes(readModel)) return "phase1_compact_analysis";
  if (readModel === "core.navigation.log") return "phase1_today_pending";
  return "canonical_collection";
}

function briefingPayloadExpression() {
  return `CASE WHEN payload->'briefing' IS NULL OR payload->'briefing'='null'::jsonb
    THEN payload-'replacedBriefingHistory'-'replacementHistory'-'priorVersions'-'previousEntry'-'previousEntries'
    ELSE (payload-'briefing'-'replacedBriefingHistory'-'replacementHistory'-'priorVersions'-'previousEntry'-'previousEntries') ||
      jsonb_build_object('briefing',jsonb_strip_nulls(jsonb_build_object(
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
      ))) END`;
}
