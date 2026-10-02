# Apple Watch Workout app — architecture/product audit and implementation plan

- Task id: `apple-watch-workout-app-audit-plan-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T044500Z-apple-watch-workout-app-audit-plan.md`
- Generated (UTC): `2026-10-02T04:48:46Z`
- Agent: Codex
- Status: **complete — audit and plan only; no shipping Watch code, production mutation, TestFlight upload, or Build 79/80 change**
- Current shipping Native authority at publication: `1783691debeea46d3e4e6b2f6e470abe032c4c74` (Build 80)
- Audited training authority: `a75f93df1a84c33bbe6e9cec6d648a11ec53031d` (Build 79); the Build 80 delta was inspected and changes only Home widget formatting/tests/artifacts, project generation metadata and the build number, not the training/HealthKit authority paths audited here
- Audited Server authority: `2d967e48cb6a01e4a327934bbd81a405d3c26486`
- Main base at audit start: `a8ef512a5f5f467750273921167613fb46fd69ab`; publication rebased onto `7415b96fc4df2148508c90a3ff4727d17ead9c37`
- Product mockups: `agent-handoffs/artifacts/apple-watch-workout-v1/watch-workout-v1-board.svg`

## Executive verdict

Build a real watchOS companion, but do **not** make it a second structured workout authority in V1.

The correct V1 has three clear owners:

1. **iPhone `TrainingSessionAuthority` owns the structured PhysiqueOS session** — exercise order, planned/performed sets, reps, load, rest configuration, revision, idempotency ledger and the durable Server commit.
2. **Apple Watch owns the HealthKit workout lifecycle** — `HKWorkoutSession` + `HKLiveWorkoutBuilder`, live heart rate, active energy and workout duration.
3. **Server becomes the durable canonical training authority only after accepted commit** and deterministically folds the Watch HealthKit observation into that same training event.

Watch is a command client plus revisioned projection cache. It can start the structured logger directly without waiting for Apple Health synchronization, but V1 should require the paired phone to be reachable for a new structured start. Once started, loss of reachability must not terminate the Watch HealthKit workout; structured mutations fail closed until authority is reachable again.

The current early-finish implementation mostly has the correct evidence boundary: Native serializes only sets with `isCompleted == true`, omits exercises with no completed sets, and Server derives volume, PRs, history and performance events only from the received canonical sets. There is, however, one correctness/functionality blocker:

> **A partially completed superset where one member has zero completed sets cannot be finished today.** Native drops the unperformed exercise but sends the original relationship unchanged; Server rejects the dangling member with `TRAINING_SUPERSET_INVALID`. The rejection is atomic, so unfinished work does not pollute evidence, but the Founder cannot reliably finish early. Fix and regression-test this before Watch implementation can ship.

## Founder must-haves versus optional ideas

### V1 must-haves

- Start a phone-prepared structured PhysiqueOS workout from Watch without depending on HealthKit import/synchronization.
- One authoritative session and exactly-once `Complete Set` semantics across Watch, phone and Live Activity.
- Execution surface with previous/current/up-next context, load/reps or duration, plan progress, large rest Stopwatch/Countdown and one dominant `Complete Set` action.
- Crown/vertical navigation to elapsed active workout time, current heart rate, active calories and correctly defined total calories or an unavailable state.
- Swipe-left controls with Pause/Resume and Finish. Manual Finish always confirms. Completing the final planned set reveals a prominent Finish action but never auto-finishes.
- Watch-owned strength workout, live HealthKit collection, recovery after Watch process loss, and deterministic one-to-one reconciliation with the structured session.
- Phone Live Activity derived from the same structured projection and revision, including paused, stale and finish states.
- Offline/stale UX that never guesses whether a set was committed.
- Early-finish relationship fix plus partial-exercise and partial-superset regression coverage.
- Generator-owned watchOS target, capabilities/signing checks, archive inspection and real-device battery/behavior acceptance.

### Explicitly optional after V1

- Creating or materially editing a workout plan on Watch.
- Load/reps editing on Watch. V1 displays and confirms the phone-prepared values; edits stay on phone.
- Starting a structured session with the phone unreachable. This requires a durable Watch authority lease, encrypted plan snapshot and a conflict arbiter; it is not a small “offline mode.”
- Recent-workout clone, templates, exercise substitution, auto-detected reps, voice entry, complications, Smart Stack controls, double-tap gestures, coaching, zones, media controls and per-set HealthKit workout activities.
- Functional-strength-training selection. Use traditional strength for V1 unless product evidence supports a user choice.

## Current-state audit

### Structured session authority

`TrainingSessionAuthority.swift` is an app-process-scoped `@MainActor @Observable` authority with a local `UserDefaults` draft store, monotonic revision, mutation-id ledger and expected-revision validation. It serializes mutations and already supplies the right conceptual foundation for Watch commands and Live Activity intent mutations. It is not cross-device state and must not be treated as such.

Current phase transitions cover start/resume, save-and-leave, finishing and terminal end. There is no workout pause phase. “Resume” today means restoring a saved draft, not resuming an active-but-paused workout. Rest state uses absolute timestamps and will continue to elapse unless pause semantics explicitly freeze and re-anchor it.

`TrainingLoggerViewModel` stamps `startedAt` when the session starts, permits review after at least one completed set, validates only completed sets for commit, requires a finish confirmation on phone, marks the authority finishing, commits, recovers accepted-processing responses, and ends the session only after durable acknowledgement.

### Live Activity

The shipping Live Activity is already a structured-session projection: it observes the phone authority, carries revisioned current/up-next set identity, runs display timers from timestamp anchors, and uses a mutation id plus expected revision for `Complete Set`. That model should be shared, not independently reimplemented on Watch.

Watch commands must mutate the phone authority. The resulting authoritative revision updates both the Watch acknowledgement/projection and phone Live Activity. The Watch never sends a second command “to the Live Activity.”

### HealthKit today

The phone imports workouts as physiological observations and currently maps workout UUID, duration, active calories, distance and average heart rate. `totalCalories` is always `nil`. `HKExternalUUID` is allowlisted internally, but the Native workout wire payload does not preserve a trusted PhysiqueOS structured-session correlation key.

HealthKit and Logger strength records are currently reconciled through candidate links/review rather than a source-owned exact key. That historical safety policy is right for arbitrary Apple Health imports, but PhysiqueOS-created Watch workouts can carry a deterministic identifier and use a higher-confidence path.

### Project/signing baseline

Build 80 is iOS 18+, generated by `ios/Scripts/generate_project.py`, with one iOS app and one combined Live Activity/Home widget extension. Its training authority is unchanged from the audited Build 79 source. The app has HealthKit, HealthKit background delivery and the shared App Group; the extension has only the App Group. Xcode 27.0 and watchOS 27.0 SDK are installed, but there is no compatible watchOS target in the scheme.

The Xcode generator is authoritative. Hand-editing the project is not an acceptable implementation path.

## Early-finish proof

### Code-path proof

The Native commit boundary in `ios/PhysiqueOS/Networking/TrainingWriteAPI.swift` is explicit:

- line 106 maps exercises with `compactMap`;
- line 107 filters sets with `exercise.sets.filter(\.isCompleted)`;
- an exercise with zero completed sets is omitted;
- only the filtered sets are encoded;
- finishing with zero performed exercises is rejected;
- line 140 separately maps every draft relationship without filtering its member ids.

The Server command port constructs canonical exercise occurrences only from the received exercises/sets, requires every occurrence to have at least one performed set, and validates every superset member against those received occurrence ids. A missing member produces `TRAINING_SUPERSET_INVALID` before persistence.

After commit, performance reconciliation reads the canonical session’s received sets. Training performance volume and record derivation iterate those stored sets, and training history/navigation read models consume the canonical evidence/performance events. There is no later path that rehydrates unperformed planned sets. A linked HealthKit workout augments physiology and presentation; it does not replace structured set evidence.

### Executable proof matrix

| Scenario | Observed/proven result | Verdict |
|---|---|---|
| One completed set + one unfinished planned set in one exercise | Instrumented Build 79 Native test asserted the commit payload contains one exercise and exactly the completed set; focused test passed on the iPhone 17 Pro simulator. | Correct |
| Entire later exercise unfinished | Native `compactMap` omits the exercise; Server cannot derive evidence for an occurrence it never receives. | Correct; add named regression test |
| Partial exercise: some sets done, later sets unfinished | Same payload filter includes only completed set ids. Server volume/history/PR inputs contain only those sets. | Correct; retain direct payload assertion |
| Partial superset: each member has ≥1 completed set, later sets unfinished | Audit-only Server test committed both occurrences with one performed set each and preserved their relationship. | Correct |
| Partial superset: member A has completed work, member B has zero completed sets | Audit-only Server test proved the dangling relationship is rejected atomically with `TRAINING_SUPERSET_INVALID`; no evidence snapshot changed. | **Blocker: finish fails, but no pollution** |
| Duplicate/retried finish | Existing Native request identity and Server idempotency protect the durable commit. | Correct foundation |

Audit-only tests were applied temporarily and removed after execution; shipping source is clean. Test results:

- `vitest.phase4`: `CanonicalPersistenceCommandPorts.test.js` — **55/55 passed**, including the two temporary partial-superset cases.
- Focused Build 79 Native test with added direct payload assertions — **passed** via `xcodebuild test-without-building` after a successful instrumented build; the test asserted only `set-1` reached the payload.
- An initial destination-by-name attempt found no exact “latest” simulator, and one immediate rerun hit a transient simulator preflight-busy error. Selecting and booting simulator `A8157897-95ED-4480-9150-6136652A6519` resolved it.

### Required blocker fix

Build the performed exercise set first, then transform relationships against it:

1. Preserve original occurrence ids for performed exercises.
2. For every relationship, keep only member ids present in the performed occurrence-id set.
3. Emit the relationship only when at least two performed members remain.
4. Never synthesize a normal sequence relationship or renumber ids.
5. Reuse the same performed-projection helper for request construction and durable-ack comparison so the two cannot drift.

Required tests:

- partial normal exercise;
- fully unperformed later exercise;
- two-member superset with both partially performed;
- two-member superset with only one performed member (relationship dropped, commit succeeds);
- three-member group with two performed members (relationship retained with two);
- timed and bodyweight sets;
- finish with zero completed sets rejected before network;
- replayed finish produces one canonical session/performance reconciliation;
- history, volume and PR assertions show no unfinished set ids or values.

This is a release gate, not a polish item.

## Recommended authority and lifecycle

### Session lifecycle

Introduce explicit structured phases:

`prepared → starting → active ↔ paused → finishing → committed`

Exceptional recoverable states are `linkLost`, `staleProjection`, `healthEndingPending`, and `commitPending`. `abandoned` is a distinct user action, not a synonym for finish.

A prepared draft has plan identity and values but no `startedAt`. The Founder prepares/selects it on phone and marks it “Ready for Watch.” Watch Start performs one phone-authoritative transaction that stamps `startedAt`, allocates the structured session id/revision and returns the first projection. The Watch then starts the HealthKit workout with the same session id as external metadata. If HealthKit start fails, structured start must roll back or enter an explicit recoverable starting failure; do not silently run only one half.

If an active session already exists, the Watch Start surface becomes Resume Workout. If no prepared plan exists, Watch says “Prepare a workout on iPhone.” This is substantially safer and smaller than rebuilding plan creation on a 45 mm screen.

### Authority invariant

For every logical session id:

- only the phone authority may accept a structured mutation in V1;
- every accepted mutation increments one revision or returns unchanged for a replayed mutation id;
- Watch and Live Activity are projections tagged with that revision;
- HealthKit workout identity is correlated but never grants authority over set evidence;
- Server produces at most one canonical structured training event for the id.

If phone and Watch disagree, phone revision wins. If Watch presents an older expected revision, the mutation is not guessed or rebased; the phone returns `stale` plus the latest projection. This may require one deliberate tap again, but never produces an accidental duplicate set.

## WatchConnectivity protocol

Use `WCSession.sendMessage` for interactive structured commands and acknowledgements. Use `updateApplicationContext` for the latest projection because newer context should replace older context. Do **not** use queued `transferUserInfo` as an ordered mutation log; delayed, out-of-order completion events are unsafe. Apple documents these transfer modes and their delivery semantics in [Transferring data with Watch Connectivity](https://developer.apple.com/documentation/WatchConnectivity/transferring-data-with-watch-connectivity).

Command envelope:

```json
{
  "schemaVersion": 1,
  "command": "completeSet",
  "sessionId": "uuid",
  "mutationId": "uuid",
  "expectedRevision": 23,
  "issuedAt": "2026-10-02T04:48:46Z",
  "payload": {
    "exerciseOccurrenceId": "occ-4",
    "setId": "set-3",
    "load": 190,
    "reps": 8,
    "unit": "lb"
  }
}
```

Acknowledgement:

```json
{
  "schemaVersion": 1,
  "mutationId": "uuid",
  "outcome": "applied",
  "authoritativeRevision": 24,
  "projection": {},
  "error": null
}
```

Outcomes are `applied`, `unchanged`, `stale` and `rejected`. A retry uses the **same mutation id**. Watch allows one structured mutation in flight; it disables the primary action while awaiting acknowledgement. A timeout shows pending and retries with the same id. It never advances locally as though accepted.

Commands: `startPreparedWorkout`, `completeSet`, `pause`, `resume`, `requestFinish`, `confirmFinish`, `cancelFinish`, and `refreshProjection`. Finish should also have a durable `finishOperationId` so HealthKit end and Server commit can be resumed independently.

Projection fields should be compact and versioned: identity/revision/phase, workout title, performed/planned counts, previous/current/up-next set display data, occurrence/set ids, superset label/round, rest anchor and mode, active elapsed clock anchors, pause ledger, finish eligibility, Health metrics and availability, projection timestamp, reachability/staleness reason, and the last acknowledged mutation id.

No per-second messages. Both devices render elapsed/rest clocks from timestamp anchors. Send semantic state changes and coalesced metric snapshots only.

## Pause, timer and finish semantics

### Pause

One phone-authoritative pause command should:

- transition the structured session to `paused`;
- record `pauseStartedAt` and later accumulate paused duration;
- freeze rest at its remaining duration, not let an absolute `endsAt` expire behind the overlay;
- disable Complete Set and structured edits;
- call `HKWorkoutSession.pause()` on Watch;
- render PAUSED on Watch and phone Live Activity;
- keep Resume and Finish available.

On resume, re-anchor rest from the frozen remainder, resume HealthKit, and derive active elapsed time as wall time minus accumulated pauses. HealthKit’s builder elapsed value can include paused intervals; preserve raw HealthKit duration, but use the structured active clock for the Founder-facing execution timer.

### Rest timer

Keep Stopwatch as the normal large treatment because that is the accepted phone model. If a duration preference exists, Countdown uses one authority-created end anchor. Countdown haptics at 10, 5 and 0 seconds are local derivations of that anchor; do not transmit countdown ticks.

### Finish saga

Finish never happens automatically.

- The controls page always offers Finish Workout and always shows confirmation when invoked manually.
- After the last planned set, the execution page changes to a prominent Finish Workout action. It should still confirm because the action ends HealthKit and begins an irreversible durable commit.
- Early confirmation states the number of incomplete planned sets and explains that only completed sets will count.

The finish saga is idempotent and recoverable:

1. phone marks `finishing` and freezes structured mutation;
2. Watch ends collection and finalizes the HealthKit workout;
3. phone commits the performed projection to Server;
4. exact-correlation reconciliation attaches the HealthKit observation when available;
5. phone ends Live Activity after durable structured acknowledgement and sends terminal projection.

If HealthKit saves but Server is offline, show “Workout saved to Health; PhysiqueOS finish pending” and retry the same finish id. If Server commits before HealthKit finalizes, retain a correlation-pending state and attach the later workout. Neither case creates a second structured event.

## Watch-owned HealthKit lifecycle and reconciliation

Create `HKWorkoutConfiguration(activityType: .traditionalStrengthTraining, locationType: .indoor)`, `HKWorkoutSession`, and `HKLiveWorkoutBuilder` on Watch. The session supplies workout background runtime and high-frequency workout data; no separate extended runtime session is necessary. Apple’s [Running workout sessions](https://developer.apple.com/documentation/HealthKit/running-workout-sessions) covers the required lifecycle, background mode and recovery APIs; use `handleActiveWorkoutRecovery` / `recoverActiveWorkoutSession` for process recovery.

Use builder statistics/delegate updates for heart rate and active energy. The current workout API’s historical `totalEnergyBurned` represents active energy and is deprecated; it must not be labeled total. The metrics page rules are:

- heart rate: latest valid beats/minute sample, with acquiring/unavailable state;
- active calories: cumulative `.activeEnergyBurned`;
- total calories: active + basal/resting energy only when both components are available for the workout interval; otherwise `—` with accessible “unavailable” semantics;
- elapsed: structured active elapsed, with HealthKit duration retained as raw physiology metadata.

Reference: [HKWorkoutBuilder](https://developer.apple.com/documentation/healthkit/hkworkoutbuilder), [HKLiveWorkoutBuilder](https://developer.apple.com/documentation/healthkit/hkliveworkoutbuilder), [traditional strength training](https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype/traditionalstrengthtraining), [active energy burned](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/activeenergyburned), and [HKWorkout totalEnergyBurned](https://developer.apple.com/documentation/healthkit/hkworkout/totalenergyburned).

### Deterministic reconciliation

Write the structured session UUID into `HKMetadataKeyExternalUUID` before finalization using builder metadata. Optionally include versioned, namespaced PhysiqueOS metadata, but External UUID is the stable primary correlation. References: [HKMetadataKeyExternalUUID](https://developer.apple.com/documentation/healthkit/hkmetadatakeyexternaluuid) and [addMetadata](https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/addmetadata(_:completion:)).

Extend the Native workout ingestion contract to carry a normalized `physiqueOSSessionId` only when:

- the workout source bundle is the signed PhysiqueOS Watch app;
- External UUID parses as the expected session UUID;
- owner, strength activity, and a tolerant time envelope agree.

Server reconciliation order:

1. exact source-owned session-id match;
2. enforce one HealthKit workout ↔ one structured session uniqueness;
3. attach physiology/duration to that canonical training session and mark the HealthKit row as a linked observation, not another performed-training event;
4. if exact correlation is absent, retain the existing temporal candidate/review flow;
5. conflicting exact claims go to review and never auto-merge.

This makes the Watch HealthKit workout and structured Logger one canonical event without weakening historical reconciliation for workouts written by other apps.

HealthKit workout mirroring should also be used: the Watch primary session can mirror state to the companion, and the system can wake the iPhone app for setup. Apple’s [WWDC23 multi-device workout session](https://developer.apple.com/videos/play/wwdc2023/10023/) describes the background-launch window. Use that opportunity to establish the phone observer and Live Activity, while WatchConnectivity remains the structured command protocol. A Live Activity cannot be guaranteed when the phone is unavailable or the system declines launch; it should adopt the active projection on next phone open.

## Product interaction specification

Apple recommends large controls on a leftmost workout control screen and a dedicated metrics view; watchOS vertical `TabView` uses Crown navigation. See [Workouts HIG](https://developer.apple.com/design/human-interface-guidelines/workouts), [Digital Crown HIG](https://developer.apple.com/design/human-interface-guidelines/digital-crown), and [watchOS vertical page navigation](https://developer.apple.com/documentation/watchOS-Apps/creating-an-intuitive-and-effective-ui-in-watchos-10).

Recommended spatial model:

- center page: execution;
- Crown down / vertical page: metrics;
- swipe left from execution: controls;
- no nested scrolling on the execution page; Crown is reserved for page movement, not accidental load edits.

Mocked states in the supplied board:

1. **Start:** prepared workout title, exercise/set count, estimated duration, Start Workout.
2. **Normal set:** previous result, current exercise/set/load/reps, large Stopwatch, Complete Set, plan progress.
3. **Final-set transition:** current last set plus explicit up-next context; it is not yet final workout.
4. **Final workout:** plan-complete confirmation and prominent Finish; no auto-finish.
5. **Crown metrics:** elapsed, heart rate, active calories and total/unavailable.
6. **Swipe-left controls:** large Pause and Finish; early-finish confirmation discloses remaining sets.
7. **Paused:** frozen elapsed/rest context, Resume primary, Complete Set unavailable.
8. **Countdown:** large timer, up-next exercise, haptic milestones.
9. **Offline:** HealthKit continues, structured set logging disabled, retry.
10. **Stale/conflict:** revision mismatch, no duplicate recorded, refresh projection.
11. **Superset:** explicit A1/A2 identity and round, correct next member, rest after round.
12. **Single-set exercise:** “Only set,” with unambiguous next exercise and exercise completion.

Haptics: success for acknowledged Complete Set; distinct haptics for rest 10/5/0, final planned set, pause/resume and rejected/stale mutation. Never play success before authoritative acknowledgement.

Always-on/reduced-luminance: remove motion, reduce refresh, redact load/reps if privacy policy requires it, retain timer/progress and paused/offline status. No control should require fine targeting.

## Project, signing and release architecture

Add a modern SwiftUI watchOS app target via the generator, paired to `com.physiqueos.native.dev` and using a predictable bundle id such as `com.physiqueos.native.dev.watchkitapp`. Set the Watch companion identifier, keep version/build parity, and choose watchOS 11.0+ if aligning with the existing iOS 18 floor.

Target boundaries:

- `PhysiqueOSWatch`: Watch UI, WC client, HealthKit workout controller, projection cache and recovery.
- shared pure Swift module/source group: protocol envelopes, ids, structured projection, timer math and reducer fixtures; no UIKit, iOS environment or app singletons.
- iOS app: Watch command router that invokes `TrainingSessionAuthority`, HealthKit mirror listener, Live Activity coordinator and exact-correlation ingestion.
- Server: performed projection fix, exact link uniqueness/reconciliation, canonical read-model coverage.

Watch entitlements/capabilities: HealthKit read/write, required Health usage descriptions, and `workout-processing` background mode. An App Group does not cross devices and must not be used as Watch/phone transport. WatchConnectivity needs correct pairing/activation but no replacement for signing/capability verification.

Generator/release gates:

- two consecutive generator runs produce identical project files;
- schemes include phone unit tests, Watch unit tests and paired simulator integration tests;
- Debug simulator build plus generic watchOS/iOS Release archive;
- inspect signed app/Watch bundle ids, companion keys, embedded profiles, HealthKit entitlements, background modes, versions/builds and code signatures;
- install on paired physical Watch/iPhone before any TestFlight upload;
- do not change Build 80 or upload a Watch build as part of this planning task.

## Battery and reliability

The HealthKit workout session is the appropriate background execution mechanism. The main battery risks are unnecessary communications and UI updates, not the structured payload size.

- consume builder callbacks, but coalesce visible metric updates to roughly 3–5 seconds unless watchOS supplies a slower cadence;
- transmit only semantic structured changes; never stream HR to phone every beat;
- derive timers locally from anchors and use system timeline/timer APIs;
- avoid animations during active workouts and always-on dim state;
- persist the minimum recoverable correlation/lifecycle data, not every metric sample;
- rely on HealthKit for physiological storage; do not duplicate raw HR samples in PhysiqueOS;
- test 60-, 90- and 120-minute strength sessions on the smallest supported battery and record Watch/iPhone battery delta, thermal state, message count, recovery success and final metric equality.

Acceptance budget should be set from device testing, not guessed in code review. A reasonable launch gate is no runaway wakeups, no timer drift beyond one second after resync, no lost/duplicate structured mutation, and no orphaned active workout after force-quit/reboot recovery exercises.

## Phased implementation plan

### Phase 0 — correctness and shared contracts (shipping blocker work)

1. Extract a single performed-session projection and fix partial-superset relationship filtering.
2. Add end-to-end evidence assertions for partial exercises/supersets, volume, PRs, history and retry.
3. Add `prepared/active/paused/finishing` lifecycle and pure clock/rest math to the phone authority.
4. Define versioned command/ack/projection Codable types and reducer contract fixtures.
5. Add exact HealthKit correlation field through Native and Server with source validation and uniqueness.
6. Run a disposable signing/generator spike for paired watchOS target and workout-processing capability.

Exit: blocker tests green; no Watch UI required.

### Phase 1A — internal paired prototype

1. Generator-owned Watch target and shared contract module.
2. Phone-prepared Start/Resume flow; phone-reachable start only.
3. Execution, metrics, controls, pause and finish-confirmation surfaces.
4. WatchConnectivity command router with mutation/revision semantics and stale/offline states.
5. Watch `HKWorkoutSession`/builder lifecycle, recovery, metrics and external UUID.
6. Mirrored session wake plus phone Live Activity adoption.
7. Exact reconciliation into one canonical event.
8. Paired-simulator fault tests and physical battery/recovery runs.

Exit: internal-only build; no claim of production readiness.

### Phase 1B — Founder V1 candidate

1. Polish haptics, always-on/privacy, availability/error copy and final-set transition.
2. Archive/signing/profile verification and observability for command latency/replay, recovery and link outcomes without raw health data.
3. Founder physical matrix: normal, early finish, partial exercise, partial superset, single set, pause during rest, link loss/recovery, phone killed, Watch app killed, Server offline at finish and total-calorie unavailable.
4. Only after acceptance, increment a new build and use the normal release lane.

### Phase 2 — optional autonomy

Evaluate recent-template start and true phone-unreachable structured start only from real V1 usage. Offline authority requires a phone-issued lease/epoch, an encrypted plan snapshot, a durable Watch mutation journal, Server arbitration and explicit conflict UX. Do not smuggle this complexity into V1 retries.

## Acceptance gates

- A Watch start creates exactly one structured session and one Watch HealthKit workout without waiting for Apple Health sync.
- Watch, phone logger and Live Activity show the same revision/current set after every acknowledged command.
- Double-tap/retry cannot complete two sets.
- Pause freezes structured active elapsed and rest; HealthKit pause state matches.
- Final set reveals Finish and never auto-finishes.
- Early finish stores only completed sets for normal, timed, bodyweight and superset cases.
- A one-member-performed superset finishes successfully with its relationship dropped, not with a rejected commit.
- The linked HealthKit workout does not appear as duplicate training history or duplicate volume/PR evidence.
- Watch process and phone process recovery restore the same session id/revision.
- Offline/stale states never show an unacknowledged set as complete.
- Signed archive contains the correct paired target, companion ids, HealthKit entitlements/background mode and matching version/build.
- 120-minute device run meets the agreed battery/thermal budget and ends no orphan workout.

## Founder decisions requested before Phase 1

1. Approve **phone-reachable start for V1** while removing any dependency on HealthKit synchronization. Recommended: yes.
2. Approve **phone-prepared “Ready for Watch” workout** as the start source. Recommended: yes.
3. Keep a confirmation even for the prominent post-final-set Finish action. Recommended: yes.
4. Display Total Calories as `—` when basal energy is unavailable rather than relabeling active calories. Recommended: yes.
5. Use `.traditionalStrengthTraining` + indoor for V1. Recommended: yes.
6. Align the Watch minimum OS with the current iOS 18 generation (watchOS 11+) and validate the Founder’s physical Watch. Recommended: yes.

## Scope and safety record

- No Watch target or shipping code implemented.
- No product code retained from audit instrumentation.
- No production, Founder data, HealthKit store, signing account, credentials, portal or TestFlight mutation.
- Builds 79/80 and their archives were not modified.
- Both temporary audit worktrees were clean after proof execution.
