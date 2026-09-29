const UP_SQL = String.raw`
ALTER TABLE physiqueos.devices
  ADD COLUMN refresh_proof_capability integer NOT NULL DEFAULT 0
  CHECK (refresh_proof_capability IN (0, 1));

CREATE TABLE physiqueos.installation_signing_keys (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  device_id text NOT NULL UNIQUE REFERENCES physiqueos.devices(id) ON DELETE CASCADE,
  algorithm text NOT NULL CHECK (algorithm = 'ES256'),
  public_key_spki bytea NOT NULL,
  thumbprint char(64) NOT NULL UNIQUE CHECK (thumbprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT installation_signing_keys_owner_fk FOREIGN KEY (device_id, user_id)
    REFERENCES physiqueos.devices(id, user_id) ON DELETE CASCADE
);

ALTER TABLE physiqueos.sessions
  ADD COLUMN refresh_proof_version integer NOT NULL DEFAULT 0
    CHECK (refresh_proof_version IN (0, 1)),
  ADD COLUMN installation_key_id text REFERENCES physiqueos.installation_signing_keys(id) ON DELETE RESTRICT,
  ADD CONSTRAINT sessions_refresh_proof_binding_check CHECK (
    (refresh_proof_version = 0 AND installation_key_id IS NULL)
    OR
    (refresh_proof_version = 1 AND installation_key_id IS NOT NULL)
  );

ALTER TABLE physiqueos.access_credentials
  ADD COLUMN first_used_at timestamptz;

CREATE TABLE physiqueos.refresh_proof_challenges (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  device_id text NOT NULL,
  session_id text NOT NULL,
  family_id text NOT NULL,
  refresh_credential_id text NOT NULL REFERENCES physiqueos.refresh_credentials(id) ON DELETE CASCADE,
  installation_key_id text NOT NULL REFERENCES physiqueos.installation_signing_keys(id) ON DELETE CASCADE,
  nonce_digest char(64) NOT NULL UNIQUE CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
  intent_digest char(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  successor_commitment_digest char(64) NOT NULL CHECK (successor_commitment_digest ~ '^[0-9a-f]{64}$'),
  proof_id_digest char(64) UNIQUE CHECK (proof_id_digest IS NULL OR proof_id_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_proof_challenges_session_owner_fk FOREIGN KEY (session_id, user_id, device_id)
    REFERENCES physiqueos.sessions(id, user_id, device_id) ON DELETE CASCADE
);
CREATE INDEX refresh_proof_challenges_expiry_idx ON physiqueos.refresh_proof_challenges(expires_at);

CREATE TABLE physiqueos.refresh_exchanges (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  device_id text NOT NULL,
  session_id text NOT NULL,
  family_id text NOT NULL,
  installation_key_id text NOT NULL REFERENCES physiqueos.installation_signing_keys(id) ON DELETE RESTRICT,
  predecessor_refresh_id text NOT NULL UNIQUE REFERENCES physiqueos.refresh_credentials(id) ON DELETE RESTRICT,
  successor_refresh_id text NOT NULL UNIQUE REFERENCES physiqueos.refresh_credentials(id) ON DELETE RESTRICT,
  intent_digest char(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  successor_commitment_digest char(64) NOT NULL CHECK (successor_commitment_digest ~ '^[0-9a-f]{64}$'),
  recovery_expires_at timestamptz NOT NULL,
  recovery_count integer NOT NULL DEFAULT 0 CHECK (recovery_count >= 0),
  maximum_recoveries integer NOT NULL CHECK (maximum_recoveries > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_exchanges_session_owner_fk FOREIGN KEY (session_id, user_id, device_id)
    REFERENCES physiqueos.sessions(id, user_id, device_id) ON DELETE CASCADE
);

CREATE TABLE physiqueos.refresh_exchange_access_credentials (
  exchange_id text NOT NULL REFERENCES physiqueos.refresh_exchanges(id) ON DELETE CASCADE,
  access_credential_id text NOT NULL UNIQUE REFERENCES physiqueos.access_credentials(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange_id, access_credential_id)
);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.refresh_exchange_access_credentials;
DROP TABLE IF EXISTS physiqueos.refresh_exchanges;
DROP TABLE IF EXISTS physiqueos.refresh_proof_challenges;

ALTER TABLE physiqueos.access_credentials
  DROP COLUMN IF EXISTS first_used_at;

ALTER TABLE physiqueos.sessions
  DROP CONSTRAINT IF EXISTS sessions_refresh_proof_binding_check,
  DROP COLUMN IF EXISTS installation_key_id,
  DROP COLUMN IF EXISTS refresh_proof_version;

DROP TABLE IF EXISTS physiqueos.installation_signing_keys;

ALTER TABLE physiqueos.devices
  DROP COLUMN IF EXISTS refresh_proof_capability;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
