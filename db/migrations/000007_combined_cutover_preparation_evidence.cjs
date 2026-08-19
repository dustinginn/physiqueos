// Durable, operation-bound evidence for the combined-cutover PREPARATION phase: canonical import,
// parity verification, and provider-prepared acknowledgement eligibility.
//
// WHY NOT `phase4_import_runs`. That table (migration 000003) is the OLD single-machine migration
// path's evidence: its primary key is a `migrationId` deterministically derived from the source
// runtime's SHA-256 alone, with no operationId dimension at all, and its `ON CONFLICT (id) DO
// UPDATE` will happily overwrite `package_digest` for an unchanged `migrationId` without ever
// checking the old and new digests agree. That is exactly the "silently overwrite... from another
// operation" failure mode the combined-cutover import contract must refuse. It also has no
// media-import accounting and no parity/acknowledgement fields at all. It remains exactly as it
// was for the old path; this is a new, narrow, additive table for the combined-cutover path only.
//
// WHY ONE TABLE FOR THREE RESPONSIBILITIES. Import, parity, and acknowledgement evidence are three
// phases of ONE cutover operation's preparation, are all small (status/count/digest/timestamp
// fields, never payload contents), and a restarted provider process needs all three together to
// decide whether the operation may safely continue - splitting them into three tables would only
// require joining them back on every read for no isolation benefit, since all three phases already
// share the same commitment to database transactions/operation identity.
//
// EVIDENCE ONLY. Rows here never confer runtime authority, never import canonical data by existing,
// and are never consulted by `combined_runtime_authority` or `claimCanonicalWriteBoundary`.

const UP_SQL = String.raw`
CREATE TABLE physiqueos.combined_cutover_preparation_receipts (
  receipt_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  migration_operation_id text NOT NULL UNIQUE,
  authorization_fingerprint char(64) NOT NULL CHECK (authorization_fingerprint ~ '^[0-9a-f]{64}$'),
  fence_id text NOT NULL,
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  target_database text NOT NULL,

  import_status text NOT NULL DEFAULT 'pending' CHECK (import_status IN ('pending', 'running', 'succeeded', 'failed')),
  import_started_at timestamptz,
  import_completed_at timestamptz,
  imported_collection_counts jsonb,
  import_digest char(64) CHECK (import_digest IS NULL OR import_digest ~ '^[0-9a-f]{64}$'),

  media_status text NOT NULL DEFAULT 'pending' CHECK (media_status IN ('pending', 'running', 'succeeded', 'failed')),
  media_object_count integer,
  media_byte_length bigint CHECK (media_byte_length IS NULL OR media_byte_length >= 0),

  parity_status text NOT NULL DEFAULT 'pending' CHECK (parity_status IN ('pending', 'passed', 'failed')),
  parity_checked_at timestamptz,
  parity_read_surface_count integer,

  prepared_status text NOT NULL DEFAULT 'pending' CHECK (prepared_status IN ('pending', 'acknowledged')),
  prepared_acknowledged_at timestamptz,
  provider_deployment_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (import_status <> 'succeeded' OR (import_completed_at IS NOT NULL AND imported_collection_counts IS NOT NULL AND import_digest IS NOT NULL)),
  CHECK (media_status <> 'succeeded' OR media_object_count IS NOT NULL),
  CHECK (parity_status <> 'passed' OR parity_checked_at IS NOT NULL),
  CHECK (prepared_status <> 'acknowledged' OR (
    prepared_acknowledged_at IS NOT NULL AND provider_deployment_id IS NOT NULL
    AND import_status = 'succeeded' AND media_status = 'succeeded' AND parity_status = 'passed'
  ))
);

CREATE INDEX combined_cutover_preparation_receipts_status_idx
  ON physiqueos.combined_cutover_preparation_receipts(migration_operation_id, prepared_status);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.combined_cutover_preparation_receipts;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
