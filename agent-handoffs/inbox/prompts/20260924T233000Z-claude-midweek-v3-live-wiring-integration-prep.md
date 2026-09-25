Task id: claude-midweek-v3-live-wiring-integration-prep-20260924

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

This task authorizes CODE / TEST / REVIEW ONLY. No production deployment, Native archive/upload, Cardio activation, policy/data mutation, or historical briefing regeneration.

Read first:
agent-handoffs/reports/20260925T042005Z-midweek-v3-engine-implementation-evidence-settlement.md
agent-handoffs/reports/20260925T025914Z-midweek-v3-engine-quality-diagnostic-amended.md
HealthKit latest.json/latest.md
HealthKit report published by commit deaac49fc6cf5602491b2c6cef32945cec2cd48e
HealthKit Cardio readiness report published by commit 23dbcaa8169889c888a53970b27a91a607925814

Expected reviewed candidates:
Midweek Server 6046e9dd2ea01bdfab6aac9fe010294177b5a5db.
Midweek Native 1343c52f.
HealthKit Server c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5.
HealthKit Native 6a108d25e2a05b63c9561be3aeb9952f4e9dafe1.
Production Server expected 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7.
Installed Native Build59 a269700b.
Reverify all authority/lineage before work.

Goal:
Finish the two disclosed Midweek architectural gaps, coordinate the Native device-closeout implementation with HealthKit without worktree collision, then prepare exact clean combined Server and Native candidates for one final integrated review. Do not release.

PART A — wire EnergyVariabilityV3 into live per-day Energy evidence

Trace the real live V3 Energy path from canonical evidence -> CadenceEnergyAssessmentService dailyRecords -> execution/findings -> BriefingV3Projection/Narrative.

Wire EnergyVariabilityV3 to trustworthy per-day data at the earliest correct layer.

Requirements:
- completeness remains source/canonical coverage semantics;
- protocol target is strategic context only;
- target distance NEVER decides completeness;
- per-day observed intake remains factual whether low/high;
- no inferred intent/forgotten-meal language;
- variability assessment is bidirectional;
- use user-relative historical baseline only when sufficient comparable history exists;
- conservative/no-nudge under insufficient history;
- isolated excursion does not automatically nudge;
- repeated pattern may nudge only when it materially reduces period-level predictability or creates strategic drift;
- output is a structured interpretation signal/claim with semantic role, not free-form duplicated prose;
- Energy card remains data-first;
- any nudge must be directional, concise, and action-relevant;
- no provenance/pipeline narration unless decision-relevant;
- avoid double-counting the same Energy meaning in Hero/Watch/Coach’s Take.

Use active Nutrition/Energy protocol from canonical strategy authority. Do not hardcode 2500 or Founder-specific variability.

Required tests include:
- 1500/2500/4000 observations all can be technically complete;
- single 4000 day does not inherently nudge;
- single 1500 day does not inherently nudge;
- repeated upward deviations + loss of predictability can produce upward nudge;
- repeated downward equivalent;
- normal user-relative spikes do not over-trigger;
- insufficient history conservative;
- protocol change separates comparable baseline correctly;
- semantic dedup with other briefing claims.

PART B — wire BriefingEvidenceSettlementPolicy into live generation scheduler

Locate the actual production briefing generation trigger/scheduler/worker path. Do not stop at a reusable module.

Integrate the reviewed settlement policy so cadence eligibility no longer means immediate generation.

Lifecycle:
window closes -> settlement/readiness -> earliest publish -> retry -> hard deadline fallback -> freeze/generate/publish.

Requirements:
- user/product chooses cadence/frequency/day only;
- Server owns clock time;
- readiness domains initially Activity + Nutrition when HealthKit-backed/expected;
- Training absence does not block;
- readiness uses canonical settlement/coverage/revision state, never value plausibility;
- 180-min minimum delay / 30-min retry / 480-min maximum wait are initial Server policy defaults unless source-grounded integration reveals a better compatible representation; document any change;
- ordinary HealthKit background canonicalization can satisfy readiness even with no explicit closeout receipt;
- explicit device closeout can accelerate readiness but is never required;
- hard deadline publishes best available canonical evidence with unsettled-domain metadata;
- freeze evidence watermark with cutoff, record/revision identities where available, readiness state, closeout receipt, generation/publish timestamp;
- later evidence revision does not mutate historical artifact;
- timezone authority explicit and based on canonical briefing/goal timezone, not transient device travel timezone;
- Monthly remains day 1;
- event-driven DEXA/Photo must not be accidentally delayed by recurring HealthKit settlement policy unless explicitly appropriate.

Observability must be live, not just vocabulary:
window_closed
closeout_eligible/requested where applicable
latest_relevant_revision_received/readiness_checked
readiness_satisfied
briefing_generated
briefing_published
deadline_fallback

Idempotency/concurrency:
- worker retries cannot generate duplicate briefings;
- settlement retries cannot race normal generation;
- two workers evaluating same cadence/window must converge on one artifact;
- hard deadline and readiness transition race safely.

PART C — Native device-closeout implementation ownership

Read docs/BRIEFING_EVIDENCE_SETTLEMENT_DEVICE_CLOSEOUT_INTERFACE.md from Midweek candidate.

Do NOT edit HealthKit-owned Native files from the Midweek worktree if they overlap the HealthKit candidate.

Instead:
1. audit exact Native files/interfaces needed;
2. publish a precise HealthKit-lane implementation subtask/report if overlap exists;
3. if files are non-overlapping and safe, implement in an isolated integration worktree only after proving zero overlap.

Preferred architecture:
- Native knows a briefing closeout is eligible/pending from a Server-owned contract;
- when iOS grants background execution or app opens during settlement, Native re-queries the relevant HealthKit window/final day for Activity/Nutrition and uploads latest observations through existing HealthKit ingestion;
- no exact-time wake promise;
- no user action required;
- no duplicate custom ingestion path if existing HealthKit sync can accept a bounded closeout request;
- closeout receipt is acknowledged to Server only after bounded query/upload attempt has completed according to contract;
- failure does not block forever; Server deadline remains authoritative.

If this belongs in HealthKit lane, do not implement it yourself. Publish the exact handoff task to agent-handoffs/inbox/prompts/ or a timestamped report and identify required HealthKit base SHA. The orchestrator will send it to HealthKit Claude.

PART D — combine Server candidates cleanly

After A+B are implemented/reviewed on the Midweek Server branch, reconcile HealthKit Server c58dcca97e7b1a32c829485b7f8dc3d8fa5bb5a5 with the final Midweek Server candidate.

Requirements:
- both descend cleanly from production 01d1900b or explicitly document lineage;
- preserve all Midweek V3/settlement behavior;
- preserve HealthKit isIndoorWorkout ingestion/classifier/type fidelity/request-bound accounting;
- preserve already-live Cardio readiness tooling from 01d1900b;
- no policy activation;
- no data migration unless truly required; stop if schema/migration unexpectedly appears;
- inspect overlap before merge/cherry-pick;
- focused tests from both lanes;
- production webpack build;
- fresh-context integrated Server review.

PART E — combine Native candidates cleanly

Reconcile Midweek Native 1343c52f with HealthKit Native 6a108d25 on exact Build59 base lineage.

Requirements:
- preserve Midweek accepted format and Coach’s Take fix;
- preserve HealthKit Sep24 candidate relationship decode, honest candidate/confirmed label, prospective indoor/outdoor metadata transport;
- if Part C Native closeout is implemented by HealthKit before final integration, include its reviewed candidate too;
- inspect file overlap and resolve semantically, not mechanically;
- no Build60 number bump yet;
- focused Midweek + HealthKit tests;
- relevant full Native suite on existing iPhone 17 Pro simulator only;
- fresh-context integrated Native review.

PART F — integrated production-shaped acceptance

Before calling candidates release-ready, prove with fixtures:
- Sep20–22 format inventory unchanged;
- hero holistic, no incidental movement PR as thesis;
- Confidence concrete/no undefined update;
- Energy data-first/no metric transcription;
- Coach slots distinct/nonempty-or-omitted/no first-person label;
- historical artifact immutable;
- 3/3 final-day Energy fixture after settled HealthKit evidence;
- unsettled final day waits;
- deadline fallback works;
- later evidence does not rewrite frozen briefing;
- current-day HealthKit Activity/Nutrition ingestion remains healthy;
- Sep23 confirmed Strength detail remains healthy;
- Sep24 candidate Strength detail decodes and renders;
- new Indoor/Outdoor metadata survives Native -> Server -> canonical classifier;
- Cardio remains NOT activated;
- four historical deferred walks remain untouched.

PART G — release plan only

Return exact combined Server and Native SHAs and recommended release order.
Preferred:
1. deploy combined Server;
2. prepare/archive combined Native Build60;
3. TestFlight upload after separate authorization;
4. Founder acceptance of Strength + Midweek;
5. then begin already-prepared Cardio graduation gates.

Do not execute release in this task.

VALIDATION

Server: focused suites, relevant full suites, mutation-test critical new guards, production-shaped webpack build.
Native: focused + relevant full unit/UI suites, existing iPhone17 Pro simulator only.
Fresh-context independent adversarial review exact combined candidates.
Every reviewer finding must be fixed/re-reviewed or explicitly documented as accepted non-blocking.

GITHUB

Midweek remains secondary lane until integration ownership is explicitly transferred.
Publish timestamped implementation/integration reports to main; do not overwrite HealthKit latest.json/latest.md.
If a HealthKit Native closeout handoff is required, publish it durably to GH and clearly identify it.
Stop for Founder authorization after exact reviewed combined candidates exist.

Flags:
AUTHORITY_REVERIFIED
ENERGY_VARIABILITY_LIVE_WIRED
ENERGY_PROTOCOL_COMPLETENESS_SEPARATION_PASS
SETTLEMENT_POLICY_LIVE_SCHEDULER_WIRED
SERVER_OWNS_DELIVERY_TIME
SETTLEMENT_RETRY_IDEMPOTENCY_PASS
SETTLEMENT_HARD_DEADLINE_PASS
SETTLEMENT_WATERMARK_FROZEN_PASS
SETTLEMENT_OBSERVABILITY_LIVE
NATIVE_CLOSEOUT_OWNERSHIP_RESOLVED
HEALTHKIT_CLOSEOUT_HANDOFF_PUBLISHED
COMBINED_SERVER_CANDIDATE_READY
COMBINED_NATIVE_CANDIDATE_READY
HEALTHKIT_TYPE_FIDELITY_PRESERVED
STRENGTH_FIX_PRESERVED
MIDWEEK_FORMAT_PRESERVED
CARDIO_NOT_ACTIVATED
SEP20_22_ARTIFACT_IMMUTABLE
SERVER_TESTS_PASS
NATIVE_TESTS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
FRESH_CONTEXT_SERVER_REVIEWED
FRESH_CONTEXT_NATIVE_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
