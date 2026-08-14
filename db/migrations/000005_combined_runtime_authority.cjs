const UP_SQL = String.raw`
CREATE TABLE physiqueos.combined_runtime_authority (
  environment text PRIMARY KEY,
  version bigint NOT NULL CHECK (version > 0),
  authority text NOT NULL CHECK (authority IN (
    'windows-legacy-authoritative', 'combined-cutover-in-progress', 'provider-prepared',
    'provider-authoritative', 'recovery-required'
  )),
  migration_operation_id text,
  authorization_fingerprint char(64),
  fence_id text,
  canonical_store_epoch text NOT NULL CHECK (canonical_store_epoch IN ('legacy-json', 'postgres-canonical')),
  composition_mode text NOT NULL CHECK (composition_mode IN ('legacy-json', 'postgres')),
  public_runtime_authority text NOT NULL CHECK (public_runtime_authority IN ('windows', 'provider')),
  migration_control_authority text NOT NULL CHECK (migration_control_authority IN ('windows', 'provider')),
  worker_authority text NOT NULL CHECK (worker_authority IN ('windows', 'paused', 'provider')),
  writes_enabled boolean NOT NULL,
  reads_enabled boolean NOT NULL,
  first_provider_canonical_write_at timestamptz,
  first_provider_command_id text,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (authorization_fingerprint IS NULL OR authorization_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK (first_provider_canonical_write_at IS NULL OR (
    public_runtime_authority='provider' AND canonical_store_epoch='postgres-canonical' AND composition_mode='postgres'
  )),
  CHECK (authority <> 'recovery-required' OR (writes_enabled=false AND worker_authority='paused'))
);

CREATE UNIQUE INDEX combined_runtime_authority_active_operation_idx
  ON physiqueos.combined_runtime_authority(migration_operation_id)
  WHERE migration_operation_id IS NOT NULL;

CREATE TABLE physiqueos.combined_runtime_authority_audit (
  id bigserial PRIMARY KEY,
  environment text NOT NULL REFERENCES physiqueos.combined_runtime_authority(environment) ON DELETE RESTRICT,
  state_version bigint NOT NULL CHECK (state_version > 0),
  command_id text NOT NULL,
  command_fingerprint char(64) NOT NULL CHECK (command_fingerprint ~ '^[0-9a-f]{64}$'),
  migration_operation_id text,
  action text NOT NULL,
  previous_authority text,
  next_authority text NOT NULL,
  result text NOT NULL CHECK (result IN ('committed', 'rejected')),
  error_code text,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, command_id),
  UNIQUE (environment, state_version)
);

CREATE TABLE physiqueos.combined_transfer_receipts (
  migration_operation_id text PRIMARY KEY,
  authorization_fingerprint char(64) NOT NULL CHECK (authorization_fingerprint ~ '^[0-9a-f]{64}$'),
  fence_id text NOT NULL,
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  runtime_sha256 char(64) NOT NULL CHECK (runtime_sha256 ~ '^[0-9a-f]{64}$'),
  media_inventory_sha256 char(64) NOT NULL CHECK (media_inventory_sha256 ~ '^[0-9a-f]{64}$'),
  migration_control_sha256 char(64) NOT NULL CHECK (migration_control_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('declared', 'receiving', 'verified', 'consumed', 'failed')),
  manifest jsonb NOT NULL,
  receipt jsonb,
  provider_deployment_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  consumed_at timestamptz
);

CREATE TABLE physiqueos.canonical_runtime_metadata (
  owner_user_id text PRIMARY KEY REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision >= 0),
  runtime_version text NOT NULL,
  source_runtime_sha256 char(64) NOT NULL CHECK (source_runtime_sha256 ~ '^[0-9a-f]{64}$'),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz NOT NULL,
  last_command_id text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.canonical_application_context (
  owner_user_id text PRIMARY KEY REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  operating_rhythm jsonb,
  adaptive_trust_profile jsonb,
  retired_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(retired_milestones)='array')
);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.canonical_application_context;
DROP TABLE IF EXISTS physiqueos.canonical_runtime_metadata;
DROP TABLE IF EXISTS physiqueos.combined_transfer_receipts;
DROP TABLE IF EXISTS physiqueos.combined_runtime_authority_audit;
DROP TABLE IF EXISTS physiqueos.combined_runtime_authority;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
