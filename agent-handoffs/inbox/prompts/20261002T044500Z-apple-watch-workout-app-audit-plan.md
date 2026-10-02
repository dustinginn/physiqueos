Paired Apple Watch App — architecture audit and implementation plan

TASK TYPE

Codex research/audit/product architecture/implementation plan.

Do NOT implement shipping Watch code yet.
Do NOT create a watchOS target yet.
Do NOT change production.
Do NOT alter Build 80 work.
Do NOT upload TestFlight.

READ FIRST

Build 79:
agent-handoffs/reports/20261002T040500Z-native-build79-widget-priority-skip-integration.md

Build 77 Live Activities:
agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md

Home Widget audit/implementation:
agent-handoffs/reports/20261002T011110Z-home-screen-widget-audit-plan.md
agent-handoffs/reports/20261002T023151Z-home-screen-widget-v1-implementation.md

HealthKit architecture/history:
search relevant HealthKit reports/handoffs, especially workout/cardio reconciliation and the standing separation:
HealthKit source observation -> canonical PhysiqueOS Activity/Workout record -> evidence eligibility/strategic interpretation.

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

CURRENT NATIVE AUTHORITY

Build 79 source:
a75f93df1a84c33bbe6e9cec6d648a11ec53031d

Build 80 formatting patch may be concurrently in progress. This audit must not interfere with it.

FOUNDER MUST-HAVES

The paired Watch app is intended to become the next major Native feature after Live Activities acceptance.

Must haves:

1. START PHYSIQUEOS WORKOUT LOGGER FROM WATCH
- Founder can initiate the PhysiqueOS Workout Logger from the Watch.
- It must NOT depend on Apple's automatic Watch workout syncing/detection to create the PhysiqueOS structured workout.
- Starting on Watch should create/start the same authoritative PhysiqueOS structured workout/session model used by the phone.
- No duplicate phone/watch session authorities.

2. WATCH DURING WORKOUT ~= PHONE LIVE ACTIVITY
Primary execution surface should closely match the accepted Live Activity interaction model:
- current exercise/set;
- previous/completed set where useful;
- Up Next on final-set transitions;
- load/reps;
- workout progress;
- large rest Stopwatch by default;
- Countdown/Off if the existing preference can be shared cleanly;
- Complete Set from Watch;
- max two context rows / avoid clutter;
- same final-set transition semantics as Live Activity.

A paired phone Live Activity should also run while the Watch-started workout is active, assuming the phone is reachable/able to start it.

The Watch must not become a second structured workout database.

3. DIGITAL CROWN / SECOND METRICS PAGE
Founder wants Digital Crown scrolling down to another workout page showing:
- total elapsed workout time;
- current heart rate;
- active calories;
- total calories.

Audit best watchOS interaction pattern:
- vertical scroll/Crown;
- paged TabView;
- workout metrics screen;
- system conventions.

Preserve the Founder's desired Crown-down mental model if technically appropriate.

4. FINISH
After final planned set is completed:
- clear Finish Workout button should become available/prominent.

Founder must also be able to finish at any time:
- swipe left to controls;
- Finish Workout;
- confirmation required.

5. PAUSE
- swipe left to controls;
- Pause;
- resume from same controls/state.
Audit how pause should affect:
  a. PhysiqueOS structured workout elapsed time/rest stopwatch;
  b. HKWorkoutSession;
  c. calories/HR;
  d. phone Live Activity;
  e. Logger mutation availability.

6. WATCH-OWNED APPLE HEALTH WORKOUT
Desired direction:
- Watch app starts the Apple Health strength workout when PhysiqueOS workout starts;
- Watch owns HKWorkoutSession/HKLiveWorkoutBuilder where appropriate;
- collect live HR, active calories, total calories/duration;
- finish/pause/resume Apple workout with PhysiqueOS workout;
- avoid relying on later automatic Watch syncing as the trigger for the structured Logger;
- later reconcile the resulting HealthKit workout with the structured PhysiqueOS Logger session as ONE canonical training event.

Structured PhysiqueOS Logger remains authority for:
- exercises;
- sets;
- reps;
- load;
- superset structure;
- completed-set state.

HealthKit remains authority/source observation for:
- heart rate;
- workout duration as recorded by HKWorkoutSession;
- active/total energy where supported;
- workout physiological observations.

A. CURRENT TRAINING AUTHORITY AUDIT

Map exact current:
- TrainingSessionAuthority;
- WorkoutDraft/session persistence;
- workout start;
- Complete Set mutation;
- Save & Leave;
- Finish/commit;
- Workout Review/confirmation;
- accepted_processing;
- Live Activity coordinator;
- Home Widget Start/Resume;
- Server workout commit contract;
- HealthKit strength reconciliation;
- HealthKit workout ingestion/review.

Identify what can be shared with watchOS and what is app-process-only today.

B. CRITICAL EARLY-FINISH SEMANTICS

Founder asks:

If a workout is finished before all planned sets are complete, does PhysiqueOS record ONLY the sets actually completed?

Do not assume.

Audit exact current code/tests/Server payload.

Prove:
- completed sets included;
- uncompleted planned sets excluded from performed evidence;
- skipped/not-reached exercises/sets behavior;
- partially completed exercise;
- partially completed superset;
- timed/bodyweight variants;
- PR calculations;
- session volume;
- performance records;
- Exercise Detail/history;
- HealthKit reconciliation;
- Workout Review display.

If current behavior does NOT satisfy this, identify it as a correctness blocker before Watch Finish-anytime ships.

Add deterministic test matrix to the plan.

C. WATCH ↔ PHONE AUTHORITY MODEL

Evaluate architectures.

Preferred principle:
one logical TrainingSessionAuthority, multiple execution clients.

Audit options:
1. Phone remains sole authority; Watch sends commands via WatchConnectivity.
2. Shared replicated session state with phone as conflict arbiter.
3. Watch can temporarily own an active session offline, with deterministic reconciliation.
4. Server-mediated session authority.
5. hybrid.

Founder requirement "start from Watch without requiring watch syncing" means:
- do not depend on HealthKit workout synchronization;
- clarify whether phone must be nearby/reachable for V1;
- distinguish Apple WatchConnectivity from Apple Health syncing.

Recommend:
- V1 online/paired behavior;
- later offline behavior if worthwhile.

Avoid distributed-authority complexity unless required.

D. START FROM WATCH

Design exact states:

No PhysiqueOS workout:
- open Watch app;
- Start Workout;
- what workout template/session is selected?
- does Watch show today's planned workout?
- does it ask for Training Day/template?
- does it open/start a blank Logger?
- how are exercises/reps/load populated?

Founder commonly prepares sets/reps/load based on previous performance.

Audit whether Watch can use:
- most recent planned Logger/template;
- today's workout;
- phone-prepared draft;
- Server canonical Training Library/history.

Recommend minimal V1 that makes Watch start genuinely useful without recreating the entire phone planning UI.

When Watch starts:
- create authoritative PhysiqueOS session exactly once;
- start HKWorkoutSession;
- start phone Live Activity if phone reachable;
- phone Home Widget becomes Resume;
- phone Logger can open same session.

E. COMMAND PROTOCOL

Design versioned WatchConnectivity messages for:
- start;
- complete set;
- pause;
- resume;
- finish request;
- cancel if needed;
- state refresh;
- preference change if supported.

Every mutation:
- mutation id;
- expected revision;
- session id;
- idempotency;
- stale response;
- acknowledgement;
- retry;
- out-of-order delivery protection.

Use the same conceptual safety as CompleteWorkoutSetIntent.

F. STATE PROJECTION

Define a compact watch-safe projection:
- session id/revision;
- workout name;
- elapsed time;
- completed/total sets;
- previous/completed row;
- current row;
- Up Next;
- rest mode/start time/duration;
- exercise/set identity;
- load/reps display;
- paused state;
- finish eligibility;
- HealthKit metrics;
- connectivity/staleness.

No entire draft database copied if unnecessary.

G. LIVE ACTIVITY COEXISTENCE

Design behavior when Watch starts/controls the workout.

Phone Live Activity:
- should appear automatically if phone reachable and app/background execution allows;
- uses same session authority/projection;
- Watch Complete Set updates phone Logger + Live Activity;
- phone Complete Set updates Watch;
- rest Stopwatch stays aligned from an absolute authoritative timestamp, not independent timers.

If phone is unreachable:
- define V1 behavior honestly.
- do not promise a Live Activity can be remotely created if iOS does not permit it.

H. WATCH HEALTHKIT WORKOUT

Audit current watchOS HealthKit APIs for actual deployment target.

Plan:
- HKWorkoutSession;
- HKLiveWorkoutBuilder;
- activity type traditionalStrengthTraining or appropriate current type;
- location indoor;
- HR collection;
- active energy;
- total energy semantics;
- elapsed time;
- pause/resume;
- endCollection/finishWorkout;
- authorization;
- background runtime;
- recovery after app interruption;
- workout event metadata if useful.

Clarify:
- what Apple provides directly for total calories vs what must be derived;
- which values are live/reliable;
- what happens if HR unavailable;
- whether iPhone can simultaneously start another workout (avoid);
- interaction with existing HealthKit automatic workout ingestion.

I. RECONCILIATION / DUPLICATE PREVENTION

Watch-owned HK workout will later appear in HealthKit ingestion.

Design deterministic reconciliation with the structured PhysiqueOS Logger session:
- attach stable correlation metadata to HKWorkout if Apple APIs allow;
- time overlap;
- device/source;
- session UUID metadata;
- server/native matching;
- standard Evidence Review exception currently used for Apple Health strength vs structured Logger.

Goal:
ONE canonical training event, with:
structured sets/reps/load + physiological HealthKit metrics.

No duplicate Training evidence.

J. WATCH UI / UX

Create non-shipping mockups.

Required states:

1. Pre-workout / Start.
2. Normal set:
   Previous
   Current
   large Stopwatch
   Complete Set.
3. Final set:
   Current
   Up Next exercise
   large Stopwatch
   Complete Set.
4. After final exercise/set:
   Completed
   Finish Workout prominent.
5. Metrics page reached by Crown/vertical scroll:
   elapsed;
   HR;
   active calories;
   total calories.
6. Swipe-left controls:
   Pause;
   Finish;
   confirmation.
7. Paused state.
8. Countdown mode.
9. Offline/unreachable phone state.
10. Stale/conflict state.
11. Superset round.
12. Single-set exercise.

Use Apple Watch dimensions and current watchOS conventions.
Do not merely shrink the iPhone Lock Screen mockup.

K. DIGITAL CROWN

Audit whether a vertical ScrollView is best for:
execution page -> metrics page.

Consider accidental scroll during exercise and whether paging/snap behavior improves usability.

Founder wants Crown-down to metrics. Preserve this unless platform convention strongly argues otherwise.

L. FINISH / PAUSE SEMANTICS

Finish:
- confirmation when invoked manually/swipe-left;
- after final set, a clear direct Finish button may still confirm if data-loss risk exists;
- never auto-finish merely because final set completed unless Founder later asks;
- commit only completed sets;
- end HK workout;
- stop Live Activity through existing saved/ended lifecycle;
- transition phone/Watch to completed/review state.

Pause:
- define whether set mutations disabled;
- rest stopwatch behavior;
- HKWorkoutSession pause;
- elapsed active vs wall-clock duration;
- phone Live Activity paused presentation.

M. EDITING BOUNDARY

Founder currently expects:
- Watch primarily execution;
- phone handles load/reps modifications if needed.

Audit whether Watch V1 should allow:
- no edits;
- reps +/- only;
- load +/-;
- previous-set correction.

Recommendation should prioritize low-error workout execution.

N. PHONE UNAVAILABLE / OFFLINE

Explicitly decide V1.

Questions:
- Can Watch start a structured PhysiqueOS workout if phone is unreachable?
- If yes, where is authoritative draft persisted?
- How does it reconcile?
- If no, what does Watch show?

Do not conflate "does not require HealthKit syncing" with "phone-independent."

Recommend whether offline Watch authority belongs in V1 or later.

O. NOTIFICATIONS / HAPTICS / ALWAYS-ON

Plan:
- haptic on Complete Set;
- rest threshold/countdown haptic if Countdown;
- final-set/final-workout cue;
- pause/resume;
- error/stale mutation;
- Always-On Display/privacy;
- wrist-down reduced-luminance state.

P. BATTERY / PERFORMANCE

Assess:
- HKWorkoutSession expected runtime benefits;
- WatchConnectivity traffic;
- projection update frequency;
- HR/energy UI update cadence;
- timers from timestamps rather than high-frequency messaging;
- phone Live Activity updates;
- battery implications for 60–120 minute workouts.

Q. PROJECT / SIGNING

Plan exact Xcode project changes:
- watchOS app target;
- Watch app bundle id;
- Watch HealthKit entitlements;
- App Groups if useful/appropriate;
- WatchConnectivity;
- shared Swift package/source membership;
- signing/profiles;
- generator changes;
- release verifier;
- version/build parity;
- TestFlight packaging.

No implementation in this task.

R. TEST PLAN

Design deterministic tests:
- Watch command idempotency;
- stale revision;
- simultaneous Watch/phone Complete Set;
- offline/reconnect;
- pause/resume;
- finish-anytime;
- early finish commits only completed sets;
- partial exercise;
- partial superset;
- final-set transition;
- rest stopwatch alignment;
- HealthKit workout start/pause/resume/end;
- reconciliation no duplicate;
- Live Activity projection parity;
- Watch state projection;
- connectivity loss;
- app relaunch;
- Watch relaunch;
- phone process killed;
- workout >1h;
- DST/timezone irrelevant to elapsed timers;
- privacy/Always-On.

S. PHASED PLAN

Recommend phases.

Likely:
Phase 0:
- lock authority/protocol;
- prove early-finish semantics;
- Watch target/signing/HealthKit spike.

Phase 1:
- paired/reachable phone required;
- Start from Watch;
- same structured session;
- Complete Set;
- Stopwatch;
- Live Activity parity;
- metrics;
- pause/resume;
- finish;
- Watch-owned HK workout;
- deterministic reconciliation.

Phase 1B:
- limited edits if real usage demands.

Phase 2:
- phone-independent/offline Watch session authority only if worthwhile.

Do not assume this phasing if audit shows a better architecture.

T. OTHER IDEAS

Founder is open to additional ideas.

Recommend only high-value Watch-native additions, such as:
- rest-end haptic;
- next exercise cue;
- heart-rate zone glance if useful;
- quick RPE after final set;
- complication/widget launcher;
- auto-open workout app during active session;
but clearly separate MUST-HAVE from OPTIONAL.

Avoid feature bloat.

U. REPORT

Publish:
agent-handoffs/reports/<timestamp>-apple-watch-workout-app-audit-plan.md

Include:
- current authority audit;
- explicit answer/proof for early-finish completed-set semantics;
- recommended Watch/phone authority;
- start flow;
- command/state protocol;
- HealthKit workout ownership;
- reconciliation;
- Live Activity coexistence;
- UI mockups;
- pause/finish semantics;
- offline V1 decision;
- project/signing;
- tests;
- phased implementation;
- risks;
- Founder decisions needed.

Publish mockups/artifacts under:
agent-handoffs/artifacts/apple-watch-workout-v1/
or docs/apple-watch-workout-audit/

MANDATORY GH PROTOCOL

Before stopping:
- publish report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read report from main;
- give Founder exact main report commit SHA.

END TASK.
