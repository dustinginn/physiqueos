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

After the exact repaired source checkpoint is known, apply `000005` and run `npm run provider:compatibility:initialize` only from the App-Platform-trusted execution context with the exact environment, database, cluster, Space, source, and build variables. The initializer verifies the database identity and every required `000005` table, rejects any transfer receipt, creates the exact state once, treats an identical replay as a no-op, and fails closed on drift. It never migrates Founder production data or creates production authority.
