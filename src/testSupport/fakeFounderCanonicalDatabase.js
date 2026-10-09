import { PHASE4_DOMAIN_TABLES } from "../platform/migration/phase4DomainCollections.js";

/**
 * A small in-process stand-in for the canonical PostgreSQL tables that
 * understands exactly the statements the Founder runtime loader, the bounded
 * runtime mutation and the named-record mutation issue. Rows persist across
 * calls and transactions roll back. Payloads are held as off-heap Buffers and
 * parsed on every read, as `pg` parses `jsonb`, so a load costs what a real
 * load costs in the reading process's heap and nothing is retained between
 * loads by the fake itself.
 *
 * It records how much of the runtime each statement touched so tests can pin
 * load and write bounds deterministically.
 */
export function createFakeFounderCanonicalDatabase({ ownerUserId, collections = {}, revision = 1 } = {}) {
  let committed = new Map();
  for (const [collection, records] of Object.entries(collections)) {
    const values = records == null ? [] : Array.isArray(records) ? records : [records];
    values.forEach((payload, position) => {
      const recordId = String(payload?.id ?? payload?.package_id ?? payload?.review_id ?? `@index:${position}`);
      committed.set(rowKey(collection, recordId), row(collection, recordId, position, Number(payload?.version ?? 1), payload));
    });
  }
  let metadata = { revision, version: 1, lastCommandId: null };
  let stagedMetadata = metadata;
  let staged = null;
  const stats = {
    collectionLoads: [],
    recordReads: [],
    recordWrites: [],
    collectionRewrites: [],
    metadataBumps: 0,
    commits: 0,
    rollbacks: 0,
    statements: 0,
  };
  const current = () => staged ?? committed;

  async function query(text, values = []) {
    stats.statements += 1;
    const sql = String(text);
    if (/^\s*BEGIN\b/i.test(sql)) { staged = new Map(committed); stagedMetadata = { ...metadata }; return ok(); }
    if (/^\s*COMMIT\b/i.test(sql)) {
      if (staged) { committed = staged; metadata = stagedMetadata; }
      staged = null; stats.commits += 1; return ok();
    }
    if (/^\s*ROLLBACK\b/i.test(sql)) { staged = null; stats.rollbacks += 1; return ok(); }
    if (/pg_advisory_xact_lock/.test(sql)) return ok();
    if (/current_database\(\)/.test(sql)) return ok([{ database: "physiqueos_phase5_test_provider" }]);
    if (/UPDATE physiqueos\.canonical_runtime_metadata/.test(sql)) {
      stats.metadataBumps += 1;
      const target = staged ? stagedMetadata : metadata;
      target.revision += 1; target.version += 1; target.lastCommandId = values[1] ?? null;
      return ok([{ revision: target.revision }]);
    }
    if (/FROM physiqueos\.canonical_runtime_metadata/.test(sql)) {
      const source = staged ? stagedMetadata : metadata;
      return ok([{ runtime_version: "founder-test", revision: source.revision, last_command_id: source.lastCommandId,
        updated_at: new Date("2026-10-09T00:00:00.000Z"), imported_at: new Date("2026-08-27T00:00:00.000Z") }]);
    }
    if (/phase4_import_runs|canonical_application_context/.test(sql)) return ok();
    if (/collection_name=ANY\(\$\d+::text\[\]\)/.test(sql) && /UNION ALL|ORDER BY collection_name/.test(sql)) {
      const out = [];
      for (const match of sql.matchAll(/FROM physiqueos\.(\w+)\s+WHERE owner_user_id=\$1 AND collection_name=ANY\(\$(\d+)::text\[\]\)/g)) {
        const names = values[Number(match[2]) - 1];
        stats.collectionLoads.push(...names);
        for (const entry of current().values()) {
          if (entry.table === match[1] && names.includes(entry.collection)) {
            out.push({ collection_name: entry.collection, source_ordinal: entry.ordinal, record_id: entry.recordId, payload: parse(entry) });
          }
        }
      }
      out.sort((left, right) => left.collection_name.localeCompare(right.collection_name) ||
        left.source_ordinal - right.source_ordinal || left.record_id.localeCompare(right.record_id));
      return ok(out);
    }
    const select = /^\s*SELECT (version,payload|version) FROM physiqueos\.(\w+)\s+WHERE owner_user_id=\$1 AND collection_name=\$2 AND record_id=\$3 FOR UPDATE/.exec(sql);
    if (select) {
      const entry = current().get(rowKey(values[1], values[2]));
      stats.recordReads.push(`${values[1]}:${values[2]}`);
      if (!entry) return ok();
      return ok([select[1] === "version" ? { version: entry.version } : { version: entry.version, payload: parse(entry) }]);
    }
    const deleteMatch = /^\s*DELETE FROM physiqueos\.(\w+)\s+WHERE owner_user_id=\$1 AND collection_name=\$2 AND NOT \(record_id = ANY\(\$3::text\[\]\)\)/.exec(sql);
    if (deleteMatch) {
      stats.collectionRewrites.push(values[1]);
      const keep = new Set(values[2]);
      let removed = 0;
      for (const [key, entry] of current()) {
        if (entry.collection === values[1] && !keep.has(entry.recordId)) { current().delete(key); removed += 1; }
      }
      return ok([], removed);
    }
    const recordUpdate = /^\s*UPDATE physiqueos\.(\w+)\s+SET legacy_id=\$4,version=\$5/.exec(sql);
    if (recordUpdate) {
      const key = rowKey(values[1], values[2]);
      const entry = current().get(key);
      if (!entry || entry.version !== Number(values[11])) return ok([], 0);
      current().set(key, row(values[1], values[2], entry.ordinal, Number(values[4]), JSON.parse(values[10]), metadataFrom(values)));
      stats.recordWrites.push(`${values[1]}:${values[2]}`);
      return ok([], 1);
    }
    const insert = /^\s*INSERT INTO physiqueos\.(\w+)/.exec(sql);
    if (insert && /ON CONFLICT \(owner_user_id,collection_name,record_id\) DO NOTHING/.test(sql) && /COALESCE\(MAX\(source_ordinal\)\+1,0\)/.test(sql) && values.length === 11) {
      const key = rowKey(values[1], values[2]);
      if (current().has(key)) return ok([], 0);
      const ordinal = Math.max(-1, ...[...current().values()].filter((entry) => entry.collection === values[1]).map((entry) => entry.ordinal)) + 1;
      current().set(key, row(values[1], values[2], ordinal, Number(values[4]), JSON.parse(values[10]), metadataFrom(values)));
      stats.recordWrites.push(`${values[1]}:${values[2]}`);
      return ok([], 1);
    }
    if (insert && /DO UPDATE SET/.test(sql) && values.length === 12) {
      // replaceCollection: one row of a whole-collection rewrite.
      const [, collection, recordId, ordinal, legacyId, version, status, occurrenceDate, observedAt, sourceIdentity, provenance, payload] = values;
      current().set(rowKey(collection, recordId), row(collection, recordId, Number(ordinal), Number(version), JSON.parse(payload),
        { legacyId, status, occurrenceDate, observedAt, sourceIdentity, provenance: JSON.parse(provenance) }));
      return ok([], 1);
    }
    throw new Error(`fakeFounderCanonicalDatabase: unsupported statement: ${sql.slice(0, 120)}`);
  }

  const client = { query, release() {} };
  const pool = { query, async connect() { return client; }, totalCount: 1, idleCount: 1, waitingCount: 0 };
  return Object.freeze({
    ownerUserId,
    pool,
    query,
    stats,
    get revision() { return metadata.revision; },
    resetStats() {
      stats.collectionLoads.length = 0; stats.recordReads.length = 0; stats.recordWrites.length = 0;
      stats.collectionRewrites.length = 0; stats.metadataBumps = 0; stats.commits = 0; stats.rollbacks = 0; stats.statements = 0;
    },
    get(collection, recordId) {
      const entry = committed.get(rowKey(collection, recordId));
      return entry ? { ...parse(entry), version: entry.version } : null;
    },
    row(collection, recordId) {
      const entry = committed.get(rowKey(collection, recordId));
      return entry ? { ...entry, payload: parse(entry), payloadBuffer: undefined } : null;
    },
    list(collection) {
      return [...committed.values()].filter((entry) => entry.collection === collection)
        .sort((left, right) => left.ordinal - right.ordinal).map((entry) => ({ ...parse(entry), version: entry.version }));
    },
    payloadBytes() {
      let bytes = 0;
      for (const entry of committed.values()) bytes += entry.payloadBuffer.length;
      return bytes;
    },
  });
}

function row(collection, recordId, ordinal, version, payload, metadata = {}) {
  const table = PHASE4_DOMAIN_TABLES[collection];
  if (!table) throw new Error(`fakeFounderCanonicalDatabase: unknown collection ${collection}`);
  return Object.freeze({
    table, collection, recordId, ordinal, version,
    payloadBuffer: Buffer.from(JSON.stringify({ ...payload, version })),
    legacyId: metadata.legacyId ?? null,
    status: metadata.status ?? null,
    occurrenceDate: metadata.occurrenceDate ?? null,
    observedAt: metadata.observedAt ?? null,
    sourceIdentity: metadata.sourceIdentity ?? null,
    provenance: metadata.provenance ?? null,
  });
}

function metadataFrom(values) {
  return {
    legacyId: values[3], status: values[5], occurrenceDate: values[6], observedAt: values[7],
    sourceIdentity: values[8], provenance: JSON.parse(values[9]),
  };
}

function parse(entry) { return JSON.parse(entry.payloadBuffer.toString("utf8")); }
function rowKey(collection, recordId) { return `${collection}\u0000${recordId}`; }
function ok(rows = [], rowCount = rows.length) { return { rows, rowCount }; }
