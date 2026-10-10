# Pre-beta optimization Round 3 — performance, Native acceptance, and Apple Health historical audit

- Published: `2026-10-10T21:48:48Z`
- Primary task id: `prebeta-round3-performance-native-acceptance-20261010`
- Primary instruction commit: `d31d1716`
- Additive instruction commits: priority schedule dedup `fdf7d7eb`; Apple Health historical backfill audit `9d2f0d90`
- Live production Server observed: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Server Round 3 candidate: [`6e68af61dccdd38bf829f78c465a7851cc07df3c`](https://github.com/dustinginn/physiqueos/commit/6e68af61dccdd38bf829f78c465a7851cc07df3c)
- Server branch: [`codex/prebeta-round3-performance-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round3-performance-20261010)
- Consolidated Native candidate: [`e12bc1af77f1c0afda1865ad8de10b8f2aecc4f4`](https://github.com/dustinginn/physiqueos/commit/e12bc1af77f1c0afda1865ad8de10b8f2aecc4f4)
- Native branch: [`codex/prebeta-round3-native-acceptance-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round3-native-acceptance-20261010)
- Result: **source candidates and a read-only historical import plan are ready; no deployment, alert activation, production import, Native archive, or TestFlight upload occurred**
- External beta assessment: **NO-GO**

## Executive result

Round 3 materially reduces the amount of PostgreSQL JSON hydrated for Home, Goals, and Log while preserving exact returned data. The final ten-sample, production-data, read-only benchmark reports 73.64% to 76.60% source-payload reductions, two database queries per surface, zero pool wait, and byte-identical response hashes versus the instrumented baseline. Home and Log medians improve 23.4% and 51.9%; Goals median is 3.1% slower in this small sample. Tail latency remains above the proposed core-read beta target, especially Log p95 3.903 seconds, so this candidate is ready for review and a later guarded rollout—not a claim that the performance gate is closed.

The Server candidate also fixes the Weight full-ISO failure by normalizing provider and legacy timestamps to canonical local dates before charting, extrema, history, and rolling-window arithmetic. Mixed date-only/full-ISO regressions pass.

The consolidated Native candidate removes redundant priority schedule copy without changing recurrence or actions. Foam Rolling now presents one `Daily · 5:00 PM` line. Daily, weekly, one-off, peptide/dose, workout, custom, overdue, and genuinely distinct due/scheduled cases are covered. It preserves the already reviewed HealthKit authorization correction, Watch amber workout actions and footer removal, Weight-free Today widget, and durable evidence-processing UI. A 477-test focused iPhone/Watch/widget slice passes; physical iPhone/Watch acceptance is prepared but not executed, so no build was released.

The Apple Health Stage 1 audit is complete and strictly read-only. The ordinary app cannot reach the May–July Visible Abs period because automatic daily catch-up is 30 days and workout history is prospectively fenced. Production currently contains no stored HealthKit source observations in the Visible Abs window. Existing canonical coverage is 10/56 Nutrition days and 15/56 Activity days, which makes +46 and +41 days the theoretical maximum improvement—not the amount available on the device. A separately initiated, source-separated, value-free device preview is required before any import can be proposed.

## Lane A — bounded Home, Goals, and Log reads

### Implementation

The candidate keeps the existing Home design and response contract while reducing read-side work:

- Log reads only user-visible Nutrition, Activity, and Training canonical evidence plus actionable processing reviews.
- Home and Goals retain the current confidence record and the newest two non-superseded publications per Goal, preserving equal-chronology ambiguity detection without loading the full history.
- V3 confidence history omits only large write-side authoring graphs that the Native surfaces do not consume; canonical identity, validation, reproducibility, and presentation data remain.
- Analysis and daily-briefing projections select the fields consumed by navigation surfaces and discard replacement/prior-version graphs.
- Per-collection row and byte metrics, pool wait, warm p95/p99, and a guarded exact-SHA read-only benchmark runner make future regressions measurable.

An attempted training-specific projection was rejected after it caused a statement timeout and was fully reverted. It is not present in the candidate.

### Before and after

The final candidate run used ten warm samples per surface inside an exact-SHA-gated PostgreSQL `REPEATABLE READ READ ONLY` transaction followed by explicit rollback. Returned response hashes and byte counts were identical to baseline for all three surfaces.

| Surface | Baseline median | Candidate median | Change | Baseline source payload | Candidate source payload | Reduction | Candidate p95/p99 | Queries / max pool wait |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Home | 1,458.4 ms | 1,117.5 ms | -23.4% | 7,136,840 B | 1,881,562 B | 73.64% | 1,982.3 / 1,982.3 ms | 2 / 0 |
| Log | 1,060.9 ms | 510.3 ms | -51.9% | 9,671,825 B | 2,263,455 B | 76.60% | 3,903.2 / 3,903.2 ms | 2 / 0 |
| Goals | 1,150.6 ms | 1,186.5 ms | +3.1% | 7,038,492 B | 1,783,214 B | 74.66% | 1,862.5 / 1,862.5 ms | 2 / 0 |

The earlier audit found production p95 of Home 4.798 seconds, Goals 3.385 seconds, and Log 3.301 seconds, 7.03–9.65 MB hydration, and pool wait up to 10 against a pool maximum of 5. The candidate removes the observed benchmark pool queue and sharply reduces transfer/parse pressure, but it does **not** meet the proposed core Server read target of p95 below 750 ms and p99 below 1.5 seconds. Home's server-only p95 is just under the separate 2-second authoritative-Home threshold, leaving no end-to-end client/network margin.

## Lane B — Weight full-ISO correctness

`ProgressReportingService` now passes every measurement timestamp through the existing canonical Weight date parser before chart points, reverse-chronological history, extrema, and rolling-average window arithmetic. Valid inputs such as `2026-10-07T07:00:00.000Z` and date-only `2026-10-08` converge on `YYYY-MM-DD`; invalid values continue to fail explicitly instead of silently shifting a day.

The regression proves mixed provider/legacy inputs produce ordered chart/history dates, correct three-day boundaries and average, and correct extrema. The focused Weight suite passes 14/14.

## Lane C — consolidated Native candidate

### Priority schedule deduplication

The change is presentation-only. It chooses one cadence-rich line containing the canonical scheduled time, suppresses same-time duplicates and generic `Today`/`Tonight` metadata, preserves dose text, and retains a truly distinct due-time versus scheduled-time line. The canonical recurrence, notification time, completion/skip commands, card geometry, and Home layout are unchanged. Accessibility uses the same de-duplicated strings.

The candidate remains one consolidated lineage and includes all previously accepted queued work:

- repeated HealthKit authorization suppression on iPhone and Watch while retaining ingestion/writeback and genuinely new-scope requests;
- accepted amber Ready for Workout, Complete Set, and equivalent primary Watch actions, with the unwanted bottom bar removed;
- Weight removed from the Today widget with Nutrition, macros, Activity, refresh, and Start Logger retained;
- durable accepted/queued/processing/retrying/ready/failed evidence state, offline recovery, accurate action-required copy, and accessible review navigation.

No standalone build was created. The DEXA Evidence cosmetic cleanup remains queued separately. Claude's Goal Adaptation work was not touched.

### Physical acceptance gate

The committed checklist covers upgrade-in-place and clean-install HealthKit behavior, repeated launches/backgrounding/update/new permission scope, Watch workout appearance and controls, widget layout/actions, priority schedule variants, durable evidence relaunch/offline/failure recovery, Dynamic Type, VoiceOver, Dark, and Mineral Light. This gate requires the Founder's paired physical iPhone and Apple Watch and remains unexecuted. TestFlight upload remains separately authorized.

## Lane D — Apple Health historical backfill audit

### Current capability and limitations

- Authorized/read nutrition types include dietary energy, protein, carbohydrate, fat, and fiber; automatic daily upload currently emits only the first four as one all-source `com.apple.Health` aggregate. Fiber is omitted.
- Activity reads Activity Summary, active energy, exercise/stand time, steps, walking/running distance, and flights. Basal energy is not authorized or queried.
- Body mass is not a HealthKit read type in the current registry. DEXA body-fat and lean-mass types are write-only.
- Workouts preserve UUID, source, and device provenance, but ordinary automatic querying has a prospective activation floor.
- Automatic daily streams are Activity Summary, Nutrition daily total, and Workouts. Current daily history is today plus isolated one-day catchups for the preceding 30 days.
- Durable owner/device/query-scoped cursors, batches of at most 100, idempotent commands, and daily fingerprints protect ordinary retry. Generic anchored sample deletions are currently deferred locally because the Server has no general deletion/tombstone contract.
- The production activation policy begins 2026-09-22, is open-ended, disables historical backfill, and keeps HealthKit-derived strategic Evidence quarantined.

Apple's statistics API supports cumulative totals separated by source, which is the required basis for avoiding blind cross-app Nutrition summation ([HKStatisticsOptions](https://developer.apple.com/documentation/healthkit/hkstatisticsoptions), [HKSourceQuery](https://developer.apple.com/documentation/healthkit/hksourcequery)). Deleted anchored samples are represented separately and must have an explicit durable reconciliation contract before historical data can displace canonical records ([HKDeletedObject](https://developer.apple.com/documentation/healthkit/hkdeletedobject)).

### Read-only production coverage

All counts came from exact-runtime, owner-scoped, repeatable-read read-only transactions with explicit rollback. No health values were included in the report.

| Window | Existing coverage | HealthKit source coverage | Safe conclusion |
|---|---|---|---|
| Discovery, May 21–Oct 10 | Activity source: 1,033 records / 49 days, Aug 23–Oct 10; Nutrition source: 207 / 49 days; workouts: 49 / 17 days, Sep 22–Oct 10 | HealthKit canonical: 20 days/domain, Sep 21–Oct 10; no duplicate canonical day keys | Stored data does not establish May–July availability. |
| Visible Abs, May 24–Jul 18 (56 days) | Nutrition 10/56 days; Activity 15/56 days | No stored HealthKit observations or canonical days | Device preview can add at most +46 Nutrition and +41 Activity days; actual availability is unknown. |
| Build Lean Mass check, Aug 15–Oct 10 (57 days) | Manual canonical: 38 days/domain, Aug 15–Sep 21 | HealthKit canonical: 20 days/domain, Sep 21–Oct 10; one overlap | Combined coverage is already 57/57; use this as duplicate/conflict validation, not an automatic-import opportunity. |

Daily aggregates identify only the synthetic Apple Health source. Stored workout provenance remains granular: 41 Apple Watch workout records across 17 days and 8 PhysiqueOS workout records across 8 days. Zero HealthKit-derived objects are present in strategic Evidence, so completed goals, Confidence, Goal Intelligence, and historical briefings remain untouched.

### Safe import sequence

1. **Stage 2, device preview only:** Founder-started, never startup/background/workout-triggered; reuse the durable authorization receipt; query May 21–Oct 10 in cancelable seven-day chunks; separate Nutrition statistics by source; inventory Activity and Workout sources; emit only day/source presence, completeness, counts, date range, errors, and opaque digests in a local encrypted receipt. Do not upload health values.
2. **Reconciliation review:** classify every day as new, identical, consistent, conflicting, partial, or unsupported. Existing canonical days win by default. Mirrored Nutrition sources must be resolved before any total is nominated. Workout calories remain descriptive and never augment Activity totals.
3. **Stage 3, separately authorized import:** bind exact owner, enrolled device, window, domains, approved source digests, preview digest, and build; dry-run before apply; one seven-day/100-observation chunk in flight; immutable source provenance; idempotent no-op replay; collision fails closed; durable per-chunk receipt and bounded rollback.
4. **Permanent side-effect fence:** imported historical rows cannot create/reopen confirmations, Evidence Reviews, coaching, priorities, notifications, briefings, Goal/phase changes, Confidence recomputation, or completed-goal reinterpretation. Generic historical activation must never adopt them.

Stop before import on authorization drift, timezone date rewriting, unresolved source overlap, canonical conflict, missing deletion reconciliation, or any coaching/Goal side effect. No Stage 2 query or Stage 3 import ran in this task.

## Production observation and alert-routing readiness

The live Server remained exact `2e4af15c`, Web/Worker/runtime parity held, readiness remained 9/9, and Recovery remained OFF. A bounded Worker-log observation included 230 reliability samples from 19:46:40Z through 21:41:40Z:

- immutable adoption boundary remained durable and unchanged at `2026-10-10T19:44:17.378Z`;
- active, stale, historical-stale, over-age queue, and dead work maxima were all zero;
- maximum heartbeat age was 923 ms;
- maximum RSS fraction was 40.62%; 23 operation-memory samples peaked at 42.07%, under the 70% admission and 85% hard ceilings;
- one 100% CPU startup sample at two seconds uptime opened a transient high-CPU signal; no sustained incident followed.

The seven-day observation began around `2026-10-10T19:46:50Z` and cannot complete before approximately `2026-10-17T19:46:50Z`. This report does not claim seven clean days.

The dormant alert-routing candidate remains `a1b4039c65f0c1db6685a04db5a0217104df8dfb`. Its disabled/source-only preview again showed durable opened/escalated/resolved outbox transitions without sending. Existing provider email alerts remain in place. App-level external delivery is still inactive because primary/backup operator, destination, acknowledgement/escalation, retention/security, and cost decisions are unset. No destination was invented and no infrastructure was changed.

## Validation

| Gate | Result |
|---|---:|
| Core navigation service | **40/40 pass** |
| PostgreSQL bounded read store | **14/14 pass** |
| Weight full-ISO and weekly averages | **14/14 pass** |
| New HealthKit audit coverage assertions | **2/2 pass; 4 unrelated tests skipped by focus** |
| Changed Server files lint / whitespace | **pass** |
| Production-data candidate benchmark | **30 warm surface samples plus cold samples; read-only rollback; stable hashes; no failures** |
| Consolidated Native focused slice | **477/477 pass; iPhone app, Watch app, and widget built** |
| Source worktrees after commit | **clean** |

The complete pre-existing `HealthKitCanonicalAcceptanceAudit.test.js` file still has one known test-gate-drift failure: it searches for an old single-outcome activation guard string, while the current activation entry correctly supports the later `replace-families` replay outcome. The two new audit-coverage tests pass and no production operation used that entry. This should be repaired as test maintenance; it does not justify hiding the red full-file result.

Physical iPhone/Watch acceptance, a signed archive, and TestFlight validation were not run. Historical device availability was not queried.

## Beta assessment and next steps

The exact source candidates are **GO for review and controlled later rollout preparation**. External beta remains **NO-GO** because:

1. the seven-day production observation does not complete before Oct 17;
2. the consolidated Native candidate has not passed paired physical-device acceptance or an authorized release;
3. core-read p95/p99 still miss the proposed beta target, especially Log tail latency;
4. external application-level alert delivery lacks an approved destination and staffed operator/escalation contract;
5. HealthKit ingest latency, unexplained 500/statement-timeout evidence, killed-app notification behavior, and unsupervised new-user pairing/recovery remain open P1 gates;
6. any historical Apple Health recovery needs a separately authorized device preview and, later, a separately authorized import contract.

Recommended sequence:

1. review Server `6e68af61`; if accepted, prepare a guarded Server-only deployment with alert routing still disabled, exact response-parity checks, 9/9 health, watchdog/adoption-boundary parity, and rollback triggers;
2. continue observation through Oct 17 and investigate any restart, sustained RSS/CPU breach, stale review/queue, new dead letter, adoption-boundary drift, or unexplained 500;
3. run the committed physical iPhone/Watch acceptance matrix on Native `e12bc1af`; do not upload until it passes and release authority is separately granted;
4. choose alert ownership/destination and exercise it in a separately authorized staffed window;
5. profile the remaining Log and Goals latency tail, HealthKit ingest, statement-timeout path, new-user recovery, and killed-app notification contract;
6. only if historical recovery remains desired, implement the local value-free Stage 2 Apple Health preview for review—still without production import.

## Safety and flags

- No Server deployment, production infrastructure mutation, Recovery activation, external alert activation, production data write/repair/import, historical HealthKit query, Native archive, TestFlight upload, or release-pointer movement occurred.
- Production reads were bounded, owner-scoped, read-only, explicitly rolled back, and handoff output excluded health values.
- Existing canonical records, source provenance, completed goals, historical briefings, Goal Adaptation, and the separately queued DEXA Evidence cosmetic work were untouched.
- Free disk ended at 12 GiB, preserving the required floor.

Flags:

- `SERVER_ROUND3_CANDIDATE=6e68af61dccdd38bf829f78c465a7851cc07df3c`
- `NATIVE_CONSOLIDATED_CANDIDATE=e12bc1af77f1c0afda1865ad8de10b8f2aecc4f4`
- `PRODUCTION_SERVER_CHANGED=NO`
- `RECOVERY_AUTHORITY=OFF`
- `ALERT_ROUTING_ACTIVE=NO`
- `PRODUCTION_DATA_MUTATED=NO`
- `HISTORICAL_HEALTHKIT_IMPORTED=NO`
- `NATIVE_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `PHYSICAL_ACCEPTANCE=PENDING`
- `SEVEN_DAY_OBSERVATION=IN_PROGRESS_NOT_COMPLETE`
- `DEXA_EVIDENCE_COSMETIC=QUEUED_SEPARATELY`
- `GOAL_ADAPTATION_TOUCHED=NO`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move `latest.json`, `latest.md`, any accepted Native release pointer, production infrastructure, alert destinations, Server runtime, Recovery authority, canonical evidence, or TestFlight state.
