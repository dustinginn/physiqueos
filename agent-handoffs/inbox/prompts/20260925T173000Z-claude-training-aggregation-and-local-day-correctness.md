Task id: claude-training-aggregation-and-local-day-correctness-20260925

Start a NEW dedicated Claude coding chat/worktree for this combined correctness project. Preferred coder: Claude. Reasoning: high.

This task combines two backlog items that can be investigated and implemented in parallel inside one isolated correctness lane:
A. Training aggregation consistency across History/landing/reporting/library/rollups.
B. Native local-day/timezone rollover correctness across daily-driver “Today” surfaces.

Do NOT use or modify the existing HealthKit Founder Takeover, Midweek, or Performance Phase 2 worktrees/sessions. Do NOT alter the prospective HealthKit Cardio ingestion/canonicalization path awaiting tomorrow’s real-workout acceptance.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/performance/latest.json
agent-handoffs/backlog/20260925-native-local-day-timezone-rollover-audit.md
agent-handoffs/reports/20260925T171500Z-healthkit-training-day-cardio-presentation-diagnostic-and-fix.md
agent-handoffs/reports/20260925T173500Z-healthkit-training-day-cardio-server-deployed-checkpoint.md
latest Performance Phase 2 deployment report.

Reverify current authority. Expected:
Production Server afdc849a6399130668d846544e85236fe1974741.
Native installed Build60 release SHA 00321dcc6dd86a6479dbca5dd27e691c87348cd8.
Performance Native candidate c736254b is unreleased and MUST NOT be accidentally overwritten or duplicated. If this task needs Native changes, base/reconcile them cleanly with c736254b so a future Build61 can contain both projects without losing reviewed performance work.
Cardio policy v4 [cardio,strength]; prospective Cardio acceptance pending tomorrow.

GENERAL RULES

- Diagnose before patching.
- Use read-only production inspection only where needed.
- No production data mutation.
- No deploy/TestFlight upload.
- No HealthKit policy/reconciliation/strategic-eligibility changes.
- Do not change HealthKit observation ingestion, workout classification, isIndoorWorkout transport, canonicalization, or tomorrow’s prospective Cardio semantics.
- Preserve Server strategic timezone semantics separately from daily-driver local-day UX.
- Performance regressions are not acceptable; current Server performance gains and unreleased Native c736254b gains must survive.

==================================================
WORKSTREAM A — TRAINING AGGREGATION CONSISTENCY
==================================================

FOUNDER-OBSERVED DEFECT / CONTROL

Current production Training Day is now correct:
- Sep21: two Outdoor Walk + one Strength.
- Sep22: two screenshot-derived walks + Strength, with duplicate canonical HealthKit walks suppressed.
- Sep23: two generic Walking canonical HealthKit Cardio rows + Strength.
- Sep24: same.
But Recent Training History still shows Sep23/Sep24 as “1 session” rather than 3.

Training Day is the accepted unified workout presentation contract.
Cardio may appear in Training without becoming a structured Training Logger session, Strength link, or claim.
Activity Day remains accounting-only.

GOAL A

Unify Training aggregate/read surfaces around one explicit canonical “presented workout/session” universe consistent with Training Day, including duplicate suppression and without corrupting Logger semantics.

AUDIT ALL RELEVANT SURFACES

At minimum trace:
- Training landing / Recent Training History day session counts;
- week/month history rollups;
- reporting;
- Training Library counts/statistics if they represent sessions/workouts;
- category summaries;
- exercise/performance rollups where workout/session count semantics matter;
- any Home/Goal training summary consuming Training aggregates.

For each surface document:
- current source collection(s);
- what “session” means today;
- whether Cardio should count;
- whether screenshot evidence and canonical HealthKit duplicates can double count;
- whether Strength Logger sessions and HealthKit Strength telemetry can double count;
- whether count is workouts, Logger sessions, exercise sessions, or evidence objects.

Do not mechanically make every number equal 3. Preserve domain-specific meanings. If a surface intentionally means “structured strength sessions,” label/count it accordingly rather than silently converting it to all workouts.

ROOT-CAUSE / CANONICAL MODEL

Design/reuse a shared Server projection for the unified Training workout universe if appropriate:
- structured Strength Logger session = one presented Strength workout;
- canonical Cardio workout = one presented Cardio workout;
- screenshot-derived Cardio evidence remains present when no canonical duplicate supersedes it;
- canonical HealthKit Cardio matching an existing active screenshot workout must not double count;
- ambiguous/unverifiable coexistence fails safely according to reviewed Training Day semantics;
- HealthKit Strength telemetry does not become a second Strength session when linked/candidate to the Logger session;
- no Cardio Logger/link/claim creation;
- generic historical walking stays generic;
- prospective Indoor/Outdoor types preserved from canonicalType;
- retired/superseded evidence handled consistently.

Use Sep21/22/23/24 as production-shaped controls.

EXPECTED RECENT HISTORY:
- Sep21 should remain 3 presented workouts/sessions.
- Sep22 should remain 3, not 5.
- Sep23 should become 3.
- Sep24 should become 3.
But verify current exact dates/data before asserting.

REPORTING/LIBRARY:
Explicitly determine correct semantics instead of forcing Training Day’s count onto them. If “Library” is exercise-centric, Cardio may belong in Cardio workout history but not exercise PR counts. Document and test the distinction.

TESTS A

At minimum:
- Sep21 control unchanged;
- Sep22 duplicate suppression;
- Sep23/24 count 3;
- Cardio-only day appears in Training history with correct count;
- Strength-only day unchanged;
- HealthKit Strength candidate/confirmed telemetry never creates a duplicate session;
- screenshot + canonical Cardio duplicate counts once;
- generic vs Indoor/Outdoor labels preserved;
- deterministic ordering;
- no Logger/link/claim semantics introduced;
- Reporting/Library semantics tested according to the explicit contract;
- payload projections introduced by Performance Phase 2 remain decoder-compatible and small.

==================================================
WORKSTREAM B — LOCAL DAY / TIMEZONE ROLLOVER
==================================================

FOUNDER OBSERVATION

At ~12:11 AM Sep25 while traveling in Texas, Native Log “Logged Today” appeared to retain Sep24 values:
Strength 28 min, Nutrition 2,415 cal, Activity 915 active cal, Weight 175.9 lb.
This was logged as an observation, not a proven defect.

GOAL B

Define and enforce correct date/timezone semantics for:
1. daily-driver “Today” UX;
2. canonical record localDate/source timezone;
3. recurring strategic briefing timezone/window.

These are NOT automatically the same authority.

PRODUCT SEMANTICS TO PROVE / IMPLEMENT

Daily-driver “Today”:
- Home/Log/Evidence daily summaries and other explicitly “Today” UX should follow the user/device’s current local calendar day, including travel, unless a source-specific canonical record intentionally exposes its source localDate.
- An app left foregrounded across midnight must roll over automatically without force quit/navigation.
- Background across midnight then foreground must roll over.
- Device timezone change must invalidate/recompute “Today” where appropriate.
- Traveling must not rewrite/reassign historical canonical records to a new date.
- HealthKit observations keep their trustworthy source/workout timezone/localDate semantics.
- Server writes/read requests must receive/use the correct requested local date without letting transient travel timezone mutate historical records.

Strategic briefings:
- DO NOT change the deployed canonical recurring briefing timezone authority established by Midweek V3.
- Recurring strategic briefing windows remain Server-owned/stable (currently Founder coaching timezone America/Los_Angeles) and must NOT follow transient travel/device timezone.
- Monthly remains day 1 under that canonical briefing timezone.

TRACE CURRENT NATIVE DATE AUTHORITY

Audit:
- Calendar.current / TimeZone.current use;
- cached currentDate/currentDay values;
- @State/@StateObject initialization;
- scenePhase handlers;
- NotificationCenter significant-time-change/day-change/time-zone-change notifications;
- timers/midnight scheduling;
- .task(id:) keys;
- ProductionDailyDriverAPI localDate parameters;
- Home/Log/Evidence/Training/Weight/Activity/Nutrition/Priority/Morning Check-In date derivation;
- caches/snapshot keys, especially Performance Phase 2 same-day Home snapshot;
- background/foreground refresh logic;
- HealthKit query bounds;
- Server date parsing/defaults.

Pay special attention to the unreleased Performance candidate c736254b:
its same-day persisted Home snapshot MUST be invalidated/refused correctly across midnight and timezone changes. Reconcile this task with that candidate rather than regressing it.

DETERMINISTIC TEST MATRIX B

At minimum:
- foreground app crosses local midnight;
- app backgrounded before midnight, foregrounded after;
- timezone changes eastward causing immediate next-day transition;
- timezone changes westward causing apparent previous-day transition;
- timezone changes without date change;
- DST spring forward;
- DST fall back;
- server UTC date differs from device-local date;
- device local date differs from canonical briefing timezone date;
- Home snapshot from prior local day refused;
- Home snapshot created in timezone A then opened same absolute instant in timezone B where local date differs;
- Log “Today” rolls over;
- Activity/Nutrition/Weight/Training today summaries agree on intended local day;
- priorities/check-ins use intended daily-driver day;
- historical records retain original canonical localDate/timezone;
- no briefing-window/timezone regression.

Prefer injectable Clock/Calendar/TimeZone abstractions over wall-clock sleeps.

If a foreground-midnight timer/notification is needed, make it robust to:
- app suspension;
- significant time change;
- timezone change;
- manual clock change;
and always recompute from current system calendar on wake rather than incrementing a cached day blindly.

==================================================
INTEGRATION / PERFORMANCE
==================================================

Because Native Performance candidate c736254b is intended for future Build61:
- if Workstream B changes Native source, integrate/rebase/cherry-pick cleanly on top of c736254b or create an explicit combined Native candidate descended from it;
- preserve its reviewed last-known Home, acknowledge-first Priority completion, retained view models, and visible-only foreground refresh;
- add timezone rollover invalidation to those cache/retention semantics as needed.

Because production Server is afdc849a:
- Server changes must descend cleanly from afdc849a;
- preserve all performance projections/caches;
- benchmark affected Training aggregate payloads to ensure no regression toward multi-MB responses;
- no common path >3 sec; Training landing/history preferred <=1–2 sec.

VALIDATION

Server if changed:
- focused + relevant broader tests;
- production webpack build exact candidate;
- production-shaped read-model benchmark/parity;
- fresh-context adversarial review.

Native if changed:
- focused tests;
- existing iPhone 17 Pro simulator only;
- full Native suite only if executable-source scope justifies it;
- obey STANDING_DISK_SAFETY.md (>=20 GiB preferred before heavy suite);
- fresh-context adversarial review.

Run mutation checks for:
- Training aggregate duplicate suppression;
- local-day rollover invalidation;
- briefing-timezone isolation;
where practical.

PRODUCTION-SHAPED READ-ONLY ACCEPTANCE

Use read-only production data for Training controls Sep21/22/23/24 and current timezone/config state where useful.
Do not mutate records.
Do not operate Founder phone.

GITHUB

This is a new correctness lane. Publish:
1. diagnostic/contract report;
2. candidate implementation report;
3. final acceptance report
to agent-handoffs/reports/ on main.
Use a lane-specific pointer if useful. Do NOT overwrite HealthKit latest.json/latest.md or performance/latest.json.

Final report must include:
- exact Training aggregation semantics by surface;
- Sep21/22/23/24 before/after;
- local-day vs canonical-record vs briefing-timezone contract;
- deterministic timezone test matrix;
- exact Server and Native candidate SHAs;
- relationship to Performance Native c736254b;
- performance before/after or parity;
- tests/build/review;
- release order.

STOP for Founder release authorization.

NOT AUTHORIZED

No Server deployment.
No Native archive/upload/TestFlight.
No production data mutation.
No HealthKit policy/reconciliation/strategic eligibility change.
No HealthKit ingestion/classifier/isIndoorWorkout change.
No historical briefing regeneration.
No Founder-device operation.

Flags:
AUTHORITY_REVERIFIED
TRAINING_AGGREGATION_SURFACES_AUDITED
TRAINING_SESSION_SEMANTICS_EXPLICIT
SEP21_CONTROL_PASS
SEP22_DEDUP_PASS
SEP23_COUNT_THREE_PASS
SEP24_COUNT_THREE_PASS
CARDIO_ONLY_DAY_HISTORY_PASS
NO_STRENGTH_DUPLICATE_PASS
REPORTING_LIBRARY_SEMANTICS_EXPLICIT
TRAINING_PAYLOAD_PERFORMANCE_PRESERVED
LOCAL_DAY_CONTRACT_EXPLICIT
FOREGROUND_MIDNIGHT_PASS
BACKGROUND_FOREGROUND_ROLLOVER_PASS
TIMEZONE_EASTWARD_PASS
TIMEZONE_WESTWARD_PASS
DST_SPRING_PASS
DST_FALL_PASS
HISTORICAL_LOCALDATE_IMMUTABLE
BRIEFING_TIMEZONE_ISOLATED
PERFORMANCE_NATIVE_C736254B_PRESERVED
HOME_SNAPSHOT_TIMEZONE_INVALIDATION_PASS
SERVER_TESTS_PASS_OR_NOT_APPLICABLE
NATIVE_TESTS_PASS_OR_NOT_APPLICABLE
PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE
FRESH_CONTEXT_REVIEWED
HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
