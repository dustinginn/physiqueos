const DOMAIN_TABLES = Object.freeze([
  "canonical_user_records",
  "canonical_goal_records",
  "canonical_plan_records",
  "canonical_protocol_records",
  "canonical_execution_records",
  "canonical_checkin_records",
  "canonical_evidence_records",
  "canonical_training_records",
  "canonical_briefing_records",
  "canonical_confidence_records",
]);

function createDomainTable(table) {
  return String.raw`
CREATE TABLE physiqueos.${table} (
  owner_user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  collection_name text NOT NULL,
  record_id text NOT NULL,
  source_ordinal integer NOT NULL CHECK (source_ordinal >= 0),
  legacy_id text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  status text,
  occurrence_date date,
  observed_at timestamptz,
  source_identity text,
  provenance jsonb,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, collection_name, record_id)
);
CREATE INDEX ${table}_owner_collection_idx
  ON physiqueos.${table}(owner_user_id, collection_name, occurrence_date, observed_at);
CREATE UNIQUE INDEX ${table}_source_identity_idx
  ON physiqueos.${table}(owner_user_id, collection_name, source_identity)
  WHERE source_identity IS NOT NULL;
`;
}

const PHASE4_UP_SQL = String.raw`
${DOMAIN_TABLES.map(createDomainTable).join("\n")}

CREATE TABLE physiqueos.canonical_relationships (
  owner_user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  relationship_type text NOT NULL,
  from_collection text NOT NULL,
  from_record_id text NOT NULL,
  to_collection text NOT NULL,
  to_record_id text NOT NULL,
  provenance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, relationship_type, from_collection, from_record_id, to_collection, to_record_id)
);
CREATE INDEX canonical_relationships_target_idx
  ON physiqueos.canonical_relationships(owner_user_id, to_collection, to_record_id);

CREATE TABLE physiqueos.canonical_media_objects (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  evidence_collection text NOT NULL,
  evidence_record_id text NOT NULL,
  original_filename text,
  content_type text NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text NOT NULL UNIQUE,
  observed_at timestamptz,
  provenance jsonb,
  state text NOT NULL DEFAULT 'verified' CHECK (state IN ('verified', 'quarantined', 'tombstoned')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, sha256, evidence_collection, evidence_record_id)
);
CREATE INDEX canonical_media_objects_owner_evidence_idx
  ON physiqueos.canonical_media_objects(owner_user_id, evidence_collection, evidence_record_id);

CREATE TABLE physiqueos.phase4_import_runs (
  id text PRIMARY KEY,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  import_digest char(64) CHECK (import_digest IS NULL OR import_digest ~ '^[0-9a-f]{64}$'),
  target_database text NOT NULL,
  result text NOT NULL CHECK (result IN ('running', 'succeeded', 'failed')),
  collection_counts jsonb NOT NULL,
  report jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
`;

const PHASE4_DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.phase4_import_runs;
DROP TABLE IF EXISTS physiqueos.canonical_media_objects;
DROP TABLE IF EXISTS physiqueos.canonical_relationships;
${[...DOMAIN_TABLES].reverse().map((table) => `DROP TABLE IF EXISTS physiqueos.${table};`).join("\n")}
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(PHASE4_UP_SQL);
exports.down = (pgm) => pgm.sql(PHASE4_DOWN_SQL);
exports.DOMAIN_TABLES = DOMAIN_TABLES;
exports.PHASE4_UP_SQL = PHASE4_UP_SQL;
exports.PHASE4_DOWN_SQL = PHASE4_DOWN_SQL;
