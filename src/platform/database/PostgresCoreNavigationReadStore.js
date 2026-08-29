import { PHASE4_DOMAIN_TABLES } from "../migration/phase4DomainCollections.js";

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
      const startedAt = performance.now();
      const readCollections = async (collections) => {
        const requested = [...new Set(collections ?? [])];
        if (requested.length === 0) return Object.freeze({});
        const grouped = groupCollectionsByTable(requested);
        const values = [ownerUserId];
        const selections = [...grouped].map(([table, names], index) => {
          values.push(names);
          return `SELECT collection_name,source_ordinal,record_id,
              ${payloadExpression(readModel)} AS payload
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
        }
        return Object.freeze(output);
      };
      try {
        return await callback({ readCollections });
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
  if (["core.navigation.home", "core.navigation.goals"].includes(readModel)) {
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
      THEN jsonb_build_object('structuredObservations',payload#>'{metadata,structuredObservations}') END,
    'structuredObservations',payload->'structuredObservations'
  ))`;
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
