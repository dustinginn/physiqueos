// Narrow, additive schema for the combined-cutover PROVIDER TRANSFER STAGING boundary.
//
// WHY THIS IS NOT `physiqueos.combined_transfer_receipts`. That table (migration 000005) is the
// OPERATION-level cutover declaration: one row per migration operation, bound to the fence,
// authorization fingerprint, and the four authorization digests, carrying the declared manifest and
// the provider's final verification receipt. Its status vocabulary
// (declared/receiving/verified/consumed/failed) describes the authorization lifecycle of the whole
// operation. It has no package identity, no byte accounting, and no chunk state, and its
// `consumed` state is claimed by import - not by byte receipt.
//
// The tables below describe something different: the byte-level, resumable transfer of ONE declared
// artifact ("package") of that operation. Overloading 000005 would force a single row to mean both
// "this operation is authorized" and "3 of 41 chunks of media file 7 have landed", which are not the
// same fact and do not share a lifetime. `physiqueos.command_receipts` is also unusable: it is
// owner/device/session scoped with foreign keys into `users`, `devices`, and `sessions`, and the
// transfer channel is machine-to-machine with no Founder session.
//
// Rows here are NONCANONICAL. Receiving and verifying bytes confers no runtime authority, imports
// nothing, and never sets `first_provider_canonical_write_at`.

const UP_SQL = String.raw`
CREATE TABLE physiqueos.combined_cutover_transfer_receipts (
  receipt_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  migration_operation_id text NOT NULL,
  package_id text NOT NULL CHECK (package_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$'),
  overall_digest char(64) NOT NULL CHECK (overall_digest ~ '^[0-9a-f]{64}$'),
  expected_bytes bigint NOT NULL CHECK (expected_bytes >= 1),
  received_bytes bigint NOT NULL DEFAULT 0 CHECK (received_bytes >= 0),
  expected_chunk_count integer NOT NULL CHECK (expected_chunk_count >= 1),
  received_chunk_count integer NOT NULL DEFAULT 0 CHECK (received_chunk_count >= 0),
  chunk_size_bytes integer NOT NULL CHECK (chunk_size_bytes >= 1),
  status text NOT NULL CHECK (status IN ('declared', 'receiving', 'verified', 'failed')),
  staging_prefix text NOT NULL CHECK (staging_prefix ~ '^cutover-transfer/'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  verified_at timestamptz,
  UNIQUE (migration_operation_id, package_id),
  CHECK (received_bytes <= expected_bytes),
  CHECK (received_chunk_count <= expected_chunk_count),
  CHECK (verified_at IS NULL OR (
    status = 'verified' AND completed_at IS NOT NULL
    AND received_bytes = expected_bytes AND received_chunk_count = expected_chunk_count
  ))
);

CREATE INDEX combined_cutover_transfer_receipts_operation_idx
  ON physiqueos.combined_cutover_transfer_receipts(migration_operation_id, status);

CREATE TABLE physiqueos.combined_cutover_transfer_chunks (
  receipt_id text NOT NULL REFERENCES physiqueos.combined_cutover_transfer_receipts(receipt_id) ON DELETE RESTRICT,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  chunk_digest char(64) NOT NULL CHECK (chunk_digest ~ '^[0-9a-f]{64}$'),
  byte_offset bigint NOT NULL CHECK (byte_offset >= 0),
  byte_length integer NOT NULL CHECK (byte_length >= 1),
  staging_key text NOT NULL CHECK (staging_key ~ '^cutover-transfer/'),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (receipt_id, chunk_index),
  UNIQUE (staging_key)
);
`;

const DOWN_SQL = String.raw`
DROP TABLE IF EXISTS physiqueos.combined_cutover_transfer_chunks;
DROP TABLE IF EXISTS physiqueos.combined_cutover_transfer_receipts;
`;

exports.shorthands = undefined;
exports.up = (pgm) => pgm.sql(UP_SQL);
exports.down = (pgm) => pgm.sql(DOWN_SQL);
exports.UP_SQL = UP_SQL;
exports.DOWN_SQL = DOWN_SQL;
