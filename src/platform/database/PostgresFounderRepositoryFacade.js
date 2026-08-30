import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createEvidenceReviewRepository } from "../../data/repositories/EvidenceReviewRepository.js";
import {
  CanonicalWriteDisposition,
  classifyFounderRepositoryMethod,
} from "../cutover/canonicalWriteSurfaceInventory.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "../migration/foundationSourceCollections.js";
import { loadCanonicalRuntime } from "../migration/phase4CanonicalImport.js";
import { assertKnownPhase4Collection } from "../migration/phase4DomainCollections.js";
import {
  createShallowWritableFounderRuntime,
  detachBoundedFounderCollections,
} from "./BoundedFounderRuntimeMutation.js";
import {
  createEvidenceReviewContinuationMessage,
} from "../../domain/services/EvidenceReviewBackgroundContinuation.js";

const GUARDED_COMPATIBILITY_DATABASE = /^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/;
const TARGETED_EVIDENCE_REVIEW_METHODS = new Set([
  "claimEvidenceReviewCommit",
  "recordEvidenceReviewCommitProgress",
  "releaseEvidenceReviewCommit",
  "completeEvidenceReviewCommit",
  "failEvidenceReviewCommit",
]);

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
  runInReadScope = null,
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
  const facade = Object.fromEntries(Object.entries(template).map(([repositoryName, repository]) => [
    repositoryName,
    Object.freeze(Object.fromEntries(Object.entries(repository).map(([methodName, value]) => [
      methodName,
      typeof value === "function"
        ? async (...args) => invoke({ repositoryName, methodName, args })
        : value,
    ]))),
  ]));
  if (typeof runInReadScope === "function") {
    Object.defineProperty(facade, "runInReadScope", {
      configurable: false,
      enumerable: false,
      value: runInReadScope,
      writable: false,
    });
  }
  return Object.freeze(facade);

  async function invoke({ repositoryName, methodName, args }) {
    const disposition = classifyFounderRepositoryMethod(repositoryName, methodName);
    if (disposition === CanonicalWriteDisposition.READ_ONLY) {
      const repositories = await loadReadRepositories();
      return repositories[repositoryName][methodName](...args);
    }

    if (repositoryName === "evidenceReviews" && TARGETED_EVIDENCE_REVIEW_METHODS.has(methodName)) {
      return executePostgresEvidenceReviewMutation({
        pool, ownerUserId, authorityStore, migrationOperationId, compatibilityMode,
        requireCompatibilityAuthority, now,
        commandId: createCommandId({ repositoryName, methodName, args }),
        methodName,
        args,
      });
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

export async function executePostgresEvidenceReviewMutation({
  pool,
  ownerUserId,
  authorityStore = null,
  migrationOperationId = null,
  compatibilityMode = false,
  requireCompatibilityAuthority = false,
  now = () => new Date(),
  commandId = randomUUID(),
  methodName,
  args = [],
} = {}) {
  if (!pool?.connect || !TARGETED_EVIDENCE_REVIEW_METHODS.has(methodName)) {
    throw new Error("Targeted PostgreSQL evidence review mutation is not configured.");
  }
  const reviewId = String(args[0] ?? "");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
    if (compatibilityMode) {
      const databaseName = await assertCompatibilityTarget(client);
      if (requireCompatibilityAuthority || authorityStore?.assertCompatibilityAccess) {
        await authorityStore.assertCompatibilityAccess({ client, databaseName });
      }
    } else if (authorityStore) {
      await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId });
    } else {
      throw Object.assign(new Error("Canonical runtime authority is required."), {
        code: "CANONICAL_RUNTIME_AUTHORITY_REQUIRED",
      });
    }
    const current = await client.query(
      `SELECT version,payload FROM physiqueos.canonical_evidence_records
        WHERE owner_user_id=$1 AND collection_name='evidenceReviews' AND record_id=$2
        FOR UPDATE`,
      [ownerUserId, reviewId],
    );
    if (current.rowCount !== 1) {
      await client.query("COMMIT");
      return null;
    }
    const reviews = [structuredClone(current.rows[0].payload)];
    const repository = createEvidenceReviewRepository(reviews);
    const result = await repository[methodName](...args);
    const review = reviews[0];
    const version = Number(current.rows[0].version) + 1;
    const payload = { ...structuredClone(review), version };
    const metadata = extractMetadata(payload);
    const updated = await client.query(
      `UPDATE physiqueos.canonical_evidence_records SET
         version=$3,status=$4,occurrence_date=$5::date,observed_at=$6::timestamptz,
         source_identity=$7,provenance=$8::jsonb,payload=$9::jsonb,updated_at=now()
       WHERE owner_user_id=$1 AND collection_name='evidenceReviews' AND record_id=$2`,
      [ownerUserId, reviewId, version, metadata.status, metadata.occurrenceDate,
        metadata.observedAt, metadata.sourceIdentity, JSON.stringify(metadata.provenance),
        JSON.stringify(payload)],
    );
    if (updated.rowCount !== 1) {
      throw Object.assign(new Error("Evidence review changed during confirmation."), {
        code: "EVIDENCE_REVIEW_CONCURRENCY_CONFLICT",
      });
    }
    if (methodName === "releaseEvidenceReviewCommit") {
      await enqueueEvidenceReviewContinuation(client, review);
    }
    await bumpRuntimeMetadata(client, { ownerUserId, commandId, now });
    await client.query("COMMIT");
    return structuredClone(result);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
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
    async readRuntime() {
      const scope = storage.getStore();
      return scope ? loadScopedRuntime(scope, loadRuntime) : loadRuntime();
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
  bounded = false,
  allowedCollections = null,
  allowApplicationContextMutation = true,
  returnReceipt = false,
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

    const loadedRuntime = await loadCanonicalRuntime({
      query: (text, values) => client.query(text, values),
      ownerUserId,
    });
    const runtime = bounded
      ? createShallowWritableFounderRuntime(loadedRuntime)
      : mutableRuntime(loadedRuntime);
    if (expectedRuntime && canonicalJson(runtime) !== canonicalJson(expectedRuntime)) {
      throw Object.assign(new Error("Canonical runtime changed before the command acquired its transaction lock."), {
        code: "FOUNDER_STORE_REVISION_CONFLICT",
      });
    }
    const before = bounded
      ? snapshotCollectionDigests(runtime)
      : snapshotCollections(runtime);
    const beforeContext = bounded
      ? snapshotApplicationContextDigest(runtime)
      : snapshotApplicationContext(runtime);
    const detachedCollectionCount = bounded
      ? detachBoundedFounderCollections(runtime, allowedCollections)
      : 0;
    const result = await mutate(runtime, { client, commandId });
    const changed = bounded
      ? changedCollectionDigests(before, runtime)
      : changedCollections(before, runtime);
    assertBoundedMutationScope({
      changed,
      allowedCollections,
      contextChanged: beforeContext !== (bounded
        ? snapshotApplicationContextDigest(runtime)
        : snapshotApplicationContext(runtime)),
      allowApplicationContextMutation,
    });
    for (const collection of changed) await replaceCollection(client, { ownerUserId, collection, source: runtime[collection] });
    const contextChanged = beforeContext !== (bounded
      ? snapshotApplicationContextDigest(runtime)
      : snapshotApplicationContext(runtime));
    if (contextChanged) await replaceApplicationContext(client, { ownerUserId, runtime });
    let revision = Number(runtime.revision ?? 0);
    if (changed.length || contextChanged) {
      revision = await bumpRuntimeMetadata(client, { ownerUserId, commandId, now });
    }
    await client.query("COMMIT");
    const clonedResult = structuredClone(result);
    return returnReceipt
      ? Object.freeze({
          committed: true,
          commitId: commandId,
          revision,
          result: clonedResult,
          changedCollections: Object.freeze([...changed]),
          memoryProfile: Object.freeze({
            runtimeLoadCount: 1,
            runtimeCloneCount: bounded ? 0 : 1,
            fullRuntimeSerializationCount: expectedRuntime ? 2 : 0,
            collectionSnapshotMode: bounded ? "digest" : "canonical_json",
            boundedCollectionCloneCount: detachedCollectionCount,
          }),
        })
      : clonedResult;
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
      WHERE owner_user_id=$1 RETURNING revision`,
    [ownerUserId, commandId, updatedAt],
  );
  if (result.rowCount !== 1) {
    const error = new Error("Canonical runtime metadata is unavailable.");
    error.code = "CANONICAL_RUNTIME_METADATA_UNAVAILABLE";
    throw error;
  }
  return Number(result.rows[0]?.revision ?? 0);
}

async function enqueueEvidenceReviewContinuation(client, review) {
  const message = createEvidenceReviewContinuationMessage(review, {
    createId: randomUUID,
  });
  if (!message) return null;
  return client.query(
    `INSERT INTO physiqueos.outbox_messages
      (id,user_id,operation_id,topic,dedupe_key,payload_version,payload,due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,now())
     ON CONFLICT (topic,dedupe_key) DO NOTHING`,
    [message.id, message.userId, message.operationId, message.topic,
      message.dedupeKey, message.payloadVersion, JSON.stringify(message.payload)],
  );
}

function snapshotCollections(runtime) {
  return Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, canonicalJson(runtime[name] ?? null)]));
}

function changedCollections(before, runtime) {
  return FOUNDATION_SOURCE_COLLECTIONS.filter((name) => before[name] !== canonicalJson(runtime[name] ?? null));
}

function snapshotCollectionDigests(runtime) {
  return Object.fromEntries(
    FOUNDATION_SOURCE_COLLECTIONS.map((name) => [
      name,
      canonicalDigest(runtime[name] ?? null),
    ])
  );
}

function changedCollectionDigests(before, runtime) {
  return FOUNDATION_SOURCE_COLLECTIONS.filter(
    (name) => before[name] !== canonicalDigest(runtime[name] ?? null)
  );
}

function snapshotApplicationContext(runtime) {
  return canonicalJson({
    operatingRhythm: runtime.operatingRhythm ?? null,
    adaptiveTrustProfile: runtime.adaptiveTrustProfile ?? null,
    milestones: runtime.milestones ?? [],
  });
}

function snapshotApplicationContextDigest(runtime) {
  return canonicalDigest({
    operatingRhythm: runtime.operatingRhythm ?? null,
    adaptiveTrustProfile: runtime.adaptiveTrustProfile ?? null,
    milestones: runtime.milestones ?? [],
  });
}

function canonicalDigest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function assertBoundedMutationScope({
  changed,
  allowedCollections,
  contextChanged,
  allowApplicationContextMutation,
}) {
  if (allowedCollections) {
    const allowed = new Set(allowedCollections.map((collection) => {
      assertKnownPhase4Collection(collection);
      return collection;
    }));
    const unexpected = changed.filter((collection) => !allowed.has(collection));
    if (unexpected.length) {
      throw Object.assign(
        new Error(`Bounded Founder mutation changed unauthorized collections: ${unexpected.join(", ")}.`),
        { code: "FOUNDER_RUNTIME_MUTATION_SCOPE_VIOLATION" }
      );
    }
  }
  if (contextChanged && !allowApplicationContextMutation) {
    throw Object.assign(
      new Error("Bounded Founder mutation changed unauthorized application context."),
      { code: "FOUNDER_RUNTIME_MUTATION_SCOPE_VIOLATION" }
    );
  }
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
