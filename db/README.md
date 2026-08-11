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
