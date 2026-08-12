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
