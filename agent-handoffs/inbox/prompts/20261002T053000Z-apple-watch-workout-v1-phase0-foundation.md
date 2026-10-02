Apple Watch Workout V1 — Phase 0 correctness, shared authority contracts, HealthKit correlation, and design lock

TASK TYPE

Foundation implementation before Watch UI.

Do NOT build the full Watch UI yet.
Do NOT create a production TestFlight Watch release.
Do NOT add phone-independent/offline structured workout authority.
Do NOT broaden product scope.

READ FIRST

Watch audit:
agent-handoffs/reports/20261002T045500Z-apple-watch-workout-app-audit-plan.md

Build 80:
agent-handoffs/reports/20261002T043000Z-native-build80-widget-number-formatting.md

Live Activities:
agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

Standing GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

BASE

Current shipping Native authority:
Build 80
source 1783691debeea46d3e4e6b2f6e470abe032c4c74

Current production Server authority:
reverify before Server work; Watch audit used 2d967e48cb6a01e4a327934bbd81a405d3c26486.

FOUNDER LOCKED DECISIONS

1. Phone-reachable structured start for Watch V1: YES.

The Watch app does NOT need to run the structured PhysiqueOS workout independently from the phone.

The phone is the planning surface and sole structured TrainingSessionAuthority.

The Watch is a paired execution client and HealthKit workout owner.

Do not implement:
- offline structured authority lease;
- Watch mutation journal intended to become independent authority;
- distributed conflict arbiter;
- phone-independent workout creation.

If phone becomes unreachable during an active workout:
- Watch HealthKit workout may continue;
- structured set mutations fail closed until phone authority is reachable;
- no local guessing that a set was committed.

2. Phone-prepared Ready for Watch workout: YES.

Founder sets up exercises/sets/reps/load/supersets on phone.

Watch Start operates on that prepared plan.

3. Finish confirmation after final set: YES.

Never auto-finish.

4. Total Calories:
show active + basal/resting only when both are legitimately available.
Otherwise show —.
Never relabel active energy as total.

5. Workout type:
traditionalStrengthTraining + indoor for V1.

6. Platform:
watchOS 11+ aligned with current iOS 18+ generation, subject to actual Founder Watch compatibility verification.

7. VISUAL DESIGN:
The Watch app MUST use PhysiqueOS visual language, not Apple Workout colors/aesthetic.

Lock reusable Watch design tokens based on current Native PhysiqueOS:
- dark navy/near-black PhysiqueOS surfaces;
- PhysiqueOS purple primary/accent/action treatment;
- current typography hierarchy adapted for Watch;
- existing semantic success/warning/error accents where appropriate;
- HR may use an appropriate physiological accent, but the overall screen must unmistakably be PhysiqueOS;
- no Apple Workout neon green/orange visual identity;
- large controls and Watch-native ergonomics still follow Apple HIG.

Update the non-shipping Watch mockup board to these PhysiqueOS colors as part of this Phase 0, but do not implement full Watch UI.

A. EARLY-FINISH CORRECTNESS — SHIPPING BLOCKER

Fix the partial-superset relationship issue discovered by the audit.

Current correct behavior:
- only isCompleted sets are serialized;
- exercises with zero completed sets are omitted;
- Server evidence/volume/PR/history derive only from performed sets.

Current blocker:
- relationship list still includes omitted occurrence ids;
- one performed superset member + one entirely unperformed member -> Server TRAINING_SUPERSET_INVALID.

Implement one performed-session projection helper used by BOTH:
- Training commit request construction;
- durable acknowledgement/comparison logic.

Rules:
1. determine performed exercises from completed sets;
2. preserve their original occurrence ids;
3. filter every relationship member list to performed occurrence ids;
4. emit relationship only if >=2 performed members remain;
5. do not synthesize replacement sequence relationships;
6. do not renumber ids;
7. unfinished sets/exercises never enter performed evidence.

Tests:
- normal partial exercise;
- fully unperformed later exercise;
- two-member superset both partially performed;
- two-member superset only one performed -> relationship dropped, commit succeeds;
- three-member relationship two performed -> relationship retained with two;
- timed sets;
- bodyweight sets;
- zero completed sets -> rejected before network;
- replayed finish idempotent;
- Server canonical session contains no unfinished set ids/values;
- volume/PR/history/performance events contain no unfinished work.

Deploy Server only if a Server change is actually required. Prefer Native projection fix if Server validation is already correct.

B. EXPLICIT PAUSE SEMANTICS

Extend structured session authority with a real active/paused lifecycle appropriate for Watch and phone Live Activity.

Do NOT confuse:
- Resume saved/left draft;
with
- Resume paused active workout.

Design/implement deterministic pause state in TrainingSessionAuthority.

Required:
- pause command with expectedRevision + mutationId;
- resume-paused command with expectedRevision + mutationId;
- idempotent replay;
- stale revision protection;
- pauseStartedAt;
- accumulatedPausedDuration;
- active elapsed = wall time - accumulated pauses/current pause;
- Complete Set disabled/rejected while paused;
- workout remains active/not Save & Leave;
- Finish remains available while paused;
- app relaunch restores paused state.

Rest:
- Stopwatch freezes at pause;
- Countdown freezes remaining duration;
- on resume, re-anchor from frozen value;
- no timer drift from per-second persistence.

Live Activity:
- add PAUSED projection/presentation semantics;
- no Complete Set while paused;
- Resume/tap-to-open remains coherent.
Do not redesign the accepted Live Activity layout beyond what pause requires.

Do not implement Watch HealthKit pause in shipping code yet; define the shared state seam the Watch controller will invoke later.

C. PREPARED / READY-FOR-WATCH STATE

Audit current draft/session lifecycle and implement the smallest phone-side prepared-plan concept needed for Watch V1.

Founder workflow:
- prepare exercises/sets/reps/load/supersets on phone;
- make it available to Watch;
- Watch starts it.

Avoid adding a heavy new planning workflow.

Determine whether existing not-yet-started Workout Logger draft can serve as Prepared.

If yes:
- expose a deterministic projection/eligibility such as readyForWatch;
- no unnecessary new persisted phase.

If a new explicit marker is needed:
- keep it minimal;
- phone UI changes should be tiny/non-disruptive;
- do not ship a confusing unfinished Watch button before Watch target exists unless feature-gated.

Define:
- exactly one prepared candidate vs multiple;
- selection if multiple drafts exist;
- active session precedence;
- saved/left session behavior.

D. SHARED WATCH COMMAND / ACK / PROJECTION CONTRACTS

Implement pure Swift, extension/watch-safe versioned Codable types, without creating the full Watch target yet.

Commands:
- startPreparedWorkout;
- completeSet;
- pause;
- resume;
- requestFinish;
- confirmFinish;
- cancelFinish;
- refreshProjection.

Envelope:
- schemaVersion;
- command;
- sessionId where applicable;
- mutationId;
- expectedRevision;
- issuedAt;
- bounded payload.

Acknowledgement:
- mutationId;
- outcome applied/unchanged/stale/rejected;
- authoritativeRevision;
- compact authoritative projection;
- typed error/reason.

Projection:
- session id;
- revision;
- phase prepared/active/paused/finishing/committed as relevant;
- title;
- completed/planned set counts;
- previous/current/up-next rows max 2;
- exercise/set ids;
- load/reps/duration display values;
- superset/round identity;
- rest mode/anchors/frozen state;
- active elapsed anchors/pause ledger;
- finish eligibility;
- connectivity/staleness reason;
- last acknowledged mutation id.

Health metrics should be a separable optional projection section so HealthKit can populate it later without making physiology authoritative for structured state.

No per-second messages.

E. PHONE COMMAND ROUTER / REDUCER

Implement/test a phone-side router seam that accepts the pure command types and invokes TrainingSessionAuthority.

Do not implement WatchConnectivity transport yet unless a tiny protocol adapter is needed to prove contracts.

Router must:
- use existing authority;
- never create a parallel session store;
- enforce expectedRevision/mutationId;
- return authoritative projection;
- stale -> latest projection;
- duplicate -> unchanged/idempotent;
- paused -> Complete Set rejected;
- finish confirmation modeled explicitly.

This seam will later be called by WCSession.

F. HEALTHKIT EXACT CORRELATION CONTRACT

Implement the shared/native/server contract required for future PhysiqueOS-created Watch workouts to correlate exactly with structured sessions.

Do NOT create a Watch HKWorkoutSession yet.

Plan/implement:
- structured session UUID is the correlation id;
- future Watch writes it to HKMetadataKeyExternalUUID;
- Native HealthKit workout ingestion extracts a normalized physiqueOSSessionId ONLY when:
  - source bundle matches the signed PhysiqueOS Watch app identity expected by configuration;
  - External UUID parses correctly;
  - strength activity;
  - owner/time envelope checks pass.

Extend Native workout wire payload additively.

Server:
- accept optional exact PhysiqueOS session correlation;
- source validate;
- one HealthKit workout -> at most one structured session;
- one exact claim conflicts -> review/fail closed;
- attach physiology to canonical structured training event;
- linked observation must not become duplicate performed Training evidence;
- absence of exact correlation retains existing temporal candidate/Evidence Review flow.

If Watch bundle id is not yet final, version/configure the trusted source identity rather than hard-coding an unreviewed production id.

No historical backfill.
No rewrite of existing HealthKit workouts.

G. HEALTHKIT METRIC SEMANTICS CONTRACT

Define pure/shared metric semantics for later Watch implementation:
- heartRateBPM optional;
- activeEnergyKcal optional;
- basalEnergyKcal optional;
- totalEnergyKcal derived only when active + basal both available;
- elapsedActiveSeconds;
- rawHealthKitDuration optional;
- availability/acquiring state.

Tests:
- active only -> total nil;
- active+basal -> total sum;
- no HR -> acquiring/unavailable;
- pause does not corrupt structured elapsed.

H. LIVE ACTIVITY PARITY

Refactor/share projection helpers where useful so:
- Watch projection and Live Activity cannot drift on previous/current/up-next;
- max-two-row semantics remain;
- final-set semantics remain;
- superset round semantics remain;
- single-set semantics remain.

Do not over-generalize UI models.
Share pure domain projection logic, not SwiftUI views.

I. VISUAL TOKEN LOCK + MOCKUP REVISION

Audit actual current PhysiqueOS Native colors/tokens.

Create a Watch token spec:
- background;
- raised/card surface;
- primary purple;
- primary text;
- secondary text;
- success;
- warning;
- error;
- HR accent;
- disabled/stale.

Update:
agent-handoffs/artifacts/apple-watch-workout-v1/watch-workout-v1-board.svg
and rendered PNG if present/appropriate.

Keep the accepted layouts/interactions from the audit.
Only revise visual language to PhysiqueOS and any small changes required by Phase 0 semantics.

Required revised states:
- Start;
- normal set;
- final-set;
- final workout;
- metrics;
- controls;
- paused;
- Countdown;
- offline;
- stale;
- superset;
- single-set.

J. WATCH TARGET SIGNING SPIKE — NON-SHIPPING

Perform a disposable generator/signing feasibility spike if safe.

Goal:
- prove proposed watchOS target structure;
- proposed bundle id;
- companion relationship;
- HealthKit capability;
- workout-processing background mode;
- build/version parity;
- archive packaging expectations.

Do not leave a shipping Watch target in Build 80 source unless this Phase 0 explicitly reaches a reviewed foundation candidate intended for next build.

Prefer scratch branch/prototype or generator test fixtures.

Never browser-login Apple Developer.
Use existing Xcode account/signing state.
If Apple requires new manual capability/App ID interaction, report it; do not mutate production identifiers casually.

K. TESTS

Native:
- performed projection;
- early finish;
- partial supersets;
- pause/resume;
- rest freeze/re-anchor;
- relaunch paused;
- command envelopes;
- router idempotency/stale;
- projection parity;
- metric derivation;
- HealthKit correlation extraction;
- source validation.

Server if changed:
- additive contract;
- exact correlation uniqueness;
- no duplicate training evidence;
- conflict fail closed;
- legacy temporal flow unchanged.

Regression:
- TrainingSessionAuthority;
- TrainingLogger;
- Live Activity projection/coordinator/intent/view;
- PR lifecycle;
- existing HealthKit ingestion/reconciliation.

L. REVIEW

Fresh independent review:
- performed evidence correctness;
- pause timer math;
- mutation safety;
- no distributed authority;
- correlation trust boundary;
- duplicate prevention;
- Live Activity parity;
- backward compatibility.

M. DEPLOY / RELEASE BOUNDARY

This Phase 0 may:
- deploy a backward-compatible Server exact-correlation contract if required and independently safe;
- produce a Native foundation candidate.

Do NOT upload a Native Build solely for Phase 0 unless there is a Founder-visible correctness fix that needs immediate release.

The partial-superset early-finish fix is Founder-visible correctness, but prefer bundling with the first Watch internal build unless the Founder asks for immediate release.

Do NOT create a TestFlight Watch build in this task.

N. DURABLE BACKLOG

Update backlog with:
- Watch V1 locked decisions;
- phone-dependent V1 explicitly accepted;
- Phase 0 status;
- partial-superset blocker resolution status;
- next implementation phase.

O. REPORT

Publish:
agent-handoffs/reports/<timestamp>-apple-watch-workout-v1-phase0-foundation.md

Include:
- exact base/candidate;
- early-finish fix/proof;
- pause model;
- prepared-plan decision;
- shared contracts;
- router;
- HealthKit correlation;
- Server changes/deploy if any;
- Live Activity parity;
- PhysiqueOS Watch token spec + revised mockup paths;
- signing spike;
- tests/review;
- exact Phase 1A implementation plan;
- Founder decisions/blockers if any.

MANDATORY GH PROTOCOL

Before every stop:
- push implementation authority;
- publish checkpoint/final report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- give exact main report commit SHA.

END TASK.
