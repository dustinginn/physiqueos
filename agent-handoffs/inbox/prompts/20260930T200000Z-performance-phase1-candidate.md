PhysiqueOS Performance Phase 1 — worker efficiency, daily-driver read amplification, fail-soft Evidence aggregation, and telemetry

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

PARENT AUDIT

Read first:
agent-handoffs/reports/20260930T190436Z-production-performance-cost-beta-scaling-audit.md

FOUNDER AVAILABILITY / OPERATING CONSTRAINT

Founder is currently away from the Mac and cannot perform terminal/keychain/PAT activation steps.

Therefore this task is CODE + TEST + BENCHMARK CANDIDATE ONLY.

DO NOT:
- deploy Server;
- upload Native/TestFlight;
- mutate production;
- rotate DigitalOcean credentials;
- create/activate replacement PATs;
- modify doctl contexts;
- change DigitalOcean app/database/Spaces plans;
- change production environment variables;
- change alerts;
- enable database extensions;
- add production instrumentation requiring infrastructure/config mutation;
- resize resources;
- delete resources;
- start multi-tenant conversion;
- touch HealthKit Sleep;
- touch persistent pairing behavior;
- touch Photo Intelligence semantics.

If any step would require Founder terminal access or credential activation, skip it and report it for later.

PURPOSE

Implement the highest-value low-risk performance improvements identified by the read-only audit while preserving existing product behavior.

Phase 1 contains four coordinated workstreams:

A. Worker idle-churn reduction.
B. Home / Goals / Log Server read-amplification reduction.
C. Fail-soft aggregate Evidence Hub contract + Native adoption if cleanly bounded.
D. Privacy-safe performance telemetry sufficient for later 1/2/10-user testing.

Do not broaden into general refactoring.

CURRENT AUTHORITY

Independently verify current GitHub production Server authority and current accepted Native authority before selecting bases.

No production mutation.

Because Claude is concurrently working on HealthKit Sleep branches, do not merge or modify Sleep candidates in this task.

A. WORKER IDLE-CHURN REDUCTION

Audit finding:
worker currently loops roughly every second:
- read runtime authority;
- write/upsert heartbeat;
- claim outbox;
- sleep 1s.

Historical cumulative signals include ~1.88M heartbeat updates, ~1.94M authority scans and ~7.52M outbox index scans.

Goal:
reduce idle DB operations by at least 90% without materially degrading message pickup, authority fencing, leases, cadence or health monitoring.

Implement a conservative adaptive-idle strategy.

Requirements:
- retain fast pickup immediately after actual work;
- back off progressively while queue remains empty;
- cap idle delay at a product-appropriate bound, likely 15–30 seconds unless tests support another value;
- reset to fast polling immediately after work is found;
- decouple worker heartbeat cadence from claim cadence;
- heartbeat cadence should remain compatible with monitoring/health semantics, likely 30–60 seconds;
- avoid rereading unchanged runtime authority on every idle tick;
- any authority caching must be bounded and must preserve cutover/fencing safety;
- deployment/authority change must be observed within a clearly bounded interval;
- leases/retries/dead-letter semantics unchanged;
- briefing cadence behavior unchanged unless measured duplicate no-op work can be safely removed.

Do NOT replace polling with a new infrastructure dependency in Phase 1.

Tests:
- immediate work pickup;
- progressive idle backoff;
- reset after work;
- heartbeat cadence;
- authority refresh bound;
- lease expiry;
- retry/dead-letter;
- graceful shutdown;
- no busy spin;
- clock/time jump behavior where relevant.

Benchmark:
synthetically compare DB operations over a representative idle hour/day before vs candidate.
Report expected heartbeat/authority/claim reductions.

B. HOME / GOALS / LOG READ AMPLIFICATION

Audit measured examples:
Home ~1.78s, 1,129 DB rows, ~5.24 MB DB material.
Goals ~1.36s, 973 rows, ~5.17 MB.
Log ~1.3–1.4s, ~864 rows and up to ~9.44 MB aggregate DB material.

Goal:
preserve exact user-facing semantics while reducing rows/materialized JSON and repeated canonical reconstruction.

Trace exact current compositions and identify broad collection reads.

Prefer:
- scoped owner + collection + date/id reads;
- existing indexed occurrence-date ranges;
- targeted canonical record IDs;
- compact server-side projections;
- reuse of already-computed canonical summaries;
- bounded recent history;
- one read for data already co-located where safe.

Avoid:
- new denormalized materialized stores unless clearly necessary;
- stale correctness;
- hidden semantic changes;
- historical truncation where the UI genuinely needs full history.

For each Home/Goals/Log optimization:
- document old query/read path;
- document new path;
- prove response semantic parity with fixtures/production-shaped data;
- measure rows and bytes before/after;
- benchmark latency in deterministic local/production-shaped harness;
- test empty/new-user states;
- test Founder full-history state;
- test completed/active Goal behavior;
- test Build Lean Mass/guardrail/current phase semantics;
- test HealthKit daily-driver presence;
- test briefing/priority data.

Do not optimize by simply dropping fields the Native app uses.

Target:
substantially reduce multi-MB DB materialization; aim for >=70% reduction where architecture permits.

C. EVIDENCE HUB AGGREGATION / FAIL-SOFT

Audit:
Native Evidence Hub currently launches seven reads:
weight, training, nutrition, activity, energy, DEXA, photos.
Any one failure can fail the whole hub.
Web pool default max = 5.

Goal:
one bounded Server-owned Evidence Hub aggregate read that can return independent typed states per vertical.

Design:
- aggregate endpoint/resource owned by Server;
- compose the seven vertical summaries under one authenticated request;
- preserve owner scoping;
- each vertical returns available / empty / unavailable / error-like typed state as appropriate;
- one optional vertical failure must not discard successful verticals;
- truly global/auth/contract failure may still fail the request;
- do not hide data corruption;
- preserve individual detail endpoints for navigation;
- no giant payload; only landing-card data.

Server implementation should avoid simply moving seven broad reads behind one endpoint while still doing seven wasteful whole-collection scans. Use scoped queries/projections.

Native:
If the Server contract and tests are clean, implement Evidence Hub to consume the aggregate resource.
Do not alter Evidence detail pages.
Preserve current visual layout unless a small loading/error-state adjustment is required.
Show partial successful content rather than full-screen failure when optional streams fail.

If Native integration would materially expand scope or collide with current Sleep Native work, STOP at the reviewed Server contract and report a separate Native follow-up rather than forcing a merge.

Tests:
- all seven available;
- each vertical individually empty;
- each optional vertical individually unavailable/failing;
- multiple optional failures;
- auth/global failure;
- malformed one-vertical data cannot poison others if contract allows safe isolation;
- owner scoping;
- payload bounds;
- Native partial rendering;
- detail navigation unchanged.

D. PRIVACY-SAFE PERFORMANCE TELEMETRY

We need enough telemetry for later controlled 1/2/10-user tests without logging private payloads.

Implement application-level telemetry only if it requires no infrastructure credential/config change.

Capture per resource/request where feasible:
- resource/route identifier;
- total Server duration;
- DB query count;
- DB rows materialized;
- DB materialized bytes estimate;
- DB connection/pool wait if available safely;
- response byte count;
- status/error class;
- cache/projection path;
- request correlation ID;
- worker idle/claim/heartbeat counters.

Never log:
- payload content;
- Health data;
- evidence content;
- tokens;
- SQL parameter values containing user data;
- private identifiers beyond existing privacy-safe request correlation.

Prefer structured bounded metrics/events that can later be aggregated.

If p95/p99 aggregation requires external telemetry/config unavailable without Founder credentials, implement the instrumentation hooks/events but do not activate external export.

Native telemetry candidate, if touched:
- resource;
- network duration;
- decode duration;
- response bytes;
- cache hit/miss;
- normalized error class;
- cancellation separate from network failure.

No private response content.

E. AUTH / SESSION PRESERVATION

Current persistent pairing is accepted and enrollment window is closed.

Performance work must not change:
- auth protocol;
- proof-bound refresh;
- pairing;
- token/session semantics;
- enrollment configuration.

Regression-test relevant request/auth paths if shared networking code changes.

F. FAILURE-SEMANTICS CLEANUP

Where directly touched:
- distinguish cancellation from network failure;
- distinguish decode/contract failure from timeout;
- fail-soft optional Evidence verticals;
- preserve last-known Home behavior.

Do not redesign every screen's error UX in this task.

G. BENCHMARK / ACCEPTANCE

Create deterministic production-shaped benchmark fixtures based on measured current Founder data volume without copying private payloads into GitHub.

Before/after report for:
- Home rows/materialized bytes/latency;
- Goals rows/materialized bytes/latency;
- Log rows/materialized bytes/latency;
- Evidence Hub request count, query count, materialized bytes, latency;
- worker idle-hour/day DB operation counts.

Provisional acceptance targets:
- >=90% reduction in idle worker DB operations;
- >=70% reduction in DB materialized bytes for Home/Goals/Log where technically possible;
- Evidence Hub cold landing becomes 1 HTTP request rather than 7;
- optional Evidence vertical failure no longer fails entire hub;
- local/production-shaped Server p95 benchmark <1s for common aggregate roots where fixture/harness supports meaningful timing;
- no semantic response regression.

Do not claim production p95 improvements from local benchmarks.

H. TESTING

Risk-scaled but thorough:
- targeted unit/integration;
- Server regression around Home/Goals/Log/Evidence;
- worker tests;
- Native tests only if Native integration is included;
- production build;
- Release compile if Native touched;
- no broad simulator tour unless a UI behavior truly needs focused validation.

Respect 15 GiB disk floor and monitor swap.
Do not delete active Claude Sleep worktrees/caches.

I. FRESH REVIEW

Run fresh-context review focused on:
- semantic parity;
- owner scoping;
- no history truncation bug;
- no stale Goal/Briefing/priority data;
- worker authority/lease safety;
- Evidence fail-soft not masking corruption;
- telemetry privacy;
- persistent pairing untouched;
- no Sleep collision;
- benchmark validity.

J. NO DEPLOY

At completion:
- push exact candidate branches/SHAs;
- publish report;
- STOP.

Founder is away from Mac.
Do not ask for PAT activation unless absolutely unavoidable; candidate development should not require it.

CREDENTIAL ROTATION BACKLOG

Parent audit found two DO token values appeared in a local agent command transcript.
They were not committed to GH.

Do NOT rotate them in this task while Founder is away from Mac.
Record credential rotation as urgent next Mac-present operation before the next production deployment requiring those contexts.

MULTI-TENANT BACKLOG

Do not implement multi-tenancy in Phase 1.

However, avoid introducing new single-owner assumptions.
Report any optimization that would need redesign for multi-user authority.

OUTPUT

Publish:
agent-handoffs/reports/<timestamp>-performance-phase1-candidate.md

Include:
- exact Server/Native bases;
- exact candidate SHA(s);
- worker algorithm and before/after operation model;
- Home/Goals/Log old/new paths;
- Evidence aggregate contract and Native status;
- telemetry added;
- benchmark table;
- tests;
- fresh review;
- deploy status = NOT DEPLOYED;
- credentials untouched;
- multi-tenant implications;
- recommended guarded deployment sequence once Founder has Mac access;
- rollback plan;
- local-only state.

Publish GH checkpoint before every stop.

END TASK.
