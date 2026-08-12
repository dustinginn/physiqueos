const PHASE5_UP_SQL = String.raw`
ALTER TABLE physiqueos.canonical_media_objects
  ADD COLUMN provider_version text,
  ADD COLUMN provider_etag text;

CREATE TABLE physiqueos.phase5_validation_runs (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  database_digest char(64) NOT NULL CHECK (database_digest ~ '^[0-9a-f]{64}$'),
  object_digest char(64) CHECK (object_digest IS NULL OR object_digest ~ '^[0-9a-f]{64}$'),
  result text NOT NULL CHECK (result IN ('running', 'succeeded', 'failed')),
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX phase5_validation_runs_owner_started_idx
  ON physiqueos.phase5_validation_runs(owner_user_id, started_at DESC);
`;

const PHASE5_DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.phase5_validation_runs;
ALTER TABLE physiqueos.canonical_media_objects
  DROP COLUMN IF EXISTS provider_etag,
  DROP COLUMN IF EXISTS provider_version;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(PHASE5_UP_SQL);
exports.down = (pgm) => pgm.sql(PHASE5_DOWN_SQL);
exports.PHASE5_UP_SQL = PHASE5_UP_SQL;
exports.PHASE5_DOWN_SQL = PHASE5_DOWN_SQL;
