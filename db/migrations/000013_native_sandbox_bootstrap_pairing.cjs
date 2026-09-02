const UP_SQL = String.raw`
ALTER TABLE physiqueos.recovery_credentials
  ADD CONSTRAINT recovery_credentials_id_user_unique UNIQUE (id, user_id);

ALTER TABLE physiqueos.pairing_credentials
  ALTER COLUMN issued_by_session_id DROP NOT NULL,
  ADD COLUMN issued_by_recovery_credential_id text,
  ADD CONSTRAINT pairing_credentials_recovery_issuer_unique UNIQUE (issued_by_recovery_credential_id),
  ADD CONSTRAINT pairing_credentials_recovery_issuer_owner_fk
    FOREIGN KEY (issued_by_recovery_credential_id, user_id)
    REFERENCES physiqueos.recovery_credentials(id, user_id) ON DELETE CASCADE,
  ADD CONSTRAINT pairing_credentials_exactly_one_issuer_check CHECK (
    (issued_by_session_id IS NOT NULL AND issued_by_recovery_credential_id IS NULL)
    OR
    (issued_by_session_id IS NULL AND issued_by_recovery_credential_id IS NOT NULL)
  );
`;

const DOWN_SQL = String.raw`
ALTER TABLE physiqueos.pairing_credentials
  DROP CONSTRAINT IF EXISTS pairing_credentials_exactly_one_issuer_check,
  DROP CONSTRAINT IF EXISTS pairing_credentials_recovery_issuer_owner_fk,
  DROP CONSTRAINT IF EXISTS pairing_credentials_recovery_issuer_unique,
  DROP COLUMN IF EXISTS issued_by_recovery_credential_id,
  ALTER COLUMN issued_by_session_id SET NOT NULL;

ALTER TABLE physiqueos.recovery_credentials
  DROP CONSTRAINT IF EXISTS recovery_credentials_id_user_unique;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
