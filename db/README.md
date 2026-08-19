# Shared-platform database foundation

This directory is inactive in the current production application. The Founder runtime JSON remains canonical until the later, separately approved cutover phase.

The migration contract uses PostgreSQL 17, `pg`, and `node-pg-migrate`. Migrations are immutable, ordered by a six-digit index, contain explicit up/down SQL, run transactionally, and use the migration tool's advisory lock. Phase 2 adds production foundation adapters and a guarded real-database validation path; it still does not connect any current production domain repository.

Required only when deliberately running migrations against an isolated foundation database:

```text
PHYSIQUEOS_DATABASE_ENABLED=1
PHYSIQUEOS_DATABASE_URL=postgresql://...
```

Commands:

```text
npm run db:migrate:dry-run
npm run db:migrate:up
npm run db:migrate:down
```

Never point these commands at the current Founder runtime or run a down migration against production without a separately approved recovery plan. Production startup does not import or initialize this database path.

Phase 2 destructive integration validation requires `PHYSIQUEOS_TEST_DATABASE_URL`. The database name must begin with `physiqueos_phase2_test` or the script refuses to run. It executes fresh up, constraints/transactions, restart durability, `pg_dump`/`pg_restore`, full down, and re-apply using synthetic records only:

```text
npm run test:phase2:postgres
```

The backup CLI likewise refuses restore targets whose names do not begin with `physiqueos_phase2_test` or `physiqueos_restore`.

## Provider-backed staging acceptance

On 2026-08-11 the migrations were accepted against the `sfo3` DigitalOcean PostgreSQL 17 staging cluster. The runtime pool removes URL-level TLS controls whenever `PHYSIQUEOS_DATABASE_CA_CERT` is supplied so a provider URL cannot override strict `rejectUnauthorized: true` CA verification. Backup/restore forwards `sslmode=verify-full` and `sslrootcert` to libpq without placing credentials in process arguments.

Provider acceptance uses guarded database names only. `scripts/validatePhase2ProviderStaging.mjs` requires `physiqueos_phase2_test_provider_20260811`; `scripts/validatePhase2ProviderRestore.mjs` additionally requires `physiqueos_restore_provider_20260811`. The deployed-worker probe alone requires `physiqueos_staging`. These scripts refuse non-DigitalOcean hosts and require `PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE=1`.

The isolated restore rehearsal matched counts, IDs, ownership/session/object relationships, migration metadata, critical values, semantic digest, private-object inventory, and object hashes. Temporary dumps and the restore logical database were removed. The retained logical acceptance database contains synthetic fixtures only; the current Founder JSON/file runtime remains canonical.

## Phase 4 domain rehearsal

Migration `000003_phase4_canonical_domains.cjs` adds inactive owner-scoped domain tables, canonical relationships, media metadata, and import-run evidence. It is consumed only by the explicit Phase 4 rehearsal composition. Production startup and current web routes do not import it.

Phase 4 import/reset tools refuse databases whose names do not begin with `physiqueos_phase4_test`, `physiqueos_phase4_rehearsal`, or `physiqueos_phase4_restore`. Current-copy packages and local object roots must remain under ignored `.tmp`; copied Founder data and media must never be committed or uploaded to provider staging. The guarded destructive cycle is:

```text
PHYSIQUEOS_PHASE4_DATABASE_URL=postgresql://.../physiqueos_phase4_rehearsal_<name>
npm run test:phase4:postgres
```

The current local rehearsal passed fresh up, full down/reapply, two identical imports, rollback/reset, command receipt/outbox cleanup, verified database backup/restore, exact counts/IDs/state digest, and 361 local media hashes. This is not production database or backup acceptance; the production JSON/file runtime remains canonical until a separately approved cutover.

## Phase 5 provider readiness

Migration `000004_phase5_provider_readiness.cjs` adds provider-version metadata to canonical media and a durable synthetic validation-run record. It is additive and inactive in production. Phase 5 import/reset accepts only the prior guarded Phase 4 names or `physiqueos_phase5_test_provider*` / `physiqueos_phase5_restore_provider*`; production names remain rejected.

The Phase 5 generator creates synthetic-only packages spanning all 42 collections. Live provider harnesses additionally require `PHYSIQUEOS_PHASE5_PROVIDER_ACCEPTANCE=1`, the exact logical database `physiqueos_phase5_test_provider_20260811`, strict DigitalOcean CA verification, and the accepted staging Space. Restore validation accepts only the isolated `physiqueos_phase5_restore_provider` target, which is removed after the proof. Copied Founder runtime/media must never be used. Live acceptance passed all 42 collections, opaque versioned media, source/restore digests, and zero-orphan checks.

## Provider-side production dry-run operations

The existing `physiqueos.migration_runs`, `physiqueos.outbox_messages`, and
`physiqueos.worker_heartbeats` tables provide the durable transport for the
bounded App Platform dry-run. The web process inserts one
`production-migration-dry-run` migration-run audit record and one
`operations.production-migration-dry-run` outbox message transactionally.
Operation ID plus a canonical SHA-256 payload fingerprint provides idempotency:
an exact retry returns current status; payload drift fails closed. Worker lease
expiry provides restart recovery, and terminal status remains pollable after a
client disconnect.

## Durable outbox contract

`physiqueos.outbox_messages` holds executable asynchronous work, not a general
event log. `DurableOutboxWorker` fails an unregistered topic closed and
terminal (`OUTBOX_TOPIC_UNSUPPORTED`) by design; every enqueued topic is
expected to have a real, deployed consumer. A producer must not enqueue a
topic before its consumer exists — introduce both together in the same
change. Read-model-invalidation events belong here only when there is actual
invalidatable cache or projection state to invalidate; PhysiqueOS's current
read paths compute fresh from canonical state on every request, so no such
event exists today. Media post-verification events belong here only when a
real downstream responsibility (indexing, notification, derived-asset
generation, etc.) is implemented to consume them.

This audit transport lives in the foundation logical database. Provider checks
use a distinct, explicitly configured migration-target connection on the same
accepted cluster. Dry-run uses SELECT/read-only provider operations and records
before/after counts for canonical domain, relationship, media, import, and
migration tables. Any count or Space-inventory digest change fails the
operation. No new schema or paid database is required.

Direct production-provider use of `scripts/runProductionMigration.mjs` from a
Windows host is rejected with
`MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED`. Use
`scripts/runRemoteProductionMigrationDryRun.mjs` as the authenticated control
client. It does not require or transmit a database URL/password, Spaces key,
DigitalOcean PAT, recovery passphrase, or private key.

### Live provider dry-run evidence (2026-08-13)

App Platform operation `phase6-provider-dry-run-20260814-0330` reached terminal
`succeeded` / `READY` against guarded logical database
`physiqueos_phase5_test_provider_20260811`. The worker verified PostgreSQL
17.10 and latest schema `000004_phase5_provider_readiness`, then exercised the
accepted production runner/orchestrator in `dryRun=true` mode. It found all 39
required collections, the three explicit exclusions, zero missing/unknown
collections, no unknown or unfenced write surface, and current package/manifest
version 2.

Canonical database and Space inventory digest
`d388cca324ed6f45044c6f3256d485e5bc1fb09b5ef9b2507fa62d5d4fc312ae`
was identical before and after. No schema migration, import, canonical domain
write, or evidence move occurred. The allowed durable migration-run/outbox
audit record is noncanonical. The worker reached the managed public TLS
hostname from App Platform while the cluster firewall remained restricted to
the sole App trusted source; direct workstation database access remains
forbidden.
## Combined runtime authority migration

Migration `000005_combined_runtime_authority.cjs` adds the durable runtime-authority state, immutable transition audit, one-time transfer receipts, canonical runtime metadata, and application context required by the combined App Platform/PostgreSQL/Spaces cutover. Provider canonical commands verify the exact authority tuple and record the first-provider-write boundary in the same PostgreSQL transaction as the domain mutation. Worker polling uses the same authority record.

`canonical_runtime_metadata` includes the `imported_at` field consumed by provider runtime loading. The compatibility remediation detected and corrected that schema/read contract before synthetic re-import or provider boot acceptance.

These tables do not make PostgreSQL production-canonical merely by being migrated or populated with synthetic data. Compatibility mode remains restricted to accepted isolated databases. Production authority changes only under the future exact combined authorization and phase protocol in `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`; the firewall remains App-Platform-only and no workstation access is required.

### Explicit non-authoritative compatibility initialization

Migration `000005` also permits the distinct `provider-compatibility-nonauthoritative` authority with `worker_authority=compatibility`. Its invariant keeps public runtime and migration control on Windows, keeps the production canonical epoch at `legacy-json`, uses PostgreSQL only as an isolated compatibility composition, disables production writes and combined execution, and requires null production operation/fence/first-write fields.

Independent read-only inspection from the accepted App Platform worker confirmed that `physiqueos_phase5_test_provider_20260811` is at `000004`, has no combined-authority or transfer row, contains one synthetic owner only, and retains the accepted 42-collection fixture (370 canonical records, 764 relationships, and three versioned media objects / 111 bytes). Direct workstation access timed out under the unchanged App-Platform-only firewall, as intended.

After the exact repaired source checkpoint is known, apply `000005` and run `npm run provider:compatibility:initialize` only from the App-Platform-trusted execution context with the exact environment, database, cluster, Space, source, and build variables. The initializer verifies the database identity and every required `000005` table, rejects any transfer receipt, creates the exact state once, treats an identical replay as a no-op, and fails closed on drift. It never migrates Founder production data or creates production authority. The accepted isolated target is now through `000005`; its nonauthoritative state has no production operation, transfer receipt, fence, routing target, or first-write marker, and its current runtime metadata includes the required `imported_at` column.

## Combined cutover transfer staging (migration 000006)

Migration `000006_combined_cutover_transfer_staging.cjs` adds `physiqueos.combined_cutover_transfer_receipts` and `physiqueos.combined_cutover_transfer_chunks`: the byte-level, chunked, resumable transport for one combined-cutover package artifact, distinct from the operation-level `physiqueos.combined_transfer_receipts` added in `000005`. See `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`'s "Implementation Phase 3" section for the full authentication, staging, and receipt design. Rows here are noncanonical: receiving and verifying bytes confers no runtime authority, imports nothing, and never sets `first_provider_canonical_write_at`. Every staging key is constrained by a database check to the `cutover-transfer/` prefix, wholly disjoint from the canonical private-media `private/` prefix. Production startup does not import or initialize this schema outside the explicit transfer service composition (`src/platform/cutover/transfer/combinedCutoverTransferComposition.js`), which itself only activates under `PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_ENABLED=1`.

## Combined cutover preparation evidence (migration 000007)

Migration `000007_combined_cutover_preparation_evidence.cjs` adds one compact, operation-bound `physiqueos.combined_cutover_preparation_receipts` row per combined-cutover operation, covering canonical import, media import, provider parity, and provider-prepared acknowledgement status/timestamps/counts/digests. `phase4_import_runs` (from `000003`) was evaluated and found insufficient for this role: it has no `operationId` dimension and its `ON CONFLICT` upsert does not guard against a conflicting package digest for an unchanged `migrationId`; it remains unchanged and reserved for the older single-machine migration path. See `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`'s "Implementation Phase 4" section for the full import/parity/acknowledgement contract. This table never stores payload contents, and a database `CHECK` enforces that `prepared_status` can only reach `acknowledged` once import, media, and parity have all independently succeeded for the same package digest. Production startup does not import or initialize this schema outside the explicit preparation service composition (`src/platform/cutover/preparation/combinedCutoverPreparationComposition.js`), which itself only activates under `PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED=1`.

## Combined cutover handoff evidence (migration 000008)

Migration `000008_combined_cutover_handoff_receipts.cjs` adds one operation-bound `physiqueos.combined_cutover_handoff_receipts` row per combined-cutover operation, covering the expected route snapshot before handoff, intended routing target and provider deployment identity, authority-commit status/timestamp/resulting-authority, and routing activation/verification/failure status and timestamps. This table is diagnostic and recovery evidence only: `physiqueos.combined_runtime_authority` (from `000005`) remains the sole authority source and the sole `first_provider_canonical_write_at` source. It was deliberately not folded into `combined_cutover_preparation_receipts` (`000007`) because preparation's own semantics end at `provider-prepared`, a phase before authority/routing handoff. Database `CHECK` constraints tie `authority_status`/`routing_status` to their required companion fields so a row can never claim a committed or activated state without its supporting timestamp. This table never stores payload contents or secrets. See `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`'s "Implementation Phase 5" section for the full authority-handoff and routing-control contract. Production startup does not import or initialize this schema outside the explicit handoff service composition (`src/platform/cutover/handoff/combinedCutoverHandoffComposition.js`), which itself only activates under `PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_ENABLED=1`.

## Combined cutover handoff recovery evidence (migration 000009)

Migration `000009_combined_cutover_handoff_recovery_evidence.cjs` additively extends `physiqueos.combined_cutover_handoff_receipts` (`000008`) with two nullable pre-boundary Windows-routing-recovery columns (`windows_routing_restore_status`, `windows_routing_restore_at`) rather than creating a new table: `restoreWindowsAuthority` (Phase 6A) reads the SAME row to decide whether provider routing was ever activated for the operation being recovered, and records the honest recovery outcome - `restored`, `failed`, or `ambiguous` (the routing control being unconfigured/unreachable, a genuinely unknown state distinct from a definite failure) - back onto it. `physiqueos.combined_runtime_authority` remains the sole authority source; this remains diagnostic evidence only.

## Combined cutover handoff worker evidence (migration 000010)

Migration `000010_combined_cutover_handoff_worker_evidence.cjs` additively extends the same `physiqueos.combined_cutover_handoff_receipts` row (`000008`/`000009`) with worker-handoff evidence for phase N/O ("release writes only through the provider platform, start the authority-gated worker"): `worker_activation_status`/`worker_activated_at`/`worker_verified_at` and `windows_worker_retirement_status`/`windows_worker_retired_at`. The row's existing `provider_deployment_id` column is reused as-is for worker deployment-identity verification. `physiqueos.combined_runtime_authority.worker_authority` remains the sole authoritative source for who legitimately owns worker authority; this table never gates `AuthorityGatedWorker.js`'s own per-call authority check and is diagnostic/recovery evidence only. See `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`'s "Implementation Phase 6C" section for the full worker-control contract and handoff sequencing.
