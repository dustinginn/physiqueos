const UP_SQL = String.raw`
CREATE TABLE physiqueos.evidence_intake_receipts (
  id text PRIMARY KEY,
  submission_identity text NOT NULL,
  owner_user_id text NOT NULL REFERENCES physiqueos.users(id) ON DELETE RESTRICT,
  effective_date date NOT NULL,
  expected_evidence_type text NOT NULL DEFAULT 'auto',
  source text NOT NULL DEFAULT 'universal_intake',
  artifact_manifest jsonb NOT NULL CHECK (jsonb_typeof(artifact_manifest) = 'object'),
  manifest_sha256 char(64) NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  typed_evidence text,
  typed_evidence_sha256 char(64) CHECK (typed_evidence_sha256 IS NULL OR typed_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recovery_context jsonb,
  media_state text NOT NULL CHECK (media_state IN ('receiving','stored','failed')),
  stored_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stored_artifacts) = 'array'),
  upload_claimed_by text,
  upload_claim_expires_at timestamptz,
  interpretation_state text NOT NULL CHECK (interpretation_state IN ('waiting_for_media','pending','processing','completed','failed')),
  interpretation_claimed_by text,
  interpretation_claim_expires_at timestamptz,
  package_id text,
  review_id text,
  last_error_code text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  interpretation_started_at timestamptz,
  interpretation_completed_at timestamptz,
  UNIQUE (owner_user_id, submission_identity)
);
CREATE INDEX evidence_intake_receipts_owner_state_idx
  ON physiqueos.evidence_intake_receipts(owner_user_id, interpretation_state, created_at);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.evidence_intake_receipts;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
