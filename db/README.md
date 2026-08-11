# Shared-platform database foundation

This directory is inactive in the current production application. The Founder runtime JSON remains canonical until the later, separately approved cutover phase.

The migration contract uses PostgreSQL 17, `pg`, and `node-pg-migrate`. Migrations are immutable, ordered by a six-digit index, contain explicit up/down SQL, run transactionally, and use the migration tool's advisory lock.

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
