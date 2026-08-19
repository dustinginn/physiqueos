// Phase 6C additive extension of the existing Phase 5 handoff receipts table (migration 000008,
// already extended once by Phase 6A's migration 000009 for pre-boundary Windows-routing-recovery
// evidence) with WORKER handoff evidence - "release writes only through the provider platform, start
// the authority-gated worker" (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase N/O).
//
// REUSED, NOT DUPLICATED. Worker handoff happens for the SAME operation, immediately after the SAME
// authority transfer this receipt already tracks - it is a continuation of the same operational
// lifecycle, not a distinct concern, so extending this row keeps one place of truth per operation
// instead of starting a second evidence lifecycle. The row's existing `provider_deployment_id` column
// (migration 000008) is reused as-is for worker deployment-identity verification: it is the same
// provider deployment the worker belongs to.
//
// NOT A SECOND AUTHORITY OR WORKER STATE MACHINE. `physiqueos.combined_runtime_authority.worker_authority`
// remains the sole authoritative source for whether the provider or Windows legitimately owns worker
// authority. This table is diagnostic/recovery evidence only - it never gates
// `AuthorityGatedWorker.js`'s own per-call authority check, and never itself decides who is allowed to
// process canonical work.
const UP_SQL = String.raw`
ALTER TABLE physiqueos.combined_cutover_handoff_receipts
  ADD COLUMN worker_activation_status text NOT NULL DEFAULT 'pending'
    CHECK (worker_activation_status IN ('pending', 'activated', 'verified', 'failed')),
  ADD COLUMN worker_activated_at timestamptz,
  ADD COLUMN worker_verified_at timestamptz,
  ADD COLUMN windows_worker_retirement_status text NOT NULL DEFAULT 'pending'
    CHECK (windows_worker_retirement_status IN ('pending', 'retired', 'failed')),
  ADD COLUMN windows_worker_retired_at timestamptz,
  ADD CONSTRAINT combined_cutover_handoff_receipts_worker_activated_at_chk
    CHECK (worker_activation_status NOT IN ('activated', 'verified') OR worker_activated_at IS NOT NULL),
  ADD CONSTRAINT combined_cutover_handoff_receipts_worker_verified_at_chk
    CHECK (worker_activation_status <> 'verified' OR worker_verified_at IS NOT NULL),
  ADD CONSTRAINT combined_cutover_handoff_receipts_windows_worker_retired_at_chk
    CHECK (windows_worker_retirement_status <> 'retired' OR windows_worker_retired_at IS NOT NULL);
`;

const DOWN_SQL = String.raw`
ALTER TABLE physiqueos.combined_cutover_handoff_receipts
  DROP CONSTRAINT IF EXISTS combined_cutover_handoff_receipts_worker_activated_at_chk,
  DROP CONSTRAINT IF EXISTS combined_cutover_handoff_receipts_worker_verified_at_chk,
  DROP CONSTRAINT IF EXISTS combined_cutover_handoff_receipts_windows_worker_retired_at_chk,
  DROP COLUMN IF EXISTS worker_activation_status,
  DROP COLUMN IF EXISTS worker_activated_at,
  DROP COLUMN IF EXISTS worker_verified_at,
  DROP COLUMN IF EXISTS windows_worker_retirement_status,
  DROP COLUMN IF EXISTS windows_worker_retired_at;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
