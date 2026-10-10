# P0 immutable watchdog adoption watermark — corrected Server candidate ready for guarded deployment

- Published: `2026-10-10T18:42:10Z`
- Founder authorization: `43aa8e734af0fdd01f930cdfb4bfd75e25be2a3f`
- Exact live Server baseline: [`60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`](https://github.com/dustinginn/physiqueos/commit/60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde)
- Exact corrected Server candidate: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Candidate branch: [`codex/p0-immutable-adoption-watermark-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/p0-immutable-adoption-watermark-20261010)
- Deployment: **NOT PERFORMED**
- Recovery authority: **unchanged / OFF**
- External beta: **NO-GO until guarded deployment, restart proof, alert routing, and observation gates complete**

## Executive result

Candidate `2e4af15c` fixes the remaining P0 under-recovery defect found after the successful `60d08a22` deployment. The worker heartbeat now persists a store-owned `details.buildAdoptedAt` value on first activation, preserves that value when a stable worker row receives later heartbeats from the same build, and resets it only when build identity changes. The watchdog reads the earliest valid immutable watermark across current-build worker rows through a bounded query. Missing, malformed, or over-limit watermark state fails closed and raises `EVIDENCE_ADOPTION_BOUNDARY_UNAVAILABLE`; it cannot make historical work automatically eligible.

The behavior was exercised against a real local PostgreSQL 18.4 engine using the production heartbeat upsert shape. The original timestamp survived normal ticks, a new store instance representing a same-build process restart, concurrent same-worker updates, and a changed worker ID. A new build received a new boundary. In a database-backed pre/post-boundary scenario after a later process restart, the old review remained historical/alert-only and only the post-adoption review was presented to bounded recovery. Invalid persisted state produced the explicit alert and zero recovery calls.

The candidate is one commit and eight Server/operations files on top of exact live `60d08a22`. It contains no schema migration, dependency change, Native source, infrastructure, provider spec, instance-size, Recovery-policy, Goal Adaptation, HealthKit, or DEXA Evidence presentation change. No production read/write, deployment, restart, alert activation, Native build, or TestFlight action was performed.

## Root cause and correction

### Before: live `60d08a22`

Production has a stable worker ID. Its heartbeat uses `ON CONFLICT (worker_id) DO UPDATE` and advances `observed_at` every tick. The watchdog treated `min(observed_at)` for the build as the deployment boundary. With one stable row, that value was the latest heartbeat rather than the first heartbeat. The production postflight observed it advance from `2026-10-10T17:56:07.430Z` to `2026-10-10T17:58:28.843Z`.

The running process remained safe because its own start time was earlier. A later same-build restart would lose that old process time and could classify a legitimate post-deployment failure as historical. This was an under-recovery gap; it did not create historical replay.

### After: candidate `2e4af15c`

1. The first heartbeat for a worker/build writes `details.buildAdoptedAt` from the heartbeat observation time.
2. A same-build conflict updates liveness and caller details while preserving only the persisted watermark. Caller-supplied watermark values are stripped before the query.
3. A changed build on the same worker row receives a new watermark.
4. A changed worker ID on the same build receives its own first-activation watermark; the watchdog takes the earliest valid value across the build.
5. The build query is capped at 65 rows to prove a complete maximum of 64. More than 64, any missing value, or any invalid value returns no persisted boundary and emits a dedicated operational alert.
6. The existing process-start fallback remains. Untrusted state therefore reduces automatic recovery rather than widening it.

No migration is required. The new value uses the existing nullable heartbeat `details jsonb` column, and the first candidate heartbeat necessarily has a new build identity relative to live `60d08a22`.

## Actual PostgreSQL proof

The checked-in integration test creates an isolated local database and production-shaped `worker_heartbeats`, `canonical_evidence_records`, and `outbox_messages` tables. It uses the real `pg` driver, real PostgreSQL `jsonb` operators, concurrent queries, and the real Server stores/monitor. It refuses any non-loopback host or database name outside the `physiqueos_adoption_test*` fence.

| Scenario | Observed result |
|---|---|
| First activation | `17:00:00.123Z` stored as the candidate build watermark |
| Subsequent tick | liveness advanced; watermark stayed at first activation |
| Same-build process restart | new store instance advanced liveness; watermark stayed at first activation |
| Concurrent stable-ID ticks | both upserts completed; persisted watermark stayed at first activation |
| Changed worker ID | second row received its own watermark; build boundary remained the earlier first activation |
| Changed build ID | stable row received a new `17:05:00.321Z` boundary |
| Pre/post stranded reviews after restart | 2 stale detected; 1 historical; 1 adopted; only the adopted review selected |
| Invalid persisted watermark | status `invalid`; dedicated alert emitted; 0 automatic recoveries |

PostgreSQL renders the stored `timestamptz` JSON value with the session offset (`2026-10-10T10:00:00.123-07:00` in this run). The strict parser accepts RFC 3339 offsets and normalizes the operational boundary to UTC, proving the implementation does not depend on a `Z`-only rendering.

## Verification results

| Gate | Result | Evidence |
|---|---:|---|
| Real PostgreSQL heartbeat/restart suite | **3/3 pass** | ticks, restart, concurrency, worker/build changes, pre/post recovery, invalid fail-closed |
| Focused reliability and DEXA regression suite | **16 files, 151/151 pass** | memory gate, bounded DEXA path, crash matrix, resume/idempotency, durable state, watchdog/store, dead outbox and cadence |
| Atomic PostgreSQL-facade recovery target | **1 pass, 18 skipped by exact name filter** | expired-claim release and bounded resume |
| Provider worker artifact | **4/4 pass** | collected production worker artifact boots with watchdog wiring |
| Memory harness | **3/3 pass; 0 OOM/restart** | entry, bounded end-to-end, confirmation/cadence contention |
| Changed-file ESLint | **PASS** | all changed JavaScript/test files |
| `git diff --check` | **PASS** | exact candidate versus `60d08a22` |
| Production Web build | **PASS** | Webpack compile, TypeScript, 50/50 static pages, route traces |

The focused matrix includes the nine-boundary DEXA crash suite, retry/idempotency behavior, live-lease and dead-message protections, and the bounded end-to-end confirmation path. The existing broader facade suite still contains the audit's unrelated P1 Weight full-ISO `RangeError`; the exact atomic recovery target is green and this candidate does not touch Weight behavior.

## Memory regression against the 1 GiB beta model

Harness conditions were unchanged from P0 Round 1: `--max-old-space-size=512`, approximately 560 MiB observed V8 heap limit, 150 MiB retained ballast, and an 87.9 MiB serialized larger-account fixture.

| Scenario | Round 1 candidate | Corrected candidate | Result |
|---|---:|---:|---:|
| Confirmation entry | 333 MiB RSS | **333 MiB RSS** | PASS; 0 collection loads |
| Bounded end-to-end confirmation | 663 MiB prior maximum set | **661 MiB RSS** | PASS |
| Confirmation/cadence contention | 663 MiB prior maximum set | **664 MiB RSS** | PASS; cadence retryably deferred |

The corrected maximum is 64.8% of the nominal 1 GiB limit, leaving **35.2% headroom**. It remains below the proposed beta gates of p95/steady RSS under 75%, every operation under 85%, and at least 30% headroom. The 1 MiB difference from the prior 663 MiB maximum is measurement noise, not a changed allocation path; the watermark correction does not enter the DEXA processing pipeline.

## Exact changed surface

Candidate `2e4af15c` is exactly 439 insertions and 11 deletions in eight files:

- heartbeat persistence and caller fencing: `src/platform/database/PostgresOutboxStore.js` plus its unit test;
- bounded watermark read/validation: `src/platform/database/PostgresEvidenceProcessingReliabilityStore.js` plus its unit test;
- fail-closed visibility: `src/platform/jobs/EvidenceProcessingReliabilityMonitor.js` plus its unit test;
- real PostgreSQL proof: `src/platform/database/EvidenceProcessingAdoptionWatermark.postgres.test.js`;
- operational contract: `docs/operations/EVIDENCE_PROCESSING_RELIABILITY.md`.

The candidate is a direct descendant of exact live `60d08a22`; the merge base is exact `60d08a22`.

## Guarded deployment plan — requires separate authorization

1. **Pin exact artifacts.** Re-fetch and verify candidate `2e4af15c67e1899933f315e9ea0c4922151c8803`, live baseline `60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`, clean worktree, direct ancestry, and exact eight-file diff. Stop on drift.
2. **Re-run safety preflight.** Require no in-progress provider deployment; public live/ready HTTP 200 and 9/9 readiness; Web/Worker/runtime exact `60d08a22`; Recovery authority absent/OFF; unchanged schema count, topology, region, instance sizes, HealthKit policies, September 14 retirement seals, October 9 DEXA lineage, canonical evidence counts, and performance-record seals. Stop on any mismatch.
3. **Re-run release gates.** Execute the real-PostgreSQL suite, focused reliability set, memory scenarios, artifact boot, lint, diff check, and production build against the exact candidate. Preserve at least 12 GiB free disk.
4. **Deploy only the exact candidate.** Fast-forward the established production branch to `2e4af15c`; render the provider spec and require only the four Web/Worker SHA/build stamp values to change; verify neutral spec digest parity. Perform no migration, policy write, topology/cost change, alert activation, or data repair.
5. **Bounded activation postflight.** Require one ACTIVE 9/9 deployment, exact Web/Worker source and runtime hashes, matching build ID, public live/ready 200 and 9/9, and healthy watchdog samples. Read the candidate heartbeat twice: `observed_at` must advance while `details.buildAdoptedAt` remains byte-equivalent in time.
6. **Prove the fixed condition.** If separately included in the deployment authorization, first require zero active/failed evidence reviews, then perform one controlled same-build Worker restart. After restart, require the same `buildAdoptedAt`, healthy heartbeat and watchdog, zero historical replay, zero recovery of pre-boundary work, and no changed canonical evidence/performance seals. Without this controlled restart, deployment may be healthy but the P0 restart gate remains unproven.
7. **Rollback triggers.** Roll back to exact `60d08a22` if build/runtime parity fails, the watermark changes during same-build ticks/restart, readiness is not 9/9, unexpected recovery/replay occurs, data seals drift, RSS reaches 85%, an OOM/restart occurs, or any other safety gate fails. The candidate has no migration, so rollback is code-only with the prior four build stamps.

Recovery must remain OFF throughout. Infrastructure alert routing, Native processing-state integration, TestFlight, Goal Adaptation, unrelated P1 work, and the queued DEXA Evidence page cleanup remain outside this deployment.

## Remaining risks and beta-readiness requirements

1. **P0 — deployment/restart proof remains open.** Source behavior is corrected and verified locally, but production still runs `60d08a22`. External beta remains blocked until exact-candidate deployment and same-build restart persistence are proven.
2. **P0 — durable alert routing remains open.** `EVIDENCE_ADOPTION_BOUNDARY_UNAVAILABLE` and the existing watchdog alerts are structured logs only. Infrastructure routing still requires separate authorization and end-to-end verification.
3. **P0 — Native processing-state presentation remains open.** Server states are durable, but the separately planned Native integration has not been built or released.
4. **P0 — production observation window remains open.** After corrected deployment, retain at least seven clean days with p95 RSS below 75%, every operation below 85%, at least 30% headroom, zero OOM/restarts, zero unalerted dead continuations, and no review stranded beyond two leases.
5. **P1 audit backlog remains open.** Weight full-ISO handling and the comprehensive audit's latency, HealthKit ingest, timeout, note-intake, notification, and new-user recovery gates are unchanged.
6. **Bounded worker-cardinality fail-closed behavior is deliberate.** More than 64 heartbeat rows for one build disables persisted-boundary recovery and alerts. Production currently uses a stable worker identity; unexpected cardinality must be investigated rather than widening an unbounded query.

## Flags

- `EXACT_SERVER_CANDIDATE=2e4af15c67e1899933f315e9ea0c4922151c8803`
- `LIVE_SERVER_REMAINS=60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`
- `ACTUAL_POSTGRESQL_HEARTBEAT_TEST=PASS_3_OF_3`
- `SAME_BUILD_RESTART_WATERMARK=PASS_LOCAL`
- `HISTORICAL_REPLAY_PROTECTION=PASS_LOCAL`
- `POST_ADOPTION_BOUNDED_RECOVERY=PASS_LOCAL`
- `INVALID_WATERMARK_FAIL_CLOSED=PASS`
- `MEMORY_MAX_RSS_MIB=664`
- `MEMORY_HEADROOM_PERCENT=35.2`
- `PRODUCTION_BUILD=PASS`
- `RECOVERY_AUTHORITY=UNCHANGED_OFF`
- `PRODUCTION_DEPLOYED=NO`
- `INFRA_ALERTS_ACTIVATED=NO`
- `NATIVE_CHANGED_OR_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `DEXA_EVIDENCE_CLEANUP=QUEUED`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not change `latest.md`, `latest.json`, release pointers, production configuration, or production data.
