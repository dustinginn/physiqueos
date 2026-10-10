# P0 Server `2e4af15c` guarded production deployment — LIVE / restart durability verified

- Published: `2026-10-10T19:48:01Z`
- Task id: `authorized-p0-2e4af15c-deploy-and-restart-20261010`
- Founder deployment/restart authority: `ec59ebc6`
- Exact deployed Server: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Prior and exact rollback Server: `60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`
- Guarded deployment: `7afe8e2a-c353-4dca-afff-fe92a7b7b8a1`
- Authorized same-build Worker restart: `78a7ea18-764e-4774-b3b1-17f96cf9c8b1`
- Build: `physiqueos-2e4af15c-20261010`
- Result: **ACTIVE 9/9; immutable adoption watermark verified across heartbeat updates and the controlled restart**
- Recovery: **OFF**
- External beta assessment: **NO-GO pending operational alert routing, Native processing-state integration, physical-device acceptance, and the seven-day observation gate**

## Executive result

Founder authorization at `ec59ebc6` explicitly approved the guarded production deployment of exact Server candidate `2e4af15c` and exactly one controlled same-build Worker restart. Every preflight gate passed, so the established production branch was fast-forwarded from exact `60d08a22` to exact `2e4af15c`. The provider spec changed only the Web and Worker SHA/build stamps, and one guarded force rebuild produced deployment `7afe8e2a…`, ACTIVE 9/9.

After deployment, Web and Worker source/runtime identity, public health, readiness, schema, Recovery state, processing queues, HealthKit policies, October 9 DEXA lineage, and September 14 Training seals all passed. The watchdog's PostgreSQL heartbeat `observed_at` advanced while `details.buildAdoptedAt` remained fixed. With zero active/failed evidence reviews reconfirmed, exactly one component-scoped Worker restart was then executed through the provider's documented `apps restart --components worker --wait` path. Restart operation `78a7ea18…` completed ACTIVE 9/9 using the same build.

The post-restart Worker started in a new process, resumed healthy heartbeats, and retained the original immutable adoption boundary exactly. No historical review became recovery-eligible, no recovery event ran, no review/outbox state changed, and all protected canonical/performance/DEXA/HealthKit seals remained unchanged. No rollback trigger occurred, so exact `2e4af15c` remains live.

## Authority and preflight ledger

| Gate | Verified result |
|---|---|
| Instruction | Exact prompt at `ec59ebc6`; explicit deploy plus one Worker restart authority |
| Live baseline | Web/Worker/runtime exact `60d08a22`; deployment `178e5464…`, ACTIVE 9/9 |
| Candidate integrity | Remote/local exact `2e4af15c`; clean; direct fast-forward descendant; exact expected eight-file diff |
| Concurrent work | No in-progress deployment; zero active/failed reviews; zero live/queued claims |
| Schema | 15 migrations; latest `000015_sender_constrained_refresh_recovery`; candidate has no migration |
| Recovery | Publication authority absent; OFF |
| Topology/cost | One Web and one Worker in `sfo`, both `apps-s-1vcpu-1gb-fixed`; unchanged |
| Provider spec | Exactly four SHA/build values changed; neutral pre/candidate digest identical: `195dd66f79ef39249eb6d03daee09b7f0a35ddd2163daf59432d0fe8257d2b2c` |
| Storage | 19 GiB free; 12 GiB floor preserved |
| Protected data | September 14 review/workout/performance/history and October 9 DEXA/briefing/writeback seals exact |

All production database audits used the approved owner-scoped console, bounded sanitized `SELECT` statements, `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, and `ROLLBACK`.

## Candidate validation credited at exact SHA

The candidate was unchanged from the fresh preflight published at `bd76cf2a`, so those exact-SHA results remain valid:

| Gate | Result |
|---|---:|
| Actual PostgreSQL 18.4 heartbeat/restart suite | **3/3 pass** |
| Focused reliability/DEXA/crash/retry suite | **16 files, 151/151 pass** |
| Atomic PostgreSQL-facade recovery target | **1 pass; 18 skipped by exact filter** |
| Collected provider Worker artifact | **4/4 pass** |
| Production Web build | **pass; 50/50 static pages** |
| Changed-file lint and diff check | **pass** |

Immediately before deployment, the changed watchdog/store/artifact targets were reconfirmed at **19/19 pass**. The memory harness also passed all three scenarios with no OOM or restart:

- entry-scope peak RSS: 335 MiB;
- bounded end-to-end peak RSS: 654 MiB;
- bounded confirmation/cadence concurrency peak RSS: 662 MiB, 64.65% of the nominal 1 GiB Worker limit;
- measured headroom: **35.35%**, above the proposed 30% beta floor.

## Deployment execution and runtime parity

1. Fast-forwarded only `combined-app-platform-cutover` from `60d08a22` to exact `2e4af15c`.
2. Applied the verified four-stamp-only provider spec; the mode-0600 temporary spec was deleted immediately after acceptance.
3. Started one guarded force rebuild: `7afe8e2a-c353-4dca-afff-fe92a7b7b8a1`.
4. Observed `PENDING_BUILD` → `BUILDING` → `DEPLOYING` → `ACTIVE`, 9/9.
5. Verified Web and Worker source SHA, runtime SHA, and build stamp all exact.

Postdeployment public checks:

| Check | Result |
|---|---:|
| `/api/v1/health/live` | HTTP 200, `ok`, exact build |
| `/api/v1/health/ready` | HTTP 200, `ready`, 9 checks |
| Web source/runtime | exact `2e4af15c` |
| Worker source/runtime | exact `2e4af15c` |
| Concurrent deployment | none |

## Immutable adoption watermark proof

The first Worker process started at `2026-10-10T19:44:08.325Z`. PostgreSQL stored one current-build heartbeat row with immutable `details.buildAdoptedAt = 2026-10-10T19:44:17.378Z`.

### Before restart

| Snapshot | Heartbeat `observed_at` | `buildAdoptedAt` |
|---|---|---|
| 1 | `2026-10-10T19:44:57.576Z` | `2026-10-10T19:44:17.378Z` |
| 2 | `2026-10-10T19:45:11.727Z` | `2026-10-10T19:44:17.378Z` |

The liveness timestamp advanced 14.151 seconds across many heartbeat ticks while the adoption boundary remained identical.

The latest pre-restart watchdog sample had zero active, stale, adopted-stale, historical-stale, or dead-continuation records; zero recovery events; 38.69% RSS; and healthy heartbeat age.

### Controlled restart

After reconfirming zero active/failed reviews, exactly one authorized call was made:

`doctl ... apps restart ... --components worker --wait`

Provider operation `78a7ea18-764e-4774-b3b1-17f96cf9c8b1` completed ACTIVE 9/9 at `2026-10-10T19:46:50Z`, reusing the prior build. The new Worker process started at `2026-10-10T19:46:36.830Z` with the exact candidate identity.

### After restart

| Snapshot | Heartbeat `observed_at` | `buildAdoptedAt` |
|---|---|---|
| 1 | `2026-10-10T19:47:14.743Z` | `2026-10-10T19:44:17.378Z` |
| 2 | `2026-10-10T19:47:29.874Z` | `2026-10-10T19:44:17.378Z` |

The post-restart liveness timestamp advanced another 15.131 seconds, while the adoption boundary remained exactly the original value. The post-restart watchdog log also reports `adoptionBoundary = 2026-10-10T19:44:17.378Z`, distinct from the new process start. Its sample had zero active/stale/historical reviews, zero dead continuations, zero recovery events, 38.18% RSS, and 1.06% CPU.

This closes the P0 restart-durability defect: original deployment adoption survives both in-place heartbeat updates and a same-build Worker restart.

## Processing and data parity

Before and after the restart:

- evidence reviews remained 203 confirmed, 38 discarded, 8 resolved confirmed, and 1 retired;
- active/failed reviews, live claims, and queued claims remained zero;
- continuation outbox remained 728 succeeded and 13 known historical dead rows, with no pending/processing work;
- no `evidence.processing.recovered` or `evidence.processing.recovery_failed` event appeared;
- the September 14 review remained retired at version 20, `autoResumeCount=0`;
- the canonical September 14 workout seal remained exact, with 4 exercises and 16 complete sets;
- all five performance-event seals and the five-session history seal remained exact;
- goals remained 13 with the exact digest, and briefings remained 61 with the exact digest;
- the broad Training aggregate was 14,831 records before the restart and remained 14,831 with the same digest afterward;
- October 9 DEXA remained one canonical row/logical key/fingerprint, revision 1, not removed;
- the bound DEXA briefing remained Confidence 70 from prior 80 with `decreased` movement;
- both expected HealthKit writeback receipts remained materialized/present;
- HealthKit activation/graduation/writeback policies were unchanged and historical backfill remained off;
- Recovery publication authority remained absent/OFF.

No historical replay, unexpected recovery, canonical evidence mutation, workout/performance mutation, DEXA mutation, HealthKit receipt mutation, policy change, or migration was observed.

## Rollback disposition

The documented critical rollback triggers were not met: deployment and restart are ACTIVE 9/9, exact runtime parity holds, the immutable adoption timestamp is fixed, public health is green, watchdog liveness resumed, no replay/recovery occurred, protected data is exact, and memory remains within threshold. Rollback was therefore **not** performed. Exact rollback anchor `60d08a22` remains documented if a later critical regression is found.

## Remaining beta-readiness requirements

1. **P0 operations:** activate and exercise durable infrastructure alert routing under separate authorization. Structured watchdog logs do not by themselves guarantee operator notification.
2. **P0 Native dependency:** integrate durable Server processing states into a separately reviewed consolidated Native build. No Native/TestFlight action occurred here.
3. Complete seven clean production days from this deployment: p95 RSS below 75%, every operation below 85%, at least 30% headroom, zero OOM/unplanned restarts, zero unalerted dead continuations, no review stranded beyond two leases, and immutable adoption across any later same-build restart.
4. Complete physical iPhone/Watch acceptance for the already-queued consolidated Native HealthKit/widget/workout changes before external beta.
5. Retain the comprehensive audit's P1 Weight, latency, HealthKit ingest, timeout, note-intake, notification, and new-user recovery gates.
6. Keep DEXA Evidence page cleanup queued for later safe Native consolidation.

External beta remains **NO-GO** until these operational and Native gates are complete. The Server P0 immutable-adoption correction itself is deployed and verified.

## Flags

- `EXACT_SERVER_DEPLOYED=YES_2e4af15c`
- `DEPLOYMENT_ACTIVE=YES_9_OF_9`
- `CONTROLLED_WORKER_RESTART=ONE_COMPLETED_9_OF_9`
- `WEB_WORKER_RUNTIME_PARITY=PASS`
- `PUBLIC_HEALTH=PASS_9_OF_9`
- `IMMUTABLE_BUILD_ADOPTION=PASS_ACROSS_TICKS_AND_RESTART`
- `BUILD_ADOPTED_AT=2026-10-10T19:44:17.378Z`
- `RECOVERY_AUTHORITY=OFF`
- `ACTIVE_OR_FAILED_REVIEWS=0`
- `HISTORICAL_REPLAY=NONE`
- `UNEXPECTED_RECOVERY=NONE`
- `PROTECTED_DATA_PARITY=PASS`
- `MEMORY_MAX_RSS_MIB=662`
- `MEMORY_HEADROOM_PERCENT=35.35`
- `ROLLBACK_TRIGGERED=NO`
- `INFRA_ALERTS_ACTIVATED=NO`
- `NATIVE_CHANGED_OR_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `DEXA_EVIDENCE_CLEANUP=QUEUED`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move `latest.json`, `latest.md`, any Native release pointer, infrastructure alerting, Recovery authority, Goal Adaptation, or queued Native work.
