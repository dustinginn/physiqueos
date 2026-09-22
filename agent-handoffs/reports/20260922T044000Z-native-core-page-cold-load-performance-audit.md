# Native core-page cold-load performance audit

Task id: `native-core-page-cold-load-performance-audit-20260921`

## Authority reverified

- Production Server: SHA `93491bc5d829d3693aa29023cd79e96922012130`, deployment `1156849f-d5af-47ec-a5d3-d247a99033ee`, phase ACTIVE. Matches the task's expected authority exactly — confirmed live via `doctl --context physiqueos-audit apps get-deployment`.
- Native: previously-recorded Remote Control anchor was Build 48 (`bbb46e19`, `origin/native/build48-accepted`). This task's expected_native_sha (`2bfbf54a`, Build 49) is one commit ahead on `origin/native/build49-candidate`, builds ahead of and includes Build 48. Used Build 49 for this audit since it matches the task's own expected authority and is the newest lineage with no unmerged HealthKit work in it.
- Pending HealthKit Build 50 candidate (`d96db0d0`, `origin/native/build50-workout-candidate`): confirmed untouched. Not built, not modified, not referenced by anything in this audit.
- Isolated read-only worktrees were created for this audit (`native-perf-audit-20260921` at `2bfbf54a`, `server-perf-audit-20260921-prod` at `93491bc5`) and have been removed after the audit — see Disk impact below.

## Scope and honest measurement caveats

**What I could not do:** I do not have the Founder's Production login credentials (Keychain-backed refresh token), and none of the local simulators had an existing authenticated Founder Production session. I did not attempt to fabricate, bypass, or extract any credential. As a result I could not drive a live, on-device, authenticated cold-launch trace through the actual Native UI end-to-end. `COLD_LAUNCH_MEASURED` and `IDLE_RESUME_MEASURED` are therefore **not** measured via a live authenticated device trace in this pass.

**What I used instead, and why it's still strong evidence:**
1. **Real production runtime logs** (`doctl --context physiqueos-audit apps logs`, read-only, no code execution) captured an actual recent Founder session (2026-09-22 ~02:27–04:26 UTC, i.e. tonight) with structured per-read-model timing (`elapsedMs`, `payloadBytes`, `rowCount`, `queryCount`, live DB pool stats). This is real Founder-caused production traffic, not a synthetic proxy — arguably better ground truth for server-side cost than anything I could generate myself without credentials.
2. **Full architecture mapping** of both the Native app (git SHA `2bfbf54a`) and the exact production Server code (git SHA `93491bc5`) via targeted code reads, with concrete file:line evidence for every claim below.
3. **A real (not estimated) local build/run experiment**: I built the Debug configuration, installed fresh on a clean iOS 26.5 simulator, and cold-launched it 3× in the app's default Sandbox/fixture mode (no network, no auth — the same SwiftUI view/viewmodel code Home uses in Founder Production, fed small bundled fixture JSON instead of a live network response). Screenshots confirm Home's fully-rendered shell is on screen at t≈0.8s after the launch command in every trial. This isolates and rules out "SwiftUI render + view construction" as a multi-second contributor when data is already in hand — it does **not** measure real network/auth/decode-of-large-payload cost, which is exactly why I leaned on production logs for that part instead of guessing.
4. **Unauthenticated network baseline**: 5× `curl -w` runs to `physiqueos.dustinginn.com` from this environment measured DNS+TCP+TLS 40–160ms total. This is from a well-connected dev network, not the Founder's real device network, so it's a floor, not a ceiling, on connection-establishment cost.
5. I did **not** invoke the more invasive "read-only production console exec" tool documented in ops memory (`runAppConsoleContextGzipFile.mjs`) — it runs arbitrary code against the live production app container, and the log-based + code-based evidence already available was sufficient to reach confident, specific findings without that additional blast radius. Flagging this choice explicitly rather than silently skipping it.

**Explicit flags** (see full list at the end) reflect this: `COLD_LAUNCH_MEASURED`=partial (fixture-only local shell timing; real device/network trace not obtained), `IDLE_RESUME_MEASURED`=no, `WARM_NAVIGATION_MEASURED`=partial, `SERVER_LATENCY_QUANTIFIED`=yes (real production log data), `AUTH_LATENCY_QUANTIFIED`=yes (real production log data — auth refresh itself, see below), `NETWORK_LATENCY_QUANTIFIED`=partial (connection establishment only, not from Founder's device), `MAINACTOR_RENDER_COST_QUANTIFIED`=partial (ruled out as dominant under fixture-scale data; not measured at production payload scale).

## Real production evidence (live logs, actual recent Founder session)

All numbers below are from actual `provider.*.complete` console diagnostics (enabled in the live deployed App Platform spec via `PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS=1` — **note: this is set only in the live spec, not in the checked-in `infra/digitalocean/*.yaml` templates**, a spec/template drift worth fixing separately so a redeploy-from-template doesn't silently lose this diagnostic) and from the structured `native.auth.*` logger.

| Read model (server-side name) | Native surface | Samples (n) | elapsedMs (server DB/assembly time) | payloadBytes | rowCount |
|---|---|---|---|---|---|
| `core.navigation.home` | Home | 1 | 2440 | 3,629,818 (3.6 MB) | 1090 |
| `core.navigation.log` | Log | 1 | 2271 | 9,255,446 (9.2 MB) | 803 |
| `core.navigation.goals` | Goals | 1 | 906 | 3,566,038 (3.5 MB) | 942 |
| `progress.evidence.nutrition` (context=all) | Evidence Hub → Nutrition | 4 | 80 / 121 / 754 / 1359 | 898K–4.0 MB (grows with query scope) | up to 821 |
| `progress.evidence.activity` (context=all) | Evidence Hub → Activity | 2 | 1129 / 1350 | 2.9–4.0 MB | 821 |
| `progress.evidence.energy` (context=all) | Evidence Hub → Energy | 2 | 1251 / 1355 | 3.99–4.0 MB | 821 |
| `progress.evidence.weight` | Log, Evidence Hub, Weight | 3 | 72 / 107 / 193 | 164,139 (constant) | 136 |
| `progress.evidence.dexa` | Evidence Hub → DEXA | 3 | 17 / 109 / 142 | 76,850 (constant) | 38 |
| `progress.photos_read` (`progress.photos`) | Evidence Hub → Photos | 2 | 1773 / 2193 | 1,445,815 (constant) | 262 |
| `training_navigation_read` (`training.landing`) | Training | 3 | 395 / 679 / 711 | n/a | n/a |
| `training_navigation_read` (`training.navigation.library`) | Training | 4 | 209 / 343 / 368 / 1560 | n/a | n/a |
| `core.navigation.training-my-library` | Training | 4 | 96 / 161 / 261 / 778 | 958,798 (constant) | 246 |
| `active_goal_read` (`goals.active.build-lean-mass`) | Goals detail | 1 | 103 | 1,773,586 | 294 |
| `evidence_review_read` (`evidence.review.detail`) | Log drill-in | 1 | 86 | 68,849 | 3 |
| `briefing_navigation_read` | Home briefing card | 1 | 149 | 1,121,881 | 7 |
| `native.auth.refresh_succeeded` | (every cold/idle session) | 2 | 18.08 / 54.65 | — | — |

Sample sizes are small (this is one ~2-hour log retention window, one real session) — per instructions I'm reporting min/median/max/n rather than claiming p90/p95 precision. **Do not over-read exact percentiles from n=1–4; the magnitudes and the pattern across repeats are the reliable part.**

DB connection pool: fixed at 5 (`PHYSIQUEOS_DATABASE_POOL_MAX` unset in the live spec, default in `src/platform/database/config.js:35` is 5, max allowed 20). During the observed Evidence Hub load burst (its 7–8 concurrent GETs), pool `waitingCount` reached **10**, meaning up to 10 requests were queued behind only 5 DB connections at once — a real, measured concurrency bottleneck, not a hypothetical one.

Auth refresh itself is **fast** (18–55ms) — despite being a heavier transaction in code (4 sequential statements, `FounderAuthService.js`), it is not, by itself, a multi-second contributor. The cost is elsewhere (see root causes below).

## Native architecture map (SHA `2bfbf54a`)

- **No consolidated bootstrap.** Every tab/screen independently calls its own `GET read/<resource>`. `readContracts()` exists but has no call site (dead code). Evidence Hub alone fans out to **7 concurrent GETs** (`weight`, `training-landing`, `nutrition`, `activity`, `energy`, `dexa`, `photos-landing`), which matches the real log burst above exactly.
- **Cold launch always pays two serial network round trips before any content**: `accessToken` is an in-memory `var`, always `nil` on process start → first request forces `refreshAccessToken()` → only then does the actual `read/home` (or whatever) request run. Refresh itself is fast per the logs above, but it's still a mandatory serial hop in front of every cold launch.
- **In-memory-only cache, zero disk/HTTP caching.** `ProductionNativeAPI.readCache` (`Networking/FounderServerAPI.swift:392`) is a plain in-process dictionary — **empty on every process launch, 100% guaranteed cache miss on cold launch for every resource.** Every request also explicitly sets `request.cachePolicy = .reloadIgnoringLocalCacheData` (lines 316, 940), which disables iOS's own free `URLCache`/HTTP disk cache and any `ETag`/conditional-GET benefit — there is no `ETag`/`If-None-Match` anywhere in the Server response either. Cache TTLs while the process is alive are short (home=30s, several training resources=60s, default=90s), which is exactly why "warm/common navigation is usually fine" (per the Founder's own description) but a fresh process pays full cost every time.
- **Confirmed duplicate-fetch bug**: Weight/Nutrition/Activity screens default their own query scope to `context=build-lean-mass`, while Evidence Hub and Log use `context=all`. Drilling from Evidence Hub into Weight, Nutrition, or Activity is a **guaranteed cache-miss re-fetch** of conceptually the same data just displayed seconds earlier, because the cache key (resource+query) doesn't match. Training's own default scope happens to match Evidence Hub's, so Training doesn't have this specific duplication.
- **No biometric/PIN gate** anywhere (grepped, zero hits) — not a contributor.
- **No connection warming/pre-connect**, no custom `URLSessionConfiguration` — first request of a cold launch pays a full DNS+TCP+TLS handshake with no help from the client.
- **No `os_signpost`/`MetricKit` anywhere.** A DEBUG-only `NativePerformanceDiagnostics` (`Performance/NativePerformanceDiagnostics.swift`) already captures almost exactly what this audit needs — `recordRead(resource:milliseconds:decodeMilliseconds:bytes:cacheHit:)` on every network read, and `recordNavigationInitiated`/`recordShell` timing "tap → destination view appears" for `AppDestination` pushes (Training/Weight/Nutrition/Photos/etc., **not** for the 5 top-level tabs, which aren't instrumented). It is **compiled out of the build the Founder actually runs** (`#if DEBUG`) — the single most direct next step for real on-device evidence is promoting a redacted/rate-limited version of this to release builds rather than building new instrumentation from scratch.
- **Foreground/background handling is per-screen, not app-level.** Every screen's own `.onChange(of: scenePhase)` calls `load()` again on `.active`, but does **not** force `invalidateReadResources` first — so a background/foreground cycle longer than the resource's TTL (as short as 30s for Home) causes a full silent re-fetch, which plausibly reads to the Founder as "the app went idle and now it's slow again" even though it's not a true process-cold-launch.
- **"Home priority navigation" as a specific named feature was not found** in this codebase or git history under that name; closest candidates are `HomeView.prefetchLikelyDestinations()` and two related commits (`96705f84`, `fdd8ad4e`) about Home's priority-completion/prefetch interaction. Flagging this rather than guessing — worth confirming the exact name with whoever raised it.

## Server architecture map (exact production SHA `93491bc5`)

- **Auth is DB-backed on every single authenticated request**, no cache: `authenticateAccessToken` opens a pooled connection, `BEGIN`s a transaction, does a 3-table JOIN to validate the token, then **two sequential UPDATE statements** (`devices`, then `sessions`) to record "last seen," then `COMMIT`s and releases — 5 DB round trips of pure auth bookkeeping on every Home/Log/Training/Nutrition/Weight read, with no in-memory/short-TTL validated-token cache. This overhead is **not captured** by the `elapsedMs` numbers in the table above (those are logged from inside the read-model service, after auth already ran) — real per-request latency is measurably higher than the table shows by however long this 5-round-trip auth check costs.
- **Access tokens expire after 10 minutes.** After any idle gap longer than that (very plausible for "opened the app after not using it for a while"), the client must first do the heavier refresh transaction (`lockRefreshCredential` 3-way JOIN + `FOR UPDATE`, then an INSERT and an INSERT+UPDATE) before any data call can even start. Measured fast in the logs above, but it's a mandatory serial prerequisite, and it's the one thing that's specifically tied to "idle," matching the Founder's own framing of the symptom.
- **Home, Training reports, Nutrition, Weight, Timeline, and Photos all query full, unbounded account history** from Postgres before truncating/limiting only at the very end of the pipeline (in application code, not at the SQL level). This is the single most consistent architectural pattern behind every large `payloadBytes`/`elapsedMs` number in the table above, and it means these numbers will only get worse as the Founder's own history grows — this is not a one-time cost, it's an unbounded trend.
- **An uncached extra DB query rides along on every Home/Training-related read**: `ensureCanonicalExerciseRegistry()` claims in a code comment to "coalesce concurrent cold-start callers," but the in-flight promise is reset in a `.finally()` immediately after resolving — so it only dedupes truly-simultaneous callers, not sequential idle-then-resume calls. Every Home/Training-Logger/Training-Landing/Reporting/Library call pays this extra round trip independently.
- **No HTTP caching anywhere**: `apiResponse.js` hard-codes `cache-control: no-store` on every response, success or failure; no `ETag`/conditional-GET support in the Native contract path. Matches the client-side finding above — there is no caching layer at any level between "in-memory, alive only for this process" and "full re-fetch."
- **The DB pool default is 5** (`src/platform/database/config.js:35`), not overridden in the live spec (`PHYSIQUEOS_DATABASE_POOL_MAX` unset), and the live logs show this genuinely queues under the Evidence Hub's own 7-concurrent-GET burst (`waitingCount` reaching 10). This is a real, cheap, low-risk lever (config value up to 20, no code change).
- **No APM/tracing SDK anywhere** (no Sentry/Datadog/OpenTelemetry). The one instrumentation gap that most limits future debugging of this exact class of problem: **the primary bulk-read path (`NativeProductionContractService.read()`, backing every page in this audit) never logs a success-path duration** — `apiResponse.js`'s `executeApiRequest` only logs on the failure path. The rich per-query diagnostics that produced the table above are real and already built, but they're wired to an env var (`PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS`) that exists only as a live spec override, not in version control.
- A dedicated, still-open internal doc (`docs/APP_WIDE_PERFORMANCE_AUDIT.md`, last touched 2026-09-07) independently benchmarked the same underlying read-model services (shared between Web and Native): Home cold **2044ms** (flagged "NEEDS OPTIMIZATION" even before Native's own auth/refresh overhead stacks on top), Training reports cold **3.0–3.7s** ("FAILS"), History/Timeline **5.3s, 2.28MB** ("FAILS"). The doc's own status says its listed optimization batches have not been confirmed live in the current deployment — I could not verify from the repo alone which of its 10 proposed batches are actually in `93491bc5` today, beyond confirming the specific 42-sequential-query `loadCanonicalRuntime` collapse (batch #1) does appear to have landed.

## Root cause classification (A–G)

**G — combination, but with a clear weighting.** In order of how much of the "3–5 seconds after idle" symptom each plausibly explains:

1. **C (Server endpoint/read-model latency) — dominant, well-quantified.** Real production numbers: Home 2.4s, Log 2.3s (9.2MB), Goals 0.9s, and 1.0–1.4s each for Nutrition/Activity/Energy when fetched with `context=all` — several of these individually approach or exceed the 3s target on their own, before any client-side network transfer time for their multi-megabyte payloads is even added. Root cause: unbounded full-history queries with no DB-level pagination, plus a redundant uncached exercise-registry query on Home/Training paths, plus zero HTTP caching.
2. **E (Native cache invalidation/no persisted snapshot) — dominant, well-quantified via code.** The in-memory-only cache guarantees a 100% cache miss on every cold launch, and `.reloadIgnoringLocalCacheData` explicitly forfeits iOS's free HTTP disk cache as a fallback. This is why "warm navigation is fine, cold-after-idle is slow" is exactly the expected behavior of the current code, not a mystery.
3. **A (auth/session cold start) — real but secondary.** The 10-minute access-token lifetime means any realistic idle gap forces a refresh round trip before any data call; measured fast (18–55ms) in production, but the per-request 5-DB-round-trip auth check (uninstrumented, so not in the table above) adds unmeasured overhead to literally every subsequent read on top of that.
4. **D (Native serial/duplicate requests) — real, narrower than initially suspected.** The architecture is not naively serial (Evidence Hub already parallelizes 7 GETs), but there is a confirmed, fixable duplicate-fetch bug (Weight/Nutrition/Activity default scope mismatching Evidence Hub/Log's `context=all`), and the concurrent-burst pattern is exactly what's driving DB-pool queuing (`waitingCount` up to 10 against a pool of 5).
5. **B (network connection cold start) — likely minor, not fully quantified.** Unauthenticated DNS+TCP+TLS from this environment measured 40–160ms; this is a floor from a well-connected network, not the Founder's actual device conditions, so I can't rule out a materially worse number on a real device after Wi-Fi/cellular has gone idle — flagging as the main remaining unknown rather than claiming it's negligible.
6. **F (rendering/decode/MainActor) — evidence points away from this being dominant.** Home's real SwiftUI shell renders in well under a second against fixture-scale data with zero network involved (directly observed, 3 trials, screenshot-confirmed at t≈0.8s). JSON decode time specifically for multi-megabyte production payloads (9.2MB Log, ~4MB Nutrition/Activity/Energy) was not directly measured — order-of-magnitude, typical `JSONDecoder` throughput on Apple silicon for moderately nested models is roughly tens of MB/s, implying perhaps 100–450ms of pure decode CPU for the largest payload, which is real but small relative to the multi-second server-side numbers above. This is an estimate, not a measurement — noted explicitly as a gap.

## Ranked bottlenecks

**P0 — causes or materially contributes to the >3s violation, shared root cause across multiple pages:**

1. **Unbounded full-history server queries with no DB-level pagination** (Home, Log, Training reports/library, Nutrition, Weight, Timeline, Photos). Evidence: real production `elapsedMs` 0.9–2.4s per endpoint; independently corroborated by the internal audit doc's "FAILS"/"NEEDS OPTIMIZATION" verdicts on the same shared services. Root cause: `src/application/*ReadService.js` + `Postgres*ReadStore.js` load complete collections, filter/limit only in application code. Fix: push `LIMIT`/date-window filtering into the SQL layer for the collections that don't need full history for a navigation-scale read (weight entries, evidence objects, photos, briefings). Scope: Server. Correctness risk: low if bounds match what the projection already effectively displays; must confirm no downstream logic silently depends on seeing full history (e.g. lifetime confidence trend calculations) before bounding those specific collections.
2. **Native cache is in-memory-only and explicitly forfeits HTTP disk caching** (`.reloadIgnoringLocalCacheData`), guaranteeing every cold launch is a 100% miss with no fallback. Fix: persist a lightweight last-known snapshot per resource (e.g. to disk, keyed the same as the in-memory cache) that cold launch can render immediately with an explicit "as of" freshness indicator while a background refresh runs, and/or stop disabling the OS HTTP cache so short-TTL resources at least get free conditional-GET benefit once the Server adds `ETag` support. Scope: Native (client persistence) + Server (ETag support) for the full fix; the client-only "keep last snapshot, don't force `.reloadIgnoringLocalCacheData`" half is independently valuable without waiting on Server. Correctness risk: medium — must clearly distinguish "showing last-known data while refreshing" from "showing current data," per the task's own explicit freshness-semantics requirement.
3. **Confirmed duplicate-fetch bug**: Weight/Nutrition/Activity default query scope (`build-lean-mass`) doesn't match Evidence Hub/Log's `context=all`, forcing a guaranteed re-fetch of conceptually-same data on the most common drill-down path. Fix: either align default scopes, or have Evidence Hub's fan-out populate the per-screen cache keys directly so a subsequent drill-down is a cache hit. Scope: Native only, small and low-risk. This is the single cheapest, most surgical fix in this whole report.

**P1 — meaningful but not dominant:**

4. DB connection pool fixed at 5 with observed queuing (`waitingCount` up to 10) under Evidence Hub's own concurrent burst. Fix: raise `PHYSIQUEOS_DATABASE_POOL_MAX` (already supports up to 20) via a spec change — no code change, low risk, cheap to try and measure. Scope: Server ops config only.
5. Per-request auth check costs 5 sequential DB round trips with no validated-token cache, on every single authenticated read, currently invisible in existing instrumentation. Fix: short-TTL in-memory cache of "this token hash validated at time T" on the Server, scoped to seconds, to avoid re-doing the full JOIN+2-UPDATE dance on every read within a tight navigation burst (e.g. Evidence Hub's 7 near-simultaneous GETs). Scope: Server, moderate risk (must not weaken revocation/last-seen accuracy beyond an acceptable staleness window — needs explicit design, not a blind cache-everything change).
6. Uncached `ensureCanonicalExerciseRegistry()` extra query riding along on every Home/Training-family read, despite a comment claiming it coalesces cold-start callers (it only dedupes truly-simultaneous calls). Fix: give it the same short-TTL cache treatment as other reference/catalog data. Scope: Server, low risk (read-only catalog data).
7. No success-path latency logging on the primary bulk-read path (`NativeProductionContractService.read()` / `executeApiRequest`), and the diagnostics that did produce this report's data are enabled only via an undocumented live spec override, not checked into `infra/digitalocean/*.yaml`. Fix: add success-path duration logging (route, resource, total ms) as a permanent structured log, and commit the `PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS=1` env var into the template so it survives a redeploy-from-template. Scope: Server, very low risk, purely additive.
8. `NativePerformanceDiagnostics` (client network+decode+shell timing) is fully built but compiled out of the Founder's real build (`#if DEBUG`). Fix: promote a redacted/rate-limited version to release builds. Scope: Native, low risk, purely additive — this is the fastest path to a real on-device authenticated cold-launch trace in a future pass.

**P2 — polish:**

9. Foreground `scenePhase` handlers call `load()` without first invalidating cache, so any background gap longer than a resource's TTL (as short as 30s for Home) silently triggers a full re-fetch that may read to the Founder as unexplained slowness distinct from true cold launch. Fix: either lengthen relevant TTLs or make the resume-refresh path explicitly show "refreshing" rather than a blank/spinner state. Scope: Native, low risk.
10. No connection pre-warming/`URLSessionConfiguration` tuning for the very first request of a cold launch. Fix: consider a lightweight prewarm ping fired the moment the app becomes active, before the user necessarily taps anything, so DNS/TCP/TLS is already resolved by the time the first real read fires. Scope: Native, low risk, speculative payoff (network baseline measured here was already small; only worth it if a real-device trace shows otherwise).
11. `readContracts()` dead code (never called) — not a performance issue, just an accuracy/maintenance note encountered during the audit.

## Optimization plan / proposed sequence

Sequenced to minimize build churn and land the highest-confidence, lowest-risk items first:

1. **Server, no-code, immediate**: raise `PHYSIQUEOS_DATABASE_POOL_MAX` via spec update and commit `PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS=1` into the checked-in template. Zero code risk, directly testable against the same real-traffic log pipeline used for this audit.
2. **Native, small, low-risk**: fix the Weight/Nutrition/Activity default-scope mismatch (P0-3). Independently valuable, no dependency on anything else.
3. **Server, moderate**: bound the unbounded full-history queries behind Home/Training/Nutrition/Weight/Timeline/Photos with real `LIMIT`/date-window filtering at the SQL layer (P0-1). This is the highest-leverage fix and the one most likely to directly move the "3–5 second" number, but needs care per-collection to avoid changing any downstream calculation that legitimately needs full history.
4. **Server, low-risk, additive**: success-path latency logging on the primary read path, short-TTL auth-token validation cache, short-TTL cache for the canonical exercise registry (P1-5, P1-6, P1-7).
5. **Native, moderate**: persisted last-known snapshot + explicit freshness semantics for cold launch, and stop unconditionally disabling the OS HTTP cache (P0-2). This is the biggest Native-side lift and the one most worth doing carefully rather than quickly.
6. **Native, low-risk, additive**: promote `NativePerformanceDiagnostics` to release builds (P1-8) — do this early enough in practice that it can validate items 1–5 above with real on-device Founder data, rather than last.

## Build 50 vs Build 51

**Recommend deferring all of the above to Build 51 or later**, not folding into the pending Build 50 (HealthKit Workout canary + graduation UI candidate, `d96db0d0`/`c116867f`). None of this task's findings depend on or interact with the HealthKit candidate lineage, and mixing an unrelated performance-fix batch into a build that's already staged and reviewed for a different purpose only adds review surface and regression risk to both efforts for no benefit. The one possible exception, if the Founder wants it sooner: item 6 above (promoting `NativePerformanceDiagnostics` to release builds) is small, purely additive, and touches no code Build 50 depends on — it could ride along in Build 50 without meaningfully increasing its review burden, if getting real on-device telemetry sooner is a priority. Everything else should wait for a dedicated Build 51 performance pass.

## Disk impact and cleanup

Created two temporary read-only `git worktree`s for this audit (`native-perf-audit-20260921` at Native SHA `2bfbf54a`, `server-perf-audit-20260921-prod` at Server SHA `93491bc5`, ~71MB and ~72MB respectively — worktrees share the repo's object store, so this is working-tree-only cost) plus a Debug build's `DerivedData` (~383MB) and small log/screenshot artifacts under `/tmp/native-perf-audit`. Total peak footprint ≈530MB. **All of it has been removed** (`git worktree remove --force` for both worktrees, `rm -rf` for the `/tmp` scratch directories) before writing this report; confirmed back to baseline. No artifacts from this audit remain on disk outside this report and its `latest.json`.

## Production safety

No production data was mutated. All production access was read-only: `doctl apps get-deployment`/`apps logs`/`apps spec get` (read-only DigitalOcean API calls, no writes), and unauthenticated `curl` requests that measured connection timing only (received `401`/`405` responses, no data returned, no session created). No Native app was run against Founder Production (no credentials available, and none were sought). No Server code was deployed, modified in production, or built for production in this task.

## Explicit flags

- COLD_LAUNCH_MEASURED: partial (fixture-scale local shell timing measured directly; real authenticated device/network cold-launch trace not obtained — no Founder credentials available)
- IDLE_RESUME_MEASURED: no (same credential gap)
- WARM_NAVIGATION_MEASURED: partial (inferred from cache TTL code + real production log repeats; not a live on-device trace)
- HOME_PROFILED: yes (real production log data + fixture-scale local render timing)
- LOG_PROFILED: yes (real production log data: 9.2MB, 2.27s)
- EVIDENCE_PROFILED: yes (real production log data covering the full 7-way fan-out)
- TRAINING_PROFILED: yes (real production log data across training-landing/library/my-library)
- NUTRITION_PROFILED: yes (real production log data)
- WEIGHT_PROFILED: yes (real production log data)
- AUTH_LATENCY_QUANTIFIED: yes (real production log data for refresh: 18–55ms; per-request auth-check DB cost identified but not independently timed since no existing instrumentation logs it)
- NETWORK_LATENCY_QUANTIFIED: partial (DNS/TCP/TLS measured from this environment, not from the Founder's device)
- SERVER_LATENCY_QUANTIFIED: yes (real production log data, corroborated by an independent internal audit doc)
- NATIVE_REQUEST_GRAPH_MAPPED: yes (complete page→viewmodel→endpoint→cache map with file:line evidence)
- DUPLICATE_FETCHES_IDENTIFIED: yes (concrete scope-mismatch bug identified and localized)
- CACHE_INVALIDATION_AUDITED: yes (in-memory-only cache, TTLs, `.reloadIgnoringLocalCacheData`, scenePhase behavior all traced in code)
- MAINACTOR_RENDER_COST_QUANTIFIED: partial (ruled out as dominant at fixture scale via direct measurement; production-payload-scale decode cost is an order-of-magnitude estimate, not measured)
- P0_BOTTLENECKS_IDENTIFIED: yes
- IMPLEMENTATION_PLAN_READY: yes
- HEALTHKIT_BUILD50_UNCHANGED: yes
- PRODUCTION_DATA_MUTATED: no
