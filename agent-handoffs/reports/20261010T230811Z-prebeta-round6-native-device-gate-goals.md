# Pre-beta optimization Round 6 — Native device gate, Goals, and HealthKit

- Published: `2026-10-10T23:08:11Z`
- Instruction commit: `b262d050c5ebbcebc350137bd64453e4733255f2`
- Prior report: `agent-handoffs/reports/20261010T224217Z-prebeta-round5-healthkit-goals-tail.md` (`f1dc8840` on main)
- Live production Server, unchanged: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Preserved Round 5 Server candidate: [`46dc86c6963154f6a3bf2785beb3982969272fe2`](https://github.com/dustinginn/physiqueos/commit/46dc86c6963154f6a3bf2785beb3982969272fe2)
- Round 6 Server candidate: [`8162dd89f13aef470a03dd21b7e396f1555b338a`](https://github.com/dustinginn/physiqueos/commit/8162dd89f13aef470a03dd21b7e396f1555b338a)
- Server review branch: [`codex/prebeta-round6-goals-healthkit-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round6-goals-healthkit-20261010)
- Preserved consolidated Native candidate: [`9c58105990fa465c0a4d7d6898d21c271931191f`](https://github.com/dustinginn/physiqueos/commit/9c58105990fa465c0a4d7d6898d21c271931191f)
- Native tree: `a09d5aec928fae8da974e8a0812a384166879fb6`
- Result: **Server source candidate and physical-device gate published; no deployment, restart, infrastructure change, alert activation, HealthKit import, Native install/archive, or TestFlight upload occurred**
- External beta assessment: **NO-GO pending physical acceptance, the seven-day observation, and remaining concurrent Active Goal tail work**

## Executive result

Round 6 produces a second safe reduction in the two remaining database-heavy paths without changing API responses or canonical data semantics.

Aggregate Goals now hydrates only analyses with structured photo observations and the one Visible Abs completion briefing that its existing domain services can consume. On the same production snapshot, the exact response remains 3,291 bytes with the same `82a6deadec42ee9c` hash. Source rows fall from 983 to 530. Median falls from 1,322.7 to 386.9 ms and p95 from 1,730.6 to 642.9 ms. This meets the proposed below-750-ms single-read p95 gate in the bounded run. Under three-way concurrency, Goals improves from 2,403.1 / 2,778.4 ms to 1,102.6 / 1,348.4 ms, but remains above the target and therefore is not closed as a beta risk.

HealthKit ingestion no longer hydrates lifetime canonical Evidence and its metadata. After reading the incoming batch and current workout relationship state, it computes the exact local-date range represented by the incoming observations and active canonical workouts, then loads Evidence and immutable storage timestamps together for that range. Against the same larger account, the Round 5 candidate's initial-load shape falls from 6 queries, 1,349 rows, and 2.84 MB to 5 queries, 185 rows, and 454 KB. Median falls from 267.6 to 62.1 ms and p95 from 577.7 to 128.4 ms. This is an 84.0% byte reduction and 77.8% p95 reduction from Round 5, while preserving collision, provenance, workout coexistence, and canonical-day behavior.

Active Goal remains deliberately unchanged. Its ordinary median was 544.4 ms, but one 4,926.7 ms single-read outlier and a 5,880.5 ms concurrent outlier remain. The selected query plans themselves complete in about 3, 8, 29, and 0.1 ms; the route still transfers 4.96 MB and shows shared-database/transfer/parse variability. No guessed JSON projection was admitted without a general semantic contract and repeatable parity evidence.

The Native candidate is byte/source unchanged and clean. A fresh iPhone-simulator build compiled the iPhone and Watch targets and passed the selected historical-preview, HealthKit synchronization/authorization, and widget suites: 115/115. Physical acceptance did not run because the registered Founder iPhone and paired Apple Watch are both reported `unavailable`. The narrowest next route is a direct Xcode developer install of exact `9c581059` to the already-authorized iPhone, with its paired Watch companion, after the devices are connected and reverified. No archive or TestFlight distribution is needed for this acceptance gate.

Production remains exact `2e4af15c`, Web/Worker parity and 9/9 readiness are intact, Recovery/diagnostics/external alert delivery remain OFF, and the seven-day observation is still in progress until approximately `2026-10-17T19:46:50Z`.

## Lane A — consolidated Native physical-device gate

### Source and simulator integrity

- Native HEAD is exact `9c58105990fa465c0a4d7d6898d21c271931191f`; tree `a09d5aec928fae8da974e8a0812a384166879fb6`.
- The worktree is clean and connectivity verification passed. Unreferenced shared-repository objects were reported by `git fsck`, but no connectivity failure exists and the candidate tree is unaffected.
- The candidate still contains, without amendment: durable evidence-processing UI; durable iPhone/Watch HealthKit authorization; Watch amber primary workout actions and footer removal; Today widget Weight removal; priority schedule deduplication; and the local, value-free Apple Health historical preview.
- A first `test-without-building` attempt correctly failed as an environment/setup gate because the prior compiled app had been reclaimed during storage cleanup. A clean selected `xcodebuild test` then rebuilt iPhone and Watch targets and passed 115/115 selected tests with zero failure.
- No signing, archive, device install, or upload was performed.

### Device availability blocker

The current device inventory is:

| Device | OS/model | State |
|---|---|---|
| Dustin's Phone (`00008150-000970321420401C`) | iPhone 17 Pro / iOS 27.0.1 | **unavailable** |
| Dustin's Apple Watch Ultra (`00008310-0008D5C03C40E01E`) | Apple Watch Ultra 3 / watchOS 27.0.1 | **unavailable** |
| B91 Evidence iPhone 17 Pro | simulator | connected |

Physical acceptance is therefore **prepared, not executed**. Simulator success cannot substitute for HealthKit authorization persistence, real Apple Health queries, Watch pairing, widget refresh, or interruption behavior on physical devices.

### Narrowest safe distribution route

1. Connect and unlock the Founder iPhone by cable, accept trust if requested, and ensure Developer Mode is enabled. Keep the paired Watch unlocked, nearby, and connected to the phone.
2. Re-run device discovery. Stop unless both physical devices are `available` and Xcode exposes the iPhone plus its paired Watch destination.
3. Reverify clean exact Native HEAD `9c581059`, tree `a09d5aec`, at least 12 GiB free disk, no concurrent archive/upload process, and the existing production session/Health permissions.
4. Use Xcode **Run** from the exact source to upgrade the existing iPhone install in place and install the embedded Watch companion. This is a local developer-device acceptance install only: do not increment a release build, archive, upload, or use TestFlight.
5. Record build SHA, device/OS versions, timezone, start/end times, and screenshot/video evidence for every visual gate. Reject any source drift or unexpected signing target before launch.
6. Capture bounded read-only production counts/digests before and after. No historical preview value or Health payload may leave the device.

The direct-install step remains unexecuted because the devices are offline and this assignment explicitly forbids release. Once both devices are available, it is the smallest route to real-device evidence without creating a distribution artifact.

### Prominent gate: historical Apple Health preview

Run this before considering any historical import:

1. Open **You → Founder Server Connection → Apple Health History Preview**. Entry must not display a Health authorization sheet.
2. Explicitly tap **Preview May–July Apple Health**. Verify the displayed discovery window is May 21–October 10 and work proceeds oldest-first in seven-day chunks.
3. Cancel once, verify responsiveness, and explicitly restart. Complete one run and record only source-separated sample/day counts, canonical-day counts, safe-new-day counts, compacted gaps, and source-review counts—never Health quantity values.
4. Expected progress is 21/21 chunks. This is an expectation for the configured window, not a claim that the physical run has occurred.
5. Background/foreground during a run and force-quit/reopen. The preview must cancel or complete safely, must not auto-start, and must not prompt again.
6. Re-run bounded production reads. Evidence reviews, canonical Nutrition/Activity, completed goals, Confidence, and historical briefings must be logically/byte unchanged.
7. Fail closed on any permission sheet at entry, implicit start, value display/upload, chunk wider than seven days, uncancelable run, 50,000-sample metric ceiling, production mutation, confirmation, coaching, or briefing effect.

### Remaining consolidated acceptance matrix

- Three cold launches, three background/foreground cycles, one force-quit/relaunch, and an in-place update on iPhone: no repeated HealthKit sheet. Repeat Watch launch/pre-workout/workout paths. A genuinely new permission is the only valid reason for a new sheet.
- Automatic foreground/background Health sync and DEXA writeback retain existing behavior; denial/unavailability remains truthful and manual Evidence remains usable.
- Watch Ready for Workout, Complete Set, pause/resume, finish, and equivalent primary actions use accepted amber styling; there is no unwanted bottom bar; navigation, haptics, and workout persistence remain intact.
- Small and large Today widgets show Nutrition/macros/Activity/refresh/Start Logger but never Weight. Test Dark, Mineral Light, and large text without clipping.
- Foam Rolling renders exactly `Daily · 5:00 PM`; audit daily, weekly, one-off, peptide, workout, custom, and overdue priorities for true versus redundant schedule information.
- Submit synthetic manual evidence, close after durable acceptance, and verify Server-backed waiting/queued/processing/retrying/ready/failed recovery after relaunch and offline/reconnect. VoiceOver must announce truthful action state.

The committed detailed checklists remain `docs/operations/PREBETA_NATIVE_PHYSICAL_ACCEPTANCE.md` and `docs/operations/APPLE_HEALTH_HISTORICAL_PREVIEW_ACCEPTANCE.md` at exact Native candidate `9c581059`.

## Lane B — aggregate Goals correction

### Safe source-only boundary

The existing Goals service passes `analyses` only to `BodyCompositionEstimateService`, which consumes `metadata.structuredObservations` or `structuredObservations`; empty/missing arrays are a no-op. The read store now excludes only analysis rows with no non-empty structured observation array.

The Goals service passes `dailyBriefings` only to `CompletedGoalPreviewService`. That service has the existing canonical Visible Abs goal/date contract (`goal_visible_abs_at_rest`, `2026-07-18`) and falls back to canonical progress photos if the matching completion event is absent. The read store now retains only that matching completion briefing for this route. Home and other read models are unchanged.

No Training Evidence field projection, global-sort change, index, schema migration, response contract change, or goal-domain rewrite is included.

### Exact-response and latency evidence

Ten fixed-clock, alternating read-only production-snapshot samples returned a stable, exact response hash:

| Aggregate Goals | Round 5 candidate | Round 6 candidate | Change |
|---|---:|---:|---:|
| Queries | 2 | 2 | unchanged |
| Source rows | 983 | **530** | **-46.1%** |
| Analyses | 426 | **31** | **-92.7%** |
| Daily briefings | 59 | **1** | **-98.3%** |
| Source payload | 1,783,214 B | **1,610,746 B** | **-9.7%** |
| Median | 1,322.7 ms | **386.9 ms** | **-70.7%** |
| p95 / max | 1,730.6 ms | **642.9 ms** | **-62.8%** |
| Response | 3,291 B / `82a6deadec42ee9c` | **identical** | exact parity |

The main Goals query plan executes in 111.8 ms with no disk or temporary-block reads. In the preceding analysis-only candidate, the same query executed in 554.3 ms and still returned 59 briefings; the final one-briefing boundary accounts for the additional reduction.

### Bounded concurrency

The committed runner uses a three-connection pool, six waves, 18 total requests, per-request `REPEATABLE READ READ ONLY`, explicit rollback, a 20-second statement timeout, commands disabled, and SELECT/WITH-only guards. Nine samples per resource had stable response hashes and no failure.

| Three-way concurrency | Analysis-only intermediate | Final Round 6 | Change |
|---|---:|---:|---:|
| Goals median | 2,403.1 ms | **1,102.6 ms** | **-54.1%** |
| Goals p95 | 2,778.4 ms | **1,348.4 ms** | **-51.5%** |
| Goals queue p95 | 110.6 ms | **70.8 ms** | lower |
| Active Goal median | 1,473.7 ms | 1,459.0 ms | effectively unchanged |
| Active Goal p95 | 6,836.4 ms | 5,880.5 ms | still unacceptable |
| Maximum observed pool waiters | 0 | 0 | no pool saturation observed |

This is representative bounded concurrency, not a production load test. Goals still exceeds the beta p95 target under concurrency, and Active Goal remains the largest unclosed read tail.

### Active Goal investigation result

The unchanged Active Goal route returned the same 11,331-byte response with hash `2cbac6ebdc6198b7`, four queries, 346 rows, and 4,962,953 source bytes. Its single-read result was 544.4 ms median / 4,926.7 ms p95; its concurrent result was 1,459.0 / 5,880.5 ms.

`EXPLAIN (ANALYZE, BUFFERS)` completed the four selected statements in approximately 2.8, 8.4, 29.0, and 0.1 ms with no disk or temp reads. The plan is not exhibiting a stable expensive scan. The selected full briefing artifact and related JSON transfer/decoding remain the primary measurable amplification, while shared managed-database variability explains the intermittent multi-second tail. A future correction must define a general, tested latest-briefing projection that preserves midweek assessment binding, canonical Narrative V3, event typing, Confidence provenance, and exact Native output. Round 6 does not guess that contract.

## Lane C — remaining HealthKit ingestion delay

### Candidate behavior

Round 5 removed lifetime observation/day scans but still read all canonical Evidence twice (records and immutable storage metadata). Round 6 adds an owner-bound store operation that returns both together for the inclusive local-date range represented by:

- incoming observations; and
- existing canonical workouts that are active under the current workout policy.

HealthKit reconciliation compares Evidence only on those local dates, so older unrelated Evidence cannot affect matching or coexistence. The in-memory and PostgreSQL stores implement the same rule. Stores without the new operation retain the former full-list fallback, avoiding a hidden interface break.

### Read-only production load benchmark

The benchmark used the current production snapshot in one exact-SHA/owner-gated, `REPEATABLE READ READ ONLY` transaction; commands were disabled and every run rolled back. It selected 51 relevant observation identities, two canonical days, and a 19-day Evidence scope. Ten alternating samples per shape completed without failure.

| Initial HealthKit hydration | Legacy baseline | Round 5 | Round 6 | Round 5 → 6 |
|---|---:|---:|---:|---:|
| Queries | 10 | 6 | **5** | **-16.7%** |
| Rows | 2,631 | 1,349 | **185** | **-86.3%** |
| Serialized source bytes | 5,330,304 | 2,844,449 | **453,738** | **-84.0%** |
| Median | 657.8 ms | 267.6 ms | **62.1 ms** | **-76.8%** |
| p95 / max | 5,463.9 ms | 577.7 ms | **128.4 ms** | **-77.8%** |

This measures the initial hydration stage only. The current live Server still has Round 5's observed 6.5-second median / 25.8-second maximum full-command duration, and Round 6 has not been deployed. Relationship computation, writes, owner-lock residence, Native scheduling, and transport remain unmeasured in production. Command-stage diagnostics remain OFF; a later separately authorized bounded diagnostic window is still required before declaring the full ingest latency closed.

## Lane D — production reliability observation

The bounded observation covers `2026-10-10T19:46:37Z` through `23:05:03Z`, approximately 3 hours 18 minutes of the required seven days.

- App Platform is ACTIVE at deployment `78a7ea18-764e-4774-b3b1-17f96cf9c8b1`; Web and Worker both report exact `2e4af15c` and build `physiqueos-2e4af15c-20261010`.
- Deployment remains 9/9 successful. Public liveness and readiness return HTTP 200; all nine readiness checks pass.
- Across 396 reliability samples, adoption boundary is uniquely and durably `2026-10-10T19:44:17.378Z`; Worker identity matches every sample and maximum heartbeat age is 1,007 ms.
- Every sample has active 0, stale 0, adopted-stale 0, historical-stale 0, queued-too-long 0, and dead-continuation 0. No recovery occurred.
- Maximum reliability-sample RSS is 41.1%. Across 39 memory-budget samples, peak RSS is 42.7%, maximum admission queue wait is 12 ms, and the 85% hard limit remains untouched.
- One `EVIDENCE_PROCESS_CPU_HIGH` alert occurred at `19:46:40Z`, during Worker startup, with no evidence work attached. There is no recovery failure or later processing alert in the bounded window.
- Recovery, provider command diagnostics, alert webhook, and alert secret are absent and default OFF on both Web and Worker.
- Free Mac storage is currently 14 GiB, two GiB above the 12 GiB hard floor. It is acceptable but narrow; do not create an archive or duplicate DerivedData before the device gate.

The observation cannot be called complete before approximately `2026-10-17T19:46:50Z`. This report does not reset or replace that window.

## Validation

| Gate | Result |
|---|---:|
| Focused Server HealthKit/Goals slice | **108/108 pass** |
| Post-finalization focused rerun | **58/58 pass** across 5 files |
| Foundation suite | **39/39 pass** across 9 files |
| Phase 4 suite | **161/161 pass** across 17 files |
| Phase 5 suite | **83/83 pass** across 10 files |
| Changed-file ESLint | **pass** |
| Whitespace/diff check | **pass** |
| Read-only HealthKit benchmark | **30 alternating samples; rollback; no failure** |
| Core exact-response benchmark | **stable hashes; Goals baseline-identical** |
| Three-connection concurrency runner | **18 requests; stable hashes; no failure** |
| Focused Native simulator build/tests | **115/115 pass; iPhone and Watch targets built** |
| Native source/worktree integrity | **exact SHA/tree; clean; connectivity pass** |
| Physical iPhone/Watch | **blocked: both unavailable; not executed** |

## Guarded Server rollout plan — not authorization

Exact candidate `8162dd89f13aef470a03dd21b7e396f1555b338a` is a strict descendant of live `2e4af15c`. Its accumulated commits are:

1. `a1b4039c` — dormant durable alert routing;
2. `6e68af61` — bounded core navigation projections;
3. `b9198382` — bounded Log reads;
4. `46dc86c6` — bounded HealthKit/Active Goal reads and dormant diagnostics; and
5. `8162dd89` — date-scoped HealthKit Evidence hydration and Goals narrowing.

There is no schema or data migration. External alert delivery and command diagnostics remain inert without separately approved environment values.

A later guarded rollout should:

1. wait for the seven-day observation to close unless the Founder explicitly re-scopes that gate; reverify exact deployment authority, candidate SHA/branch integrity, clean source, and ancestry from `2e4af15c`;
2. reverify current production still exact `2e4af15c`, Web/Worker parity, 9/9 health, migration `000014`, durable immutable adoption boundary, no active/stale/queued/dead work, and unchanged canonical Evidence/performance digests;
3. prove Recovery, diagnostics, alert webhook/secret, historical import, and all data-repair authorities remain OFF;
4. deploy exact `8162dd89f13aef470a03dd21b7e396f1555b338a` as the sole change, with no Worker-only drift, Native release, alert activation, or historical import;
5. require Web/Worker/runtime exact-SHA parity and 9/9 readiness before traffic acceptance;
6. postflight the adoption boundary, no historical replay, no Evidence/performance drift, watchdog heartbeat/memory, and representative Home/Log/Goals/Active Goal reads;
7. observe real HealthKit ingest without diagnostics first. If a separate decision later enables diagnostics, use a bounded window, aggregate-only log review, and explicit disable verification; and
8. use the documented rollback to exact `2e4af15c` on SHA, readiness, data, replay, memory, or request-behavior drift. No database rollback should be needed.

## Remaining beta-readiness blockers and next actions

1. **Founder device action:** connect/unlock the iPhone and paired Watch. Once both are `available`, authorize/run the direct local Xcode upgrade and execute the committed physical matrix. Historical preview/no-mutation evidence is the first acceptance gate.
2. **Reliability:** continue the existing observation through approximately Oct 17; investigate any restart, adoption-boundary change, sustained RSS/CPU, stalled work, or processing alert.
3. **Server performance:** review exact candidate `8162dd89`. Aggregate Goals is materially improved, but concurrent Goals and Active Goal do not yet meet the proposed p95 gate. Design the general latest-briefing projection only with exact-response parity across weekly, midweek, monthly, DEXA, and photo artifacts.
4. **HealthKit:** after a separately authorized Server rollout, use real command timings to validate that the 84% hydration-byte reduction improves end-to-end ingestion. Do not enable diagnostics by default.
5. **Storage:** retain at least 12 GiB free. Reclaim derived artifacts before any future archive; stop if the floor is reached.
6. **Release:** TestFlight upload remains separately authorized and must wait for the physical matrix. Historical import remains a separate Stage 3 decision after value-free preview review.
7. **Operations:** external alert routing still requires destination, operator, acknowledgement/escalation, retention/security, and cost decisions before activation.

## Safety flags

- `SERVER_ROUND6_CANDIDATE=8162dd89f13aef470a03dd21b7e396f1555b338a`
- `SERVER_PARENT=46dc86c6963154f6a3bf2785beb3982969272fe2`
- `NATIVE_CONSOLIDATED_CANDIDATE=9c58105990fa465c0a4d7d6898d21c271931191f`
- `NATIVE_TREE=a09d5aec928fae8da974e8a0812a384166879fb6`
- `PRODUCTION_SERVER_CHANGED=NO`
- `RECOVERY_AUTHORITY=OFF`
- `COMMAND_DIAGNOSTICS_ACTIVE=NO`
- `ALERT_ROUTING_ACTIVE=NO`
- `PRODUCTION_DATA_MUTATED=NO`
- `HISTORICAL_HEALTHKIT_IMPORTED=NO`
- `HEALTH_VALUES_UPLOADED=NO`
- `NATIVE_INSTALLED=NO`
- `NATIVE_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `PHYSICAL_ACCEPTANCE=BLOCKED_DEVICES_UNAVAILABLE`
- `SEVEN_DAY_OBSERVATION=IN_PROGRESS_NOT_COMPLETE`
- `DISK_FLOOR_12_GIB=PRESERVED_AT_14_GIB`
- `DEXA_EVIDENCE_COSMETIC=QUEUED_SEPARATELY`
- `GOAL_ADAPTATION_TOUCHED=NO`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move an accepted release pointer, production runtime, infrastructure, alert destination, Recovery authority, canonical data, Native build number, archive, TestFlight state, or Goal Adaptation work.
