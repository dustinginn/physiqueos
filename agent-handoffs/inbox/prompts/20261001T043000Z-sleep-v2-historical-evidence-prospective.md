HealthKit Sleep — canon-v2 deployment, PhysiqueOS-aligned historical Evidence, and prospective sync preparation

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Canon-v2 candidate:
agent-handoffs/reports/20261001T035449Z-healthkit-sleep-canon-v2-candidate.md

Historical validation:
agent-handoffs/reports/20260930T210326Z-healthkit-sleep-historical-shape-validation.md

Sleep Evidence design:
agent-handoffs/reports/20261001T032718Z-healthkit-sleep-evidence-design.md

FOUNDER DECISION — HISTORICAL BOUNDARY

Do NOT use the earliest Sleep record in Apple Health.

Historical Sleep Evidence must begin at the first date where PhysiqueOS itself has a consistently populated, trustworthy evidence timeline suitable for meaningful cross-domain inspection.

Determine this boundary from production PhysiqueOS data first. Do not assume June.

The intent is that historical Sleep appears only for the period where PhysiqueOS has sufficiently consistent contextual evidence such as training, nutrition, weight/activity and other canonical evidence to make the historical Evidence timeline coherent.

The boundary is a product/evidence-coverage boundary, NOT an Apple Health availability boundary.

Founder wants historical Sleep visible in Evidence from that PhysiqueOS boundary forward.

HISTORICAL STRATEGIC RULE

Historical Sleep is permanently Evidence/display-only.

It must NEVER retroactively alter:
- historical Goals or Goal progress;
- Goal Confidence;
- Strategy Confidence;
- V3 Confidence;
- Narrative;
- Briefings;
- recommendations;
- strategic evidence;
- historical strategic artifacts.

Prospective Sleep also remains strategically quarantined during initial sync acceptance.

Only after:
1. automatic prospective sync is proven over the next few nights;
2. Recovery Briefing card is designed and Founder-approved;
3. Founder separately authorizes strategic graduation;
may Sleep participate in V3/Goal interpretation, prospectively from a new explicit strategic-effective boundary.

No historical strategic rewrite is ever permitted.

TASK

A. Reverify current production authority.

B. Review and deploy accepted sleep-canon-v2 candidate 133d838e if current authority remains compatible.
After deploy prove:
- live/ready;
- web/worker exact SHA;
- historical validation remains intact;
- prospective activation OFF;
- ordinary Sleep samples/days 0 before import;
- strategic leakage 0.

C. DETERMINE PHYSIQUEOS CONSISTENT-EVIDENCE START DATE

Use read-only production evidence.

Define a defensible, deterministic boundary representing the beginning of consistently populated PhysiqueOS evidence, rather than merely the first isolated record.

Inspect daily/weekly coverage across the major evidence streams that existed historically, including at minimum:
- training;
- nutrition;
- weight;
- activity;
- canonical evidence / daily evidence coverage;
- Goal timeline where relevant.

Do not require streams that were intentionally introduced later (for example HealthKit Sleep itself or newer features) to exist historically.

Develop a simple evidence-coverage criterion and report it before using it.

Preferred principle:
choose the earliest date after which the core PhysiqueOS daily evidence set is consistently present with no sustained onboarding/sparse-data period.

Avoid cherry-picking a date because it produces a longer Sleep history.

If there are multiple plausible boundaries, report them and choose the one best supported by the app's canonical-history quality, not Apple Health availability.

Read-only SQL rules:
BEGIN READ ONLY;
verify transaction_read_only=on;
bounded owner-scoped SELECTs only;
no credentials printed.

Report the selected date and a sanitized coverage summary. Do not expose private daily values unnecessarily.

D. HISTORICAL SLEEP AVAILABILITY CHECK

Only after the PhysiqueOS boundary is selected, determine whether HealthKit Sleep exists continuously/meaningfully from that boundary forward.

If Sleep begins later than the PhysiqueOS boundary, the actual Sleep Evidence start is the first representable Sleep day ON OR AFTER the PhysiqueOS boundary.

Do not reach earlier than the PhysiqueOS boundary.

Use a bounded privacy-safe diagnostic/search, not an unbounded raw export.

E. EVIDENCE-ONLY HISTORICAL IMPORT

Create a guarded durable historical Sleep Evidence import from:
max(PhysiqueOS consistent-evidence boundary, first representable Sleep day on/after boundary)
through:
day immediately before prospective D0.

Use sleep-canon-v2 and Founder Oura preference.

These records are intended to appear in Recovery/Sleep Evidence.

Structural quarantine is mandatory:
- immutable ingestionPurpose/origin = historical_evidence_import or equivalent;
- strategicEligible = false permanently for historical import;
- V3/Briefing/Goal readers categorically exclude historical_evidence_import;
- future broad eligibility policy cannot accidentally sweep these records into strategy.

Do not rely only on a mutable current policy flag.

Historical Sleep can be read by Evidence read models.

No historical Briefing/Confidence recomputation.

F. TIMEZONE / TRAVEL

Founder reports travel to Texas in late September while the validation data showed one device-at-ingest zone.

Therefore:
- historical inferred timezone is not ground truth;
- never fabricate local clock times for travel nights;
- preserve timeZoneBasis/provenance;
- consistency calculations must exclude or appropriately mark historically uncertain clock-time nights;
- total sleep duration remains usable independent of display timezone.

Do not attempt to infer travel location from unrelated personal data.

G. SEPTEMBER VALIDATION

Do not blindly promote/copy the 2878 validation rows.

Import historical Evidence through the reviewed durable historical-import path from HealthKit.

Use the validation collection only as comparison evidence.

Compare September sanitized shape after import:
- expected coverage;
- Oura/source shape;
- v2 duplicate resolution;
- stage availability;
without raw Founder values.

Do not delete validation records without separate authorization.

H. SERVER RECOVERY/SLEEP READ MODEL

Implement the approved Evidence read-model contract, performance-safe and owner-scoped.

At minimum:
Landing:
- lastNight;
- nights[14];
- sevenNightAverage;
- sleep-window/consistency summary;
- sources.

Trends:
- bounded requested ranges;
- long-range weekly aggregation where designed;
- pagination/bounds.

Night detail:
- main episode;
- timeline;
- stage status/values;
- continuity;
- time in bed;
- secondary sleep;
- source/provenance;
- completeness;
- timezone basis;
- algorithm version.

Historical Evidence and prospective Evidence should render through the same read model, with provenance retained.

Evidence display does not imply strategic eligibility.

Avoid broad collection hydration; use scoped/indexed reads consistent with current performance work.

I. PROSPECTIVE D0

After v2 + historical import + Native automatic path are ready, choose the next clean D0 whose floor is safely future.

Prior Oct 4 suggestion is valid only if its floor remains safely future at apply time.
Otherwise advance to the next clean day.
Never weaken the future-floor guard.

Prospective mode:
validation_only.

Prospective records:
canonical operational Sleep Evidence;
strategic eligibility quarantined.

Historical import ends before D0.

No strategicEffectiveAt yet.

J. NATIVE / HISTORICAL IMPORT REQUIREMENTS

If historical import requires a new Native build, integrate only the minimum reviewed bounded historical-import capability plus the already-accepted automatic Sleep path and Founder-page cleanup.

No arbitrary full-history export.

If Build 74 is required:
- integrate current accepted Native authority + a5041eb0 cleanup + required Sleep Evidence/history plumbing;
- preserve persistent pairing and existing graduated HealthKit behavior;
- Xcode upload only after review;
- stop for Founder install/action if required.

K. STRATEGIC QUARANTINE TESTS

Prove:
- historical_evidence_import cannot enter V3 under any current/future broad policy without explicit code/policy change;
- prospective validation_only Sleep cannot enter V3;
- no Briefing readiness dependency;
- no Goal/Confidence mutation;
- no historical artifact recomputation;
- no recommendation changes.

Prepare tests for a future explicit strategicEffectiveAt:
pre-boundary excluded;
on/after boundary only eligible after a future policy version explicitly enables Sleep.

Do not enable it.

L. DEPLOYMENT / ACTIVATION

Canon-v2 may be deployed under this task after guarded review.

Historical Evidence import may be executed only after:
- boundary is determined and reported;
- import path is reviewed;
- strategic quarantine tests pass.

Prospective activation may occur only after exact Native/Server authorities are ready and local permission gates permit it. If a new explicit Founder production authorization is required, stop and report the exact sentence.

M. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-v2-historical-evidence-prospective-prep.md

Include:
- v2 deployment authority;
- PhysiqueOS consistent-evidence boundary criterion and selected date;
- first Sleep day on/after boundary;
- historical import range;
- historical import counts/shape sanitized;
- quarantine proof;
- read-model contract;
- Native build requirement/status;
- prospective D0;
- prospective activation status;
- exact Founder action if any;
- strategic status OFF;
- rollback/local-only state.

Publish GH checkpoint before every stop.

END TASK.
