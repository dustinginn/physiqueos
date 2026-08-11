const PHASE2_UP_SQL = String.raw`
ALTER TABLE physiqueos.devices
  ADD CONSTRAINT devices_id_user_unique UNIQUE (id, user_id);

ALTER TABLE physiqueos.sessions
  ADD COLUMN refresh_family_id text,
  ADD COLUMN last_seen_at timestamptz,
  ADD CONSTRAINT sessions_id_user_unique UNIQUE (id, user_id),
  ADD CONSTRAINT sessions_id_user_device_unique UNIQUE (id, user_id, device_id),
  ADD CONSTRAINT sessions_device_owner_fk FOREIGN KEY (device_id, user_id)
    REFERENCES physiqueos.devices(id, user_id) ON DELETE RESTRICT;

ALTER TABLE physiqueos.access_credentials
  ADD CONSTRAINT access_credentials_device_owner_fk FOREIGN KEY (device_id, user_id)
    REFERENCES physiqueos.devices(id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT access_credentials_session_owner_fk FOREIGN KEY (session_id, user_id, device_id)
    REFERENCES physiqueos.sessions(id, user_id, device_id) ON DELETE CASCADE;

ALTER TABLE physiqueos.refresh_credentials
  ADD CONSTRAINT refresh_credentials_device_owner_fk FOREIGN KEY (device_id, user_id)
    REFERENCES physiqueos.devices(id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT refresh_credentials_session_owner_fk FOREIGN KEY (session_id, user_id, device_id)
    REFERENCES physiqueos.sessions(id, user_id, device_id) ON DELETE CASCADE;

ALTER TABLE physiqueos.command_receipts
  ADD CONSTRAINT command_receipts_device_owner_fk FOREIGN KEY (device_id, user_id)
    REFERENCES physiqueos.devices(id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT command_receipts_session_owner_fk FOREIGN KEY (session_id, user_id, device_id)
    REFERENCES physiqueos.sessions(id, user_id, device_id) ON DELETE RESTRICT;

ALTER TABLE physiqueos.operations
  ADD CONSTRAINT operations_id_user_unique UNIQUE (id, user_id);

ALTER TABLE physiqueos.command_receipts
  ADD CONSTRAINT command_receipts_operation_owner_fk FOREIGN KEY (operation_id, user_id)
    REFERENCES physiqueos.operations(id, user_id) ON DELETE RESTRICT;

ALTER TABLE physiqueos.outbox_messages
  ADD CONSTRAINT outbox_operation_owner_fk FOREIGN KEY (operation_id, user_id)
    REFERENCES physiqueos.operations(id, user_id) ON DELETE RESTRICT;

ALTER TABLE physiqueos.stored_objects
  ADD CONSTRAINT stored_objects_id_user_unique UNIQUE (id, user_id);

ALTER TABLE physiqueos.upload_intents
  DROP CONSTRAINT upload_intents_state_check,
  ADD CONSTRAINT upload_intents_state_check CHECK (state IN ('created', 'uploading', 'completing', 'completed', 'aborted', 'expired', 'failed')),
  ADD COLUMN completion_receipt_hash char(64),
  ADD COLUMN provider_etag text,
  ADD COLUMN provider_version text,
  ADD CONSTRAINT upload_intents_receipt_hash_check CHECK (
    completion_receipt_hash IS NULL OR completion_receipt_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT upload_intents_completion_receipt_unique UNIQUE (completion_receipt_hash),
  ADD CONSTRAINT upload_intents_object_owner_fk FOREIGN KEY (object_id, user_id)
    REFERENCES physiqueos.stored_objects(id, user_id) ON DELETE RESTRICT;

ALTER TABLE physiqueos.outbox_messages
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN dead_at timestamptz,
  ADD COLUMN last_error_detail text;

CREATE TABLE physiqueos.auth_challenges (
  id text PRIMARY KEY,
  user_id text REFERENCES physiqueos.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('founder_enrollment', 'passkey_registration', 'passkey_authentication', 'device_pairing')),
  challenge_hash char(64) NOT NULL UNIQUE CHECK (challenge_hash ~ '^[0-9a-f]{64}$'),
  context jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_challenges_user_purpose_idx ON physiqueos.auth_challenges(user_id, purpose, expires_at);

CREATE TABLE physiqueos.passkey_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  credential_external_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports text[],
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX passkey_credentials_user_idx ON physiqueos.passkey_credentials(user_id);

CREATE TABLE physiqueos.pairing_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  issued_by_session_id text NOT NULL REFERENCES physiqueos.sessions(id) ON DELETE CASCADE,
  credential_hash text NOT NULL UNIQUE,
  hash_algorithm text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pairing_credentials_user_expiry_idx ON physiqueos.pairing_credentials(user_id, expires_at);
ALTER TABLE physiqueos.pairing_credentials
  ADD CONSTRAINT pairing_credentials_session_owner_fk FOREIGN KEY (issued_by_session_id, user_id)
    REFERENCES physiqueos.sessions(id, user_id) ON DELETE CASCADE;

CREATE TABLE physiqueos.device_security_states (
  device_id text PRIMARY KEY REFERENCES physiqueos.devices(id) ON DELETE CASCADE,
  pin_failure_count integer NOT NULL DEFAULT 0 CHECK (pin_failure_count >= 0),
  retry_after timestamptz,
  recovery_required boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physiqueos.security_events (
  id text PRIMARY KEY,
  user_id text REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  device_id text REFERENCES physiqueos.devices(id) ON DELETE SET NULL,
  session_id text REFERENCES physiqueos.sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'revoked', 'expired')),
  correlation_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_events_user_created_idx ON physiqueos.security_events(user_id, created_at DESC);
ALTER TABLE physiqueos.security_events
  ADD CONSTRAINT security_events_device_owner_fk FOREIGN KEY (device_id, user_id)
    REFERENCES physiqueos.devices(id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT security_events_session_owner_fk FOREIGN KEY (session_id, user_id)
    REFERENCES physiqueos.sessions(id, user_id) ON DELETE RESTRICT;

CREATE TABLE physiqueos.backup_runs (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('database', 'objects', 'combined')),
  status text NOT NULL CHECK (status IN ('started', 'verified', 'failed')),
  schema_version text NOT NULL,
  build_id text NOT NULL,
  manifest_sha256 char(64) CHECK (manifest_sha256 IS NULL OR manifest_sha256 ~ '^[0-9a-f]{64}$'),
  object_count bigint CHECK (object_count IS NULL OR object_count >= 0),
  byte_length bigint CHECK (byte_length IS NULL OR byte_length >= 0),
  details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
`;

const PHASE2_DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.backup_runs;
DROP TABLE IF EXISTS physiqueos.security_events;
DROP TABLE IF EXISTS physiqueos.device_security_states;
DROP TABLE IF EXISTS physiqueos.pairing_credentials;
DROP TABLE IF EXISTS physiqueos.passkey_credentials;
DROP TABLE IF EXISTS physiqueos.auth_challenges;

ALTER TABLE physiqueos.outbox_messages
  DROP COLUMN IF EXISTS last_error_detail,
  DROP COLUMN IF EXISTS dead_at,
  DROP COLUMN IF EXISTS completed_at;

ALTER TABLE physiqueos.upload_intents
  DROP CONSTRAINT IF EXISTS upload_intents_object_owner_fk,
  DROP CONSTRAINT IF EXISTS upload_intents_completion_receipt_unique,
  DROP CONSTRAINT IF EXISTS upload_intents_receipt_hash_check,
  DROP COLUMN IF EXISTS provider_version,
  DROP COLUMN IF EXISTS provider_etag,
  DROP COLUMN IF EXISTS completion_receipt_hash;

ALTER TABLE physiqueos.upload_intents
  DROP CONSTRAINT IF EXISTS upload_intents_state_check,
  ADD CONSTRAINT upload_intents_state_check CHECK (state IN ('created', 'uploading', 'completed', 'aborted', 'expired', 'failed'));

ALTER TABLE physiqueos.stored_objects
  DROP CONSTRAINT IF EXISTS stored_objects_id_user_unique;

ALTER TABLE physiqueos.command_receipts
  DROP CONSTRAINT IF EXISTS command_receipts_operation_owner_fk,
  DROP CONSTRAINT IF EXISTS command_receipts_session_owner_fk,
  DROP CONSTRAINT IF EXISTS command_receipts_device_owner_fk;

ALTER TABLE physiqueos.outbox_messages
  DROP CONSTRAINT IF EXISTS outbox_operation_owner_fk;

ALTER TABLE physiqueos.operations
  DROP CONSTRAINT IF EXISTS operations_id_user_unique;

ALTER TABLE physiqueos.refresh_credentials
  DROP CONSTRAINT IF EXISTS refresh_credentials_session_owner_fk,
  DROP CONSTRAINT IF EXISTS refresh_credentials_device_owner_fk;

ALTER TABLE physiqueos.access_credentials
  DROP CONSTRAINT IF EXISTS access_credentials_session_owner_fk,
  DROP CONSTRAINT IF EXISTS access_credentials_device_owner_fk;

ALTER TABLE physiqueos.sessions
  DROP CONSTRAINT IF EXISTS sessions_device_owner_fk,
  DROP CONSTRAINT IF EXISTS sessions_id_user_device_unique,
  DROP CONSTRAINT IF EXISTS sessions_id_user_unique,
  DROP COLUMN IF EXISTS last_seen_at,
  DROP COLUMN IF EXISTS refresh_family_id;

ALTER TABLE physiqueos.devices
  DROP CONSTRAINT IF EXISTS devices_id_user_unique;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(PHASE2_UP_SQL);
exports.down = (pgm) => pgm.sql(PHASE2_DOWN_SQL);
exports.PHASE2_UP_SQL = PHASE2_UP_SQL;
exports.PHASE2_DOWN_SQL = PHASE2_DOWN_SQL;
