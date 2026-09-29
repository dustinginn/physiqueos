# Native daily-driver performance, Phase 2: baseline and diagnostic

Task id: `claude-native-daily-driver-performance-phase2-20260925`
Report 1 of 3 (baseline/diagnostic). Lane: performance. This report does not take ownership of the HealthKit `agent-handoffs/latest.json` / `latest.md`.

## Authority (re-verified live, read-only)

- Production Server: `a399916ac9b1c9128067f0f77fb7fd05666aa92a`, deployment `66ee39f6-c4d7-49c8-9012-3de1a77a832c` ACTIVE (web and worker source SHA exact), `/api/v1/health/live` build id `physiqueos-a399916a-20260925`.
- Native installed/release: Build 60, `00321dcc6dd86a6479dbca5dd27e691c87348cd8`.
- HealthKit prospective Cardio acceptance lane: untouched (no ingestion, classifier, workout policy, isIndoorWorkout, or Training Day Cardio semantics changed; see the candidate report).
- Disk: 21 GiB free at start (≥20 GiB preferred reserve held); no cleanup needed.

## Method (and honest limits)

1. **Real Founder production traffic.** Today's `provider.*.complete` read diagnostics (`PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS=1` in the live spec) and `native.*` structured logs from deployment `66ee39f6` (17:26–17:48Z), via read-only `doctl apps logs`.
2. **Zero-write per-resource Server benchmark** of the exact Native read service. This is the code behind `GET /api/v1/native/read/<resource>`, run inside the production web container against production data (new tool `scripts/performance/*`).
   - Safety: identity gates, one connection, `BEGIN … READ ONLY` confirmed via `transaction_read_only=on`, a SELECT/WITH-only statement guard, and `ROLLBACK`. Output is numbers only.
   - Coverage: cold (first call in the process) and a warm median (2 repeats) per resource, with DB time, query count, rows loaded, and response bytes.
3. **V8 CPU profiles** of the slowest reads, taken in the same container, same safety contract. Positions were resolved locally with a sourcemap that never left the Mac.
4. **Native request graph** from source, plus network cost from this Mac to production. `curl`: TLS about 30–60 ms, time-to-first-byte about 145–300 ms per request, and the same for a trivial health route. So every request carries a fixed ~0.15 s edge/app overhead before any read work.
5. **Not done:** no Founder-device operation and no authenticated phone trace (not authorized; no credentials used). Native end-to-end numbers below are therefore *composed*: Server read time, plus measured network overhead, plus the request graph and cache state from source. They are labelled as such. Native decode/render at fixture scale was already shown sub-second by the 09-22 audit.

## Inherited prior findings (Part A)

| Finding | Evidence (commit/file) | Old latency | Old root cause | Old fix / deferral | Status at 00321dcc / a399916a |
|---|---|---|---|---|---|
| ≤3 s hard ceiling | `docs/APP_WIDE_PERFORMANCE_AUDIT.md` (850f0133); prompt 20260922T040500Z | – | – | policy | Still the standard |
| ~10 s Home→Priority, slow completion | No number in git. Related: 03b0b3d9 (Build 31 read cache), fdd8ad4e (completion animation), e9b3ea50 (Web bounded completion) | not recoverable | – | – | Navigation re-measured (below): closed. Completion from Priority Detail root-caused (below). |
| Completed Visible Abs 503 | 503 not in git; 97493433 narrow completed-goal store | 503 not recoverable; Web 370/135 ms after | full-runtime composition | narrow store | Closed: 80–140 ms Server (below) |
| Training category/library 7.6–10 s | Figure not in git; Web batch 7 duplicate identity hydration fixed (c3feb211 lineage) | Web worst 1,135 ms after fix | duplicate hydration | fixed | Closed: 0.23–0.67 s Server (below) |
| Progress Hub 1–2 s target | 102fa29d, d0a5804a | Native Evidence fan-out 0.75–2.2 s per read (09-22) | 7-way fan-out on a 5-connection pool; unbounded `context=all` payloads | deferred | Open. Measured below. |
| Blocking spinners on Home/Log/Evidence | 3f55e2cc | – | view model rebuilt on tab reappearance | fixed for Home/Log/Evidence only | Tab revisits are fixed. Cold launch always shows a spinner (in-memory cache only). 19 other screens still rebuild. |
| `.task(id:)` view-model reconstruction | 3f55e2cc | – | `.task` re-fires on reappearance | fixed for 3 screens | Still present on 19 read screens plus Priority Detail |
| Workout completion waited ~60 s on screenshot | 94e13922 (Native), 8aed040c (Server) | ~60 s | commit waited for intake | durable commit first, async reconciliation | Solved. Do not repeat. |
| Server runtime reconstruction | c3feb211 … c7dd10cb (Web 09-07); 09-22 audit 652b3ca7 | Web 15 s → <3 s; Native Home 2.4 s / 3.6 MB | per-route full runtime | narrow per-surface stores | Mostly solved. Reads still load full per-collection history (Home 1,121 rows / ~4.2 MB per request). |
| Resume / cold-launch cache misses, pool of 5, auth round trips | 09-22 audit | – | in-memory cache; `.reloadIgnoringLocalCacheData`; pool max 5 | deferred | Still present. Pool queueing re-observed today (below). |

**Already solved, not repeated:** Web full-runtime collapse; asynchronous workout evidence; Home/Log/Evidence tab-revisit retention; Log cache-key fix (87e5d2e9); in-flight read dedupe and generation-gated invalidation (FounderServerAPITests).

## Real Founder production traffic today (deployment 66ee39f6)

`provider.*.complete` elapsed = Server DB plus projection time inside the read store (excludes auth and HTTP):

| Read model | Samples (ms) | Rows loaded | DB payload loaded |
|---|---|---|---|
| core.navigation.home | 2270, 1424, 1399, 2432 | 1109 | 4.18 MB |
| core.navigation.profile | 348, 29 | 231 | 0.29 MB |
| training.landing | 1761, 291, 1071 | – | – |
| training.navigation.library | 1263, 718 | – | – |
| core.navigation.training-my-library | 307, 146 | 252 | 0.99 MB |
| progress.evidence.nutrition / activity / energy | 469–904 | 295–1020 | 1.2–4.3 MB |
| progress.evidence.weight / dexa | 43–377 | – | – |
| progress.photos | 1884, 1391 | 265 | 1.45 MB |
| training.navigation.day | 26, 36 | – | – |

- **Pool queueing:** during the launch/resume bursts, `waitingCount` reached **19** (17:47:40) and **12** (17:34:12) on the 5-connection pool.
- **Duplicate reads:** Home was read twice back to back at cold launch (17:34:08–11), and profile twice. The cause was not proven without a device trace.
- **Auth:** at resume, 4 reads failed `ACCESS_TOKEN_EXPIRED` (the 10-minute token) before a refresh (22–279 ms) and retry.

## Zero-write per-resource Server benchmark (baseline code a399916a, production data)

Cold = first call in a fresh Node process (includes JIT/module warm-up; comparable to the first request after a deploy or container restart). Warm = median of repeats.

| Native resource (surface) | Cold ms | Warm ms | Warm DB ms | Queries | Rows | Response bytes |
|---|---|---|---|---|---|---|
| home (Home) | 4383 | 1606 | 937 | 2 | 1121 | 69,555 |
| priority (Priority Detail) | 35–205 | 35–42 | ~99* | 7 | 168 | 1.7–3.5 K |
| evidence-review-queue (Log) | 1002 | 957 | 674 | 2 | 841 | 1,051 |
| goals (Goals landing) | 807 | 1013 | 658 | 2 | 970 | 3,373 |
| active-goal (Build Lean Mass) | 189 | 228 | – | 9 | 303 | 4,936 |
| completed-goal (Visible Abs) | 140 | 81 | 54 | 2 | 36 | 3,118 |
| operating-plan | 58 | 44 | 27 | 2 | 187 | 5,232 |
| morning-check-in | 1057 | 1313 | 1111 | 1 | 1179 | 1,592 |
| weight (all / lean-mass) | 172 / 89 | 103 / 83 | – | 4 | 139 | 15,660 / 11,939 |
| nutrition (all / lean-mass) | 546 / 214 | 480 / 250 | 344 / 152 | 6 | 92 | **1,268,892** / 1,198,702 |
| activity (all) | 315 | 511 | – | 8 | 356 | 71,862 |
| energy (all) | 480 | 348 | 445 | 8 | 434 | 53,996 |
| dexa (all) | 57 | 39 | 35 | 4 | 38 | 32,498 |
| photos (Progress Photos) | 898 | 1271 | 1108 | 7 | 265 | 48,708 |
| timeline | 725 | 690 | – | 11 | 1680 | 24,622 |
| training-landing (Training landing) | 1030 | 866 | 373 | 4 | 342 | **1,652,513** |
| training-library my / all / category | 674 / 229 / 447 | 457 / 545 / 486 | – | 5 | 515 | 191,032 |
| training-exercise | 64 | 56 | 86 | 5 | 33 | 137,539 |
| training-reporting | 566 | 510 | 99 | 4 | 342 | 29,849 |
| training-logger (start workout) | **2885** | **1748** | 257 | 2 | 264 | 198,843 |
| training-day | 94 | 37 | 31 | 4 | 17 | 2,008 |
| training-session | 15 | 14 | 10 | 2 | 13 | 919 |
| briefing-history | 930 | 381 | 377 | 1 | 32 | 20,329 |
| briefing (detail) | 161–181 | 28–80 | 23–58 | 4 | 7 | 18–39 K |

\*DB time can exceed wall time where reads run concurrently, because the benchmark sums overlapping query waits.

- DB round trip inside the container: 1.6–2.4 ms median.
- Response bodies are small except Training landing (1.65 MB) and Nutrition (1.27 MB). Evidence Hub fetches both on every load, so each load downloads about 3.2 MB.

## Where the Server time goes (CPU profiles, production data)

- **Home (1.6 s warm):**
  - DB ~0.94 s. Postgres detoasts and projects the full `analyses` (410 rows, 27 MB raw) and `dailyBriefings` (53 rows, 15.5 MB raw) history plus 1.6 MB of confidence history, returning ~4.2 MB.
  - CPU: `getLocalDateKey` ≈ 420 ms per read and `resolveLocalTimeZone` ≈ 130 ms per read. Both construct a new `Intl.DateTimeFormat` on every call; `DailyBriefingFreshnessService` and `DailyFocusService` call them per record.
- **Training Logger (1.7 s warm / 2.9 s cold):** `normalizeExercisePhrase` ≈ 1.1 s per read. Alias matching re-normalizes every registry name and alias on every lookup, thousands of times, inside `TrainingLoggerProgressionService.listAllPerformances`.
- **Training landing (0.9–1.0 s):**
  - `ProgressReportingService`'s private `getLocalDateKey` ≈ 160 ms per read and `formatDate` (`toLocaleDateString`) ≈ 120 ms per read;
  - `projectClientSafeValue` walks the 1.65 MB body, ≈ 100 ms.
- **Progress Photos (0.9–1.3 s):** `CanonicalPhotoSessionReadService.formatDate` ≈ 580 ms per read and `GalleryInterpretationService.formatDate` ≈ 110 ms per read (`toLocaleDateString` per view and comparison).
- **Activity:** time is dominated by `ProgressReportingService.getLocalDateKey`.
- **Log / Morning Check-In / Goals:** DB-bound. Full `evidenceReviews` (242 rows, 7.4 MB raw) and `canonicalEvidenceObjects` histories are loaded per request.

## Native request graph and composed cold/warm latency (Build 60 + a399916a)

Network overhead is ~0.15–0.3 s per serial round trip; Server time comes from the benchmark and production logs. Cold = process or view model not warm. Warm = revisit with a valid in-memory cache (TTL: home 30 s, training/briefing-history 60 s, others 90 s).

| # | Path | Requests (serial→parallel) | Cold (composed) | Warm | Blocking? | Class |
|---|---|---|---|---|---|---|
| 1 | Launch → Home meaningful content | refresh → home | **2.0–2.9 s** typical; **~4.8 s** first request after a deploy/restart | 0 requests (retained) | full-screen spinner (in-memory cache only) | PASS ceiling / FAIL after restart |
| 2 | Home refresh (pull) | home + prefetch (goals, goal detail, briefing) | 1.8–2.7 s | – | content kept | PASS ceiling |
| 3 | Home → Priority Detail | priority | 0.2–0.5 s | 0 requests (90 s) but view-model rebuild flashes a spinner | spinner | PASS preferred |
| 4 | Priority completion (from Detail) | command → notification cleanup = invalidate + **full Home read** → acknowledgement → priority re-read | **~2.0–3.3 s to visible acknowledgement** | – | yes, acknowledgement waited on the Home read | FAIL risk / root cause found |
| 4b | Priority completion (Home inline) | command → row removed; Home refetch in background | command round trip (~0.3–0.6 s est.) | – | no | PASS |
| 5–6 | Home → Log / Log content | review-queue ∥ weight | 1.1–1.3 s | 0 requests (retained) | spinner at first visit | PASS ceiling |
| 7 | Evidence Hub | 7 in parallel (training landing+library, nutrition, activity, energy, dexa, photos, weight) | 1.5–2.5 s plus **~3.2 MB download**; pool queueing observed | retained | spinner at first visit | PASS ceiling; network-sensitive |
| 8 | Evidence stream open (Nutrition/Weight/Activity) | 1 read (scope mismatch → re-fetch) | 0.3–0.8 s (+1.2 MB for Nutrition) | cached 90 s | spinner | PASS |
| 9 | Training landing/history | landing ∥ library | 1.1–1.6 s (+1.84 MB) | 60 s cache | spinner | PASS ceiling |
| 10 | Training Day | day | 0.2–0.3 s | – | – | PASS |
| 11 | Training session | session | ~0.2 s | – | – | PASS |
| 12 | Training Library / category | library | 0.6–0.9 s | 60 s cache, but view-model rebuild spinner and lost scope | spinner | PASS (historical 7.6–10 s closed) |
| 13 | Goals landing | goals | 1.0–1.2 s | 90 s cache, rebuild spinner | spinner | PASS ceiling |
| 14 | Active Build Lean Mass detail | goals → active-goal (serial) | 1.3–1.5 s (hub cold); 0.4 s (hub cached) | – | spinner | PASS |
| 15 | Completed Visible Abs detail | goals → completed-goal | 1.2–1.4 s cold; ~0.3 s | – | – | PASS (503 not reproducible) |
| 16 | Briefing History | history (cursor) | 0.5–1.1 s | 60 s | – | PASS |
| 17 | Briefing detail | briefing | 0.2–0.35 s; latest is prefetched from Home | – | – | PASS preferred |
| 18 | Progress Photos | photos | 1.1–1.5 s | 90 s | spinner | PASS ceiling |
| 19 | Weight detail | weight | ~0.3 s | – | – | PASS preferred |
| 20 | Nutrition / Activity day | nutrition (1.2 MB) / activity (always reloads, by design) | 0.4–0.9 s | – | – | PASS |
| + | Training Logger (start workout) | logger | **2.0–3.1 s** | 60 s | spinner | FAIL risk when cold |
| + | Resume after >30 s idle | every mounted screen with a `scenePhase` handler refetches at once, plus an expired-token refresh | visible screen queued behind hidden ones (pool waiting 12–19) | – | content kept, slow settle | optimization |

## Ranking (frequency × latency × blocking; Founder priority order)

1. **Home cold launch** (daily, first surface). 2–3 s spinner; ~4.8 s after a restart. Server Home read 1.4–2.4 s, of which ~0.55 s is pure date-formatter construction.
2. **Priority completion from Detail** (daily, several times). Acknowledgement waits on a full Home read (~2–3.3 s).
3. **Training Logger open** (Logging, daily on training days). 1.7–2.9 s Server CPU in exercise-phrase normalization.
4. **Resume burst**: hidden screens contend with the visible one on a 5-connection pool.
5. **Evidence Hub / Training landing / Nutrition**: ~3.2 MB of mostly undecoded payload per Hub load, plus date-formatter CPU in Training, Activity and Photos.
6. **View-model rebuild spinners** on 19 read screens plus Priority Detail (flash, scope reset, re-read).
7. Log / Goals / Morning Check-In: 1.0–1.3 s DB-bound full-history reads. PASS ceiling now, but an unbounded trend (Phase 3).

No common path is SEVERE (≥5 s) or CRITICAL (≥8 s/503) on current code. The historical ~10 s Priority navigation, the 7.6–10 s Training Library, and the Visible Abs 503 did not reproduce.

## Proposed fixes (implemented in the candidate report)

- Server, output-identical:
  - cache `Intl.DateTimeFormat` per zone in `localDate`;
  - memoize `normalizeExercisePhrase`;
  - cache reporting and photo date formatters.
- Server, Native-only payload projections: exact Build 60 decode keys for training-landing, training-library, and nutrition.
- Native:
  - persisted last-known Home, labelled and non-completable, painted on cold launch;
  - Priority Detail acknowledges before notification reconciliation;
  - read screens retain their view model;
  - only the visible screen refreshes on resume.
- Phase 3, larger architecture:
  - bounded or pre-projected history for Home, Log, Goals and Morning Check-In (read-model table or indexed projections);
  - auth last-seen writes off the read path;
  - a pool-size spec change (config, needs deploy authorization).

## Flags (baseline stage)

AUTHORITY_REVERIFIED=yes · PRIOR_PERFORMANCE_WORK_RECOVERED=yes · BUILD60_BASELINE_COMPLETE=yes (Server measured on production data; Native composed, no device) · COLD_WARM_MEASURED=yes (Server) / composed (Native) · DUPLICATE_REQUESTS_MEASURED=yes (production logs) · SERVER_DB_BREAKDOWN_MEASURED=yes · BOTTLENECKS_RANKED=yes · HOME_PRIORITY_PROFILED=yes · PRIORITY_COMPLETION_PROFILED=yes (source + Server; command time not in log window) · VISIBLE_ABS_GOAL_PROFILED=yes · TRAINING_LIBRARY_PROFILED=yes · HOME_LOG_EVIDENCE_PROFILED=yes · PROGRESS_HUB_PROFILED=yes · SERVER_DEPLOYED=no · TESTFLIGHT_UPLOADED=no · PRODUCTION_MUTATED=no
