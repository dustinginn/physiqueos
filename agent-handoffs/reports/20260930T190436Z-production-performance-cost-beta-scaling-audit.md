# PhysiqueOS production performance, cost, reliability, and beta-scaling audit

**Audit time:** 2026-09-30 18:20–19:04 UTC

**Mode:** read-only production audit; no optimization, resize, deletion, deploy, alert edit, or production mutation

**Repository:** `dustinginn/physiqueos`

**GitHub base inspected:** `04c48716d684a4bfd6b5ff6e0a3c72d796a2f9f2` (`main`)

**Report branch:** `codex/production-performance-cost-beta-scaling-audit-20260930`

**Production application source:** `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5`

**Native Build 71 source inspected:** `71164900210f689480ed277205bf8a43b6d18ead`

## Executive verdict

PhysiqueOS is not currently compute-, storage-, or bandwidth-bound. The present DigitalOcean footprint has substantial headroom for the founder workload, and the estimated fixed DigitalOcean bill is approximately **$40/month**: $20 App Platform, $15 PostgreSQL, and $5 Spaces. The marginal DigitalOcean cost of moving from one to two or even ten similarly active users should remain close to $0 at current usage levels.

The immediate beta blocker is application authority, not infrastructure. The production Native contract accepts only the configured canonical owner and returns 404 for every other authenticated user. A second human cannot be safely added to this runtime until owner resolution, worker cadence, object keys, credentials, and read/write paths are proven tenant-scoped.

The slow Native experience has three measured causes:

1. **Large server-side read amplification.** Recent production diagnostics show common screens reading 864–1,129 database rows and 3.3–9.4 MB of database result material before projection. Home and Goals took 1.78 s and 1.36 s respectively in the small current-deployment sample.
2. **Client fan-out and fail-closed composition.** Evidence Hub launches seven independent reads and fails the entire hub if any one fails. Training needs two reads. Log needs two. Goal detail can need a hub read followed by a detail read. The web pool defaults to five connections, so one Evidence Hub already creates more concurrent requests than the pool can service at once.
3. **Fixed background database churn.** The worker wakes every second, rereads runtime authority, writes a heartbeat, and attempts an outbox claim even when there is no work. Cumulative database statistics show about 1.88 million heartbeat updates, 1.94 million authority-index scans, and 7.52 million outbox-index scans. This is the dominant user-independent workload and is a much better optimization target than resizing.

Reliability is acceptable for a founder canary but not yet a defensible multi-user beta posture. The app and worker are single instances, PostgreSQL is a single 1 GiB node, Native non-Home surfaces generally lack persisted stale-while-revalidate behavior, and a recent 21-minute Native outage was caused by refresh-token reuse after a suspended/lost rotation response—not database load. One current-deployment readiness check also saw a transient Spaces `ECONNRESET`, although a subsequent 20/20 live probe passed.

**Recommendation:** keep the current sizes. First establish tenant-safe authority, route/query telemetry, adaptive worker idling, smaller server projections, fail-soft Native aggregation, and session-recovery validation. Then run controlled 1/2/10-user burst tests. Resize only when those tests or production alert trends cross explicit thresholds.

## Evidence classification

- **Measured:** returned directly by DigitalOcean, PostgreSQL read-only queries, production logs, live HTTPS probes, or exact deployed source.
- **Inferred:** a conclusion from measured configuration/code where the relevant production execution path was not directly timed.
- **Estimated:** a linear or conservative planning model, not a bill or load test.
- **Unknown:** unavailable with the audit role or absent telemetry. Unknowns are not treated as zero.

## Production authority and audit safety

### Measured production identity

| Item | Value |
|---|---|
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` (`physiqueos-foundation-staging`, despite being production) |
| Public origin | `https://physiqueos.dustinginn.com` |
| Active deployment | `01d9c20f-8b91-4872-a31a-ea9e9276bfcb` |
| Deployment created | 2026-09-30 18:20:17 UTC |
| Web/worker source | `372c306ba45ffaa0f93f7bf74e4c0c266070d9a5` |
| Build identity | `physiqueos-372c306b-20260930` |
| Configured deploy branch | `combined-app-platform-cutover` |
| Runtime authority | provider/full runtime, PostgreSQL canonical store |

The production database audit ran inside `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, allowed only `SELECT`/`WITH`, used one bounded connection, and explicitly rolled back. No row, object, deployment, alert, or infrastructure setting was changed.

The exact deployed Native read benchmark payload was prepared, but the least-privilege audit token was denied App Platform console access (HTTP 403). Escalating to a broader production credential was not used. Current request evidence therefore comes from production diagnostics plus the earlier repository benchmark reports; it is labeled accordingly.

## DigitalOcean inventory and cost

### Exact project inventory

The default DigitalOcean project contains exactly three attached resources:

| Resource | Configuration | Fixed monthly cost | Marginal cost driver |
|---|---|---:|---|
| App Platform app | one `web` and one `worker`, each `apps-s-1vcpu-1gb-fixed`, count 1 | **$20 measured from current size pricing** | outbound transfer above allowance; a different size/plan; more instances |
| Managed PostgreSQL | PostgreSQL 17.11, SFO3, one `db-s-1vcpu-1gb` node, 10 GiB | **$15 estimated from published starting price** | larger node, HA/replica, storage above included allocation |
| Spaces bucket | `physiqueos-p2-staging-20260811-b36ea183`, SFO3 | **$5 published base price** | storage above 250 GiB and outbound above 1 TiB |
| **Estimated total** | | **~$40/month** | |

No Droplet is present. There is no App Platform database child, no DigitalOcean connection pool, and no fourth project resource. Billing and balance APIs returned 403, so $40 is a component-price estimate rather than reconciliation against an invoice. Non-DigitalOcean AI/provider charges are unknown and excluded.

Pricing sources (verified during the audit):

- [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/): the deployed fixed 1 vCPU/1 GiB size is $10/month and includes 100 GiB outbound allowance.
- [Managed PostgreSQL pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/): single-node 1 GiB PostgreSQL starts at $15/month; additional storage is $0.215/GiB/month.
- [Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/): $5/month includes 250 GiB storage and 1 TiB outbound; excess is $0.02/GiB-month storage and $0.01/GiB outbound.

### Current utilization

Seven-day App Platform metrics, 2026-09-23 18:50 UTC through 2026-09-30 18:50 UTC:

| Component | CPU median / p95 / max | Memory median / p95 / max | Restarts |
|---|---|---|---:|
| Web | 2.63% / 6.49% / 12.76% | 21.93% / 33.53% / 50.51% | 0 |
| Worker | 6.12% / 9.31% / 15.46% | 20.68% / 41.71% / 49.25% | 0 |

Measured App Platform bandwidth for 2026-09-29 was 29,247,167 bytes (27.9 MiB). This is negligible against the included allowance.

Measured canonical media is 701 verified objects totaling 804,647,124 bytes (767 MiB), or about 0.3% of the Spaces base storage allowance. No canonical media object was quarantined or tombstoned at the snapshot.

**Finding:** resizing either app component upward is not justified by current utilization. The worker consumes more baseline CPU than the web service despite an empty queue, reinforcing the fixed-polling finding.

## Managed PostgreSQL and the “staging” memory alert

### Resource identity matters

The cluster named `physiqueos-p2-staging-pg` is not a disposable staging cluster. It hosts the live production database `physiqueos_phase5_test_provider_20260811` and is bound to the production app. Deleting or downsizing this cluster would affect production.

The cluster also contains `physiqueos_staging` (~8.9 MiB), `physiqueos_native_sandbox_acceptance` (~10.5 MiB), and `physiqueos_phase2_test_provider_20260811` (~10.7 MiB). Those logical databases may merit a later dependency/retention audit, but their presence does not make the cluster itself stale.

### Measured database state

| Measure | Result |
|---|---:|
| Production DB size | 60,585,651 bytes (57.8 MiB) |
| Application logical DBs combined | roughly 88 MiB, excluding system/default DBs |
| Daily backup size | 0.126–0.130 GiB |
| Backup growth | about 0.0006 GiB/day |
| Connections during audit | 2/25 (1 active audit, 1 idle app) |
| Idle in transaction | 0 |
| Cache hit | 100.00% cumulative at DB level; 99.99–100% on key tables |
| Deadlocks / conflicts | 0 / 0 |
| Lifetime temp files / bytes | 618 / 1.19 GiB |
| `shared_buffers` | 190 MiB |
| `effective_cache_size` | ~569 MiB planner estimate |
| `work_mem` | 2 MiB per eligible operation |
| `maintenance_work_mem` | ~89 MiB |
| `max_connections` | 25 |
| `log_min_duration_statement` | 1,000 ms at runtime |
| Query-stat extension | `pg_stat_statements` absent; only `plpgsql` installed |

The 1.19 GiB temporary-byte counter is cumulative, not resident memory or current disk usage. It is a reason to add rate telemetry, not evidence of a present incident.

### Alert configuration and interpretation

The cluster has enabled 10-minute alerts at 70% for CPU, memory, and disk. DigitalOcean's documented default database alert threshold is 90%; the PhysiqueOS 70% memory alert is intentionally more sensitive.

The audit role could read the policy but could not retrieve the historical database memory time series because DigitalOcean database metrics require separate metrics credentials. The exact alert peak/duration is therefore **unknown**.

The most likely explanation is a low threshold on a small PostgreSQL node where shared buffers, backend processes, and useful Linux filesystem cache are counted as used memory. This is **inferred**, not proven. Evidence against active memory distress includes:

- only 2 of 25 connections;
- tiny databases and backups;
- near-perfect cache-hit ratios;
- no lock queue, deadlock, or conflict;
- no recent failure event in the managed-database event stream;
- low app/worker CPU and zero restarts;
- 20/20 successful readiness probes after the audit began.

Do not silence the alert or resize from this alert alone. First collect the memory curve alongside CPU, connection count, query latency, temp-byte delta, and request latency. Treat sustained memory as actionable only when it correlates with symptoms or approaches an exhaustion threshold.

### Table and query efficiency

Largest relations and notable cumulative behavior:

| Relation | Total size | Live/dead tuples | Signal |
|---|---:|---:|---|
| `canonical_confidence_records` | 17.78 MiB | 587 / 47 | 4.21M sequential tuples read and 74.5K index scans; large TOAST share |
| `canonical_evidence_records` | 9.56 MiB | 1,277 / 262 | 6.70M sequential tuples read and 104.8K index scans |
| `canonical_briefing_records` | 5.23 MiB | 77 / 25 | 21.4K sequential scans over a small table; frequent whole-collection reads |
| `canonical_relationships` | 4.51 MiB | stats reported 0 live | statistics are suspect/stale; verify exact count before any action |
| `canonical_training_records` | 2.56 MiB | 885 / 159 | modest absolute size; HealthKit drives recent row growth |
| `outbox_messages` | 1.04 MiB | 813 live | 7.52M cumulative index scans despite no current backlog |

Largest canonical JSON collections by payload bytes:

| Collection | Rows | Payload | Seven-day behavior |
|---|---:|---:|---|
| `analyses` | 414 | 5.24 MiB | 5 created / 5 updated |
| `dailyBriefings` | 55 | 2.36 MiB | 2 created / all 55 updated |
| `evidenceReviews` | 246 | 2.27 MiB | mostly stable, but included in broad reads |
| `evidencePackages` | 341 | 1.43 MiB | modest growth |
| `canonicalEvidenceObjects` | 579 | 1.15 MiB | central fan-in collection |
| `healthKitObservations` | 617 | 0.89 MiB | 451 created in seven days |
| `goalConfidenceHistory` | 30 | 0.59 MiB | 2 created / all 30 updated |

There is no evidence that disk or raw row count is the bottleneck. The inefficiency is repeatedly loading and transforming broad JSON collections to render small projections. Because `pg_stat_statements`/DigitalOcean query statistics are not enabled, the audit cannot rank SQL shapes by total execution time, mean latency, or temp blocks. Index deletion or creation would be guesswork at this point and is not recommended.

## Worker and background workload

### Measured state

- Current worker heartbeat was healthy and sub-second fresh.
- Pending, processing, and retrying outbox counts were zero.
- Historical outbox state includes 720 succeeded and 12 dead `evidence.review.continue` messages; the maximum recorded attempt count was 67 among succeeded messages and 16 among dead messages. This is evidence of historical retry amplification, not a current backlog.
- Seven-day command volume was dominated by 444 HealthKit ingest commands, followed by 14 priority completions, five check-ins, four training commits, and four reconciliation commands.

### Root cause: one-second idle churn

Exact deployed worker code does this on every loop:

1. read runtime authority;
2. write/upsert the worker heartbeat;
3. query/claim the next outbox message;
4. if idle, wait 1,000 ms and repeat.

The briefing cadence also wakes every five minutes. The outbox design can therefore generate up to 86,400 heartbeat writes, 86,400 authority reads, and at least 86,400 claim attempts per continuously running worker per day without a user action. Deployment gaps explain why cumulative counts are below the theoretical maximum, but the relationship is clear.

This fixed workload explains why the idle worker's median CPU (6.12%) is more than twice the web median and why outbox/authority indexes dominate cumulative scans. It also creates WAL and backup churn independent of beta-user count.

The correct first optimization is an adaptive idle backoff or notification-driven claim mechanism with a lower-frequency health heartbeat—not a larger database. Any change must preserve bounded message pickup latency, leases, authority fencing, and dead-letter behavior.

## Native request waterfalls and slow/failing surfaces

### Client behavior in Build 71 source

The Native transport has useful protections: exact-key in-memory caching, in-flight request coalescing, generation-based invalidation, a 32-entry cap, and TTLs of 30 seconds for Home, 60 seconds for briefing/training landing/reporting/library, and 90 seconds otherwise. Home alone has a persisted last-known snapshot.

Every production read bypasses URL caching and has a 15-second request timeout. Decode errors and several transport failures collapse to generic screen failure states. A cold or invalidated session therefore exposes full server latency; warm reads can be fast but are process-local except Home.

| Native surface | Cold/invalidated waterfall | Failure semantics | Production diagnostic sample |
|---|---|---|---|
| Home | one `home` read; then notification reconciliation; Goals + Briefing prefetch in parallel | last-known Home can render; without it, generic full-screen failure | 1 sample: 1,780 ms; 1 query group; 1,129 DB rows; 5.24 MB DB material |
| Goals hub | one `goals` read | full-screen failure | 1 sample: 1,363 ms; 973 rows; 5.17 MB DB material |
| Goal detail | Goals hub, then `active-goal` or `completed-goal` unless hub cache is warm | sequential critical path | active-goal: 643 ms; 11 queries; 318 rows; 3.30 MB DB material |
| Log | `evidence-review-queue` and `weight` in parallel; weight is fail-soft | primary Log failure still fails screen | 2 current samples: 1,314–1,389 ms; 864 rows total per diagnostic set; 9.44 MB aggregate DB material |
| Training landing | `training-landing` and `training-library` in parallel, both required | either failure fails surface | no sufficiently large current sample |
| Evidence Hub | seven parallel reads: weight, training, nutrition, activity, energy, DEXA, photos | **any one failure fails the entire Hub** | no complete current request-group timing; source proves fan-out |
| Briefing detail | one `briefing` read | full-screen failure | 224 ms; 4 queries; 7 rows; 0.53 MB DB material |
| Profile | one profile read | full-screen failure | 203 ms |

The diagnostic “payload bytes” above are bytes materialized from database rows before server projection, not HTTP response sizes. They still reveal amplification: screens are processing megabytes and hundreds of rows to return a compact mobile view.

### Pool interaction

The web and worker each use the default PostgreSQL pool maximum of five; the database allows 25 connections and there is no managed connection pooler. One cold Evidence Hub submits seven HTTP reads at once, already exceeding the web pool. Two simultaneous users could submit 14 Evidence requests; ten synchronized users could submit 70. Some individual resources execute multiple SQL operations after acquiring capacity.

This predicts queueing before CPU or disk saturation. At current single-user averages the pool is mostly idle, but synchronized cold launches are the relevant beta test—not seven-day average CPU.

### Failure modes

1. **Auth rotation / suspension:** the 2026-09-28 incident produced approximately 21 minutes of “Home could not be loaded.” A rotated refresh response was lost while the app was suspended; reuse of the prior refresh credential correctly revoked the family/session. Re-pairing recovered it. This was not a database latency event.
2. **Spaces readiness transient:** current web logs contain one `provider.readiness.failed` at object-storage stage with `ECONNRESET` after 492 ms. The subsequent probe passed 20/20. App Platform health checks use liveness, so a Spaces outage does not remove the web instance from routing; media-dependent operations can still fail while the app is live.
3. **Fail-closed fan-out:** Evidence Hub's seven-way `try await` tuple makes optional-stream degradation a complete-screen outage.
4. **Decode/contract failure:** schema mismatch or decode error becomes `invalidResponse`, commonly surfaced as a generic load failure.
5. **Timeout/cancellation:** reads can occupy the UI for up to 15 seconds. Cancellation is frequently categorized as network failure, obscuring the distinction.
6. **Deployment churn:** the current SHA was deployed three times between 15:20 and 18:20 UTC and deployment cadence has been high over the prior 48 hours. Repeated cold starts increase tail-risk even when steady-state metrics are low.
7. **Single-instance dependencies:** one web, one worker, and one database node mean maintenance/restart events have no application-level or database standby redundancy.

### Live health probes

Twenty sequential samples were taken for each public endpoint after the logged Spaces reset:

| Endpoint | Success | Median | p95 | Max |
|---|---:|---:|---:|---:|
| `/api/v1/health/live` | 20/20 HTTP 200 | 122.6 ms | 145.9 ms | 270.5 ms |
| `/api/v1/health/ready` | 20/20 HTTP 200 and ready | 124.3 ms | 151.5 ms | 266.9 ms |

This proves current availability during the probe window, not seven-day reliability.

## 1, 2, and 10 active-user model

“Active” here means users with founder-like daily behavior: HealthKit ingestion, several screen visits, occasional training/check-in writes, briefing reads, and comparable media growth. The model is deliberately rough and assumes tenant authority is implemented first.

### Capacity and cost estimate

| Scenario | DigitalOcean fixed cost | App bandwidth/month | Spaces storage at founder-like corpus | DB/application growth | Burst risk |
|---|---:|---:|---:|---|---|
| 1 human (current) | ~$40 | ~0.84 GiB from observed day | 0.77 GiB | 57.8 MiB production DB; ~451 HealthKit observations/week | current 1–2 s cold screens; low average utilization |
| 2 humans | ~$40 | ~1.7 GiB estimated | ~1.5 GiB estimated | approximately linear at this scale | 14-way Evidence fan-out can queue behind pool 5 |
| 10 humans | ~$40 initially | ~8.4 GiB estimated | ~7.7 GiB estimated | still far below 10 GiB if near-linear; AI/artifact history may grow faster | 70-way synchronized Evidence burst; p95/p99 and pool wait likely fail before CPU average |

The bandwidth and storage rows are linear estimates, not load-test results. They remain far below included DigitalOcean allowances. Database storage also has orders of magnitude of headroom for the observed record sizes.

The cost that may scale materially is outside the measured DigitalOcean bill: evidence interpretation, briefing generation, Photo Intelligence, and other AI/provider calls. Provider billing/usage was unavailable, so it is an explicit unknown rather than assumed negligible.

### Hard beta blocker: single-owner runtime

Production has two active user rows, but one is the Native sandbox acceptance identity; this is not evidence of two supported beta humans.

The deployed Native service receives one environment-level `PHYSIQUEOS_CANONICAL_OWNER_USER_ID`. After authentication it enforces `principal.userId === ownerUserId`; another authenticated user receives `RESOURCE_NOT_FOUND`. Read compositions, worker cadence, operations, and several provider services are initialized around that same owner.

Therefore:

- **one founder:** supported now;
- **a second beta user:** not supported by production authority today, regardless of spare infrastructure;
- **ten beta users:** must not be attempted until tenant isolation and per-user background work are implemented and tested.

This is a correctness/security requirement, not merely a scaling enhancement.

## Prioritized execution plan

No item below was executed in this audit.

### P0 — security and beta correctness

1. **Rotate exposed DigitalOcean credentials.** During this audit, two saved DigitalOcean access-token values were inadvertently emitted into the local agent command transcript. They are not included in this report or committed to GitHub. Revoke/rotate the affected tokens through an approved security operation, then validate least-privilege contexts. This is urgent but was not performed because this task is read-only.
2. **Design and prove multi-tenant authority before inviting beta users.** Replace the environment-single-owner boundary with authenticated per-user resolution; prove row-level owner scoping, object-key isolation, command idempotency, worker/cadence partitioning, media authorization, backup/restore, and cross-user negative tests.
3. **Close the refresh-rotation recovery gap.** Preserve the security model while making an app suspension/lost-response recoverable without a 21-minute outage or manual re-pair. Validate current persistent-pairing decisions separately; this audit did not change them.

Acceptance: two independent production-shaped identities can execute every supported read/write and background flow with zero cross-owner visibility, and a lost refresh response has a documented bounded recovery path.

### P1 — observability before tuning

1. Enable a privacy-safe query-stat facility (`pg_stat_statements` or DigitalOcean's supported equivalent) and retain route-level call count, mean/p95/p99, rows, bytes, temp blocks, and errors.
2. Export PostgreSQL memory, CPU, connections, disk, temp-byte rate, and restart/maintenance events into one view with App Platform request latency and pool wait.
3. Promote the existing Native diagnostics to privacy-safe production metrics: resource, network time, decode time, response bytes, cache hit, error class, and request correlation.
4. Split user cancellation from network failure and contract/decode failure.

Acceptance: seven stable days of route/query/pool metrics with no payload or user data logged, including cold-launch and foreground cohorts.

### P1 — remove fixed background churn

1. Add adaptive idle backoff (for example 1 s immediately after work, then 5–30 s while idle) or a notification-driven wakeup.
2. Decouple health heartbeat frequency from claim frequency; a 30–60 s heartbeat is usually adequate if alert thresholds follow it.
3. Avoid rereading unchanged authority on every one-second tick; cache only with a bounded invalidation/fence that preserves cutover safety.
4. Verify briefing cadence does not rewrite unchanged collections.

Acceptance: at least 90% reduction in idle heartbeat/authority/outbox operations, message pickup within the agreed SLO, unchanged lease/authority/dead-letter tests, and no increase in missed cadence runs.

### P1 — collapse Native fan-out and reduce server materialization

1. Create server-owned aggregate contracts for Evidence Hub, Training landing, and other multi-read screens. Compose under one bounded server request and return partial/typed availability for optional verticals.
2. Make Evidence Hub fail-soft: one unavailable optional stream must not discard six successful streams.
3. Persist last-known snapshots or stale-while-revalidate states for other daily-driver roots where product semantics allow it, with explicit freshness labels and write invalidation.
4. Query/projection work should fetch required columns/records, not hydrate multi-megabyte collections for a compact summary.

Acceptance targets for 1-user and 10-user synchronized cold tests: no pool wait at 1 user; p95 pool wait <50 ms at 10; daily-driver server p95 <500 ms for simple roots and <1 s for aggregate roots; no whole-screen failure from one optional Evidence stream.

### P2 — query/index work driven by evidence

1. Rank query shapes by total time, mean/p95, rows, buffer hits, and temp blocks after telemetry is installed.
2. Investigate large TOAST payloads and frequent rewrites in confidence, evidence, briefings, and confidence history.
3. Verify `canonical_relationships` exact count and statistics before deciding whether it is stale data or just stale analyzer metadata.
4. Add/change indexes only for measured hot predicates; do not delete “unused” indexes from cumulative scan counts alone.

### P2 — controlled scale test and only then sizing

Run production-shaped, non-mutating read tests plus isolated write/background tests at:

- one user, cold and warm;
- two users synchronized on Home, Evidence, Log, and Training;
- ten users with staggered daily traffic and a synchronized foreground burst.

Capture app CPU/memory, DB CPU/memory/connections, pool wait, route p50/p95/p99, SQL time, response bytes, error rate, outbox lag, and AI/provider calls. Keep present sizes unless thresholds below are crossed in two repeatable tests or sustained production windows.

## Alert and resize policy

Recommended policy after telemetry is available; these are proposals, not alert changes:

| Signal | Warning | Critical / action |
|---|---|---|
| Web/worker CPU | >60% for 15 min | >80% for 10 min with request/lag symptom |
| Web/worker memory | >75% for 15 min | >85% for 10 min, restart, or upward leak trend |
| PostgreSQL memory | >85% for 15 min | >90% sustained **and** connection/latency/temp/restart symptom |
| PostgreSQL CPU | keep 70%/10 min warning | >85%/10 min with slow-query evidence |
| PostgreSQL connections | 18/25 | 22/25 or rejected/queued connections |
| PostgreSQL disk | 70% | 80%, with growth forecast to exhaustion |
| Web pool | p95 wait >50 ms or any sustained waiters | p95 >250 ms or timeout/rejection |
| Route latency | daily-driver p95 >1 s for 15 min | p95 >2 s or p99 >5 s, by resource |
| HTTP errors | >1% over 5 min | >5% or three consecutive health/readiness failures |
| Spaces dependency | 3 readiness resets/errors in 10 min | sustained failure or media error rate >1% |
| Worker | heartbeat age >2× configured interval; oldest pending >60 s | heartbeat absent >2 min, dead-message delta >0, or oldest pending >5 min |

Resize decision rules:

- Add web capacity/change App Platform plan only after route latency correlates with sustained CPU or pool saturation and aggregation/query fixes are measured.
- Resize PostgreSQL only after memory/CPU/connection pressure is proven symptomatic; the current 70% memory alert alone is not sufficient.
- Consider database HA for beta reliability/SLO, not for present storage or CPU capacity. Price and recovery objectives should be approved explicitly.

## Beta-readiness decision

| Dimension | Status | Reason |
|---|---|---|
| DigitalOcean capacity for 2–10 founder-like users | **Likely sufficient** | large CPU, memory, bandwidth, DB, and Spaces headroom |
| Cost predictability | **Good for DO; incomplete overall** | ~ $40 fixed DO; AI/provider usage unknown |
| Single-user performance | **Needs targeted work** | common cold screens 1–2 s; broad JSON materialization |
| Burst behavior | **Unproven / risky** | 5-connection web pool vs 7 requests per Evidence Hub |
| Reliability | **Founder-canary level** | single instances/node; auth incident; optional-stream fail-closed |
| Multi-user correctness/security | **Blocked** | environment-single-owner production contract |

**Decision:** do not add a second real beta user yet. Keep the current DigitalOcean sizes and bill. Execute P0 tenant/session work and P1 observability/background/fan-out work, then pass the 1/2/10-user acceptance test before beta enrollment.

## Audit limitations and unknowns

- Exact DigitalOcean invoice/balance: billing API denied the audit role.
- Historical PostgreSQL memory curve and exact alert peak: metrics credentials unavailable.
- Current request-rate, p95 HTTP latency, and status-code time series: App Platform API exposed CPU/memory/restarts/bandwidth, while richer Insights remained unavailable to this role.
- SQL shape ranking: `pg_stat_statements` absent and DigitalOcean query-stat monitoring disabled.
- Exact current Native read benchmark: guarded payload was built, but audit-token App Platform console access was denied. No broader credential was used.
- AI/provider usage and cost: unavailable.
- Native Build 71 was validated/distributed, but this audit did not prove which build was installed on the founder device.

## Checkpoint / handoff

- **What changed:** this report only.
- **Tests/checks run:** production identity verification; exact DigitalOcean project inventory; app/deployment/component/alert/backups/firewall/pool inspection; seven-day App Platform metrics; 20× liveness and 20× readiness probes; guarded read-only PostgreSQL audit; current-deployment log analysis; exact deployed server/worker source inspection; Native Build 71 source/waterfall inspection; official DigitalOcean pricing review.
- **Tests not run:** no mutating test; no load generation; no exact current in-container Native benchmark because the audit token lacks console exec; no real second-user test because production is single-owner.
- **Deploy status:** unchanged. No deploy requested or performed.
- **Production mutation:** none.
- **Blockers:** tenant authority blocks beta enrollment; query/DB memory histories lack required telemetry; provider billing is unavailable.
- **Next operator action:** approve credential rotation first, then scope the P0 multi-tenant/session design and P1 telemetry/worker/aggregate-read implementation as separate reviewed changes.
- **Local-only/untracked/private artifacts:** temporary sparse clones, sanitized control-plane scripts, read-only audit scripts, and benchmark bundles under `/private/tmp`; none are production state or part of this report commit.
- **Sensitive handling:** no access token, database URL, certificate, credential, personal record, payload value, or protected log detail is included in this report.
