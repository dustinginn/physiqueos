# Native daily-driver performance, Phase 2: before/after acceptance

Task id: `claude-native-daily-driver-performance-phase2-20260925`
Report 3 of 3 (final). Earlier reports:
- baseline: `agent-handoffs/reports/20260925T185500Z-native-daily-driver-performance-phase2-baseline.md`
- candidates: `agent-handoffs/reports/20260925T193500Z-native-daily-driver-performance-phase2-candidates.md`

**STOP: Founder release authorization required.** Nothing was deployed or uploaded, and no production data was mutated.

## Exact final candidates

- **Server:** `afdc849a6399130668d846544e85236fe1974741`, branch `claude/performance-phase2-server-20260925`, based on production `a399916a`.
- **Native:** `c736254b23b169b144b8e998fe6476d4cd79fe95`, branch `claude/native-performance-phase2-20260925`, based on Build 60 `00321dcc`. Still 1.0 (60); Build 61 release prep is not done.

## How before/after was measured (comparable by construction)

- **Server:** the same zero-write in-container benchmark ran the exact baseline source (`a399916a`) and the exact candidate source against the same production data and the same pinned clock (`2026-09-25T19:00:00Z`).
  - Runs were interleaved baseline/candidate per resource group; Core was repeated as a second pair because production DB latency spiked during the first baseline run.
  - Each response's data is SHA-256-digested, giving **parity**. Every resource not intentionally projected has an identical digest before and after, across all four groups and both Core pairs. The three projected resources differ by design and are proven by key-level tests against Build 60's decoders.
  - Compute (wall minus DB) is reported alongside wall time, because DB latency on the shared production instance is noisy.
- **Native:** request graph and structural tests, plus a simulator measurement of the new cold-launch path.
  - The last-known Home paint for a 93 KB production-shaped Home envelope takes 3.7 ms median (4.2 ms max) on the iPhone 17 Pro simulator.
  - No Founder-device trace was taken (not authorized).

## Server before → after (warm median / cold, production data)

| Resource | Before | After | Response bytes | Parity |
|---|---|---|---|---|
| home | 1.69 s / 3.33 s (pair 2); 1.61 s / 4.38 s (baseline run) | **0.97 s / 1.79 s** | 69.6 K (same) | identical |
| home compute (CPU) | 707–726 ms | **325–411 ms** | – | – |
| training-logger | 1.45 s / 2.50 s | **0.98 s / 1.11 s** (compute 1,412 → 788 ms) | 199 K (same) | identical |
| photos | 1.29 s / 1.05 s | **0.33 s / 0.31 s** | 48.7 K (same) | identical |
| training-landing | 0.57 s / 0.86 s | 0.60 s / 0.52 s (compute 293 → 111 ms) | **1,652,513 → 148,150** | projected (by design) |
| training-library (my/all/category) | 0.32–0.41 s / 0.42–0.75 s | 0.21–0.80 s / 0.22–0.50 s (DB noise) | **191 K → 12.6 K** | projected (by design) |
| nutrition (all / lean-mass) | 0.41 / 0.34 s; cold 0.89 / 4.46 s | **0.28 / 0.14 s; cold 0.35 s** | **1.27 MB → 0.64 MB** | projected (by design) |
| log (evidence-review-queue) | 0.88 s / 1.10 s | 0.78 s / 0.79 s | same | identical |
| goals | 0.99 s / 0.96 s | 0.88 s / 0.78 s | same | identical |
| energy | 0.35–3.3 s (noise) | 0.47 s / 0.22 s | same | identical |
| priority, completed Visible Abs, operating plan, day, session, briefings, weight, dexa, activity, timeline, reporting, exercise | unchanged within noise (25 ms – 0.7 s) | – | same | identical |

Evidence Hub download per load: **~3.2 MB → ~1.0 MB**.

## Native daily-driver paths before → after (composed: Server time + ~0.15–0.3 s per round trip + request graph)

| Path | Before (Build 60 + a399916a) | After (both candidates) | What changed |
|---|---|---|---|
| Launch → Home meaningful content | 2.0–2.9 s spinner (~4.8 s after a restart) | **~4 ms last-known paint** (same local day), labelled "Updating your last update from h:mm…"; authoritative settle ~1.3–2.2 s | persisted snapshot + Server CPU |
| Launch on a new day / after sign-in | 2.0–2.9 s spinner | ~1.3–2.2 s spinner | Server CPU; yesterday's snapshot is refused by design |
| Home refresh | 1.8–2.7 s (content kept) | ~1.2–1.8 s | Server CPU |
| Home → Priority Detail | 0.2–0.5 s | 0.2–0.5 s (unchanged; historical ~10 s closed) | – |
| Priority completion from Detail, visible acknowledgement | **~2.0–3.3 s** (command + full Home read) | **command round trip only (~0.3–0.6 s est.)**; settle continues in background | acknowledge-first ordering |
| Priority completion from Home | command round trip | unchanged | – |
| Home → Log / Log content | 1.1–1.3 s first visit | ~0.9–1.1 s | Server |
| Evidence Hub | 1.5–2.5 s + 3.2 MB | **~0.8–1.3 s + ~1.0 MB** | Photos CPU, projections |
| Training landing / history | 1.1–1.6 s + 1.84 MB | **~0.7–0.9 s + 0.16 MB** | projections + CPU |
| Training Library / category | 0.6–0.9 s + 191 KB; back-navigation spinner and scope reset | ~0.4–0.9 s + 12.6 KB; back-navigation instant, scope kept | projection + retention |
| Training Logger (start workout) | **2.0–3.1 s** | **~1.2–1.4 s** | exercise-phrase memo |
| Progress Photos | 1.1–1.5 s | **~0.5–0.6 s** | cached date formatter |
| Goals landing / Build Lean Mass / Visible Abs | 1.0–1.2 s / 1.3–1.5 s / 1.2–1.4 s | ~0.9–1.1 s / ~1.1–1.3 s / ~1.1–1.3 s | Server CPU (the Visible Abs 503 did not reproduce: 56–131 ms) |
| Any read screen after back-navigation or tab return | spinner flash + re-read (0 to 1.2 s) | **0 requests, no spinner**, selection kept | view-model retention (19 screens) |
| Foreground resume | every mounted screen refetches together (pool waiting 12–19) | only the visible screen (+ Home for notifications) | visible-only refresh |
| Training Day / session, Briefing history/detail, Weight | ≤1.1 s | unchanged | – |

### Request-count changes (structural, tested)

- **Cold-launch Home first paint:** 2 serial requests (refresh + home) → **0 requests** (snapshot), then the same 2 in the background.
- **Priority Detail completion:** before acknowledgement, 1 command + 1 Home read → **1 command**.
- **Back-navigation to a cached read screen:** view-model rebuild + cache read → **no rebuild, 0 requests**.
- **Resume:** N mounted screens → **1 visible screen** (+ Home).

## Acceptance vs standard (Part I)

- **Common paths >3 s:** none on the candidates (composed). Before: cold launch after a restart (~4.8 s) and Training Logger cold (~3.1 s).
- **Home → Priority Detail:** ≤0.5 s. PASS; the ≤1 s warm target is met.
- **Priority completion:** visible acknowledgement ≈ command round trip, meeting the ≤1 s target when the Server is healthy. Authoritative settle (Home reconcile ~1.0–1.8 s) is ≤3 s.
- **Home/Log/Evidence warm meaningful content:** retained, 0 requests. Cold-launch Home paints in ms (same day).
- **Training landing/day/detail warm:** ≤1 s. Training Library ≤0.9 s. Completed Goal ≤1.3 s with no 503. Progress Hub (Evidence) ~0.8–1.3 s, within ≤2 s.
- **Correctness:** Server parity digests are identical for every non-projected resource. Projections are proven against the Build 60 decoders. Snapshot freshness guards are tested (same-day only; retired by writes, revocation and pairing; generation-gated). No HealthKit, Training, briefing or mutation semantics changed.

## Remaining risks and Phase 3 proposal (measured blockers)

1. **Full-history DB loads** remain the floor for Home (DB 0.64–0.94 s), Log (0.5–0.7 s), Goals (0.6–0.7 s) and Morning Check-In (0.7–1.1 s). Postgres detoasts the whole `analyses` (27 MB raw), `dailyBriefings` (15.5 MB), `evidenceReviews` (7.4 MB) and `canonicalEvidenceObjects` histories on every read. Proposal: pre-projected or bounded read models, requiring a domain review of confidence/freshness semantics. Expected payoff: Home 1.0 s → ~0.3–0.4 s.
2. **Per-request auth writes:** last-seen UPDATEs cost ~5 DB round trips per read. **DB pool of 5:** a spec change (not deployed; needs authorization). Payoff: less resume and Evidence Hub queueing.
3. **Proactive access-token refresh** before the 10-minute expiry. Today, resume costs a 401 plus refresh round trip for every parallel read.
4. **Duplicate Home read at cold launch** was seen in production logs; the cause is unproven without a device trace. **Release-safe Native timing:** `NativePerformanceDiagnostics` is DEBUG-only, so a redacted release version would enable real on-device before/after.
5. **Training Logger** is still ~0.8 s CPU. A registry-versioned alias index needs invalidation against runtime exercise registration.
6. **Last-known snapshots for Log/Evidence Hub:** same design, after the Home snapshot is accepted on device.
7. **UI test flake** `testReportingJourneys` (pre-existing): the helper only swipes up, so after back-navigation with a retained scroll position it can miss the control.

## Recommended release order (after Founder authorization)

1. **Server `afdc849a` first.** It is backward compatible with installed Build 60, because every projection keeps every key Build 60 decodes. The Founder gets the Home/Logger/Photos CPU wins and the smaller Hub/Training payloads immediately with no app update. Use the documented two-step deploy (spec stamp + force-rebuild), then rerun the same benchmark against the live SHA (`--sha afdc849a…`) as the post-deploy audit.
2. **Native Build 61 from `c736254b`**, after the HealthKit prospective Cardio acceptance closes, to keep lanes separate. It is independent of the Server candidate (works against `a399916a` or `afdc849a`). It needs release prep (build-number bump, archive) under a separate authorization.

## Flags

AUTHORITY_REVERIFIED=yes · PRIOR_PERFORMANCE_WORK_RECOVERED=yes · BUILD60_BASELINE_COMPLETE=yes · COLD_WARM_MEASURED=yes (Server measured; Native composed + simulator) · DUPLICATE_REQUESTS_MEASURED=yes · SERVER_DB_BREAKDOWN_MEASURED=yes · BOTTLENECKS_RANKED=yes · HOME_PRIORITY_PROFILED=yes · PRIORITY_COMPLETION_PROFILED=yes · VISIBLE_ABS_GOAL_PROFILED=yes · TRAINING_LIBRARY_PROFILED=yes · HOME_LOG_EVIDENCE_PROFILED=yes · PROGRESS_HUB_PROFILED=yes · HIGH_IMPACT_FIXES_IMPLEMENTED=yes · CACHE_CORRECTNESS_GUARDS_PASS=yes · REQUEST_COUNT_GUARDS_PASS=yes · BEFORE_AFTER_REMEASURED=yes (Server on production data; Native structural + simulator) · COMMON_PATHS_UNDER_3S_OR_EXPLICITLY_ESCALATED=yes · SERVER_TESTS_PASS_OR_NOT_APPLICABLE=yes · NATIVE_TESTS_PASS_OR_NOT_APPLICABLE=yes (one pre-existing UI flake) · PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE=yes · FRESH_CONTEXT_REVIEWED=yes · HEALTHKIT_CARDIO_PATH_UNCHANGED=yes · SERVER_DEPLOYED=no · TESTFLIGHT_UPLOADED=no · PRODUCTION_MUTATED=no · GH_REPORT_PUBLISHED=yes (performance lane pointer; HealthKit latest.json/latest.md untouched)
