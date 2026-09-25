Task id: claude-native-daily-driver-performance-phase2-20260925

Start/continue a dedicated PhysiqueOS performance lane. Preferred coder: Claude. Reasoning: high. Use a NEW Claude coding chat/worktree for this performance project so the HealthKit Founder Takeover and Midweek sessions remain intact and available for their own acceptance work.

This task authorizes DIAGNOSE / INSTRUMENT / CODE / TEST / REVIEW ONLY for PhysiqueOS daily-driver performance. No production deployment, no TestFlight upload, no production data mutation.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
current production deployment reports and Build60 release reports as needed.

Also recover and read any older performance/stabilization reports, prompts, commits, tests, comments, or source instrumentation in git history before starting. Do not rediscover known findings if prior work already proved them.

KNOWN PRIOR PERFORMANCE CONTEXT TO VERIFY/INHERIT, NOT BLINDLY ASSUME

Earlier stabilization work established:
- common Native navigation/completion should be consistently <=3 seconds as a hard ceiling; simple warm/cached interactions should feel substantially faster/effectively immediate;
- Founder observed roughly ~10-second Home -> Priority navigation and similarly sluggish Priority completion;
- completed Visible Abs Goal page was slow enough to trigger an HTTP 503 and was explicitly backlogged for correctness + performance audit;
- Training category/library had previously been observed in roughly the 7.6–10 second range;
- Progress Hub had a preferred 1–2 second target;
- older Native performance work identified blocking spinners/reloads across Home, Log and Evidence, with an intended architecture of rendering cached canonical content immediately and refreshing silently;
- older Native diagnostics implicated SwiftUI .task(id:) / view-model reconstruction/reload behavior in repeated fetches;
- older workout completion path once waited on screenshot interpretation (~60 seconds) and was changed so durable workout commit completes immediately while evidence reconciliation proceeds asynchronously;
- older Server/web performance work found runtime reconstruction was expensive and duplicated across surfaces; that architecture may have changed materially since migration, so measure current behavior before acting.

Search git/history for evidence of these prior findings and cite exact files/commits in the final report where recoverable.

CURRENT AUTHORITY TO REVERIFY

Production Server is expected to be a399916ac9b1c9128067f0f77fb7fd05666aa92a after the Training Day Cardio Server-only fix.
Native installed/release is Build60, release SHA 00321dcc6dd86a6479dbca5dd27e691c87348cd8.
Cardio prospective sync is intentionally awaiting a real workout tomorrow. PERFORMANCE WORK MUST NOT alter HealthKit ingestion/canonicalization, workout policy, Cardio reconciliation semantics, or prospective type-fidelity behavior unless a performance defect is proven in those exact paths and separately escalated. Avoid touching the HealthKit lane unnecessarily.

GOAL

Make the PhysiqueOS Native daily-driver experience fast and stable using measured end-to-end evidence, not speculative micro-optimization.

Primary acceptance principle:
- <=3 seconds is the HARD ceiling for common navigation/completion;
- warm/cached simple reads should generally render meaningful canonical content in <=1 second where architecture permits;
- Progress Hub / common read surfaces preferred <=1–2 seconds;
- user actions should acknowledge immediately and perform safe nonessential work asynchronously where canonical integrity allows;
- no stale/incorrect data may be hidden behind speed improvements.

PART A — RECOVER PRIOR PERFORMANCE WORK

Search:
- git log/history;
- agent-handoffs;
- tests;
- comments/TODOs;
- old instrumentation;
- branches if locally available;
for prior performance diagnostics/fixes.

Build a short inherited-findings matrix:
finding / date-or-commit / old measured latency / old root cause / old fix or deferred work / current relevance.

Explicitly identify what has already been solved and should NOT be repeated.

PART B — CURRENT BUILD60 PERFORMANCE BASELINE

Instrument and measure the real current paths using production-shaped data and current Server/Native code.

At minimum measure COLD and WARM/repeat behavior for:
1. app launch -> Home meaningful content;
2. Home refresh;
3. Home -> Priority Detail;
4. Priority completion -> visible acknowledgement and authoritative settled state;
5. Home -> Log;
6. Log meaningful content;
7. Evidence Hub;
8. Evidence stream open;
9. Training landing/history;
10. Training Day;
11. Training session/detail;
12. Training Library/category;
13. Goals landing;
14. active Build Lean Mass Goal detail;
15. completed Visible Abs Goal detail;
16. Briefing History;
17. briefing detail/open;
18. Progress Photos / Progress Hub if accessible without modifying Founder evidence;
19. Weight detail/history;
20. Nutrition/Activity daily detail where relevant.

Use current production-shaped fixtures/local read models wherever possible. Do not operate Founder phone unless separately authorized.

For each path capture:
- user-action timestamp;
- first meaningful cached content;
- network request start/end;
- Server request duration if available;
- database/read-store duration/query count if available;
- decoding/projection time;
- first rendered authoritative content;
- refresh completion;
- request count and duplicate-request count;
- payload size;
- cache hit/miss;
- blocking vs background work.

Distinguish:
COLD = process/view-model/cache not warm.
WARM = revisit in same session with valid cached content.

Do not report a single aggregate number that hides where time is spent.

PART C — PERFORMANCE BUDGET / RANKING

Classify every measured path:
PASS preferred;
PASS hard ceiling but optimization opportunity;
FAIL >3s;
SEVERE >=5s;
CRITICAL >=8s or timeout/503.

Rank by:
frequency x latency x user-blocking severity.

The Founder daily-driver priority order should influence ranking:
Home, Logging, Training, Nutrition, Weight, Activity, Photos, DEXA Evidence, Briefings, Priorities.

PART D — ROOT-CAUSE EACH MATERIAL FAILURE

For every >3s path and any high-frequency >1.5–2s path, prove the dominant cause(s):
- Native lifecycle/repeated .task fetch;
- view-model reconstruction;
- cache invalidation;
- sequential requests that can safely be parallel;
- oversized payload;
- duplicate server reconstruction;
- N+1/read-store queries;
- DB scan/index issue;
- server composition/projection cost;
- blocking evidence/media work;
- synchronous mutation follow-up;
- image loading;
- unnecessary polling;
- retry/backoff;
- network round trips;
- main-thread decoding/rendering;
- other proven source.

Use tracing/tests/profiling. Do not guess from code shape alone.

PART E — IMPLEMENT HIGH-IMPACT FIXES

After baseline/ranking, fix the highest-impact daily-driver bottlenecks that can be safely addressed in this task.

Architecture principles:
1. Render valid cached canonical content immediately, refresh silently.
2. Cache must be explicitly invalidated/versioned when writes make it stale.
3. Do not trade correctness for speed.
4. Avoid blocking the UI on nonessential evidence interpretation/media processing.
5. Mutation acknowledgement should be immediate once durable canonical write is accepted; background reconciliation may continue only where existing canonical semantics permit.
6. Eliminate duplicate requests/reconstruction.
7. Parallelize independent reads only when consistency semantics allow it.
8. Prefer shared read-model/server fixes over per-screen hacks.
9. Do not introduce permanent stale snapshots.
10. Keep Server authority for canonical/strategic truth.
11. Do not disturb HealthKit prospective Cardio acceptance path.

You may split implementation into several isolated commits by root cause.

PART F — SPECIFIC LEGACY HOTSPOTS

Explicitly inspect and either fix or close with evidence:
- Home -> Priority Detail latency;
- Priority completion feedback/settlement;
- completed Visible Abs Goal detail / historical 503;
- Training Library/category latency;
- Home/Log/Evidence blocking spinner behavior;
- repeated .task(id:)/view-model fetches;
- Progress Hub 1–2s target.

If a hotspot is already fixed in current Build60/current Server, document measured proof and close it rather than rewriting it.

PART G — TESTING

For every performance fix add deterministic regression protection where practical:
- request-count tests;
- no duplicate fetch on stable revisit;
- cached-first rendering tests;
- cache invalidation after mutation;
- async acknowledgement behavior;
- query-count ceilings;
- bounded payload/read tests;
- latency-independent structural tests (avoid flaky wall-clock unit assertions);
- correctness parity before/after.

Use real wall-clock measurements only for benchmark/acceptance evidence, not brittle unit gates unless existing infrastructure supports it.

PART H — VALIDATION

Server changes:
- focused tests;
- relevant broader tests;
- query/read-model benchmark;
- production webpack build on exact candidate;
- fresh-context adversarial review.

Native changes:
- focused tests;
- use existing iPhone 17 Pro simulator only;
- run full Native suite only when executable-source scope justifies it;
- obey STANDING_DISK_SAFETY.md: >=20 GiB preferred before full Native suite/archive;
- fresh-context adversarial review.

Re-run the SAME baseline after fixes and produce before/after numbers for every changed path.

No performance claim without comparable before/after evidence.

PART I — ACCEPTANCE STANDARD

For the exact final candidates:
- no common daily-driver path >3s unless a documented external dependency makes it impossible and Founder explicitly accepts it;
- Home -> Priority Detail <=3s hard ceiling, target <=1s warm;
- Priority completion visible acknowledgement <=1s target, authoritative settle <=3s when Server is healthy;
- Home/Log/Evidence warm meaningful content <=1s target;
- Training landing/day/detail warm <=1–2s target;
- Training Library/category <=3s hard ceiling, <=2s preferred;
- completed Goal detail <=3s and no timeout/503;
- Progress Hub <=2s preferred;
- no regression in canonical correctness, cache freshness, HealthKit, Training, briefing, or mutation semantics.

If some paths cannot meet this without a larger architectural project, do NOT hide it. Produce a Phase 3 proposal with measured blocker and expected payoff.

PART J — CONCURRENCY / LANE SAFETY

HealthKit prospective Cardio is intentionally frozen for real-world acceptance until the next actual workout.
Do not change:
- HealthKit observation ingestion;
- Cardio workout classifier/canonicalization;
- workout policy;
- isIndoorWorkout transport;
- Training Day Cardio semantics just deployed;
unless a performance-only change is proven necessary and explicitly isolated for later approval.

Do not overwrite HealthKit latest.json/latest.md. Performance is a separate lane.

GITHUB

Publish:
1. a performance baseline/diagnostic report before or alongside implementation;
2. exact implementation candidate report;
3. final before/after acceptance report
under agent-handoffs/reports/ on main.

Use a performance-specific pointer if helpful, but do not take ownership of HealthKit latest.json/latest.md.

Final report must include:
- inherited prior findings;
- current cold/warm baseline table;
- ranked bottlenecks;
- root causes;
- exact fixes;
- before/after comparable measurements;
- request/query count changes;
- tests/build/review;
- exact Server/Native candidate SHAs;
- any remaining >3s path;
- recommended release order.

STOP for Founder release authorization.
No deploy/upload in this task.

NOT AUTHORIZED

No Server deployment.
No TestFlight upload/archive unless later explicitly authorized.
No production data mutation.
No HealthKit policy mutation.
No Cardio reconciliation.
No strategic eligibility changes.
No historical briefing regeneration.
No Founder-device operation.

Flags:
AUTHORITY_REVERIFIED
PRIOR_PERFORMANCE_WORK_RECOVERED
BUILD60_BASELINE_COMPLETE
COLD_WARM_MEASURED
DUPLICATE_REQUESTS_MEASURED
SERVER_DB_BREAKDOWN_MEASURED
BOTTLENECKS_RANKED
HOME_PRIORITY_PROFILED
PRIORITY_COMPLETION_PROFILED
VISIBLE_ABS_GOAL_PROFILED
TRAINING_LIBRARY_PROFILED
HOME_LOG_EVIDENCE_PROFILED
PROGRESS_HUB_PROFILED
HIGH_IMPACT_FIXES_IMPLEMENTED
CACHE_CORRECTNESS_GUARDS_PASS
REQUEST_COUNT_GUARDS_PASS
BEFORE_AFTER_REMEASURED
COMMON_PATHS_UNDER_3S_OR_EXPLICITLY_ESCALATED
SERVER_TESTS_PASS_OR_NOT_APPLICABLE
NATIVE_TESTS_PASS_OR_NOT_APPLICABLE
PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE
FRESH_CONTEXT_REVIEWED
HEALTHKIT_CARDIO_PATH_UNCHANGED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
