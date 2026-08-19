// Durable, operation-bound routing-intent evidence for the combined-cutover AUTHORITY/ROUTING
// HANDOFF phase (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase L). This is deliberately
// separate from `physiqueos.combined_cutover_preparation_receipts` (migration 000007): preparation's
// own semantics end at "provider-prepared" (import/media/parity/acknowledged), a phase before this
// one, so overloading it with handoff facts would blur two different lifecycles onto one row.
//
// NOT A SECOND AUTHORITY STATE MACHINE. `physiqueos.combined_runtime_authority` remains the sole
// authoritative source for `authority` and `first_provider_canonical_write_at`. Rows here are
// diagnostic/recovery evidence only - which routing state was expected before handoff, which
// provider target and deployment were intended, whether the authority transition committed, and
// whether routing activation committed, remained pending, or failed. A future `restoreWindowsAuthority`
// implementation reads this evidence to decide whether routing must be reversed before Windows
// authority is restored (see the "Authority transferred but no provider canonical write" row of the
// governing document's rollback/recovery matrix), but this table never decides authority itself.
//
// No secrets, no canonical payload content - only identifiers, small non-secret route-state
// snapshots, status enums, and timestamps.

const UP_SQL = String.raw`
CREATE TABLE physiqueos.combined_cutover_handoff_receipts (
  receipt_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  migration_operation_id text NOT NULL UNIQUE,
  authorization_fingerprint char(64) NOT NULL CHECK (authorization_fingerprint ~ '^[0-9a-f]{64}$'),
  fence_id text NOT NULL,
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  routing_target text NOT NULL,
  provider_deployment_id text NOT NULL,

  expected_route_snapshot jsonb,

  authority_status text NOT NULL DEFAULT 'pending' CHECK (authority_status IN ('pending', 'committed')),
  authority_committed_at timestamptz,
  resulting_authority text,

  routing_status text NOT NULL DEFAULT 'pending' CHECK (routing_status IN ('pending', 'activated', 'verified', 'failed')),
  routing_activated_at timestamptz,
  routing_verified_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (authority_status <> 'committed' OR (authority_committed_at IS NOT NULL AND resulting_authority IS NOT NULL)),
  CHECK (routing_status NOT IN ('activated', 'verified') OR routing_activated_at IS NOT NULL),
  CHECK (routing_status <> 'verified' OR routing_verified_at IS NOT NULL)
);

CREATE INDEX combined_cutover_handoff_receipts_status_idx
  ON physiqueos.combined_cutover_handoff_receipts(migration_operation_id, authority_status, routing_status);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.combined_cutover_handoff_receipts;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
