# P0 watchdog guarded preflight and consolidated Native HealthKit/Watch candidate

- Task id: `p0-2e4af15c-preflight-native-healthkit-watch-20261010`
- Published: `2026-10-10T19:20:51Z`
- P0 instruction commit: `23e7cea9`
- Watch UI instruction commit: `3de0c4fa`
- recurrent HealthKit instruction commit: `ed3a0f9b`
- exact live Server: [`60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`](https://github.com/dustinginn/physiqueos/commit/60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde)
- exact P0 Server candidate: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- exact consolidated Native candidate: [`8ba52df9b0a3012b1b3826d2353933551c736e1b`](https://github.com/dustinginn/physiqueos/commit/8ba52df9b0a3012b1b3826d2353933551c736e1b)
- Native candidate branch: [`codex/next-native-widget-remove-weight-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/next-native-widget-remove-weight-20261010)
- production deployment: **not performed**
- Worker restart: **not performed**
- Native/TestFlight release: **not performed**
- Recovery: **unchanged / OFF**
- external beta assessment: **NO-GO pending the separately authorized P0 deployment/restart proof and remaining operational gates**

## Executive result

The exact P0 Server candidate is ready for a guarded deployment, but the governing instruction does not supply the separate exact-candidate deployment authority or the explicit controlled Worker-restart authority it requires. I therefore completed the full read-only preflight, re-ran the release gates, published the ready-to-run plan below, and stopped before mutation. Production remains exact `60d08a22`, healthy 9/9, with Recovery OFF, no active/failed evidence reviews, no queued live work, no historical replay, and unchanged September 14 Training and October 9 DEXA/HealthKit seals.

The next consolidated Native candidate is complete at exact `8ba52df9`. It contains the already-reviewed Today widget Weight removal at parent `49113cb5`, the Watch workout footer/amber correction, and a durable iPhone/Watch HealthKit authorization boundary. DEXA Evidence presentation cleanup `a26d89ad` remains separately queued because combining that change here was not consolidation-safe. No build was uploaded.

## P0 guarded Server preflight

### Authority and live-state gates

| Gate | Verified result |
|---|---|
| Live source/runtime | Web and Worker exact `60d08a22`; build `physiqueos-60d08a22-20261010` |
| Candidate integrity | Remote exact `2e4af15c`; direct fast-forward descendant of live; exact expected eight-file diff |
| Provider deployment | `178e5464-5e62-405b-8832-540f76c471c5` ACTIVE; no concurrent deployment |
| Topology | one Web and one Worker; unchanged region/size topology |
| Public health | `/live` 200 in 0.198 s; `/ready` 200 in 0.157 s; readiness 9/9 |
| Database | latest migration `000015_sender_constrained_refresh_recovery`; no migration in candidate |
| Recovery | absent/OFF; no Recovery or Goal Adaptation activation |
| Provider spec | candidate dry-run changes only four Web/Worker SHA/build stamps; neutral digest parity passed |
| Storage | 17 GiB free after local validation; 12 GiB floor preserved |

### Production safety seals

- Evidence review states: 203 confirmed, 38 discarded, 8 resolved, 1 retired; **0 active/failed**.
- Live queued evidence work: **0**.
- Outbox: 728 succeeded and 13 already-known historical dead rows; no new live continuation.
- September 14 Training review remains retired at version 20. The preserved workout session, exercises, sets, reps, loads, history, and performance-record seals are unchanged.
- October 9 DEXA canonical values and lineage remain exact; the two HealthKit writeback receipts remain present and unchanged.
- Recent broad activity consisted only of ordinary October 10 HealthKit observations. No historical confirmation replay was observed.

### Candidate release gates

| Gate | Result |
|---|---:|
| Actual PostgreSQL 18.4 heartbeat/restart suite | **3/3 pass** |
| Focused evidence reliability and DEXA suite | **16 files, 151/151 pass** |
| Exact atomic PostgreSQL-facade recovery target | **1 pass, 18 skipped by exact filter** |
| Collected provider Worker artifact | **4/4 pass** |
| Changed-file lint and diff check | **pass** |
| Production Web build | **pass; 50/50 static pages** |
| Memory harness | **3/3 pass; no OOM/restart** |

Peak measured RSS was **660 MiB**, 64.45% of the nominal 1 GiB Worker limit, leaving **35.55% headroom**. It passes the proposed beta thresholds: steady/p95 under 75%, each operation under 85%, and at least 30% headroom.

### Why deployment stopped

The assignment authorizes guarded preparation and permits deployment only if exact release authority already exists. It separately requires explicit authority for the controlled same-build Worker restart. Neither authorization is present in this assignment. Deploying or restarting would therefore exceed the active operator contract. This is a deliberate gate, not a failed technical check.

### Ready-to-run guarded deployment plan

1. Receive explicit authority to deploy exact `2e4af15c67e1899933f315e9ea0c4922151c8803` and, separately, to perform one controlled same-build Worker restart.
2. Re-fetch live and candidate refs; require the exact ancestry/diff, one ACTIVE deployment, 9/9 readiness, Recovery OFF, zero active/failed reviews, and unchanged September 14/October 9 seals. Stop on drift.
3. Re-run the bounded PostgreSQL, reliability, memory, artifact, lint, diff, and production-build gates while retaining at least 12 GiB free.
4. Fast-forward only the established Server production branch and require the provider spec to change only the four SHA/build stamps. No migration, topology, cost, policy, alert, or data mutation.
5. Require Web/Worker/source/runtime parity at `2e4af15c`, public 200/200, readiness 9/9, healthy watchdog ticks, and a `buildAdoptedAt` value that remains identical while heartbeat liveness advances.
6. With the separately authorized restart and only after reconfirming zero active/failed reviews, restart one Worker. Require the same immutable `buildAdoptedAt`, no historical replay, no pre-boundary recovery, unchanged canonical/performance seals, and healthy memory/readiness.
7. Roll back code-only to exact `60d08a22` on parity failure, watermark movement, readiness below 9/9, unexpected replay/recovery, seal drift, RSS at or above 85%, OOM/restart, or any safety-gate failure.

## Recurrent HealthKit authorization — root cause and correction

### Evidence and call graph

Every raw request is now behind one coordinator on each device. The audit found these entry paths:

- iPhone process launch/background observer registration: automatic read scope, presentation prohibited;
- iPhone foreground activation/startup synchronization: automatic read scope, presentation allowed;
- protected-data recovery: automatic read scope, presentation prohibited;
- manual Log refresh: automatic read scope, deliberate foreground presentation;
- explicit Sleep diagnostic: separate sleep-only read scope;
- explicit DEXA writeback enable: separate body-composition write scope;
- Watch automatic workout initialization: exact workout/heart-rate/active/basal set, presentation prohibited;
- Watch direct Start/Retry: the same exact set, presentation allowed.

Build 93/94/95 history showed no expansion of the declared HealthKit type sets. The prior correction preflighted with `getRequestStatusForAuthorization`, but remembered completed scopes only in process memory. Relaunch, Watch extension restart, or update discarded that knowledge, allowing lifecycle and workout paths to revisit the same OS request. Overlap was serialized only within one process lifetime. That is the application-level recurrence this candidate corrects.

Apple's contract is important to the boundary: `.shouldRequest` means the app has not previously requested every supplied type; a genuinely new type can legitimately produce a sheet; and read authorization remains privacy-preserving/opaque, so the app must not claim that a completed request means every read type was granted. References: [authorization request status](https://developer.apple.com/documentation/healthkit/hkauthorizationrequeststatus/shouldrequest), [authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data), and [`requestAuthorization`](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestauthorization%28toshare%3Aread%3A%29?changes=_7).

### After `8ba52df9`

- iPhone and Watch independently persist a local-only receipt for the exact read/write identifier sets whose authorization flow completed. It is an attempt/decision receipt, never a claim of read grant.
- Repeated launch, foreground, background, manual sync, Watch workout, relaunch, and build-update calls skip both status preflight and raw request when the exact set is already covered.
- A completed denied or partial decision is also remembered, preventing nagging; any user permission change stays user-controlled in Settings. DEXA continues checking observable per-type write status before writing.
- A genuinely new identifier is not covered, so it performs the normal preflight and may request once.
- Existing iPhone installs adopt only the frozen v1 automatic-read set when the already-operating owner-identity cache proves that lane previously ran. Existing Watch installs adopt only the original exact workout set when HealthKit reports that workout sharing has a decided state. Neither migration boundary can swallow a future type expansion.
- Concurrent requests remain coalesced to one sheet. Background/automatic callers never present consent; a foreground/direct caller can deliberately finish a deferred request.
- Privacy-safe local diagnostics retain an installation id, session id, build, bounded event counts, per-reason counts, and last reason. They contain no Health data and are not uploaded.
- Existing Activity, Nutrition, Workout, Sleep, DEXA writeback, Cardio, and Strength ingestion/writeback paths remain wired and covered by focused regressions.

### Before/after behavior

| Scenario | Before | Candidate |
|---|---|---|
| Same exact set after relaunch/update | OS status preflight repeated; could re-enter request | durable exact-set skip |
| Foreground plus overlapping sync | in-process coalescing only | in-process coalescing plus durable boundary |
| Background/startup needs new consent | preflight, no sheet | unchanged: defer, no sheet |
| Direct Watch Start needs first consent | preflight, then one sheet | unchanged: preflight, then one sheet |
| Denied/partial completed sheet | could be revisited after process loss | completed decision remembered without claiming grant |
| Truly new data type | OS preflight/request | unchanged: uncovered type can request exactly once |

## Watch workout footer and amber actions

Source inspection ruled out an app divider and an iPhone-style home indicator. The active workout is a watchOS vertical-page `TabView`; on watchOS 26 its bottom scroll-edge effect produced the Founder-visible thin band above the action region. The candidate hides only that bottom edge effect on the active vertical pager and the already-existing overflow panel. Crown/vertical paging, the system clock, page indicator, navigation, safe-area behavior, and accessibility scrolling remain intact.

`Start Workout` (the Ready for Workout state), `Complete Set`, final-set `Finish Workout`, and confirmation Finish now use the accepted workout amber token with contrast-safe ink in both Watch appearances. The matching iPhone `Ready on Watch` primary handoff uses the same semantic amber. Secondary, quiet, and destructive actions are unchanged.

Local simulator inspection of the real shipping views confirmed:

- Mineral Light execution screen: no thin bottom band; Complete Set is amber and fully visible.
- Dark Ready for Watch screen: Start Workout is amber and fully visible.

## Consolidated Native validation

| Validation | Result |
|---|---:|
| iPhone focused HealthKit/DEXA/sync/widget/workout-theme suite | **154 executed, 1 opt-in render skipped, 0 failures** |
| Final iPhone authorization rerun | **18/18 pass** |
| Watch authorization suite | **8/8 pass** |
| Watch footer and primary-action UI suite | **4/4 pass** |
| Watch target + unit/UI test bundles, arm64/x86_64 | **build-for-testing pass** |
| Widget core suite | **27/27 pass** |
| Diff whitespace check | **pass** |

The opt-in widget acceptance renderer was the sole skip; the shipping view render test and the specific dark/Mineral Weight-independence test passed. No broad unrelated UI suite was run.

## Exact Native candidate composition

`8ba52df9` is a clean descendant of `49113cb5`:

1. `49113cb5` — removes only the Weight row from the Today widget, tightens the layout, and preserves the other widget data/actions.
2. `8ba52df9` — adds durable HealthKit request receipts/coalescing/diagnostics and the Watch footer/amber corrections.

The branch is clean and pushed. It is queued for the next consolidated Native build; no standalone archive, TestFlight upload, or release pointer was created.

## Remaining risks and beta gates

1. **P0:** production still runs `60d08a22`. External beta remains blocked until exact `2e4af15c` deployment plus immutable-watermark same-build restart proof complete under explicit authority.
2. **P0:** durable infrastructure routing for watchdog alerts is still not activated. Structured logs alone do not close the operational notification requirement.
3. **P0:** Native evidence-processing state presentation is still only a plan; it is not part of this candidate.
4. **P0:** complete at least seven clean production days after the P0 deployment with p95 RSS below 75%, every operation below 85%, at least 30% headroom, zero OOM/restarts, zero unalerted dead continuations, and no review stranded beyond two leases.
5. **Native device acceptance:** run repeated iPhone/Watch launches, foreground/background transitions, one update preserving the same exact types, and one deliberately new-type request on Founder hardware before external beta. Simulator tests prove application control flow but cannot prove whether a particular OS build elects to draw a system permission sheet.
6. DEXA Evidence presentation cleanup `a26d89ad` remains queued for a later safe consolidation. It was intentionally not cherry-picked here.
7. No infrastructure alerts, production policy, Server runtime, Recovery, Goal Adaptation, Native release, or TestFlight state changed in this task.

## Flags

- `P0_SERVER_CANDIDATE=2e4af15c67e1899933f315e9ea0c4922151c8803`
- `P0_PREFLIGHT=PASS`
- `P0_DEPLOYED=NO_AUTHORITY`
- `CONTROLLED_WORKER_RESTART=NO_AUTHORITY`
- `RECOVERY=OFF`
- `HEALTH=9_OF_9`
- `MEMORY_MAX_RSS_MIB=660`
- `MEMORY_HEADROOM_PERCENT=35.55`
- `HISTORICAL_REPLAY=NONE`
- `NATIVE_CANDIDATE=8ba52df9b0a3012b1b3826d2353933551c736e1b`
- `NATIVE_BRANCH=codex/next-native-widget-remove-weight-20261010`
- `NATIVE_TESTFLIGHT_UPLOADED=NO`
- `WIDGET_WEIGHT_REMOVAL=INCLUDED`
- `WATCH_BOTTOM_BAND=REMOVED`
- `WATCH_PRIMARY_AMBER=STANDARDIZED`
- `HEALTHKIT_DURABLE_EXACT_SET_BOUNDARY=IMPLEMENTED`
- `DEXA_EVIDENCE_CLEANUP=QUEUED_SEPARATELY`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move `latest.json`, `latest.md`, any release pointer, or any production/Native release state.
