# Phase 4 persistence rehearsal and production migration runbook

Status: Phase 4 implementation and local copy-backed acceptance on branch `phase4-persistence-rehearsal`, based on exact Phase 3 checkpoint `694d3cac7158c3ebdbafcef6a61699be52d5937a`.

This document describes a rehearsal, not a production migration. The production JSON/file Founder runtime is still canonical. Production web, authentication, evidence locations, deployment, and DigitalOcean staging were not changed.

## Persistence model

Migration `000003_phase4_canonical_domains.cjs` adds ten bounded domain tables for user/settings, Goals/lifecycle, Operating Plan, protocols, execution/reminders, check-ins/weight, evidence, Training, briefings, and Confidence/Progress Intelligence. Each domain row has an explicit owner, collection identity, preserved legacy ID, stable source ordinal, version, status, occurrence/observed time, source identity, provenance, JSONB payload, and timestamps. The JSONB retains evolving legacy fields without storing the complete Founder runtime as one opaque snapshot. Relationships, private-media metadata, hashes, and import runs have separate tables and constraints.

Every source collection in `FOUNDATION_SOURCE_COLLECTIONS` has one explicit domain-family mapping. Unknown source keys fail export; unknown/missing required collections fail package validation; invalid explicit ownership and missing relationship targets fail import. Legacy records that omit `userId` inherit the package's required singleton Founder owner. This is an explicit legacy-ownership rule, not an unowned row: every target row receives `owner_user_id` and its foreign key is enforced.

The non-production PostgreSQL composition loads the same Phase 3 repositories/read loaders and supplies the same command handler with transactional PostgreSQL record, receipt, and outbox adapters. Production route composition does not import this module. Private media is copied only from a physically isolated snapshot into an ignored local object root; the application receives opaque authorized handles, never source paths or storage keys.

## Package and manifest contract

The copy/export sequence is:

1. hash the live runtime;
2. copy the runtime and only `evidence/`, `photos/`, and `dexa/` media to `.tmp`;
3. hash each source before and after copy and its destination; fail if any byte changes;
4. mark the snapshot files read-only;
5. normalize the copied runtime using the checkpointed repository code;
6. export canonical JSON plus a deterministic manifest.

The manifest includes source version/revision/hash, repository checkpoint, all collection counts and exact IDs, collection semantic digests, ownership and discovered relationships, critical values, file relative names, MIME types, sizes, SHA-256 values, and expected evidence relationships. It contains no credentials or absolute paths. Import and validation manifests add target database, counts, ID parity, package/import/state digests, and timing. Re-exporting the same snapshot produced byte-identical runtime and manifest files.

Current-copy rehearsal snapshot:

- Founder runtime: revision 110, 26,402,081 bytes, SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D`.
- Canonical records: 1,220 across all 42 mapped collections; no unknown collection.
- Private media: 361 objects, 271,434,316 bytes.
- Package digest: `ace5c5f1e6cfd3c3b3fe60f3d88920c50703e89e45d552a327e5ca5a0e0bbae8`.
- Canonical state digest: `5b2000796d776019699933aca3216018777684d10450009032b9fc0b553f389c`.
- Database/media import digest: `63413b01be8e211b9406dfec766ec2b646dd95d07b17416888eea7dc1867ed47` in both fresh runs.

## Rehearsal results

Local PostgreSQL ran in a physically separate `.tmp` cluster on port 55433 with the guarded logical database `physiqueos_phase4_rehearsal_current`. Fresh up, full down, re-apply, copy import, rollback/reset, repeated import, backup, destructive mutation, restore, and post-restore validation passed.

Read parity passed Home, Log/day, Evidence Review, Goals, Operating Plan, Priorities, Progress Intelligence, Confidence, briefing list/detail, Training history/detail, Training exercise search/detail/categories/recent, and You/profile. PostgreSQL JSONB exposed an insertion-order-dependent ETag; ETags now hash canonical JSON. The current Home model also exposed the legacy `/briefing/daily` route missing from typed destinations; it now maps to `briefing.list`. Neither correction changes product semantics.

All 17 Phase 3 commands produced equivalent canonical results through isolated in-memory and PostgreSQL adapters. Replay, response-loss replay, idempotency-key payload drift, interrupted transaction rollback, stale expected version, duplicate priority occurrence, repeated confirmation/logger/Goal operations, same-aggregate concurrency, independent-aggregate concurrency, and duplicate evidence source identity passed. Each committed mutation wrote exactly one transactional read-model-invalidation outbox effect; receipt replay did not duplicate it and interrupted work leaked neither state nor outbox. Exactly one same-aggregate concurrent writer wins and the stale writer receives `EXPECTED_VERSION_CONFLICT`.

Rollback deleted canonical rows, media metadata, receipts, outbox work, operations, and worker heartbeats while the source snapshot remained byte-identical. A fresh import then reproduced the exact digest. PostgreSQL backup was 2,490,768 bytes for the current copy-backed database; restore reproduced counts, IDs, state digest, media metadata, and read models. All 361 source and local-object hashes matched after restore reconciliation.

Measured workstation timings:

- consistent runtime plus 271 MB media snapshot copy: 1.929 s;
- deterministic package export and media inventory: 1.697 s;
- PostgreSQL import: 2.143-2.471 s;
- local media object copy: 1.674 s;
- database/package validation: 0.974-1.018 s;
- 17-surface read parity: 1.389 s;
- second fresh import: 2.147 s.

These are local measurements, not provider promises. Schema preparation, full historical export/inventory, bulk immutable-media pre-copy, dry validation, and backups can occur before the final fence. The final fence must capture the last runtime revision/hash, final media delta, import the final package, run count/ID/digest validation, switch the web composition, and run write/read smoke tests. The measured compute is under ten seconds, but the production runbook budgets **2-5 minutes** for operator checks and rollback decisions and retains the existing **under-ten-minute target**. A longer estimate or any need for a freeze requires fresh approval before imposing it.

## Draft production migration runbook (do not execute in Phase 4)

### Before the migration window

1. Complete and publish the approved pre-migration checkpoint with the end-work-session task. Record exact application commit, production deployment, Founder revision/hash, database schema, and object inventory.
2. Confirm operator, alert recipient, maintenance communication, credential access, rollback authority, and a tested immutable application build. Do not activate auth in this step.
3. Run Phase 1-4 bounded validation. Create and verify the accepted Phase 2 database/object backup and an independent local legacy-runtime/media backup. Retain manifests outside the deploy artifact.
4. Apply database schema additively while production remains on JSON/file. Export and validate a pre-window copy. Pre-copy immutable media and reconcile all hashes. Do not delete or tombstone legacy media.
5. Rehearse the exact production commands against an isolated target. Confirm read parity, command parity, owner negatives, backup/restore, and rollback triggers.

### Final write fence

1. Announce a 2-5 minute write-only maintenance window; reads may remain on the pinned legacy build if safely supported. Record the last accepted runtime revision/hash and lock ownership. If a safe narrow write fence cannot be established, abort before mutation.
2. Create the final runtime copy and final media delta. Verify source hash before/after capture. The source remains read-only and recoverable.
3. Export the deterministic package; verify unknown collections, counts, exact IDs, relationships, ownership, critical values, and hashes.
4. Import in one guarded migration run. Validate database counts/IDs/digests, object hashes, read models, dates/time zones, and authorized media.
5. Take and verify a post-import database backup and object inventory.
6. Switch only the authenticated production web composition to PostgreSQL/object adapters. Keep production auth activation separately sequenced and gated; do not combine an unproven auth activation with data migration.
7. Run protected read smoke and representative writes for weight/check-in, priority, evidence review, Training, Goals, briefings/Confidence, and media. Verify receipts/outbox and no legacy write.
8. Release the fence only after all gates pass. Mark the old runtime read-only, preserve it and its media, and begin elevated monitoring.

### Rollback triggers and procedure

Rollback triggers include any count/ID/relationship/hash mismatch, owner/security failure, client-visible read or command parity regression, missing media, unresolved outbox/receipt state, excessive fence duration, or health/smoke failure.

Before the composition switch, rollback is simple: discard/reset the target, keep the source canonical, and restart from a fresh package. After the switch but before any accepted PostgreSQL write, restore the pinned legacy composition and deployment, confirm the original revision/hash, and discard the target. After any accepted PostgreSQL write, do **not** blindly switch back: stop writes, inventory committed receipts/outbox and affected aggregates, then either forward-fix PostgreSQL or execute a separately reviewed deterministic reverse reconciliation into a copy of the legacy runtime. Production rollback must never lose accepted post-cutover writes.

Monitor database errors/latency, version conflicts, receipt replay, outbox lag/dead letters, media authorization/hash failures, owner denials, and read-model parity for at least one full daily cycle. The old runtime may be retired only after a separately approved retention window, verified backups/restores, and confirmation that no production reader/writer depends on it.

## Commands and safety guards

- `node scripts/runPhase4CurrentCopyExport.mjs .tmp/<run>` creates the isolated copy/package.
- `node scripts/verifyPhase4PackageDeterminism.mjs <snapshot> <package-a> <package-b>` proves byte determinism.
- `npm run test:phase4` runs serial unit validation.
- `npm run test:phase4:postgres` requires a guarded Phase 4 database URL and runs destructive local rehearsal only.
- `npm run validate:phase4` runs bounded Phase 1-4 regressions, optional guarded PostgreSQL rehearsal, lint, build, smoke, and diff checks.

Database import/reset refuses any name outside `physiqueos_phase4_test*`, `physiqueos_phase4_rehearsal*`, or `physiqueos_phase4_restore*`. Current-copy artifacts must remain under ignored `.tmp`. The repository must be scanned before checkpointing to ensure none are staged or untracked.

## Remaining gates and recommended Phase 5

Phase 4 proves the durable path locally but does not authorize production migration. Provider latency for the complete domain import, final operational ownership, the exact production write-fence date/communication, production auth sequencing, and post-cutover monitoring approval remain future gates. No copied Founder record or evidence may be sent to DigitalOcean without separate authorization.

Recommended Phase 5 is a production-cutover readiness review and synthetic provider composition validation using this exact package contract, followed by a separately authorized migration window only after all operators and rollback decisions are explicit. Phase 5 must not begin automatically, and it must not begin Apple/Native Baseline work unless separately authorized.

Phase 5 evolution: the draft runbook above is now hardened and provider-validated in `docs/PHASE5_CUTOVER_READINESS.md`. Synthetic provider critical work measured about 40 seconds excluding restart and about 83 seconds including the observed App Platform restart, so the 2-5 minute Founder write-fence estimate remains credible; the former 15-minute automatic-abort wording is superseded by a ten-minute hard approval boundary before composition switch/first PostgreSQL write. Authentication is explicitly a later window after PostgreSQL/Spaces-backed web stability. The safe Next.js lifecycle is stop, isolated build/preflight, atomic promotion, restart, then routes/assets/build/ownership verification.

## Final bounded acceptance

The final serial harness passed 38 files / 200 tests: Phase 1 9/34, Phase 2 9/52, Phase 3 9/46, Phase 4 5/10, persistence isolation 2/29, and adjacent services 4/29. The guarded PostgreSQL cycle, deterministic package proof, targeted lint, production build, isolated smoke, `git diff --check`, current production smoke, and generated-artifact/secret scans passed. The isolated smoke returned 200 for `/`, `/log`, `/goals`, `/profile/operating-plan`, and `/api/v1/health/live`; protected capabilities returned the intended 503 while auth remains inactive. Pinned production separately returned 200 for `/`, `/log`, and `/api/health`.

The first final smoke attempt was an acceptance-harness defect: the reused Phase 3 smoke helper hardcoded its prior build directory. It now respects the caller's isolated build directory, and the complete harness passed on rerun. The known pre-existing Turbopack broad filesystem trace warning remains. The Progress Reporting duplicate-day diagnostics appeared identically in legacy and PostgreSQL parity and are current canonical-state warnings, not migration drift. No deterministic product, foundation, migration, or parity defect remains unresolved.

Founder integrity before and after the final harness was byte-identical: revision 110, updated `2026-08-12T02:05:50.820Z`, 26,402,081 bytes, SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D`. No concurrent Founder activity occurred during the final gate. The local rehearsal server was stopped; ignored `.tmp` packages, reports, offline database files, and object copies remain local for audit and are not tracked by Git.

## Canonical collection contract v2 reconciliation (2026-08-13)

The historical 42-collection result above remains an accurate record of the Phase 4 package produced at that time, but it was not an accurate count of persisted source collections. Commit `7e99af27af69c912d8d5b6219d2afc4ac3f67618` built the registry from the hydrated application runtime. `createFounderRuntimeStore` injects `operatingRhythm`, `adaptiveTrustProfile`, and `milestones` from code seeds even though none has ever appeared in `PERSISTED_COLLECTIONS`. Revision 110, accepted revision 119, and current revision 122 omit all three raw keys. No accepted schema migration removed, renamed, or folded them between Phase 4 and revision 122.

Contract `founder-canonical-collections-v2` therefore has 39 required persisted collections and zero optional persisted collections. `operatingRhythm` is **derived/noncanonical state**: its current Founder-specific read context is owned by `src/data/founderSeed/operatingRhythm.js` and is overlaid only at application composition. `adaptiveTrustProfile` is a **future-only/inactive design collection** with no production consumer or command. The standalone `milestones` collection is **deprecated/retired**; current goal/forecast milestones are distinct nested Goal/phase concepts and must not be invented from the old empty seed. These three names are recognized for historical input compatibility, recorded with presence/absence and classification in manifest version 2, and never exported or imported as canonical rows.

The exporter now requires every genuine persisted collection to be present before normalization and copies values without a null/default fallback. Unknown keys and missing required collections still fail closed. Tests cover raw absence, historically hydrated presence, unknown input, mandatory omission, package exactness, and deterministic output, preventing empty arrays, empty objects, default records, or placeholder rows from satisfying an inventory count.
