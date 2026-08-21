// Narrow external A-P coordinator evidence. Domain receipts remain authoritative; this row stores
// only run/CAS state, safe evidence references, bound approval fingerprints, and the pre-mutation B
// restoration snapshot required for resumable pre-M recovery.
const UP_SQL = String.raw`
CREATE TABLE physiqueos.combined_cutover_coordinator_runs (
  run_id text PRIMARY KEY CHECK (run_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  coordinator_operation_id text NOT NULL,
  migration_operation_id text NOT NULL UNIQUE,
  environment text NOT NULL,
  authorization_fingerprint char(64) NOT NULL CHECK (authorization_fingerprint ~ '^[0-9a-f]{64}$'),
  input_digest char(64) NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  current_step text NOT NULL DEFAULT 'A' CHECK (current_step IN ('A','B','C_D','E','F_G','H_I_J','K','L','M','N_O','P','COMPLETE')),
  step_status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (step_status IN (
    'NOT_STARTED','IN_PROGRESS_OR_UNRESOLVED','COMPLETED','FAILED_CONCLUSIVE','FAILED_AMBIGUOUS',
    'BLOCKED_PRECONDITION','IRREVERSIBLE_BOUNDARY_CROSSED','ABORTED_TO_WINDOWS','PROVIDER_FORWARD_RECOVERY'
  )),
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_steps) = 'array'),
  evidence_refs jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'object'),
  approval_fingerprints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(approval_fingerprints) = 'object'),
  b_snapshot jsonb,
  b_snapshot_digest char(64) CHECK (b_snapshot_digest IS NULL OR b_snapshot_digest ~ '^[0-9a-f]{64}$'),
  m_boundary_crossed boolean NOT NULL DEFAULT false,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((b_snapshot IS NULL) = (b_snapshot_digest IS NULL)),
  CHECK (b_snapshot IS NULL OR jsonb_typeof(b_snapshot) = 'object'),
  CHECK (NOT m_boundary_crossed OR completed_steps ? 'M')
);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.combined_cutover_coordinator_runs;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
