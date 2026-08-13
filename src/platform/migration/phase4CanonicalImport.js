import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { assertKnownPhase4Collection, PHASE4_DOMAIN_TABLES } from "./phase4DomainCollections.js";
import { readAndValidateCanonicalPackage } from "./phase4CanonicalExport.js";
import { createPhase4MediaObjectId } from "./phase4LocalMediaMigration.js";
import { assertMigrationSourceIdentityMatches } from "./MigrationSourceIdentity.js";

const GUARDED_DATABASE = /^(?:physiqueos_phase4_(?:test|rehearsal|restore)|physiqueos_phase5_(?:test|restore)_provider)(?:_|$)/;

export async function importCanonicalPackage({
  pool,
  packageRoot,
  resetTarget = false,
  expectedSourceIdentity = null,
  requireMigrationOperationId = false,
  targetAuthorization = null,
} = {}) {
  if (!pool?.connect) throw new Error("Phase 4 import requires a PostgreSQL pool.");
  const packageData = await readAndValidateCanonicalPackage(packageRoot);
  if (expectedSourceIdentity) {
    assertMigrationSourceIdentityMatches(packageData.manifest.source, expectedSourceIdentity, { requireMigrationOperationId });
  }
  const client = await pool.connect();
  const startedAt = new Date();
  try {
    await client.query("BEGIN");
    const database = await assertGuardedDatabase(client, targetAuthorization);
    if (resetTarget) await resetCanonicalTarget(client, targetAuthorization);
    const owner = validateOwner(packageData.collections);
    await upsertUser(client, owner);
    const counts = {};
    for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
      const source = packageData.collections[collection];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      counts[collection] = records.length;
      for (let position = 0; position < records.length; position += 1) {
        await upsertRecord(client, { collection, record: records[position], position, ownerUserId: owner.id });
      }
    }
    await importRelationships(client, packageData.manifest.relationships ?? [], owner.id, packageData.collections);
    await importMediaMetadata(client, packageData.manifest.files ?? [], owner.id);
    const importDigest = await createDatabaseSemanticDigest(client, owner.id);
    await client.query(
      `INSERT INTO physiqueos.phase4_import_runs
        (id,source_sha256,package_digest,import_digest,target_database,result,collection_counts,report,started_at,completed_at)
       VALUES ($1,$2,$3,$4,$5,'succeeded',$6::jsonb,$7::jsonb,$8,now())
       ON CONFLICT (id) DO UPDATE SET
         import_digest=EXCLUDED.import_digest, result='succeeded', collection_counts=EXCLUDED.collection_counts,
         report=EXCLUDED.report, completed_at=now()`,
      [packageData.manifest.migrationId, packageData.manifest.source.runtime.sha256,
        packageData.manifest.semanticDigest, importDigest, database, JSON.stringify(counts),
        JSON.stringify({
          replaySafe: true,
          ownerUserId: owner.id,
          runtimeVersion: packageData.manifest.source.runtime.version,
          runtimeRevision: packageData.manifest.source.runtime.revision,
          sourceUpdatedAt: packageData.manifest.criticalValues.sourceUpdatedAt,
        }), startedAt]
    );
    await client.query("COMMIT");
    return Object.freeze({
      migrationId: packageData.manifest.migrationId,
      database,
      ownerUserId: owner.id,
      collectionCounts: Object.freeze(counts),
      importDigest,
      packageDigest: packageData.manifest.semanticDigest,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function loadCanonicalRuntime({ query, ownerUserId }) {
  if (typeof query !== "function") throw new Error("Canonical runtime loading requires a query function.");
  const runtime = {};
  for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
    const table = assertKnownPhase4Collection(collection);
    const result = await query(
      `SELECT record_id,payload FROM physiqueos.${table}
       WHERE owner_user_id=$1 AND collection_name=$2 ORDER BY source_ordinal,record_id`,
      [ownerUserId, collection]
    );
    const payloads = result.rows.map((row) => row.payload);
    runtime[collection] = isSingletonCollection(collection) ? payloads[0] ?? null : payloads;
  }
  const metadata = await query(
    `SELECT report,source_sha256 FROM physiqueos.phase4_import_runs
     WHERE result='succeeded' ORDER BY completed_at DESC LIMIT 1`
  );
  const report = metadata.rows[0]?.report ?? {};
  return Object.freeze({
    version: report.runtimeVersion ?? "founder-seed-v2",
    revision: Number(report.runtimeRevision ?? 0),
    importedAt: new Date(0).toISOString(),
    updatedAt: report.sourceUpdatedAt ?? new Date(0).toISOString(),
    ...runtime,
    phase4Import: metadata.rows[0] ?? null,
  });
}

export async function validateCanonicalImport({ pool, packageRoot, targetAuthorization = null }) {
  const packageData = await readAndValidateCanonicalPackage(packageRoot);
  const owner = validateOwner(packageData.collections);
  const client = await pool.connect();
  try {
    await assertGuardedDatabase(client, targetAuthorization);
    const counts = {};
    const idParity = {};
    for (const entry of packageData.manifest.collections) {
      const table = assertKnownPhase4Collection(entry.sourceCollection);
      const result = await client.query(
        `SELECT record_id FROM physiqueos.${table}
         WHERE owner_user_id=$1 AND collection_name=$2 ORDER BY record_id`,
        [owner.id, entry.sourceCollection]
      );
      const ids = result.rows.map((row) => row.record_id).sort();
      const expected = [...entry.exactIds].map(String).sort();
      counts[entry.sourceCollection] = ids.length;
      idParity[entry.sourceCollection] = JSON.stringify(ids) === JSON.stringify(expected);
      if (ids.length !== entry.recordCount || !idParity[entry.sourceCollection]) {
        throw new Error(`Import parity failed for ${entry.sourceCollection}.`);
      }
    }
    const importDigest = await createDatabaseSemanticDigest(client, owner.id);
    const runtime = await loadCanonicalRuntime({ query: (text, values) => client.query(text, values), ownerUserId: owner.id });
    const canonicalState = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, runtime[name]]));
    const sourceDigest = createPayloadHash(canonicalState);
    if (sourceDigest !== packageData.manifest.criticalValues.canonicalStateDigest) {
      throw new Error("Imported canonical state semantic digest does not match the package.");
    }
    return Object.freeze({ valid: true, ownerUserId: owner.id, counts, idParity, importDigest, sourceDigest });
  } finally {
    client.release();
  }
}

export async function resetCanonicalTarget(clientOrPool, targetAuthorization = null) {
  const client = clientOrPool.query ? clientOrPool : null;
  if (!client) throw new Error("A PostgreSQL query target is required.");
  await assertGuardedDatabase(client, targetAuthorization);
  await client.query("DELETE FROM physiqueos.canonical_relationships");
  await client.query("DELETE FROM physiqueos.canonical_media_objects");
  await client.query("DELETE FROM physiqueos.outbox_messages");
  await client.query("DELETE FROM physiqueos.command_receipts");
  await client.query("DELETE FROM physiqueos.operations");
  await client.query("DELETE FROM physiqueos.worker_heartbeats");
  for (const table of [...new Set(Object.values(PHASE4_DOMAIN_TABLES))]) {
    await client.query(`DELETE FROM physiqueos.${table}`);
  }
  await client.query("DELETE FROM physiqueos.phase4_import_runs");
}

export async function createDatabaseSemanticDigest(queryTarget, ownerUserId) {
  const rows = [];
  for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
    const table = assertKnownPhase4Collection(collection);
    const result = await queryTarget.query(
      `SELECT record_id,payload FROM physiqueos.${table}
       WHERE owner_user_id=$1 AND collection_name=$2 ORDER BY source_ordinal,record_id`,
      [ownerUserId, collection]
    );
    rows.push({ collection, records: result.rows.map((row) => ({ recordId: row.record_id, payload: row.payload })) });
  }
  const media = await queryTarget.query(
    `SELECT id,evidence_collection,evidence_record_id,content_type,byte_length,sha256,storage_key,state,version
     FROM physiqueos.canonical_media_objects WHERE owner_user_id=$1 ORDER BY id`, [ownerUserId]
  );
  return createPayloadHash({ rows, media: media.rows });
}

async function upsertUser(client, owner) {
  await client.query(
    `INSERT INTO physiqueos.users (id,status,version) VALUES ($1,'active',$2)
     ON CONFLICT (id) DO UPDATE SET version=GREATEST(physiqueos.users.version,EXCLUDED.version),updated_at=now()`,
    [owner.id, normalizeVersion(owner.version)]
  );
  await client.query(
    `INSERT INTO physiqueos.user_profiles (id,user_id,display_name,time_zone,version)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name,time_zone=EXCLUDED.time_zone,
       version=GREATEST(physiqueos.user_profiles.version,EXCLUDED.version),updated_at=now()`,
    [`${owner.id}:profile`, owner.id, owner.displayName ?? owner.name ?? "Founder",
      owner.timeZone ?? "America/Los_Angeles", normalizeVersion(owner.version)]
  );
}

async function upsertRecord(client, { collection, record, position, ownerUserId }) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Canonical ${collection} record ${position} must be an object.`);
  }
  validateRecordOwner(record, ownerUserId, collection, position);
  const table = assertKnownPhase4Collection(collection);
  const recordId = resolveRecordId(record, position);
  const metadata = extractRecordMetadata(record);
  await client.query(
    `INSERT INTO physiqueos.${table}
      (owner_user_id,collection_name,record_id,source_ordinal,legacy_id,version,status,occurrence_date,observed_at,source_identity,provenance,payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::timestamptz,$10,$11::jsonb,$12::jsonb)
     ON CONFLICT (owner_user_id,collection_name,record_id) DO UPDATE SET
       source_ordinal=EXCLUDED.source_ordinal,legacy_id=EXCLUDED.legacy_id,version=EXCLUDED.version,status=EXCLUDED.status,
       occurrence_date=EXCLUDED.occurrence_date,observed_at=EXCLUDED.observed_at,
       source_identity=EXCLUDED.source_identity,provenance=EXCLUDED.provenance,payload=EXCLUDED.payload,updated_at=now()`,
    [ownerUserId, collection, recordId, position, metadata.legacyId, metadata.version, metadata.status,
      metadata.occurrenceDate, metadata.observedAt, metadata.sourceIdentity,
      JSON.stringify(metadata.provenance), JSON.stringify(record)]
  );
}

async function importRelationships(client, relationships, ownerUserId, collections) {
  const available = new Set([`user:${ownerUserId}`]);
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    records.forEach((record, position) => available.add(`${collection}:${resolveRecordId(record, position)}`));
  }
  for (const relationship of relationships) {
    const from = parseQualifiedIdentity(relationship.from);
    const to = parseQualifiedIdentity(relationship.to);
    if (!from || !to || !relationship.type) throw new Error("Migration relationship is invalid.");
    if (!available.has(relationship.from) || !available.has(relationship.to)) {
      throw new Error(`Migration relationship target is missing: ${relationship.from} -> ${relationship.to}.`);
    }
    await client.query(
      `INSERT INTO physiqueos.canonical_relationships
        (owner_user_id,relationship_type,from_collection,from_record_id,to_collection,to_record_id,provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`,
      [ownerUserId, relationship.type, from.collection, from.id, to.collection, to.id,
        JSON.stringify({ source: "phase4-export" })]
    );
  }
}

async function importMediaMetadata(client, files, ownerUserId) {
  for (const file of files) {
    if (file.ownerUserId !== ownerUserId) throw new Error(`Invalid media owner for ${file.relativePath}.`);
    const relationship = parseQualifiedIdentity(file.relationshipIds?.[0]) ?? { collection: "unclassified", id: file.relativePath };
    const id = createPhase4MediaObjectId(file);
    const storageKey = `private/${ownerUserId}/${id}`;
    await client.query(
      `INSERT INTO physiqueos.canonical_media_objects
        (id,owner_user_id,evidence_collection,evidence_record_id,original_filename,content_type,byte_length,sha256,storage_key,provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (id) DO UPDATE SET content_type=EXCLUDED.content_type,byte_length=EXCLUDED.byte_length,
         sha256=EXCLUDED.sha256,provenance=EXCLUDED.provenance,updated_at=now()`,
      [id, ownerUserId, relationship.collection, relationship.id, file.relativePath.split("/").at(-1),
        file.mimeType, file.size, file.sha256, storageKey,
        JSON.stringify({ sourceRelativePath: file.relativePath, immutableOriginal: true })]
    );
  }
}

async function assertGuardedDatabase(client, targetAuthorization = null) {
  const result = await client.query("SELECT current_database() AS database");
  const database = result.rows[0]?.database;
  const explicitlyAuthorized = targetAuthorization?.productionExecutionAuthorized === true &&
    String(targetAuthorization.expectedDatabase ?? "") === String(database ?? "") &&
    typeof targetAuthorization.migrationOperationId === "string" &&
    targetAuthorization.migrationOperationId.length > 0;
  if (!GUARDED_DATABASE.test(String(database ?? "")) && !explicitlyAuthorized) {
    throw new Error("Refusing canonical import/reset outside a guarded Phase 4 rehearsal or Phase 5 provider-test database.");
  }
  return database;
}

function validateOwner(collections) {
  const user = collections.user;
  if (!user || Array.isArray(user) || !String(user.id ?? "").trim()) {
    throw new Error("Canonical package has no valid singleton user owner.");
  }
  return user;
}

function validateRecordOwner(record, ownerUserId, collection, position) {
  const explicit = record.ownerUserId ?? record.userId ?? record.user_id;
  if (explicit != null && String(explicit) !== ownerUserId) {
    throw new Error(`Invalid owner in ${collection} record ${position}.`);
  }
}

function extractRecordMetadata(record) {
  return {
    legacyId: nullable(record.id ?? record.package_id ?? record.review_id),
    version: normalizeVersion(record.version),
    status: nullable(record.status ?? record.state),
    occurrenceDate: calendarDate(record.occurrenceDate ?? record.localDate ?? record.date ?? record.scheduledDate),
    observedAt: dateTime(record.observedAt ?? record.observed_at ?? record.createdAt),
    sourceIdentity: nullable(record.sourceIdentity ?? record.sourceId ?? record.source_id ?? record.fileId),
    provenance: record.provenance && typeof record.provenance === "object" ? record.provenance : { source: "legacy-founder-runtime" },
  };
}

function resolveRecordId(record, position) {
  return String(record?.id ?? record?.package_id ?? record?.review_id ?? `@index:${position}`);
}

function parseQualifiedIdentity(value) {
  const candidate = String(value ?? "");
  const separator = candidate.indexOf(":");
  if (separator < 1 || separator === candidate.length - 1) return null;
  return { collection: candidate.slice(0, separator), id: candidate.slice(separator + 1) };
}

function normalizeVersion(value) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : 1;
}

function nullable(value) { return value == null || value === "" ? null : String(value); }
function calendarDate(value) { const text = nullable(value); return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function dateTime(value) { const text = nullable(value); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; }
function isSingletonCollection(name) { return ["user", "nutritionContext", "operatingPlan"].includes(name); }
