# PhysiqueOS Performance Phase 1 candidate

**Completed:** 2026-09-30 20:11 UTC

**Mode:** code, test, deterministic benchmark, and review candidate only

**Deploy status:** **NOT DEPLOYED**

**Repository:** `dustinginn/physiqueos`

## Exact authority and candidate identities

The production identities were independently rechecked before choosing bases. The active DigitalOcean web/worker deployment remained on Server source `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`; no deployment or production configuration changed. The accepted Native Build 71 source remained `71164900210f689480ed277205bf8a43b6d18ead`.

| Line | Base | Candidate branch | Candidate implementation SHA |
|---|---|---|---|
| Server | `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5` | `codex/performance-phase1-server-20260930` | `b68d7fb32783117b0d82dd6541a0cb35a5c72061` |
| Native | `71164900210f689480ed277205bf8a43b6d18ead` | `codex/performance-phase1-native-20260930` | `9dd958c699dfbde9bafabcecb88d8b69b1a4f324` |

Both branches are pushed. The Server branch also carries this report in a documentation-only commit after the implementation SHA.

## Executive result

Phase 1 meets its candidate targets without infrastructure or production mutation:

- modeled idle worker database operations fall **96.59%**, from 10,800 to 368 per idle hour;
- Home and Goals retain their full required row sets while reducing deterministic materialized JSON bytes **78.40%** and **80.95%** through exact SQL projections;
- Log falls from 864 to 12 production-shaped rows and from 2,036,102 to 26,342 bytes by reading only the requested local day plus actionable reviews;
- Evidence Hub becomes one Native HTTP request instead of seven, returns compact typed per-stream states, and keeps six streams usable when one optional stream fails;
- Server, database, worker, and Native release-safe telemetry now expose bounded performance fields without payloads, query values, health data, credentials, raw errors, or raw correlation identifiers;
- affected Server suites, a full production build, an unsigned Native Release compile, and focused simulator tests pass.

This is not evidence of a production p95 improvement. The benchmark is deterministic and production-shaped; a guarded deployment and controlled 1/2/10-user run remain required.

## A. Worker idle-churn reduction

### Candidate algorithm

The durable worker now polls at `1s, 2s, 4s, 8s, 15s, 30s` while continuously idle, caps at 30 seconds, and resets to the 1-second path immediately after any non-idle outcome. This preserves fast pickup after real work while placing a clear 30-second upper bound on pickup after sustained idle.

Heartbeat writes are independent of claims and occur every 30 seconds unless status/details change; shutdown forces a final `stopping` heartbeat. A backwards clock jump also forces safe refresh/write behavior.

Authority behavior deliberately differs by state:

- positive provider authority is read fresh before every possible claim, so a cutover pause/fence cannot be crossed through a cache;
- only a paused/negative authority result is cached, for at most 15 seconds;
- paused heartbeat cadence remains 30 seconds;
- compatibility-mode assertions and pre-authority control-plane behavior are unchanged.

Lease renewal, lease-loss checks, retry delays, maximum attempts, dead-letter handling, and dead hooks were not changed. Abort listeners are removed after each wait, avoiding a long-running listener accumulation.

### Idle operation model

| Window | Baseline claims | Candidate claims | Baseline heartbeat writes | Candidate heartbeat writes | Baseline authority reads | Candidate authority reads | Total reduction |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 hour | 3,600 | 124 | 3,600 | 120 | 3,600 | 124 | **96.59%** |
| 1 day | 86,400 | 2,976 | 86,400 | 2,880 | 86,400 | 2,976 | **96.59%** |

The model counts fresh positive-authority reads per possible claim rather than claiming the larger reduction a positive cache would offer. That conservative choice preserves production fencing safety.

## B. Home, Goals, and Log read amplification

### Home

**Old path:** one grouped provider query returned broad canonical collections, including full `analyses`, nested observation prose/provider traces, and deep briefing replacement/history structures. The service then hydrated a compact runtime and used only a small body-composition subset.

**Candidate path:** the same owner-scoped grouped query remains one statement, but PostgreSQL builds the exact analysis observation projection (`type`, `region`, `confidence`, `supportsGoal`) and a bounded briefing projection. Canonical evidence is restricted to the training evidence type already retained by Home. Goals, priorities, weight, DEXA, protocols, execution, reminders, confidence, and other Home-required collections remain present.

### Goals

**Old path:** the Goals root loaded complete analyses, large briefing histories, and broad canonical evidence before the application applied its existing training/body-composition semantics.

**Candidate path:** it uses the same compact analysis/briefing SQL projections and training evidence predicate as Home. Goal, transition, operating-plan, confidence, weight, DEXA, protocol, nutrition, and photo collections are not history-truncated. Existing active/completed goal and Build Lean Mass behavior is exercised by the unchanged semantic service tests.

### Log

**Old path:** Log loaded all evidence reviews, all canonical evidence objects, and all canonical HealthKit workouts, then filtered for today's surface in application code.

**Candidate path:** one captured `now` value is passed from the service into the store and back into Log composition. SQL returns only actionable review states (`pending`, `committing`, `commit_failed`, `partially_committed`) and canonical evidence/HealthKit workout records for the requested local day. Time-zone fallback is requested zone, canonical user zone, then UTC. HealthKit graduation overlays are also bounded to that same local date; workout links and link claims remain available so current-day provenance semantics are unchanged.

The Log optimization intentionally applies only to the daily-driver root. Historical evidence detail, timeline, training, nutrition, activity, photo, and DEXA endpoints are unchanged.

### Store telemetry

Core navigation completion events now include read model, query count, row count, estimated JSON materialized bytes, projection identity, elapsed time, compatibility load count, and pool total/idle/waiting counts. Graduation overlay queries are included in those counters. No SQL parameter or payload value is logged.

## C. Server-owned fail-soft Evidence Hub and Native adoption

Server now exposes `evidence-hub` in the authenticated Native contract. It runs seven already-scoped readers concurrently and returns exactly seven compact landing summaries in canonical order:

`training`, `nutrition`, `weight`, `photos`, `dexa`, `activity`, `energy`.

Each stream has a typed `state` (`available`, `empty`, `unavailable`), the existing Native-compatible status/tone/destination, compact metric/trend/date fields, and a bounded `failureClass` only when unavailable. `Promise.allSettled` isolates optional read failures. A projection/shape problem in one vertical is classified `contract_invalid`; it is not silently treated as empty and cannot poison the other six. Authentication, owner mismatch, unknown resource, and other global boundary failures still fail the request before aggregation.

Native now makes one `GET /api/v1/native/read/evidence-hub?context=all` request, decodes the Server-owned aggregate, and preserves the existing detail destinations and static Timeline/Recovery/Health Metrics rows. Detail screens remain on their individual resources. The Evidence Hub cache lifetime is 30 seconds.

This candidate does **not** pretend seven source reads disappeared. The aggregate retains seven logical scoped source reads; its value in Phase 1 is one authenticated HTTP request, compact response projection, controlled concurrency behind the Server boundary, and per-stream failure isolation. Further source-query consolidation should be driven by post-deploy query telemetry rather than a new denormalized store.

## D. Privacy-safe telemetry and touched failure semantics

Server Native reads now emit bounded structured completion/failure events with:

- fixed resource and route identity;
- Server duration and response byte count;
- status and normalized error class;
- cache/projection path;
- a 16-hex SHA-256 prefix of a syntactically bounded request correlation value, never the raw value.

Evidence aggregation logs only the fixed stream-to-state map. Worker events cover idle-delay transitions/resets, heartbeat cadence, and authority refresh cadence. Core navigation emits the DB counters described above.

Native production reads emit resource, total duration, decode duration, response bytes, cache hit/miss, and a bounded outcome. Cancellation and timeout are distinct from network and contract/decode failures for **read requests only**. Command/write transport behavior was intentionally preserved: cancellation/timeout still follows the existing network-failure and idempotent retry semantics. Pairing, refresh proof, session rotation, enrollment, and last-known Home behavior were not changed.

No event contains response/request bodies, Health data, evidence content, URLs with query values, headers, tokens, SQL parameters, private identifiers, raw correlation IDs, or exception text. No external exporter or infrastructure configuration was added.

## Deterministic production-shaped benchmark

Command: `node scripts/performance/phase1ProductionShapeBenchmark.mjs`

Method:

- deterministic seed `20260930`;
- 60 local materialization/serialization samples per shape;
- sanitized synthetic values only;
- row counts calibrated to the parent production audit: 414 analyses with 3,312 observations, Home 1,129 rows, Goals 973 rows, Log 780 canonical evidence objects plus 84 reviews;
- Log candidate contains eight current-day evidence objects and four actionable reviews;
- Evidence fixture models seven scoped source reports and seven compact cards;
- local medians measure JavaScript materialization/serialization, not PostgreSQL execution, network latency, p95, or p99.

### Before/after

| Surface | Rows before → after | Materialized/response bytes before → after | Reduction | Local median before → after |
|---|---:|---:|---:|---:|
| Home | 1,129 → 1,129 | 4,939,050 → 1,066,708 DB-shape bytes | **78.40% bytes** | 3.689 → 1.031 ms |
| Goals | 973 → 973 | 4,783,830 → 911,488 DB-shape bytes | **80.95% bytes** | 3.331 → 0.891 ms |
| Log | 864 → 12 | 2,036,102 → 26,342 DB-shape bytes | **98.61% rows / 98.71% bytes** | 1.286 → 0.066 ms |
| Evidence Hub | 7 HTTP / 7 logical queries → 1 HTTP / 7 logical queries | 236,787 → 1,111 response-shape bytes | **85.71% requests / 99.53% response bytes** | 0.196 → 0.002 ms serialization |

Evidence source materialization is modeled unchanged at 236,579 bytes in both cases because the aggregate still invokes the seven scoped sources. That prevents an invalid claim of DB savings from HTTP aggregation alone. The response-byte number is fixture-shaped and must be replaced with observed production telemetry after guarded deployment.

All local common-root materialization medians are far below one second, but these are CPU-directional fixture results and are **not** a production latency acceptance claim.

### Rough 1/2/10-active-user busy-hour model

Per active user, the model uses 12 Home, 6 Log, 2 Goals, and 2 Evidence Hub landings in a busy hour.

| Active users | Native HTTP requests before → after | Core navigation queries | Evidence scoped reads | Home/Goals/Log DB-shape bytes before → after |
|---:|---:|---:|---:|---:|
| 1 | 34 → 22 | 20 | 14 | 81,052,872 → 14,781,524 |
| 2 | 68 → 44 | 40 | 28 | 162,105,744 → 29,563,048 |
| 10 | 340 → 220 | 200 | 140 | 810,528,720 → 147,815,240 |

This is a linear planning model, not a load test. It predicts much lower JSON materialization and removes Evidence's client-side seven-request burst, but does not prove pool wait, p95/p99, database memory, or synchronized 10-user behavior.

## Test and build evidence

| Check | Result |
|---|---|
| Native contract + Evidence aggregate Server tests | **69 passed** |
| Core navigation semantic service suite | **34 passed** |
| PostgreSQL/core Phase 4 suite | **154 passed** |
| Worker loop + durable outbox focused suite | **23 passed** |
| Full Phase 2 foundation/worker suite | **125 passed** |
| Authority-gated worker suite | **18 passed** |
| Changed Server ESLint set | **passed** |
| Server production build | **passed** with `next build --webpack` |
| Native focused simulator tests | **3 passed**: aggregate single-request/partial rendering, read cancellation, read timeout |
| Native unsigned Release compile | **BUILD SUCCEEDED** |
| Diff whitespace check and credential-pattern scan | **passed** |

Additional regression context:

- the broad Package 7 run passed 595/601 tests; its six failures require ignored `private/founder/runtime-store.json` / `migration-control.json` fixtures that are intentionally absent from the isolated clone;
- the broad Phase 3 run passed 308/309 tests; its single failure requires the same absent private runtime fixture;
- default Turbopack rejected the isolated clone's `node_modules` symlink because it points outside the filesystem root; the webpack production build completed successfully;
- the first sandboxed Phase 2 run could not bind localhost (`EPERM`); the complete suite passed outside that network sandbox;
- the Release compile has two pre-existing Swift 6 warnings in `BackgroundExecutionAssertion.swift`; neither file nor behavior was changed here.

The affected suites are green. No private production fixture was copied into the candidate to make broad legacy tests pass.

## Fresh review

### Findings resolved during review

1. A proposed positive-authority cache could have delayed a cutover fence. It was removed: positive authority is now fresh before every claim; only a paused state is cached for 15 seconds.
2. Generic transport classification initially changed command cancellation/timeout behavior. Classification was narrowed to Native read requests, preserving command retry and idempotency semantics.
3. Worker reset telemetry reported the next delay rather than the actual previous delay, and resolved waits retained abort listeners. Both were corrected and covered.
4. Raw request correlation, although syntactically bounded, was still an identifier. It is now hashed before telemetry and the raw value is forbidden by test.
5. HealthKit graduation could have re-amplified historical Log data after the SQL filter. Its overlay is now restricted to the exact requested local day and included in DB counters.
6. The worker benchmark originally modeled cached positive authority. It now conservatively counts a fresh authority read per claim, matching the safety implementation.

### Review conclusions

- **Semantic parity:** Home/Goals services still consume the same required goal, phase, briefing, priority, confidence, weight, DEXA, protocol, execution, nutrition, photo, and training semantics. Only unused nested JSON is projected away. Existing semantic fixtures pass.
- **History:** no historical detail endpoint is truncated. The date bound is confined to daily-driver Log. Goals retain their full goal/transition/confidence histories.
- **Owner scoping:** every new query retains `owner_user_id=$1`; Evidence authentication and the existing canonical-owner comparison happen before aggregate composition.
- **Worker safety:** positive authority is not cached; pause observation is bounded to 15 seconds only while already paused; heartbeat is 30 seconds; leases/retries/dead-letter logic is unchanged.
- **Fail-soft correctness:** empty, unavailable, and contract-invalid are distinct. Tests cover all seven available, all seven empty, every vertical individually empty, every vertical individually failing, multiple failures, malformed one-vertical data, payload bound, partial Native rendering, and unchanged detail destinations.
- **Telemetry privacy:** fixed labels/counters only; correlation is hashed; errors and payloads are absent.
- **Auth/session:** persistent pairing, proof-bound refresh, session/enrollment configuration, and token semantics are untouched.
- **Forbidden domains:** no HealthKit Sleep, pairing, Photo Intelligence, or multi-tenant implementation file is changed. Concurrent Sleep branches were neither merged nor modified.
- **Benchmark validity:** results are reproducible and directionally useful, but cannot substitute for production p95/p99 or real pool-wait measurement.

No unresolved release-blocking defect was found in the candidate. The key remaining unknown is actual production latency/query behavior after deployment, not candidate correctness.

## Multi-tenant implications

This work does not start multi-tenancy. The existing production service/store composition is still initialized with one canonical owner. The candidate does not add an unscoped query, but the new Evidence aggregate inherits that single-owner boundary.

Before any second real beta user, redesign composition so owner identity is resolved from the authenticated principal per request, then prove row/object/media isolation, worker partitioning, cache-key isolation, command idempotency, and cross-owner negative tests. The 2/10-user numbers above are capacity shapes only, not authorization to enroll users.

## Recommended guarded sequence when the Founder has Mac access

1. Rotate the two DigitalOcean credentials called out by the parent audit before the next production operation requiring those contexts; validate least privilege. No credential value is in this report.
2. Review the two candidate SHAs independently. Keep Sleep, pairing, Photo Intelligence, and tenant work out of these merges.
3. Deploy the Server candidate first. Do not distribute the Native candidate yet.
4. Verify liveness/readiness, auth/profile, Home/Goals/Log semantic fixtures, worker heartbeat age, claim pickup after sustained idle, authority pause/resume, outbox lag/dead delta, pool waiting count, and new privacy-safe events.
5. Run one-user cold/warm production reads and compare route duration, DB query/row/byte counts, response bytes, errors, and pool wait against the audit baseline. Stop if semantics differ or worker pickup/fence bounds fail.
6. Only after `evidence-hub` is proven live, distribute the Native candidate to an internal Founder-only lane. Verify the single aggregate request, partial-stream behavior, detail navigation, auth/session continuity, and last-known Home.
7. Run controlled 1/2/10-user production-shaped tests. Until tenant authority is complete, 2/10 must use isolated synthetic/load identities and must not invite real beta humans.
8. Keep current DigitalOcean sizes unless repeatable tests cross the parent audit's CPU, memory, connection, pool-wait, or route-latency thresholds.

## Rollback

No database migration, data rewrite, feature flag, alert, credential, or infrastructure change exists in this candidate.

- **Server rollback:** redeploy the prior production Server source `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`. Old Native clients do not call `evidence-hub`, so Server-first deployment is backward compatible.
- **Native rollback:** retain/redistribute accepted Build 71 source `71164900210f689480ed277205bf8a43b6d18ead`. Do not ship the Native candidate until the Server aggregate is live.
- **Data rollback:** none required; all candidate behavior is read/query/telemetry cadence logic with no schema or canonical-data mutation.

## Scope and local-only state

- DigitalOcean resources, plans, environment, alerts, app spec, database extensions, and credentials: **untouched**.
- Server deploy: **not performed**.
- Native archive/TestFlight upload/install: **not performed**.
- PAT creation/activation: **not requested or performed**.
- Production data: **not mutated**.
- Disk floor: maintained; 30 GiB free at final check.
- Local-only state: isolated worktrees under `/tmp/physiqueos-phase1.DksOC7` and Xcode DerivedData under `/tmp`; these are disposable build artifacts, not production state.
- Sensitive handling: no token, database URL, certificate, private payload, personal record, or protected log text is committed.

## Final checkpoint

All candidate code is committed and pushed. This report is the required final GH checkpoint. Work stops here with production unchanged.
