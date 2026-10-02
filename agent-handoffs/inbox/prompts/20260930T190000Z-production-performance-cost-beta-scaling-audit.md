PhysiqueOS production performance, reliability, cost-efficiency and beta-scaling audit

Standing rule: publish GH checkpoint before every stop per agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md.

Founder concerns:
1. Native Home and other common pages still occasionally take several seconds or show they cannot load.
2. DigitalOcean sends recurring cost/monitoring emails, including sustained PostgreSQL memory around 70% for 10 minutes on the staging database and recurring prepaid reloads.
3. Founder expects to add another beta user soon and wants to know whether cost, latency and reliability will scale acceptably.

READ-ONLY AUDIT FIRST.
Do not resize/delete resources, change plans/topology, tune DB settings, add indexes, change worker cadence, deploy code, mutate production, change alerts or activate another user.
Do not touch HealthKit Sleep, persistent pairing or Photo Intelligence behavior.

Reverify current production Server/deployment/web-worker/database authority first.

AUDIT GOALS

A. Explain measured causes of slow/failed common Native surfaces.
B. Identify Server/DB/application paths dominating latency.
C. Inventory DigitalOcean fixed recurring cost and utilization.
D. Separate fixed baseline from per-user marginal cost.
E. Determine whether the staging PostgreSQL 70% memory alert represents real pressure, normal cache use, inefficient workload or an unnecessary/stale staging resource.
F. Model approximately 1 Founder, 2 active users and 10 active beta users.
G. Recommend what to optimize before beta.

Provisional performance targets for comparison:
- common Server read p95 ideally <1s where reasonable;
- Native perceived cold load <2s;
- warm daily-driver navigation near-immediate;
- routine 5xx/timeouts unacceptable.
Measure actual values before recommending final SLOs.

1. DIGITALOCEAN INVENTORY / COST

Read-only inventory all PhysiqueOS DO resources:
App Platform apps/components, web/worker size/count, managed PostgreSQL clusters including production/staging/dev, DB node size/count/storage, backups where relevant, Spaces/object storage/CDN, network/egress, monitoring/logging/add-ons, DO AI/paid usage if any, stale/duplicate resources.

For each capture purpose/environment, plan/size, utilization, whether production-required, fixed vs usage-sensitive, and approximate monthly cost from authoritative billing/control-plane data if available.

If exact billing cannot be read safely, use current DO published pricing as clearly labeled estimate with date/source.

Do not expose billing/payment credentials.

2. STAGING POSTGRES ALERT

Investigate the specific staging PostgreSQL resource referenced by Founder monitoring.

Determine:
- actual role and whether anything currently depends on it;
- plan/node/storage and monthly cost;
- DB size;
- memory/CPU/disk/IO history if available;
- active/idle connections and pool behavior;
- cache/buffer behavior where observable;
- largest tables/indexes;
- query/workload sources;
- whether tests/audits/jobs still target it;
- whether 70% memory correlates with latency/errors/connection pressure.

Do not treat 70% memory alone as a problem. PostgreSQL may intentionally use memory for cache.

3. PRODUCTION LATENCY / FAILURE MAP

Audit actual production behavior for:
Home, Goals, Log/Logged Today, Evidence Hub, Weight, Training, Priority detail/open, Priority completion, Briefing/history/detail, Photos/Photo Briefing and You where relevant.

Map Native screen -> API calls -> Server service -> DB queries -> downstream dependencies.

Where possible collect:
request counts, p50/p95/p99, timeout/5xx/error rate, payload size, DB query count, rows scanned, connection wait, sequential/parallel work, repeated work, caching, provider dependency, Native waterfall/duplicate requests, and optional data blocking the whole screen.

Use existing production logs/metrics/read-only tooling. Do not add production instrumentation in this task.

4. DATABASE / QUERY AUDIT

Use approved read-only production SQL path only:
BEGIN READ ONLY;
verify transaction_read_only=on;
bounded owner-scoped or aggregate SELECTs;
never print credentials;
never mutate.

Audit:
largest tables/canonical collections;
row counts/growth;
index usage;
slow/high-frequency query shapes;
sequential scans;
N+1 patterns;
whole-collection reads;
large JSON reads;
history reconstruction;
queries scaling with total history instead of relevant user/date window;
missing/ineffective indexes;
connection pool utilization;
locks/waits where observable;
expensive briefing/evidence aggregation.

Pay special attention to known architecture risks: generic canonical-record scans, large JSON collections, worker reconciliation loops and repeated canonical reconstruction.

Do not add indexes.

5. WEB / WORKER AUDIT

Measure/inspect CPU and memory distribution, request concurrency, worker cadence, per-user scheduled jobs, duplicate/redundant jobs, briefing/photo/confidence/reconciliation costs, provider calls on synchronous reads, polling vs event-driven work, startup/runtime memory and DB pool sizing.

Separate latency caused by Native/network, web compute, DB, worker contention, provider calls, cold start/deployment, auth and payload size.

6. NATIVE REQUEST WATERFALL

Read current Native code/log evidence for:
duplicate requests;
sequential calls that could safely parallelize;
repeated auth/bootstrap;
unnecessary refetch on navigation/tab changes;
missing short-lived caching for stable data;
UI blocked on secondary data;
stale-while-revalidate opportunities;
retry amplification;
whole-screen failure when only an optional section fails.

No Native patch in this task.

7. FAILURE MODES

For reports like "can't load Home", identify concrete classes:
5xx, timeout, auth/refresh, network, decoding/schema, readiness/deployment, DB connection, worker dependency, partial-data fail-closed behavior, Native cancellation/task lifecycle.

Quantify where possible and determine where graceful partial rendering should replace total-page failure.

8. COST MODEL: 1 / 2 / 10 USERS

Separate FIXED BASELINE from MARGINAL/USAGE-SENSITIVE costs:
DB storage/growth, web/worker compute pressure, AI/provider inference, object/media storage, bandwidth, scheduled jobs per user, Briefings/Photo Intelligence, HealthKit observation volume including future Sleep, etc.

Provide:
current known/estimated monthly baseline;
likely incremental cost of user 2;
likely pressure points by 10 users;
ranges/uncertainty;
resource-tier triggers.

Keep non-DO provider costs separate.

9. OPTIMIZATION OPPORTUNITIES

Group findings:

A. Free/very-low-risk:
unused resources, duplicate jobs, bounded scans, over-fetch, stale resources, request-waterfall fixes.

B. Code/query:
scoped queries, indexes, caching/read models, parallelization, progressive rendering, event-driven jobs.

C. Resource/topology:
right-size DB/app components, staging consolidation/removal, pool sizing, web/worker scaling.

D. Multi-user architecture:
worth doing before ~10 users but unnecessary for 2.

For every recommendation report:
user-visible speed impact;
reliability impact;
monthly cost impact;
engineering effort;
regression risk;
whether required before second user;
measured evidence.

Do not use an opaque score. Recommend an execution sequence.

10. BETA READINESS

Answer explicitly:
- Is adding one beta user reasonable on current infrastructure?
- What must be fixed first?
- What metrics/thresholds should be watched?
- What would trigger DB/web/worker scaling?
- Which costs barely change for user 2?
- Which workloads scale fastest?

Do not add a beta user.

11. MONITORING

Review existing DO alerts and recommend actionable thresholds for DB memory/CPU/storage/connections, web latency/error rate, worker lag/failures, 5xx/readiness and provider failures.

Avoid noisy memory alerts that fire during normal PostgreSQL cache behavior without an action.

Do not change alerts.

12. EVIDENCE QUALITY

Cross-check conclusions against production control-plane metrics, read-only DB evidence, logs, current code, existing performance reports and authoritative pricing/billing where available.

Label each major conclusion as measured, inferred, estimated or unknown.
Do not extrapolate a short spike into a scaling conclusion.

OUTPUT

Publish agent-handoffs/reports/<timestamp>-production-performance-cost-beta-scaling-audit.md.

Include executive summary, current authority, infrastructure/cost table, staging DB finding, latency/surface map, concrete failure causes, DB/query findings, Native waterfall findings, web/worker findings, 1/2/10 user model, optimization opportunities, beta-readiness conclusion, recommended SLOs/alerts, phased execution plan, exact follow-up workstreams/prompts and data limitations.

If an urgent reliability/security issue appears, publish checkpoint immediately.

No code or production mutation.
