# P0 Server `60d08a22` guarded production deployment — LIVE / healthy, restart-adoption durability HOLD

- Published: `2026-10-10T17:58:50Z`
- Founder authorization: `79d9b410af4c5d24ffc9c606d938bf5704b3099b`
- Exact deployed Server: [`60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`](https://github.com/dustinginn/physiqueos/commit/60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde)
- Prior/rollback Server: `85a9802587de0ef23ff2021e803258dea825254d`
- Deployment: `178e5464-5e62-405b-8832-540f76c471c5`
- Build: `physiqueos-60d08a22-20261010`
- Runtime result: **ACTIVE 9/9, Web/Worker/runtime exact, public health green**
- Data result: **no historical replay; September 14 workout/performance seals unchanged**
- Postflight acceptance: **HOLD on durable adoption watermark across a future worker restart**
- External beta: **NO-GO**

## Executive result

Exact Server candidate `60d08a22` was fast-forwarded onto `combined-app-platform-cutover` and deployed through the established four-stamp spec update plus one manual force rebuild. Deployment `178e5464…` reached `ACTIVE` with all nine provider steps successful. Web and Worker source hashes, runtime hashes, and build stamps are exact. Public live and ready endpoints return HTTP 200, with all nine readiness checks green.

The worker started the new watchdog and emitted eight healthy samples during postflight. There were zero active/stale reviews, zero recovery events, and no replay of the retired September 14 confirmation. Recovery remains OFF. Schema, topology, instance sizes, HealthKit policies, the October 9 DEXA lineage, and protected September 14 Training data passed bounded read-only parity checks.

Postflight identified one source-design gap not exposed by the inherited test: `worker_heartbeats` updates one stable worker row in place, including `observed_at`. The monitor queries `min(observed_at)` as the supposed build-first heartbeat. That value therefore advances every second and cannot reproduce the original deployment boundary after a later worker restart. The current process is safe because it takes the earlier of its own start and the current heartbeat, but a future same-build restart could classify an earlier post-deployment failure as historical/alert-only instead of recovery-eligible.

This is under-recovery, not historical replay, and there is no current affected review. It is not a critical runtime regression relative to prior production, which had no watchdog recovery at all. The documented rollback trigger was therefore not met; `60d08a22` remains live and healthy. No further production mutation was performed after this finding. A narrow follow-up candidate must make the build adoption timestamp immutable before beta credit or any restart-resilience claim.

## Preflight gate ledger

| Gate | Result |
|---|---:|
| Exact assignment/candidate | `79d9b410`; candidate remote and local exact `60d08a22` |
| Production lineage | live `85a98025` was the candidate merge base; three exact commits ahead; fast-forward |
| Old deployment authority | `40122906-34f0-4d0a-91cf-8c943a15e603`, ACTIVE 9/9, no in-progress deployment |
| Old Web/Worker/runtime | exact `85a98025`, build `physiqueos-85a98025-20261009` |
| Public health | live 200 `ok`; ready 200 `ready`, 9 checks |
| Candidate worktree | clean; remote branch exact; diff check clean |
| Focused P0 suite | 19 files, **150/150 pass** |
| Atomic recovery/lease target | **1 pass, 18 skipped by exact test-name filter** |
| Production build | PASS: compile, TypeScript, 50/50 static pages, route traces |
| Schema | 15 migrations; latest `000015_sender_constrained_refresh_recovery` |
| Recovery | authority row absent; **OFF** |
| Active/failed evidence reviews | 0 |
| Sep 14 review | one `retired` review, version 20; exact payload/rollback seals |
| Storage | 16 GiB free; 12 GiB floor preserved |

Candidate scope from exact old production to exact new production is 36 files: the two reviewed P0 reliability commits plus the historical disposition/adoption-boundary commit. It contains no Native, migration, infrastructure, instance-size, dependency, Goal Adaptation, Recovery policy, or DEXA Evidence presentation change.

### Spec gate

The generated private spec changed exactly four values:

- Web `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`;
- Worker `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`.

The neutral pre/candidate spec digest was identical: `195dd66f79ef39249eb6d03daee09b7f0a35ddd2163daf59432d0fe8257d2b2c`. Topology remained one Web and one Worker, each `apps-s-1vcpu-1gb-fixed`, in `sfo`. The temporary plaintext spec was mode `0600` and deleted immediately after update acceptance.

## Production data preflight

Every database audit used the approved application console, one bounded owner-scoped connection, `REPEATABLE READ READ ONLY`, explicit `transaction_read_only=on`, bounded `SELECT` statements, sanitized output, and `ROLLBACK`.

### Processing state

| Review status | Count |
|---|---:|
| confirmed | 203 |
| discarded | 38 |
| resolved confirmed | 8 |
| retired | 1 |

There were no `committing`, `commit_failed`, or `partially_committed` reviews; no live or queued claims; and no recoverable historical review. Evidence continuation outbox state was 728 succeeded and 13 historical dead, with no pending/processing messages.

### September 14 exact preservation

| Protected item | Predeploy seal/state |
|---|---|
| Review | version 20 `retired`, payload SHA-256 `37c4b8e395995e62cabf78839702e1fd5a84e8c762eceb9eaf15e7f222f74968` |
| Rollback anchor | prior version 19, prior payload SHA-256 `38b3e48780970b0375ac95d5ac18fccd8e5690bd6b58c43f4966ef4e65786cd1` |
| Canonical workout | SHA-256 `2e00e2fa962888c8f4a65fe8005f1be436ba97585220b50a24291a0b1dfb80ba`; 4 exercises / 16 complete sets |
| Performance | 5 unique events; all five payload seals exact |
| Relevant history | 5 sessions including target; SHA-256 `cb60ee631078b776b790babdb1daa97f8a63026e1d3c6a14eca2078db8e71a1a` |
| Target outbox | 1 dead audit row / 4 succeeded; no live continuation |

Goals remained 13 / digest `254b12f7bf836699b1b49f4712856214`; briefings remained 61 / digest `4c2454439ac9ce48a59a7601f59fb3d7`.

One broad Training aggregate changed between the earlier retirement report and this deploy preflight. Narrow diagnosis found one new HealthKit observation and the expected update to October 10 canonical HealthKit day data at 17:33 UTC. The exact September 14 review/workout/performance/history seals were unchanged, so this was classified as normal live Founder ingestion rather than deployment drift. That immediate predeploy Training baseline was 14,808 rows / digest `797965b8a1f0dcf0f225e7180c91255f`.

### HealthKit and October 9 DEXA

- Recovery publication authority: absent/OFF.
- Daily HealthKit activation: absent.
- Workout policy: version 4, enabled for Cardio/Strength, link auto-confirm off, strategic eligibility quarantined, historical backfill off.
- Graduation policy: version 4; Activity/Nutrition projection and the accepted evidence domains unchanged; historical briefing regeneration off.
- DEXA writeback: version 1, prospective from October 9, two accepted measurement kinds, historical backfill off.
- October 9 DEXA: one row/logical key/fingerprint, revision 1; one fully bound briefing; Confidence 70 from 80, `decreased`; two expected HealthKit receipts, both materialized/present.

## Deployment execution

1. Reverified the production branch at exact `85a98025` and candidate branch at exact `60d08a22`.
2. Fast-forwarded only `combined-app-platform-cutover` to exact `60d08a22`.
3. Applied the four-stamp-only spec.
4. Started exactly one manual force rebuild: `178e5464-5e62-405b-8832-540f76c471c5`.
5. Observed `PENDING_BUILD` → `BUILDING` → `DEPLOYING` → `ACTIVE`.

No migration, policy write, data repair, synthetic upload/confirmation, topology/cost change, infrastructure alert, Native change, TestFlight upload, Recovery activation, Goal Adaptation change, or DEXA Evidence UI merge occurred.

## Postflight results

| Gate | Result |
|---|---:|
| Deployment | `178e5464…`, ACTIVE 9/9, no in-progress deployment |
| Web source/runtime | exact `60d08a22` |
| Worker source/runtime | exact `60d08a22` |
| Build | exact `physiqueos-60d08a22-20261010` |
| Public live/ready | 200 `ok`; 200 `ready`; 9 checks |
| Schema/Recovery | unchanged; 15 migrations; Recovery OFF |
| Review/outbox distribution | unchanged; 0 active/failed; 728 succeeded / 13 dead |
| DEXA/HealthKit policies and receipts | unchanged |
| Sep 14 exact seals | unchanged; auto-resume count remains 0 |
| Historical replay | none; zero `recovered` or `recovery_failed` events |

The live worker started at `2026-10-10T17:54:31.842Z` and emitted the exact candidate identity. Eight watchdog samples were observed. The later sample at `17:58:06Z` reported:

- active/stale/adopted-stale/historical-stale reviews: all 0;
- dead continuations among watched active reviews: 0;
- heartbeat age: 579 ms;
- RSS: 19.64% of the 1 GiB service limit;
- CPU: 1.06%;
- recovery events: 0.

During deployment, normal live HealthKit ingestion added two source observations and a canonical October 10 day record/update. The broad Training aggregate therefore reached 14,811 rows. These records are HealthKit-shaped, timestamped to live intake, and unrelated to the watchdog or September 14 confirmation. The exact protected workout and all five performance-event hashes stayed unchanged.

## Failed postflight sub-gate: adoption watermark across restart

Current-process historical protection is working: watchdog logs pin the boundary to process start `2026-10-10T17:54:31.842Z`, the retired September review is excluded, and no recovery ran.

The promised durable same-build restart behavior is not proven and, under the deployed persistence semantics, is incorrect:

1. Production supplies a stable `PHYSIQUEOS_WORKER_ID`.
2. `PostgresOutboxStore.heartbeat()` uses `ON CONFLICT (worker_id) DO UPDATE` and replaces `observed_at` on every heartbeat.
3. `PostgresEvidenceProcessingReliabilityStore.inspect()` queries `min(observed_at)` for the build as the adoption timestamp.
4. Two read-only snapshots showed the sole current-build heartbeat moving from `17:56:07.430Z` to `17:58:28.843Z`.
5. On a future restart, the old process start is gone and the persisted row contains only its last heartbeat. A post-deployment review older than that final heartbeat could become historical/alert-only after restart.

The inherited restart unit test supplied a fixed old timestamp and did not exercise the actual heartbeat upsert. This creates a detection/recovery gap, not a duplicate-replay risk. No current production record is affected because there are zero active/failed reviews.

### Rollback decision

Rollback to `85a98025` was not triggered:

- Web/Worker/runtime and health are green;
- no data corruption, historical replay, unexpected review/outbox mutation, OOM, or restart occurred;
- the new memory bounds and current-process watchdog operate correctly;
- prior production had no watchdog recovery, so this is not a regression from a working cross-restart recovery capability.

The exact rollback anchor remains `85a98025` with the former build stamps and a force rebuild if a separate critical regression appears.

## Required P0 follow-up

Before beta or any claimed restart-resilience acceptance, produce a new separately reviewed Server candidate that persists an immutable build-adoption timestamp. The lowest-scope option is to preserve a `buildAdoptedAt` value in the existing heartbeat details for the same build while continuing to update liveness separately, resetting it only when build identity changes. Tests must use the real heartbeat upsert semantics and cover:

- first heartbeat and subsequent heartbeat updates;
- same-process ticks;
- same-build worker restart;
- build change;
- pre-boundary alert-only work;
- post-boundary recovery before and after restart;
- stable worker ID and changing worker ID cases;
- no duplicate replay, live-lease safety, dead-message revival, and resume exhaustion.

Do not restart production merely to test this. Deploy any correction only under a new exact-SHA authorization.

## Remaining beta-readiness requirements

1. Correct and deploy the immutable adoption watermark, then prove same-build restart behavior.
2. Activate and verify durable operational alert routing under separate authorization; no route was configured here.
3. Integrate Server processing states into a separately reviewed Native build; no Native/TestFlight action occurred here.
4. Complete at least seven clean production days after the corrected boundary is live: p95 RSS below 75%, every operation below 85%, at least 30% headroom, zero OOM/restarts, zero unalerted dead continuations, and no review beyond two leases.
5. Retain the comprehensive audit's P1 Weight, latency, HealthKit ingest, timeout, note-intake, notification, and new-user recovery gates.
6. Keep the DEXA Evidence page cleanup queued for the later consolidated Native build.

## Flags

- `EXACT_SERVER_DEPLOYED=YES_60d08a22`
- `DEPLOYMENT_ACTIVE=YES_9_OF_9`
- `WEB_WORKER_RUNTIME_PARITY=PASS`
- `PUBLIC_HEALTH=PASS_9_OF_9`
- `RECOVERY_AUTHORITY=OFF`
- `SEP14_RETIRED_REVIEW=PASS_VERSION20`
- `HISTORICAL_REPLAY=NONE`
- `WATCHDOG_CURRENT_PROCESS=PASS`
- `WATCHDOG_RESTART_ADOPTION_DURABILITY=HOLD`
- `ROLLBACK_TRIGGERED=NO`
- `INFRA_ALERTS_ACTIVATED=NO`
- `NATIVE_CHANGED_OR_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `DEXA_EVIDENCE_CLEANUP=QUEUED`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. `latest.md`, `latest.json`, Native/release pointers, infrastructure alerts, Recovery authority, Goal Adaptation, and queued DEXA Evidence presentation work remain unchanged.
