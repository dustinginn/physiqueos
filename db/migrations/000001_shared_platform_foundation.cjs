const FOUNDATION_UP_SQL = String.raw`
CREATE SCHEMA IF NOT EXISTS physiqueos;

CREATE TABLE physiqueos.users (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.user_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  time_zone text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  platform text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_id_idx ON physiqueos.devices(user_id);

CREATE TABLE physiqueos.sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES physiqueos.devices(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  authenticated_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_device_idx ON physiqueos.sessions(user_id, device_id);

CREATE TABLE physiqueos.access_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES physiqueos.devices(id) ON DELETE RESTRICT,
  session_id text NOT NULL REFERENCES physiqueos.sessions(id) ON DELETE CASCADE,
  credential_hash text NOT NULL UNIQUE,
  hash_algorithm text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_credentials_session_idx ON physiqueos.access_credentials(session_id);

CREATE TABLE physiqueos.refresh_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES physiqueos.devices(id) ON DELETE RESTRICT,
  session_id text NOT NULL REFERENCES physiqueos.sessions(id) ON DELETE CASCADE,
  family_id text NOT NULL,
  credential_hash text NOT NULL UNIQUE,
  hash_algorithm text NOT NULL,
  replaced_by_id text,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_credentials_replacement_fk FOREIGN KEY (replaced_by_id) REFERENCES physiqueos.refresh_credentials(id) ON DELETE RESTRICT
);
CREATE INDEX refresh_credentials_family_idx ON physiqueos.refresh_credentials(user_id, family_id);

CREATE TABLE physiqueos.recovery_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  credential_hash text NOT NULL UNIQUE,
  hash_algorithm text NOT NULL,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.operations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  operation_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  result jsonb,
  problem jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operations_user_status_idx ON physiqueos.operations(user_id, status, created_at);

CREATE TABLE physiqueos.command_receipts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES physiqueos.devices(id) ON DELETE RESTRICT,
  session_id text NOT NULL REFERENCES physiqueos.sessions(id) ON DELETE RESTRICT,
  command_id text NOT NULL,
  idempotency_key text NOT NULL,
  command_type text NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'committed', 'rejected', 'failed')),
  result jsonb,
  operation_id text REFERENCES physiqueos.operations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (user_id, idempotency_key),
  UNIQUE (user_id, command_id)
);

CREATE TABLE physiqueos.outbox_messages (
  id text PRIMARY KEY,
  user_id text REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  operation_id text REFERENCES physiqueos.operations(id) ON DELETE SET NULL,
  topic text NOT NULL,
  dedupe_key text NOT NULL,
  payload_version text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead')),
  due_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claim_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic, dedupe_key)
);
CREATE INDEX outbox_claim_idx ON physiqueos.outbox_messages(status, due_at, claim_expires_at);

CREATE TABLE physiqueos.stored_objects (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('created', 'uploading', 'verified', 'quarantined', 'tombstoned', 'purged')),
  bucket text,
  object_key text,
  provider_version text,
  content_type text NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  sha256 char(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  provenance jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  verified_at timestamptz,
  tombstoned_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_key, provider_version)
);
CREATE INDEX stored_objects_user_state_idx ON physiqueos.stored_objects(user_id, state);

CREATE TABLE physiqueos.upload_intents (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  object_id text NOT NULL UNIQUE REFERENCES physiqueos.stored_objects(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('created', 'uploading', 'completed', 'aborted', 'expired', 'failed')),
  expected_byte_length bigint NOT NULL CHECK (expected_byte_length >= 0),
  expected_sha256 char(64) CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[0-9a-f]{64}$'),
  provider_upload_id text,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.worker_heartbeats (
  worker_id text PRIMARY KEY,
  build_id text NOT NULL,
  status text NOT NULL,
  observed_at timestamptz NOT NULL,
  details jsonb
);

CREATE TABLE physiqueos.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  platforms text[],
  minimum_build bigint,
  configuration jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.migration_runs (
  id text PRIMARY KEY,
  manifest_version text NOT NULL,
  source_repository_revision text NOT NULL,
  source_runtime_version text NOT NULL,
  source_runtime_revision text NOT NULL,
  source_runtime_sha256 char(64) NOT NULL CHECK (source_runtime_sha256 ~ '^[0-9a-f]{64}$'),
  importer_version text NOT NULL,
  target_schema_version text NOT NULL,
  semantic_digest char(64) NOT NULL CHECK (semantic_digest ~ '^[0-9a-f]{64}$'),
  result text NOT NULL CHECK (result IN ('pending', 'succeeded', 'failed')),
  validation_result text NOT NULL CHECK (validation_result IN ('pending', 'succeeded', 'failed')),
  report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
`;

const FOUNDATION_DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.migration_runs;
DROP TABLE IF EXISTS physiqueos.feature_flags;
DROP TABLE IF EXISTS physiqueos.worker_heartbeats;
DROP TABLE IF EXISTS physiqueos.upload_intents;
DROP TABLE IF EXISTS physiqueos.stored_objects;
DROP TABLE IF EXISTS physiqueos.outbox_messages;
DROP TABLE IF EXISTS physiqueos.command_receipts;
DROP TABLE IF EXISTS physiqueos.operations;
DROP TABLE IF EXISTS physiqueos.recovery_credentials;
DROP TABLE IF EXISTS physiqueos.refresh_credentials;
DROP TABLE IF EXISTS physiqueos.access_credentials;
DROP TABLE IF EXISTS physiqueos.sessions;
DROP TABLE IF EXISTS physiqueos.devices;
DROP TABLE IF EXISTS physiqueos.user_profiles;
DROP TABLE IF EXISTS physiqueos.users;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(FOUNDATION_UP_SQL);
exports.down = (pgm) => pgm.sql(FOUNDATION_DOWN_SQL);
exports.FOUNDATION_UP_SQL = FOUNDATION_UP_SQL;
exports.FOUNDATION_DOWN_SQL = FOUNDATION_DOWN_SQL;
