Task id: native-core-page-cold-load-performance-audit-20260921

Goal

Perform a measurement-first performance investigation of PhysiqueOS Native core-page loading, focused on the Founder's observed 3-5 second loads when first opening the app after it has been idle/not used for a while. Identify and rank the actual bottlenecks and produce a concrete optimization plan. Do not implement optimizations in this task unless an instrumentation-only change is required to obtain reliable measurements.

This is a separate performance workstream from HealthKit. Do not use the HealthKit Phase 2 Claude chat.

Claude chat guidance

Use a NEW Claude Remote Control chat for this performance audit. Suggested chat name: "Native Performance".

Remote Control should spawn an isolated worktree from the current accepted Native anchor. Reverify authority and do not assume the current Remote Control anchor has advanced beyond accepted Build 48/49 lineage.

Current product context

Founder observation:
- warm/common navigation is usually fine;
- after the app has not been used for a while, initial/core pages can show loading for roughly 3-5 seconds;
- this is most noticeable on first open/return-from-idle, not necessarily every subsequent tab switch.

Performance standard:
- common core-page usable content should be consistently <=3 seconds;
- target ~1-2 seconds where caching/read-model architecture makes that practical;
- do not achieve this by showing stale/wrong data as current without explicit freshness semantics.

Core surfaces to audit

At minimum:
- app initial launch / first authenticated Home
- Home
- Log
- Evidence Hub
- Training entry/history surface
- Nutrition surface
- Weight surface

Also inspect Goals/You only if shared startup work makes them relevant.

Define scenarios

Measure separately:
1. true cold launch after process termination;
2. launch after app has been backgrounded long enough for process/network/auth state to become cold;
3. foreground resume with process still resident;
4. first visit to each core tab after launch;
5. repeated/warm revisit to each tab;
6. network/server warm vs cold where observable;
7. any authentication/token refresh path.

Do not conflate SwiftUI render time with network latency.

Measurement decomposition

Instrument or otherwise measure the timeline from user/app lifecycle event to usable page content.

Break down where possible:
- process/app initialization
- authentication/session restoration
- Keychain/Face ID/PIN state if relevant
- API client setup
- DNS/TCP/TLS/network connection establishment
- token refresh/auth request
- Server request duration
- Server endpoint/read-model assembly
- database/query duration if Server tracing exists
- payload transfer
- JSON decode/model mapping
- MainActor/state publication
- SwiftUI first render
- image/media fetches
- secondary/non-blocking requests
- any repeated/duplicate request
- any serial request chain that could be parallel
- cache lookup/invalidation/expiry
- foreground refresh policy

Prefer os_signpost / MetricKit-compatible or existing structured instrumentation over print timing if available. Any temporary instrumentation must be easy to remove and must not log Founder-sensitive payloads.

Production safety

Do not mutate Founder production data.

Read-only production API calls from the Native app are acceptable only if they are the same ordinary reads the app already performs and do not expose sensitive payloads in logs/reports.

Prefer fixture/local measurements for render/decode decomposition and bounded production measurements for real network/server latency.

Do not run destructive UI journeys.

No production Server deployment in this audit.

Native authority

Reverify:
- currently accepted/installed Native authority;
- pending HealthKit Build 50 candidate lineage;
- persistent Remote Control anchor.

Do not merge into the HealthKit candidate. This audit is separate.

Server authority

Reverify current production Server SHA/deployment because endpoint timing may matter. Expected at task publication:
Server 93491bc5d829d3693aa29023cd79e96922012130
deployment 1156849f-d5af-47ec-a5d3-d247a99033ee

If authority has advanced, report it and use current production.

Audit source architecture

For each core page map:
page -> view model/store -> API endpoint(s) -> request dependencies -> cache behavior -> decode -> render dependencies -> blocking vs secondary data.

Identify:
- duplicated Home/global bootstrap requests;
- independent calls serialized unnecessarily;
- tab views re-fetching data already loaded globally;
- foreground lifecycle causing full invalidation;
- token refresh blocking all requests;
- caches discarded on background/scene changes;
- expensive server endpoints;
- oversized payloads;
- expensive decode/mapping on MainActor;
- image/media requests blocking primary content;
- view initialization doing synchronous work;
- N+1 or repeated database/read-model queries if server evidence is available;
- whether multiple tabs could share a single bootstrap/read-through cache.

Cold-start experiment

Create a reproducible measurement protocol.

Run enough repetitions to distinguish one-off noise from persistent latency. Prefer at least 5 runs per major scenario if practical.

Report median and p90/p95 where sample size supports it; otherwise report min/median/max and sample count.

Do not claim statistical precision beyond the sample.

Measure:
- time to first usable Home content;
- first core-tab usable content;
- warm revisit latency;
- auth/session restoration latency;
- endpoint timings.

"Usable" means primary content required to understand/use the page is rendered. Secondary photos/charts/media may continue loading if the product can function without them.

Server investigation

If production endpoint latency materially contributes:
- inspect Server source/read models for the relevant endpoints;
- use existing logs/metrics if safely available;
- bounded read-only query plans/timing are allowed only through approved read-only access;
- do not optimize/deploy Server code in this task.

Separate:
client wait caused by server
vs
client architecture caused by serial/duplicate/blocking work.

Cache/freshness analysis

Evaluate possible approaches without implementing:
- stale-while-revalidate for previously viewed canonical read models;
- persisted lightweight last-known snapshot for launch;
- in-memory shared stores across tabs;
- ETag/If-None-Match or version-aware conditional reads;
- background prefetch;
- parallel fetches;
- lazy secondary sections;
- preserving last known data while refreshing instead of blank loading states;
- auth/session refresh decoupled from rendering when safe;
- endpoint consolidation/bootstrap response only if it reduces real latency rather than merely moving complexity.

For each recommendation state correctness/freshness risk.

Do not recommend hiding latency with stale data unless the UI can clearly preserve canonical freshness semantics.

Home priority navigation

Prior stabilization history had slow Home priority navigation/completion. Re-measure current state if the relevant path still exists, but do not let it distract from the new cold-load issue.

Regression/performance test strategy

Recommend durable automated performance gates:
- launch metric
- page-load signposts
- request-count assertions
- duplicate-fetch tests
- fixture decode/render benchmarks
- server endpoint timing thresholds where appropriate

Do not create brittle wall-clock UI tests as the only gate.

Deliverable

Produce a ranked bottleneck report:

For each bottleneck:
- affected pages/scenarios
- measured contribution
- evidence
- root cause
- proposed fix
- expected qualitative/quantified improvement if supported
- implementation scope (Native/Server/both)
- correctness risk
- recommended priority

Classify:
P0 = causes >3s core usable-content violation/shared root cause
P1 = meaningful but not dominant
P2 = polish

Also provide a proposed implementation sequence that minimizes build churn.

Important decision

Determine whether the 3-5 second behavior is primarily:
A. authentication/session cold start;
B. network connection cold start;
C. Server endpoint/read-model latency;
D. Native serial/duplicate requests;
E. Native cache invalidation/no persisted snapshot;
F. rendering/decode/MainActor;
G. combination.

Do not guess; quantify.

No implementation by default

Stop after audit/recommendation.

If you discover a trivial, obviously safe instrumentation-only patch needed for measurement, you may make it locally but do not merge/deploy/release it without reporting.

Do not modify the pending HealthKit Build 50 candidate.

GitHub protocol

Claim/complete through established inbox protocol.
Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
- exact Native/Server authority
- scenarios measured
- measurement method/sample count
- per-page latency table
- request-count/dependency map
- ranked P0/P1/P2 bottlenecks
- root-cause classification A-G
- optimization plan
- expected build/server work
- whether any fix should be folded into Build 50 or deferred to Build 51
- disk impact of profiling artifacts and cleanup performed
- no production mutations

Explicit flags:
COLD_LAUNCH_MEASURED
IDLE_RESUME_MEASURED
WARM_NAVIGATION_MEASURED
HOME_PROFILED
LOG_PROFILED
EVIDENCE_PROFILED
TRAINING_PROFILED
NUTRITION_PROFILED
WEIGHT_PROFILED
AUTH_LATENCY_QUANTIFIED
NETWORK_LATENCY_QUANTIFIED
SERVER_LATENCY_QUANTIFIED
NATIVE_REQUEST_GRAPH_MAPPED
DUPLICATE_FETCHES_IDENTIFIED
CACHE_INVALIDATION_AUDITED
MAINACTOR_RENDER_COST_QUANTIFIED
P0_BOTTLENECKS_IDENTIFIED
IMPLEMENTATION_PLAN_READY
HEALTHKIT_BUILD50_UNCHANGED
PRODUCTION_DATA_MUTATED
