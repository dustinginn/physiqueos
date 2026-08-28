import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import {
  CanonicalWriteDisposition,
  classifyFounderRepositoryMethod,
} from "../cutover/canonicalWriteSurfaceInventory.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "../migration/foundationSourceCollections.js";
import { loadCanonicalRuntime } from "../migration/phase4CanonicalImport.js";
import { assertKnownPhase4Collection } from "../migration/phase4DomainCollections.js";

const GUARDED_COMPATIBILITY_DATABASE = /^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/;

export function createPostgresFounderRepositoryFacade({
  pool,
  ownerUserId,
  authorityStore = null,
  migrationOperationId = null,
  compatibilityMode = false,
  requireCompatibilityAuthority = false,
  now = () => new Date(),
  createCommandId = () => randomUUID(),
  readRepositories = null,
} = {}) {
  if (!pool?.query || !pool?.connect) throw new Error("PostgreSQL Founder repositories require a pool.");
  if (!String(ownerUserId ?? "").trim()) throw new Error("PostgreSQL Founder repositories require an owner.");
  if (compatibilityMode && requireCompatibilityAuthority && !authorityStore?.assertCompatibilityAccess) {
    throw new Error("Provider compatibility repositories require durable compatibility authority.");
  }
  if (!compatibilityMode && !authorityStore?.claimCanonicalWriteBoundary) {
    throw new Error("Provider canonical repositories require durable runtime authority.");
  }

  const template = createSeedRepositories(emptyRuntime(), { allowStagedMutations: true });
  const loadReadRepositories = readRepositories ?? (async () => createReadRepositories(
    await loadCanonicalRuntime({ query: (text, values) => pool.query(text, values), ownerUserId }),
  ));
  if (typeof loadReadRepositories !== "function") throw new Error("PostgreSQL Founder repository reads require a snapshot loader.");
  return Object.freeze(Object.fromEntries(Object.entries(template).map(([repositoryName, repository]) => [
    repositoryName,
    Object.freeze(Object.fromEntries(Object.entries(repository).map(([methodName, value]) => [
      methodName,
      typeof value === "function"
        ? async (...args) => invoke({ repositoryName, methodName, args })
        : value,
    ]))),
  ])));

  async function invoke({ repositoryName, methodName, args }) {
    const disposition = classifyFounderRepositoryMethod(repositoryName, methodName);
    if (disposition === CanonicalWriteDisposition.READ_ONLY) {
      const repositories = await loadReadRepositories();
      return repositories[repositoryName][methodName](...args);
    }

    return executePostgresFounderRuntimeMutation({
      pool, ownerUserId, authorityStore, migrationOperationId, compatibilityMode, requireCompatibilityAuthority, now,
      commandId: createCommandId({ repositoryName, methodName, args }),
      operation: `${repositoryName}.${methodName}`,
      mutate(runtime) {
        const repositories = createSeedRepositories(runtime, { allowStagedMutations: true });
        return repositories[repositoryName][methodName](...args);
      },
    });
  }
}

export function createPostgresFounderReadScope({ loadRuntime, readPoolState = () => null, onComplete = null, now = () => Date.now() } = {}) {
  if (typeof loadRuntime !== "function") throw new Error("PostgreSQL Founder read scope requires a canonical runtime loader.");
  const storage = new AsyncLocalStorage();
  return Object.freeze({
    async run(callback, metadata = {}) {
      if (typeof callback !== "function") throw new Error("PostgreSQL Founder read scope requires a callback.");
      if (storage.getStore()) return callback();
      const scope = { runtime: null, runtimePromise: null, repositoriesPromise: null, loadCount: 0 };
      const startedAt = now();
      const poolBefore = safePoolState(readPoolState);
      try {
        return await storage.run(scope, callback);
      } finally {
        safelyObserve(onComplete, Object.freeze({
          readModel: String(metadata.readModel ?? "unknown"),
          runtimeLoadCount: scope.loadCount,
          elapsedMs: Math.max(0, now() - startedAt),
          poolBefore,
          poolAfter: safePoolState(readPoolState),
        }));
      }
    },
    async readRepositories() {
      const scope = storage.getStore();
      if (!scope) return createReadRepositories(await loadRuntime());
      if (!scope.repositoriesPromise) {
        scope.repositoriesPromise = loadScopedRuntime(scope, loadRuntime).then(createReadRepositories);
      }
      return scope.repositoriesPromise;
    },
    currentRuntime() {
      return storage.getStore()?.runtime ?? null;
    },
  });
}

function loadScopedRuntime(scope, loadRuntime) {
  if (!scope.runtimePromise) {
    scope.loadCount += 1;
    scope.runtimePromise = Promise.resolve().then(loadRuntime).then((runtime) => {
      scope.runtime = runtime;
      return runtime;
    });
  }
  return scope.runtimePromise;
}

function createReadRepositories(runtime) {
  return createSeedRepositories(mutableRuntime(runtime), { allowStagedMutations: false });
}

function safePoolState(readPoolState) {
  try {
    const state = readPoolState?.();
    if (!state || typeof state !== "object") return null;
    return Object.freeze({
      totalCount: Number(state.totalCount ?? 0),
      idleCount: Number(state.idleCount ?? 0),
      waitingCount: Number(state.waitingCount ?? 0),
    });
  } catch { return null; }
}

function safelyObserve(observer, event) {
  if (typeof observer !== "function") return;
  try { observer(event); } catch { /* Diagnostics must never change canonical read behavior. */ }
}

export async function executePostgresFounderRuntimeMutation({
  pool,
  ownerUserId,
  authorityStore = null,
  migrationOperationId = null,
  compatibilityMode = false,
  requireCompatibilityAuthority = false,
  now = () => new Date(),
  commandId = randomUUID(),
  operation = "application-runtime-mutation",
  expectedRuntime = null,
  mutate,
} = {}) {
  if (!pool?.connect || typeof mutate !== "function") throw new Error("PostgreSQL runtime mutation is not configured.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
    if (compatibilityMode) {
      const databaseName = await assertCompatibilityTarget(client);
      if (requireCompatibilityAuthority || authorityStore?.assertCompatibilityAccess) {
        await authorityStore.assertCompatibilityAccess({ client, databaseName });
      }
    }
    else if (authorityStore) await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId });
    else throw Object.assign(new Error("Canonical runtime authority is required."), { code: "CANONICAL_RUNTIME_AUTHORITY_REQUIRED" });

    const runtime = mutableRuntime(await loadCanonicalRuntime({ query: (text, values) => client.query(text, values), ownerUserId }));
    if (expectedRuntime && canonicalJson(runtime) !== canonicalJson(expectedRuntime)) {
      throw Object.assign(new Error("Canonical runtime changed before the command acquired its transaction lock."), {
        code: "FOUNDER_STORE_REVISION_CONFLICT",
      });
    }
    const before = snapshotCollections(runtime);
    const beforeContext = snapshotApplicationContext(runtime);
    const result = await mutate(runtime, { client, commandId });
    const changed = changedCollections(before, runtime);
    for (const collection of changed) await replaceCollection(client, { ownerUserId, collection, source: runtime[collection] });
    const contextChanged = beforeContext !== snapshotApplicationContext(runtime);
    if (contextChanged) await replaceApplicationContext(client, { ownerUserId, runtime });
    if (changed.length || contextChanged) {
      await bumpRuntimeMetadata(client, { ownerUserId, commandId, now });
    }
    await client.query("COMMIT");
    return structuredClone(result);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertCompatibilityTarget(client) {
  const result = await client.query("SELECT current_database() AS database");
  const database = String(result.rows[0]?.database ?? "");
  if (!GUARDED_COMPATIBILITY_DATABASE.test(database)) {
    const error = new Error("Compatibility writes are restricted to the isolated Phase 5 provider database.");
    error.code = "PROVIDER_COMPATIBILITY_TARGET_REJECTED";
    throw error;
  }
  return database;
}

async function replaceCollection(client, { ownerUserId, collection, source }) {
  const table = assertKnownPhase4Collection(collection);
  const records = source == null ? [] : Array.isArray(source) ? source : [source];
  const identities = records.map((record, position) => resolveRecordId(record, position));
  await client.query(
    `DELETE FROM physiqueos.${table}
      WHERE owner_user_id=$1 AND collection_name=$2 AND NOT (record_id = ANY($3::text[]))`,
    [ownerUserId, collection, identities],
  );
  for (let position = 0; position < records.length; position += 1) {
    const record = structuredClone(records[position]);
    const recordId = identities[position];
    const current = await client.query(
      `SELECT version FROM physiqueos.${table}
        WHERE owner_user_id=$1 AND collection_name=$2 AND record_id=$3 FOR UPDATE`,
      [ownerUserId, collection, recordId],
    );
    const version = current.rows[0] ? Number(current.rows[0].version) + 1 : normalizeVersion(record.version);
    const payload = { ...record, version };
    const metadata = extractMetadata(payload);
    await client.query(
      `INSERT INTO physiqueos.${table}
        (owner_user_id,collection_name,record_id,source_ordinal,legacy_id,version,status,occurrence_date,
         observed_at,source_identity,provenance,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::timestamptz,$10,$11::jsonb,$12::jsonb)
       ON CONFLICT (owner_user_id,collection_name,record_id) DO UPDATE SET
         source_ordinal=EXCLUDED.source_ordinal,legacy_id=EXCLUDED.legacy_id,version=EXCLUDED.version,
         status=EXCLUDED.status,occurrence_date=EXCLUDED.occurrence_date,observed_at=EXCLUDED.observed_at,
         source_identity=EXCLUDED.source_identity,provenance=EXCLUDED.provenance,payload=EXCLUDED.payload,updated_at=now()`,
      [ownerUserId, collection, recordId, position, metadata.legacyId, version, metadata.status,
        metadata.occurrenceDate, metadata.observedAt, metadata.sourceIdentity,
        JSON.stringify(metadata.provenance), JSON.stringify(payload)],
    );
  }
}

async function bumpRuntimeMetadata(client, { ownerUserId, commandId, now }) {
  const updatedAt = now().toISOString();
  const result = await client.query(
    `UPDATE physiqueos.canonical_runtime_metadata
        SET revision=revision+1,last_command_id=$2,version=version+1,updated_at=$3
      WHERE owner_user_id=$1`,
    [ownerUserId, commandId, updatedAt],
  );
  if (result.rowCount !== 1) {
    const error = new Error("Canonical runtime metadata is unavailable.");
    error.code = "CANONICAL_RUNTIME_METADATA_UNAVAILABLE";
    throw error;
  }
}

function snapshotCollections(runtime) {
  return Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, canonicalJson(runtime[name] ?? null)]));
}

function changedCollections(before, runtime) {
  return FOUNDATION_SOURCE_COLLECTIONS.filter((name) => before[name] !== canonicalJson(runtime[name] ?? null));
}

function snapshotApplicationContext(runtime) {
  return canonicalJson({
    operatingRhythm: runtime.operatingRhythm ?? null,
    adaptiveTrustProfile: runtime.adaptiveTrustProfile ?? null,
    milestones: runtime.milestones ?? [],
  });
}

async function replaceApplicationContext(client, { ownerUserId, runtime }) {
  await client.query(
    `UPDATE physiqueos.canonical_application_context SET
       operating_rhythm=$2::jsonb,adaptive_trust_profile=$3::jsonb,retired_milestones=$4::jsonb,
       version=version+1,updated_at=now() WHERE owner_user_id=$1`,
    [ownerUserId, JSON.stringify(runtime.operatingRhythm ?? null),
      JSON.stringify(runtime.adaptiveTrustProfile ?? null), JSON.stringify(runtime.milestones ?? [])],
  );
}

function mutableRuntime(runtime) { return structuredClone(runtime); }

function emptyRuntime() {
  return Object.fromEntries([
    ...FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, singleton(name) ? null : []]),
    ["operatingRhythm", null], ["adaptiveTrustProfile", null], ["milestones", []],
  ]);
}

function singleton(name) { return ["user", "nutritionContext", "operatingPlan"].includes(name); }
function resolveRecordId(record, position) { return String(record?.id ?? record?.package_id ?? record?.review_id ?? `@index:${position}`); }
function normalizeVersion(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : 1; }
function nullable(value) { return value == null || value === "" ? null : String(value); }
function calendarDate(value) { const text = nullable(value); return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function dateTime(value) { const text = nullable(value); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; }
function extractMetadata(record) {
  return {
    legacyId: nullable(record.id ?? record.package_id ?? record.review_id),
    status: nullable(record.status ?? record.state),
    occurrenceDate: calendarDate(record.occurrenceDate ?? record.localDate ?? record.date ?? record.scheduledDate),
    observedAt: dateTime(record.observedAt ?? record.observed_at ?? record.createdAt),
    sourceIdentity: nullable(record.sourceIdentity ?? record.sourceId ?? record.source_id ?? record.fileId),
    provenance: record.provenance && typeof record.provenance === "object" ? record.provenance : { source: "provider-canonical-repository" },
  };
}
