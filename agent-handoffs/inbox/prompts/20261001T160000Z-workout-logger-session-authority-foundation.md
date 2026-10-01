Workout Logger Live Activities — Phase 0 architectural foundation: app-scoped TrainingSessionAuthority

READ FIRST

Discovery report:
agent-handoffs/reports/20261001T055845Z-workout-logger-live-activities-discovery-plan.md

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

FOUNDER PRODUCT DECISIONS

Founder wants Live Activity interaction to be architecturally correct from Day 1 rather than shipping a temporary read-only authority model.

Phase 1 Live Activity direction, for later UI implementation:
- Complete Set should be possible from the Live Activity / supported Lock Screen interactive surface.
- Previous completed set + current set are the primary set context.
- Maximum roughly two set/context rows; do not build a miniature Workout Logger.
- On the final set of an exercise, show useful next-exercise context rather than cramming three set rows.
- Completing the final set should naturally advance context to the next exercise.
- Direct rep/load editing from the Live Activity is NOT required for initial implementation; deep-linking to the active Logger is acceptable.
- Founder wants to SEE a mockup before Live Activity UI is finalized.

REST PRODUCT DECISION

Rest tracking is a Day-1 concept.

Rest Mode must support:
1. Stopwatch
2. Countdown
3. Off

Founder personally expects Stopwatch to be useful/default for their workflow, but do not hard-code a global product default without a deliberate preference/default decision.

Behavior:
- completing a set automatically starts/restarts rest tracking when Rest Mode is Stopwatch or Countdown;
- Stopwatch starts at 0:00 and counts upward from an absolute startedAt;
- Countdown starts from configured duration and counts toward zero using absolute endsAt;
- Countdown reaching zero does NOT automatically advance or complete a set;
- Off creates no rest state;
- completing the next set ends/replaces the prior rest state and starts the next rest interval according to mode;
- manual rest controls can be added later where useful.

Use absolute timestamps so future ActivityKit rendering does not require per-second app updates.

TASK TYPE

ARCHITECTURE FIRST.

Implement and prove the app-scoped active workout authority required for safe future LiveActivityIntent mutations.

Do NOT implement:
- Widget Extension;
- ActivityKit UI;
- Dynamic Island;
- Lock Screen Live Activity;
- LiveActivityIntent;
- TestFlight Live Activity;
- Server changes;
- push/APNs.

A separate task will create visual mockups after this authority is accepted.

CURRENT BASE

Reverify latest accepted Native authority before coding.

Sleep Build 76 may be in flight concurrently.
Do not collide with or regress Sleep work.

The Live Activities discovery identified Xcode generator drift, but the Sleep Build 75 integration report states it was fixed at 249e155f/77681cd7. Reverify current generator authority before any project regeneration. This task should not need a new target.

A. CURRENT PROBLEM

Today:
- persisted TrainingLoggerDraft in TrainingLoggerDraftStore is durable authority;
- TrainingLoggerViewModel is screen-scoped and holds its own mutable in-memory draft;
- future LiveActivityIntent would run in the app process and could mutate persistence beneath a stale view model;
- this creates a lost-update/race risk.

Fix this before Live Activity interaction exists.

B. TRAINING SESSION AUTHORITY

Design and implement an app-scoped, MainActor-safe TrainingSessionAuthority or equivalent.

Responsibilities:
- own the current authoritative mutable draft for active live workout session(s);
- load/reconcile durable TrainingLoggerDraftStore state;
- expose observable state to TrainingLoggerViewModel/UI;
- serialize mutations;
- persist each accepted mutation through the existing draft store;
- preserve existing local-first behavior;
- preserve existing Server commit boundary at Finish;
- preserve Sandbox/Founder Production authority separation;
- preserve multiple draft/history semantics while clearly identifying the active live session;
- recover correctly after app relaunch;
- handle authority/environment switch;
- provide a single mutation API usable later by LiveActivityIntent.

Do not make ActivityKit authoritative.

C. MUTATION API

Define explicit idempotent domain operations rather than arbitrary draft replacement where possible.

At minimum support operations equivalent to current Logger behavior:
- update exercise/set fields;
- mark set complete;
- mark set incomplete if current UI supports it;
- add/remove/reorder where current product permits;
- add exercise;
- change variant;
- Save & Leave;
- Resume;
- Finish/submit transition;
- Cancel/discard.

For future Live Activity:
add a narrowly scoped operation:
completeSet(sessionId, exerciseId, setId, expectedVersion or mutationId)
or equivalent.

Requirements:
- idempotent;
- stale intent cannot complete the wrong set;
- session identity validated;
- set identity validated;
- already-completed operation is safe;
- version/conflict semantics explicit;
- no lost updates between UI and future intents.

D. VERSION / CONCURRENCY

Add the minimum draft/session revision mechanism required for deterministic concurrency.

Options may include:
- monotonic local revision;
- mutation id ledger/bounded idempotency keys;
- actor serialization.

Choose the smallest robust design.

Test:
- UI mutation followed by intent-style mutation;
- intent-style mutation followed by UI mutation;
- duplicate complete-set mutation;
- stale revision;
- two rapid set completions;
- relaunch between mutation and UI observation;
- persistence failure.

E. PER-SET completedAt

Founder accepts adding optional per-set completion timestamp.

Add:
completedAt

Semantics:
- set exactly when a set transitions incomplete -> complete;
- preserve existing timestamp if duplicate completion arrives;
- clear or appropriately record behavior if set is intentionally marked incomplete;
- no backfill fabrication for old drafts/sessions;
- additive/optional schema evolution;
- Server commit contract should ignore or safely accept it according to current training contract; do not change Server without need.

Determine whether completedAt belongs in canonical committed training evidence later. For this architecture task, prioritize active-session correctness and preserve backward compatibility.

F. REST STATE

Add a canonical active-session rest state owned by TrainingSessionAuthority, not by UI or future Live Activity.

Model should support:
mode: stopwatch | countdown | off
startedAt
endsAt for countdown
durationSeconds/config where needed
sourceSetId / sourceExerciseId
id/version if useful for idempotent controls

Semantics:
- complete set automatically starts/restarts rest if mode != off;
- stopwatch uses startedAt only;
- countdown uses startedAt + configured duration/endsAt;
- countdown expiry does not mutate workout progression;
- next completion replaces prior rest;
- Save & Leave / Finish / Cancel behavior explicitly defined;
- relaunch restores meaningful rest state;
- stale/expired countdown behavior defined;
- no per-second persistence.

G. REST PREFERENCES

Design the preference boundary but keep scope disciplined.

Need to support future user choice:
- Stopwatch
- Countdown
- Off
- Countdown duration when countdown selected.

Determine best storage level:
- global default;
- session override;
- exercise-level future extension.

Recommended architecture should allow later per-exercise override without schema break.

If a UI preference editor is not necessary for architectural proof, implement the model/default injection and leave user-facing settings for the Live Activity/Logger UI task.

Do not silently choose a product-wide default if avoidable. Tests may use Stopwatch.

H. VIEW MODEL MIGRATION

Migrate TrainingLoggerViewModel from owning a disconnected mutable copy to observing/commanding TrainingSessionAuthority.

Preserve existing public UI behavior.

Avoid a giant rewrite of the Logger view.

The ViewModel may remain as presentation adapter, but authoritative mutations must flow through the authority.

Prove:
- existing Logger editing behaves identically;
- screen dismissal/reopen sees current authority state;
- future background intent-style mutation is reflected immediately when UI is active/resumes;
- no duplicate persistence.

I. SERVER / FINISH BOUNDARY

Preserve current:
- commitTrainingSession idempotency;
- accepted-processing/result-unknown recovery;
- Evidence Review handoff;
- draft cleanup after durable finish;
- attachment behavior;
- Server authority after durable commit.

Do not change training Server semantics merely for Live Activities.

J. LIVE ACTIVITY PROJECTION CONTRACT — NO UI

Create or specify a pure projection from TrainingSessionAuthority state suitable for future ActivityKit.

No ActivityKit import required yet if separation is cleaner.

Projection should be able to produce:
- session id/label;
- startedAt;
- phase;
- previous completed set;
- current set;
- current exercise;
- whether current is final set of exercise;
- next exercise / first set context when appropriate;
- progress;
- rest mode;
- rest startedAt;
- rest endsAt for countdown;
- completion state.

Maximum presentation concept later:
normally Previous + Current.
If final set context makes Next Exercise more useful, expose enough state for UI to choose without recomputing workout semantics in the extension.

Do not encode full workout history.

K. STOPWATCH / COUNTDOWN TESTABILITY

Use absolute dates.

Future system rendering:
- Stopwatch: current time - rest.startedAt
- Countdown: rest.endsAt - current time

No timers firing every second in authority.

Unit tests must use injected clock.

L. TESTS

Run existing Training Logger suite plus new adversarial tests.

At minimum:
- load/recovery;
- active session selection;
- every current Logger mutation path;
- persistence ordering;
- persistence failure;
- concurrent UI/intent-style mutations;
- duplicate mutation id;
- stale version;
- completedAt set/preserve/clear semantics;
- Stopwatch auto-start;
- Countdown auto-start;
- Off;
- next set completion replaces rest;
- expired countdown;
- relaunch during stopwatch;
- relaunch during countdown;
- Save & Leave;
- Resume;
- Finish;
- Cancel;
- accepted-processing;
- result-unknown;
- multiple drafts;
- authority switch;
- pure Live Activity projection:
  - reps/load;
  - bodyweight;
  - timed;
  - superset;
  - final set -> next exercise;
  - workout complete;
  - rest stopwatch/countdown/off.

Full Native unit suite if feasible.
Release compile.
Fresh independent review with special focus on concurrency/lost updates and Server commit parity.

M. PERFORMANCE

No regression to Workout Logger interaction latency.

Measure or deterministically ensure:
- mutation remains local-first;
- persistence does not add network dependency;
- authority observation doesn't trigger broad reloads;
- set-complete feedback remains immediate.

N. NO TESTFLIGHT UNLESS NEEDED

This is architectural foundation and should not change visible product behavior except any intentionally added Logger rest UI if separately justified.

Prefer no TestFlight upload for this task.

Publish candidate code and report for review.

O. NEXT TASK HANDOFF

After authority acceptance, prepare a separate handoff for:
Workout Logger Live Activity visual mockup/prototype.

That task should use the accepted authority projection and produce screenshots before shipping UI.

Mockup should explore:
- Lock Screen;
- Dynamic Island compact/minimal/expanded;
- Previous + Current;
- final-set + Up Next behavior;
- Stopwatch dominant rest state;
- Countdown variant;
- Complete Set button;
- tap-to-open Logger;
- maximum two set/context rows;
- privacy/redacted state.

Do not implement shipping ActivityKit in this task.

P. REPORT

Publish:
agent-handoffs/reports/<timestamp>-workout-logger-session-authority-foundation.md

Include:
- exact base/candidate SHA;
- old vs new authority map;
- concurrency/idempotency design;
- completedAt semantics;
- rest model;
- Stopwatch/Countdown/Off behavior;
- ViewModel migration;
- Server finish parity;
- future Live Activity projection;
- tests/performance/review;
- any migration/backward-compat concerns;
- whether ready for visual mockup;
- exact next prompt recommendation.

Publish GH before every stop.

END TASK.
