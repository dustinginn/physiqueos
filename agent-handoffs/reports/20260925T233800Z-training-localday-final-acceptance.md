# Training aggregation + local-day correctness: final acceptance (STOP for Founder release authorization)

Task id: `claude-training-aggregation-and-local-day-correctness-20260925`
Lane pointer: `agent-handoffs/training-localday/latest.json` (HealthKit `latest.json`/`latest.md` and `performance/latest.json` untouched).
Companion reports: `20260925T233600Z-training-localday-diagnostic-and-contract.md` (contract, per-surface semantics), `20260925T233700Z-training-localday-candidate-implementation.md` (implementation, compatibility).

**Result: both workstreams implemented, tested, mutation-checked, production-shaped-accepted (read-only) and fresh-context reviewed. Nothing deployed, nothing uploaded, no production data mutated.**

| | Candidate | Base |
|---|---|---|
| Server | `09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e` (`claude/training-aggregation-server-20260925`) | production `afdc849a` |
| Native | `c15f08812dd8c7a0102087d7abca7aa92e61da8d` (`claude/training-localday-correctness-20260925`), still 1.0 (60) | Performance candidate `c736254b` (descends from Build 60 `00321dcc`) |

## 1. Training aggregation semantics by surface (summary)
Training Day's presented-workout universe (Logger Strength = 1, screenshot Cardio = 1, canonical HealthKit Cardio = 1 unless an unambiguous duplicate of active evidence on its day; HealthKit Strength never a row) now drives Recent Training History (day counts, latest day, entries), week/month/goal-window history, reporting history and overview "Sessions", and the web Cardio library/activity history. Structured-Strength surfaces (resistance performance, status groups, PRs, exercise records, Native Library exercise registry, Weekly/Midweek/Monthly/Goal training) are deliberately unchanged. Log's Logged Today keeps its deliberate no-Cardio-row design; Activity Day stays accounting-only; the web-only `/progress` hub all-time metric is left as a follow-up. Full table in the contract report.

## 2. Sep 21/22/23/24 before/after (production data, zero-write probe, deployed-code baseline vs candidate, same pinned clock)

| Day | Training Day | History BEFORE (afdc849a) | History AFTER (candidate) | Reporting history after |
|---|---|---|---|---|
| Sep 20 | 3 | 3 sessions | 3 sessions (unchanged) | 3 |
| Sep 21 | 3 | 3 sessions | **3 sessions (unchanged)** Outdoor Walk ×2 + Strength | 3 |
| Sep 22 | 3 | 3 sessions | **3 sessions (not 5)**: HealthKit duplicates suppressed | 3 |
| Sep 23 | 3 | **1 session** | **3 sessions**: Walking, Walking, Traditional Strength Training | 3 |
| Sep 24 | 3 | **1 session** | **3 sessions**: Walking, Walking, Traditional Strength Training | 3 |
| Sep 25 | 0 | — | — | — |

Latest Training Day on the landing / Native Evidence Hub training stream: Sep 24 "1 session" -> "3 sessions". Every history day equals its Training Day `sessionCount`. Resistance presentation and resistance performance digests identical; Native Library exercise payload digest identical (13,978 B both). Web Cardio breakdown gains "Walking 4" (the four generic reconciled walks); Indoor Walk 1 / Outdoor Walk 124 / Stair Stepper 30 unchanged. Reporting overview "Sessions" 235 -> 239; its latest-day "Active Calories" now includes those walks (0 -> 346, the two Sep 24 walks). The probe ran candidate code at `d5e6707f`; `8e926e0a` changes only failure isolation, the legacy package path and zone fallback (all no-ops for production: canonical training present, stored user zone null -> America/Los_Angeles either way).

## 3. Local-day vs canonical-record vs briefing-zone contract
- Daily-driver Today = device's current local date + zone (Logged Today, today-scoped caches, Home/Log/Evidence refresh), recomputed from the system on activation, local midnight, significant time change and zone change.
- Canonical record dates never move (HealthKit keeps its workout/sample zone basis; the requested zone is never persisted and never changes the stored user zone).
- Strategic briefing windows, Monthly day 1, Home Today's Focus, notification schedule and Morning Check-In reconciliation stay Server-owned in America/Los_Angeles.
- The Founder's 00:11 Texas observation: explained — Server-canonical Pacific day was still Sep 24; with the candidates, Logged Today follows the device day (Sep 25) and the Native Log rolls over without a force quit.

## 4. Deterministic timezone test matrix (Native `DailyDriverLocalDayTests`, 19 tests; Server `DailyDriverLocalDay.test.js`, 11 tests + contract/core tests)
- Foreground crossing local midnight (cached Log/Weight re-read) PASS
- backgrounded before midnight, foregrounded after (no notification; activation recompute; same-day activation is a no-op) PASS
- eastward zone change = immediate next day (00:11 CDT Sep 25) PASS
- westward = apparent previous day (Honolulu) PASS
- zone change without date change still changes day identity (cache partition) PASS
- DST spring forward 2027-03-14 (23 h day, rollover at local midnight) PASS
- DST fall back 2026-11-01 (25 h day) PASS
- Server UTC date ≠ device local date PASS
- device date ≠ canonical briefing date (Home snapshot refused when either calendar turned; Kolkata device-only and Honolulu canonical-only cases) PASS
- Home snapshot from prior local day refused PASS
- snapshot created in zone A opened at the same instant in zone B refused (Tokyo, Denver) and accepted back in A PASS
- day change retires the persisted snapshot; same-day activation keeps it PASS
- Log "Today" rolls over and names the device zone PASS
- day-scoped caches cover Activity/Nutrition/Weight/Training/Priority/Check-In PASS
- Home notification calendar stays America/Los_Angeles with a Texas device PASS
- weigh-in keeps its chosen localDate, names the zone; Check-In sends none; retry keeps its key in one zone, new key after a zone change PASS
- Server: Logged Today canonical vs Texas vs Honolulu days; historical records untouched by travel reads; weigh-in accepted for Sep 25 with the Texas zone and rejected without it / with a malformed zone / for a genuinely future date; Check-In ignores the zone; briefing/schedule/reconciliation modules cannot consume a requested zone (source guard) PASS.

## 5. Relationship to Performance Native c736254b
The Native candidate is a linear descendant of `c736254b` (no rebase, nothing duplicated or overwritten). Its last-known Home paint, acknowledge-first Priority completion, retained view models and visible-only foreground refresh are preserved (all their tests pass); the rollover reload is itself visibility-gated so the first resume of a day does not reintroduce a reload burst; the snapshot gains zone partitioning and a canonical-plus-device same-day refusal. A future Build 61 from `c15f0881` contains both projects.

## 6. Performance (same zero-write benchmark, production DB, pinned clock; warm = rounds 2–3)
| Read | Baseline afdc849a | Candidate |
|---|---|---|
| Training landing warm | 173 / 122 ms | 111 / 191 ms |
| Training reporting warm | 332 / 388 ms | 502 / 400 ms |
| Native Library warm | 86 / 101 ms | 108 / 85 ms |
| Native landing payload | 138,022 B | 140,875 B (+2.1%) |
| Native reporting presentation | 29,525 B | 30,121 B |
| Native Library payload | 13,978 B | 13,978 B (identical) |
| Queries per landing+reporting+library round | 9 | 11 (+1 bounded Cardio SELECT each for landing and reporting; Native Library +0) |
Cold first round: landing 517 vs 510 ms, reporting 617 vs 741 ms (shared-DB noise range). No common path near 3 s; landing well under 1 s; no regression toward multi-MB payloads. Native: foreground/rollover reads are visibility-gated; zone cache reset only on re-evaluation.

## 7. Tests, build, mutations, reviews
- Server focused suites: 468/468 (training, native, log, core, store, HealthKit acceptance guard). Broad `src/{domain,application,platform,data,screens,app,presentation}`: 8,603 tests; every failing test also fails on clean `afdc849a` (environmental `private/founder/*` fixtures etc.) except 3 PDF/DEXA tests that pass in isolation (load flakes) and the HealthKit command-ports diff guard (narrowed to allow only the reviewed weigh-in zone lines; mutation-verified). No new failure.
- **Production webpack build on exact `8e926e0a`: exit 0, "Compiled successfully"** (artifacts removed afterwards). `09f04dc5` changes only a test file, so the candidate's runtime code is identical to the built SHA.
- Native: focused `FounderServerAPITests` + `DailyDriverLocalDayTests` 220/220; **full `PhysiqueOSTests` unit target 1,414/1,414** on the existing iPhone 17 Pro simulator. UI-test target NOT run (disk reserve ~15.5 GiB, below the 20 GiB preferred for the heavy UI suite).
- Mutation checks (all RED, restored): Server A — merge removed 9, identity collapse 8, dedupe removed 7, per-day evidence scoping removed 6, Strength family filter removed 1, ordering 1, legacy package skip removed 1, failure isolation removed 1. Server B — contract drops zone 1, weigh-in port drops zone 1, Check-In accepts zone 1, core Log ignores zone 1, command-ports guard hole 2. Native — rollover invalidation removed 3, Home zone partition removed 1, canonical-day check removed 1, Log zone removed 1, device-day check removed 1, reevaluate always invalidates 3, idempotency signature without zone 1.
- Fresh-context adversarial reviews: Server PASS-WITH-NOTES, Native PASS-WITH-NOTES; every actionable note fixed (`8e926e0a`, `2a4605be`, `83921065`); a third fresh-context re-review of those fixes returned PASS-WITH-NOTES and its notes were fixed too (`09f04dc5`: guard rejects deleted lines; `c15f0881`: Home always loads after re-evaluating so notification sync never uses yesterday's model). Final Native unit target re-run on `c15f0881`: 1,414/1,414.

## 8. Release order (recommended; requires Founder authorization)
1. **Server `09f04dc5`** via the established guarded two-step (fast-forward production branch from `afdc849a`; `apps update --spec` bumping `PHYSIQUEOS_GIT_SHA`/`PHYSIQUEOS_BUILD_ID` on web AND worker; `create-deployment --force-rebuild`; verify source SHA, runtime gitSha, health, migrations, then re-run the read-only aggregate probe). Build 60 benefits immediately (Recent Training History / Evidence Hub counts); Logged Today and weigh-ins behave exactly as today until a Native build sends a zone.
2. **Native Build 61 from `c15f0881`** (Performance Phase 2 + rollover/zone correctness), after tomorrow's prospective Cardio acceptance on Build 60 and a separate authorization. Either order is safe (each side tolerates the other's current build).

## 9. Open items / notes
- Web-only `/progress` hub all-time training metric still counts evidence only (follow-up if wanted).
- Unverified Activity accounting note for the HealthKit lane (possible workout-calorie double count on screenshot+HealthKit duplicate days inside the Activity decomposition; not a session count) — unchanged.
- Other retained screens (Training landing/history, Activity/Nutrition day, Priority Detail, Morning Check-In) do not observe the day change directly; their caches are invalidated so their next load is fresh.
- Morning Check-In keeps the canonical day by design (briefing/priority reconciliation).

## Disk (STANDING_DISK_SAFETY)
Start 19 GiB; low point ~15.5 GiB after the webpack build (never below the 15 GiB floor). Reclaimed only this task's own artifacts: the Server `.next` build output (634 MB) and a temporary baseline test worktree. No other lane's worktree, DerivedData, archive or data touched. Native builds used a job-local DerivedData.

## Flags
AUTHORITY_REVERIFIED · TRAINING_AGGREGATION_SURFACES_AUDITED · TRAINING_SESSION_SEMANTICS_EXPLICIT · SEP21_CONTROL_PASS · SEP22_DEDUP_PASS · SEP23_COUNT_THREE_PASS · SEP24_COUNT_THREE_PASS · CARDIO_ONLY_DAY_HISTORY_PASS · NO_STRENGTH_DUPLICATE_PASS · REPORTING_LIBRARY_SEMANTICS_EXPLICIT · TRAINING_PAYLOAD_PERFORMANCE_PRESERVED · LOCAL_DAY_CONTRACT_EXPLICIT · FOREGROUND_MIDNIGHT_PASS · BACKGROUND_FOREGROUND_ROLLOVER_PASS · TIMEZONE_EASTWARD_PASS · TIMEZONE_WESTWARD_PASS · DST_SPRING_PASS · DST_FALL_PASS · HISTORICAL_LOCALDATE_IMMUTABLE · BRIEFING_TIMEZONE_ISOLATED · PERFORMANCE_NATIVE_C736254B_PRESERVED · HOME_SNAPSHOT_TIMEZONE_INVALIDATION_PASS · SERVER_TESTS_PASS_OR_NOT_APPLICABLE · NATIVE_TESTS_PASS_OR_NOT_APPLICABLE (unit target; UI target not run) · PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE · FRESH_CONTEXT_REVIEWED · HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED · GH_REPORT_PUBLISHED
SERVER_DEPLOYED = false · TESTFLIGHT_UPLOADED = false · PRODUCTION_MUTATED = false
