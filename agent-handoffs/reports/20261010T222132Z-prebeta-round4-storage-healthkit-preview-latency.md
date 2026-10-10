# Pre-beta optimization Round 4 — storage, Apple Health preview, and tail latency

- Published: `2026-10-10T22:21:32Z`
- Primary instruction commit: `59ecae4a`
- Prior Round 3 report: `agent-handoffs/reports/20261010T214848Z-prebeta-round3-performance-native-healthkit-audit.md`
- Live production Server observed: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Preserved Round 3 Server parent: [`6e68af61dccdd38bf829f78c465a7851cc07df3c`](https://github.com/dustinginn/physiqueos/commit/6e68af61dccdd38bf829f78c465a7851cc07df3c)
- Round 4 Server candidate: [`b9198382f7c01b8071dfcc35e7c5e6023ff2f6c8`](https://github.com/dustinginn/physiqueos/commit/b9198382f7c01b8071dfcc35e7c5e6023ff2f6c8)
- Server branch: [`codex/prebeta-round4-performance-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round4-performance-20261010)
- Preserved consolidated Native parent: [`e12bc1af77f1c0afda1865ad8de10b8f2aecc4f4`](https://github.com/dustinginn/physiqueos/commit/e12bc1af77f1c0afda1865ad8de10b8f2aecc4f4)
- Round 4 consolidated Native candidate: [`9c58105990fa465c0a4d7d6898d21c271931191f`](https://github.com/dustinginn/physiqueos/commit/9c58105990fa465c0a4d7d6898d21c271931191f)
- Native branch: [`codex/prebeta-round4-healthkit-preview-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round4-healthkit-preview-20261010)
- Result: **both source candidates are published and review-ready; no deployment, production import/write, infrastructure change, Native archive, or TestFlight upload occurred**
- External beta assessment: **NO-GO**

## Executive result

Round 4 first restored safe Mac storage headroom, then produced the separately initiated, value-free Apple Health device-preview candidate requested by the Round 3 audit. The preview is Founder-only, never runs automatically, never asks for permission, never materializes or uploads quantity values, and has no import, evidence-processing, coaching, briefing, or canonical-write path. It inventories source apps, sample counts, day coverage, exact remaining gap ranges, and conservative recoverable-day counts across May 21–October 10 in 21 cancelable seven-day chunks. The May 24–July 18 Visible Abs cut is reported separately. Actual device availability is intentionally not claimed until the candidate passes the committed physical-iPhone checklist and the Founder explicitly runs the preview.

The Server candidate adds the missing request-day bound to the Log canonical-evidence read. On the same production snapshot and fixed clock, the exact Log response hash stays identical while source hydration falls from 509 rows / 2,263,455 bytes to 97 rows / 168,294 bytes. Warm median falls from 573.6 ms to 99.0 ms and p95 from 2,562.8 ms to 306.7 ms. Aggregate Goals improved in this ten-sample run, but its source shape was unchanged and the active-goal route produced a 4,374.5 ms tail outlier. An attempted global-sort removal made Goals worse and was removed before the candidate. Goals and HealthKit-ingest tail latency therefore remain P1 work rather than being hidden behind a favorable aggregate sample.

The current production runtime remains exact `2e4af15c`, active deployment `78a7ea18-764e-4774-b3b1-17f96cf9c8b1`, with Web/Worker parity and 9/9 readiness. A bounded recent log review found no statement-timeout, database-timeout, PostgreSQL `57014`, HTTP 500, or `ETIMEDOUT` match. It did expose long successful write transactions: 18 HealthKit ingests had a 6,547.37 ms sample median and 25,836.56 ms maximum, and the one training commit took 8,112.48 ms. Those paths were not changed in this round and remain a beta-readiness risk.

## Lane A — storage safety

The root volume began at the 12 GiB minimum. Only completed, task-owned, regenerable artifacts with no active Xcode/build owner were removed:

| Removed path | Approximate size | Classification |
|---|---:|---|
| `/private/tmp/physiqueos-round3-consolidated-derived` | 930 MiB | prior task DerivedData |
| `/private/tmp/physiqueos-round3-derived` | 991 MiB | prior task DerivedData |
| `/private/tmp/physiqueos-round2-derived` | 795 MiB | prior task DerivedData |
| `/private/tmp/physiqueos-build95-focused-units` | 1.9 GiB | prior task focused-test output |

Free space reached 17 GiB before new builds. Round 4's focused Xcode build temporarily reduced that to 15 GiB. After testing, this task's 1.7 GiB DerivedData, 80 MiB extracted benchmark baseline, and generated benchmark bundles were removed by exact path; free space returned to 17 GiB. The small 884 KiB focused-test result bundle and the benchmark JSON evidence were retained. Active worktrees, source, signed archives, credentials, release artifacts, and unrelated caches were not touched.

## Lane B — local, value-free Apple Health historical preview

### Implemented boundary

The Native candidate adds one explicit control under the Founder Server Connection surface. Page entry, launch, backgrounding, synchronization, and workout initialization cannot start it. Tapping the control:

1. checks the existing shared HealthKit authorization state without calling the authorization-request API;
2. reads existing canonical Nutrition and Activity day keys through the established production read APIs;
3. queries local HealthKit metadata in 21 sequential May 21–October 10 chunks of at most seven days;
4. groups Nutrition, Activity, and Workout coverage by domain, metric, source name, source bundle, sample count, and local-date set;
5. compares coverage with existing canonical dates and reports discovery-window and Visible Abs cut improvements, source-review days, workout days, and exact compacted gap ranges; and
6. stops cleanly between chunks when cancelled.

The HealthKit query result model has no quantity/value field. Source and date metadata are reduced on-device and nothing from the query is sent to the Server. One metric producing 50,000 samples inside a seven-day chunk fails closed instead of allowing unbounded memory growth. Canonical day counts are scoped to the preview window, not the user's full history.

### Conservative reconciliation contract

- A Nutrition day is only a safe candidate when energy, protein, carbohydrate, and fat are all present.
- Any Nutrition day represented by more than one source bundle is excluded for manual source review; the preview does not guess which source is authoritative or sum mirrors.
- Activity recovery is based on Activity Summary day presence; workout coverage is reported separately and never augments Activity totals.
- Existing canonical dates win and are subtracted from recoverable candidates.
- Missing dates are calculated against canonical-plus-device coverage and shown as compact exact ranges.
- No preview result can create or reopen confirmations, Evidence Reviews, coaching, priorities, notifications, briefings, Goal changes, Confidence recomputation, or completed-goal reinterpretation.

This is still Stage 2 preview only. No import receipt, production mutation, or backfill authority exists. The real May–July recoverable counts remain **unknown until physical-device acceptance and an explicit Founder run**; the report does not substitute the Stage 1 theoretical maxima for device evidence.

The physical-device checklist is committed at `docs/operations/APPLE_HEALTH_HISTORICAL_PREVIEW_ACCEPTANCE.md`. It covers no-prompt entry, cancel/retry, background/foreground, force-quit/no-autostart, source/day counts, exact gaps, and before/after production-record parity. No physical device query, Native archive, or TestFlight upload ran in this task.

## Lane C — Log and Goals latency

### Guarded benchmark method

Both baselines and candidate runs used the production database through the exact-SHA benchmark runner with one connection, a fixed clock, ten warm repetitions per route, `REPEATABLE READ READ ONLY`, SELECT/WITH-only command fencing, disabled commands/media, explicit rollback, and owner/SHA gates. The Round 3 baseline was rerun with the same explicit `America/Los_Angeles` Log request used by Native so the new date predicate was compared fairly. No benchmark query committed a write.

All candidate responses were stable across repetitions and every response hash matched baseline.

| Route | Baseline median / p95 | Candidate median / p95 | Source rows | Source bytes | Exact response |
|---|---:|---:|---:|---:|---|
| Home | 1,038.0 / 1,194.0 ms | 1,012.8 / 1,571.4 ms | 1,150 → 1,150 | 1,881,731 → 1,881,731 | identical |
| Log | 573.6 / 2,562.8 ms | **99.0 / 306.7 ms** | **509 → 97** | **2,263,455 → 168,294** | identical |
| Goals | 905.3 / 1,787.2 ms | 850.3 / 1,322.3 ms | 983 → 983 | 1,783,214 → 1,783,214 | identical |
| Active Goal | 554.8 / 1,224.4 ms | 493.7 / 4,374.5 ms | 346 → 346 | 4,955,565 → 4,955,565 | identical |
| Completed Goal | 66.8 / 156.0 ms | 44.3 / 343.6 ms | 36 → 36 | 352,137 → 352,137 | identical |
| Operating Plan | 74.6 / 379.8 ms | 91.8 / 273.3 ms | 178 → 178 | 311,476 → 311,476 | identical |
| Morning Check-In | 1,107.2 / 1,982.7 ms | 1,203.2 / 2,066.3 ms | 1,247 → 1,247 | 10,030,111 → 10,030,111 | identical |

The implemented optimization is deliberately narrow: the already validated device timezone is converted to a local date and passed as non-persisted read context, and PostgreSQL filters only Log's canonical Evidence objects to that day. Calls without an explicit device zone retain the former read behavior. No schema, index, migration, API shape, returned field, Home presentation, or ordering contract changed.

Goals still hydrates 259 canonical Training evidence rows totaling about 1.085 MB to construct current performance intelligence. The prior Round 3 training projection hit the 15-second statement timeout and was reverted. Round 4 also tested removing the final database sort; Goals became slower (median 1,489.9 ms, p95 2,638.3 ms), so that experiment was fully removed. The next safe Goals step is a route-specific indexed/projection design proven with `EXPLAIN` and exact response parity—not a speculative filter that risks dropping historical performance context.

Rollback for the Server candidate is source-only: redeploy its parent `6e68af61`. There is no database rollback, schema operation, environment change, or data repair.

## Lane D — current timeout and reliability evidence

The bounded current-deployment log window covered Web structured events from `2026-10-10T19:44:42.140Z` through `22:17:18.390Z` and Worker reliability samples through `22:21:22.396Z`.

- Zero matches across the latest 5,000 Web lines and 5,000 Worker lines for statement timeout, database timeout, `57014`, `ETIMEDOUT`, or HTTP 500.
- 38 committed Native command receipts were observed. Eighteen HealthKit ingests had median 6,547.37 ms and maximum 25,836.56 ms; one training-session commit took 8,112.48 ms. These are successful end-to-end command durations and may span several statements, but they leave poor headroom around a 15-second per-statement database limit and warrant continued profiling.
- 309 Worker reliability samples retained one durable adoption boundary, `2026-10-10T19:44:17.378Z`; active, stale, adopted-stale, historical-stale, queued-too-long, and dead-continuation maxima were all zero.
- Maximum heartbeat age was 929 ms. Maximum sampled Worker RSS fraction was 40.62%; 30 operation-memory samples peaked at 42.23%, below the 70% admission and 85% hard ceilings.
- Production Web and Worker both remain exact `2e4af15c`; readiness is `ready`, build ID `physiqueos-2e4af15c-20261010`, with all nine checks true and migration `000014` unchanged.

Recovery remained OFF and no recovery action was invoked. The alert-routing candidate remains dormant; no destination, external notification, or infrastructure alert was activated. The seven-day observation that began around `2026-10-10T19:46:50Z` cannot complete before approximately `2026-10-17T19:46:50Z`; this report makes no early seven-day claim.

## Validation

| Gate | Result |
|---|---:|
| Server focused unit slice | **62/62 pass** across Core Navigation, PostgreSQL read store, and the repaired HealthKit acceptance audit |
| Stale HealthKit test expectation | **fixed separately without weakening**; it now accepts only the entry's explicit apply/dry-run plus already-replaced outcomes |
| Changed Server lint and whitespace | **pass** |
| Production-data read benchmark | **70 warm samples plus cold samples; read-only rollback; stable hashes; no failures** |
| Native focused HealthKit suite | **59/59 pass**, iPhone 17 Pro simulator, 6.695 seconds |
| Native focused build-for-testing | **pass**, arm64 single-architecture simulator build |
| Source candidates | **committed, pushed, and clean** |

## Release readiness and remaining risk

Both exact candidates are **GO for review and their later guarded release processes**. They are not authorization to deploy or release. External beta remains **NO-GO** because:

1. the seven-day production observation remains in progress until approximately Oct 17;
2. consolidated Native physical iPhone/Watch acceptance, including the new HealthKit preview, remains pending;
3. Goals/Active Goal tail latency and the 6.5–25.8 second HealthKit-ingest durations still need bounded profiling and remediation;
4. app-level external alert delivery still lacks approved primary/backup operator, destination, acknowledgement/escalation, retention/security, and cost decisions; and
5. the Apple Health preview has not yet established actual May–July device availability, and any import requires a separately reviewed and separately authorized Stage 3 contract.

Recommended sequence:

1. review Server `b9198382`; if accepted, use a separately authorized guarded Server rollout with exact SHA/Web/Worker/runtime parity, 9/9 health, Recovery OFF, adoption-boundary parity, response checks, and rollback to `6e68af61` on drift;
2. continue observation through Oct 17 and escalate any restart, sustained RSS/CPU breach, stale work, dead continuation, adoption-boundary drift, timeout, or 500;
3. profile HealthKit ingest and Training commit stages under bounded concurrency, then design the Goals-specific query/index change against exact response hashes;
4. run the committed consolidated Native physical-device matrix on `9c581059`, including preview cancel/background/force-quit and production-record parity; do not upload TestFlight until that passes and release authority is separately granted;
5. if the device preview shows useful, non-conflicting May–July coverage, publish its value-free counts and source/gap classification before proposing any Stage 3 import; and
6. choose and staff external alert routing before activation.

## Safety and flags

- No Server deployment, Worker restart, infrastructure mutation, Recovery activation, external alert activation, production write/repair/import, Health value upload, Native archive, TestFlight upload, or release-pointer movement occurred.
- Production investigation and benchmarks were bounded, owner-scoped, read-only, and explicitly rolled back where a database transaction was used.
- Existing canonical records, provenance, completed goals, historical briefings, Home design, Claude Goal Adaptation, and the queued DEXA Evidence cosmetic cleanup were untouched.

Flags:

- `SERVER_ROUND4_CANDIDATE=b9198382f7c01b8071dfcc35e7c5e6023ff2f6c8`
- `NATIVE_CONSOLIDATED_CANDIDATE=9c58105990fa465c0a4d7d6898d21c271931191f`
- `PRODUCTION_SERVER_CHANGED=NO`
- `RECOVERY_AUTHORITY=OFF`
- `ALERT_ROUTING_ACTIVE=NO`
- `PRODUCTION_DATA_MUTATED=NO`
- `HISTORICAL_HEALTHKIT_IMPORTED=NO`
- `HEALTH_VALUES_UPLOADED_BY_PREVIEW=NO`
- `NATIVE_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `PHYSICAL_ACCEPTANCE=PENDING`
- `SEVEN_DAY_OBSERVATION=IN_PROGRESS_NOT_COMPLETE`
- `DEXA_EVIDENCE_COSMETIC=QUEUED_SEPARATELY`
- `GOAL_ADAPTATION_TOUCHED=NO`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move `latest.json`, `latest.md`, any accepted Native release pointer, production runtime, infrastructure, alert destination, Recovery authority, canonical evidence, or TestFlight state.
