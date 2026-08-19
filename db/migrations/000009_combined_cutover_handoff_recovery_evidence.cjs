// Additive Phase 6A extension of migration 000008's `combined_cutover_handoff_receipts` table with
// PRE-BOUNDARY Windows-routing-recovery evidence. This is deliberately an extension of the existing
// handoff-evidence row rather than a new table: `restoreWindowsAuthority` recovery already reads that
// exact row to decide whether provider routing was ever activated (see 000008's header comment,
// "A future restoreWindowsAuthority implementation reads this evidence..."), so recording the
// recovery outcome back onto the same row keeps one place of truth per operation instead of a second
// evidence lifecycle. It does not distort the row's existing forward-handoff semantics: these columns
// are null unless a recovery attempt actually ran, and nothing here participates in the CHECK
// constraints migration 000008 already defined for `authority_status`/`routing_status`.
//
// NOT A SECOND AUTHORITY STATE MACHINE. `physiqueos.combined_runtime_authority` remains the sole
// authoritative source for `authority` and `first_provider_canonical_write_at`. POST-boundary forward
// recovery (`enterProviderRecovery`) needs no new schema at all: the existing
// `combined_runtime_authority_audit` row produced by the real `REQUIRE_RECOVERY` transition already
// durably identifies the owning operation and the reason forward recovery was required.
const UP_SQL = String.raw`
ALTER TABLE physiqueos.combined_cutover_handoff_receipts
  ADD COLUMN windows_routing_restore_status text
    CHECK (windows_routing_restore_status IS NULL OR windows_routing_restore_status IN ('restored', 'failed', 'ambiguous')),
  ADD COLUMN windows_routing_restore_at timestamptz;
`;

const DOWN_SQL = String.raw`
ALTER TABLE physiqueos.combined_cutover_handoff_receipts
  DROP COLUMN IF EXISTS windows_routing_restore_status,
  DROP COLUMN IF EXISTS windows_routing_restore_at;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
