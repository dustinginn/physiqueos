import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { assertKnownPhase4Collection } from "../migration/phase4DomainCollections.js";

export function createPhase4CanonicalRecordStore({ query }) {
  if (typeof query !== "function") throw new Error("Canonical record storage requires a query function.");
  let mutationCount = 0;
  return Object.freeze({
    getMutationCount: () => mutationCount,
    async getRuntimeMetadata({ ownerUserId, lock = false }) {
      if (lock) {
        // Share the Web/runtime owner's transaction lock so a composite
        // Native save cannot race a staged Web replacement of these rows.
        await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
      }
      const result = await query(
        `SELECT revision,version,last_command_id,updated_at
           FROM physiqueos.canonical_runtime_metadata
          WHERE owner_user_id=$1${lock ? " FOR UPDATE" : ""}`,
        [ownerUserId]
      );
      return mapRuntimeMetadata(result.rows[0]);
    },
    async advanceRuntimeMetadata({ ownerUserId, expectedRevision, commandId, at = new Date() }) {
      const result = await query(
        `UPDATE physiqueos.canonical_runtime_metadata
            SET revision=revision+1,last_command_id=$3,version=version+1,updated_at=$4
          WHERE owner_user_id=$1 AND revision=$2
          RETURNING revision,version,last_command_id,updated_at`,
        [ownerUserId, Number(expectedRevision), commandId, at.toISOString()]
      );
      if (!result.rows[0]) throw runtimeRevisionConflict(expectedRevision);
      return mapRuntimeMetadata(result.rows[0]);
    },
    async get({ ownerUserId, collection, recordId }) {
      const table = assertKnownPhase4Collection(collection);
      const result = await query(
        `SELECT payload,version FROM physiqueos.${table}
         WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3`,
        [ownerUserId, collection, recordId]
      );
      return mapRecord(result.rows[0]);
    },
    async list({ ownerUserId, collection, sourceOrder = false }) {
      const table = assertKnownPhase4Collection(collection);
      const result = await query(
        `SELECT payload,version FROM physiqueos.${table}
         WHERE owner_user_id=$1 AND collection_name=$2 ORDER BY ${sourceOrder ? "source_ordinal,record_id" : "record_id"}`,
        [ownerUserId, collection]
      );
      return result.rows.map(mapRecord);
    },
    async put({ ownerUserId, collection, recordId, payload, expectedVersion = null, sourceIdentity = null }) {
      const table = assertKnownPhase4Collection(collection);
      const version = expectedVersion == null ? normalizeVersion(payload.version) : Number(expectedVersion) + 1;
      const enriched = { ...structuredClone(payload), version };
      if (expectedVersion != null) {
        const updated = await query(
          `UPDATE physiqueos.${table} SET payload=$4::jsonb,version=$5,status=$6,
             occurrence_date=$7::date,observed_at=$8::timestamptz,source_identity=COALESCE($9,source_identity),updated_at=now()
           WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3 AND version=$10
           RETURNING payload,version`,
          [ownerUserId, collection, recordId, JSON.stringify(enriched), version,
            nullable(enriched.status ?? enriched.state), calendarDate(enriched.occurrenceDate ?? enriched.localDate ?? enriched.date),
            dateTime(enriched.observedAt ?? enriched.createdAt), nullable(sourceIdentity), Number(expectedVersion)]
        );
        if (!updated.rows[0]) throw versionConflict(collection, recordId);
        mutationCount += 1;
        return mapRecord(updated.rows[0]);
      }
      const inserted = await query(
        `INSERT INTO physiqueos.${table}
          (owner_user_id,collection_name,record_id,source_ordinal,legacy_id,version,status,occurrence_date,observed_at,source_identity,provenance,payload)
         VALUES ($1,$2,$3,
           (SELECT COALESCE(MAX(source_ordinal)+1,0) FROM physiqueos.${table} WHERE owner_user_id=$1 AND collection_name=$2),
           $3,$4,$5,$6::date,$7::timestamptz,$8,$9::jsonb,$10::jsonb)
         ON CONFLICT (owner_user_id,collection_name,record_id) DO UPDATE SET
           payload=EXCLUDED.payload,version=physiqueos.${table}.version+1,status=EXCLUDED.status,
           occurrence_date=EXCLUDED.occurrence_date,observed_at=EXCLUDED.observed_at,
           source_identity=COALESCE(EXCLUDED.source_identity,physiqueos.${table}.source_identity),updated_at=now()
         RETURNING payload,version`,
        [ownerUserId, collection, recordId, version, nullable(enriched.status ?? enriched.state),
          calendarDate(enriched.occurrenceDate ?? enriched.localDate ?? enriched.date),
          dateTime(enriched.observedAt ?? enriched.createdAt), nullable(sourceIdentity),
          JSON.stringify(enriched.provenance ?? { source: "phase4-command" }), JSON.stringify(enriched)]
      );
      const row = inserted.rows[0];
      mutationCount += 1;
      if (Number(row.version) !== version) {
        const corrected = { ...row.payload, version: Number(row.version) };
        await query(
          `UPDATE physiqueos.${table} SET payload=$4::jsonb WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3`,
          [ownerUserId, collection, recordId, JSON.stringify(corrected)]
        );
        return Object.freeze(corrected);
      }
      return mapRecord(row);
    },
  });
}

export function createInMemoryCanonicalRecordStore(collections, {
  runtimeMetadata = { revision: 1, version: 1, lastCommandId: null, updatedAt: null },
} = {}) {
  const maps = new Map();
  for (const [collection, source] of Object.entries(collections)) {
    const values = source == null ? [] : Array.isArray(source) ? source : [source];
    maps.set(collection, new Map(values.map((record, position) => [resolveRecordId(record, position), structuredClone(record)])));
  }
  let metadata = structuredClone(runtimeMetadata);
  let mutationCount = 0;
  return Object.freeze({
    getMutationCount: () => mutationCount,
    async getRuntimeMetadata() { return clone(metadata); },
    async advanceRuntimeMetadata({ expectedRevision, commandId, at = new Date() }) {
      if (Number(metadata?.revision) !== Number(expectedRevision)) {
        throw runtimeRevisionConflict(expectedRevision);
      }
      metadata = Object.freeze({
        revision: Number(metadata.revision) + 1,
        version: Number(metadata.version ?? 1) + 1,
        lastCommandId: commandId,
        updatedAt: at.toISOString(),
      });
      return clone(metadata);
    },
    async get({ collection, recordId }) { return clone(maps.get(collection)?.get(recordId)); },
    async list({ collection }) { return [...(maps.get(collection)?.values() ?? [])].map(clone); },
    async put({ collection, recordId, payload, expectedVersion = null }) {
      const collectionMap = maps.get(collection) ?? new Map();
      maps.set(collection, collectionMap);
      const existing = collectionMap.get(recordId);
      if (expectedVersion != null && Number(existing?.version ?? 1) !== Number(expectedVersion)) {
        throw versionConflict(collection, recordId);
      }
      const version = expectedVersion == null
        ? existing ? Number(existing.version ?? 1) + 1 : normalizeVersion(payload.version)
        : Number(expectedVersion) + 1;
      const result = Object.freeze({ ...structuredClone(payload), version });
      collectionMap.set(recordId, result);
      mutationCount += 1;
      return clone(result);
    },
    snapshot() {
      return Object.fromEntries([...maps].map(([collection, values]) => [collection, [...values.values()].map(clone)]));
    },
  });
}

function mapRecord(row) {
  return row ? Object.freeze({ ...row.payload, version: Number(row.version) }) : null;
}
function mapRuntimeMetadata(row) {
  return row ? Object.freeze({
    revision: Number(row.revision),
    version: Number(row.version),
    lastCommandId: row.last_command_id ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }) : null;
}
function clone(value) { return value == null ? null : structuredClone(value); }
function resolveRecordId(record, position) { return String(record?.id ?? record?.canonicalId ?? record?.package_id ?? record?.review_id ?? `@index:${position}`); }
function normalizeVersion(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : 1; }
function nullable(value) { return value == null || value === "" ? null : String(value); }
function calendarDate(value) { const text = nullable(value); return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function dateTime(value) { const text = nullable(value); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; }
function versionConflict(collection, recordId) {
  return new ApplicationProblem({ status: 409, code: "EXPECTED_VERSION_CONFLICT", title: "The canonical record changed before this command completed.", detail: `${collection}:${recordId}` });
}
function runtimeRevisionConflict(expectedRevision) {
  return new ApplicationProblem({
    status: 409,
    code: "EXPECTED_VERSION_CONFLICT",
    title: "The canonical runtime changed before this command completed.",
    detail: `runtime:${expectedRevision}`,
  });
}
